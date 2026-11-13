// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { G1, createServer, mountAt, params, type Roles, type Server } from './test-support';

const { notify } = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('@ap/kernel', async () => {
  const actual = await vi.importActual<typeof import('@ap/kernel')>('@ap/kernel');
  return { ...actual, usePlatform: () => ({ ...actual.usePlatform(), toast: notify }) };
});

// jsdom has no layout: a stand-in viewer lists the Components, reports a click and shows the highlight it was given.
vi.mock('@eqv/renderer', async () => {
  const actual = await vi.importActual<typeof import('@eqv/renderer')>('@eqv/renderer');
  const React = await import('react');
  const Viewer = ({ layout, onSelectedChange, selectedId, highlight }: { layout: { id: string; components: { id: string }[] }; onSelectedChange?: (id: string | null) => void; selectedId?: string | null; highlight?: unknown }) =>
    React.createElement('div', { 'data-testid': 'viewer', 'data-layout': layout.id, 'data-selected': selectedId ?? '', 'data-highlight': highlight ? JSON.stringify(highlight) : '' },
      ...layout.components.map((c) => React.createElement('button', { key: c.id, 'data-testid': `select-${c.id}`, onClick: () => onSelectedChange?.(c.id) }, c.id)));
  return { ...actual, TopViewer: Viewer };
});

// Radix Select scrolls its active option into view, which jsdom lacks.
if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => undefined;
vi.setConfig({ testTimeout: 30000 });
const slow = { timeout: 8000 };
let server: Server;
let restore: () => void;
beforeEach(() => { server = createServer(); notify.mockClear(); restore = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restore(); });

const STAGED = 'e26e53e8bd7d956bd51371f8a15c4eb869c54adc918ca77352408bb2a93511ff';
const mount = (role: Roles, search = '') => mountAt(server, role, search);
const button = (name: string | RegExp) => screen.getByRole('button', { name });
const maybe = (name: string | RegExp) => screen.queryByRole('button', { name });
const tab = (name: string | RegExp) => screen.getByRole('tab', { name });
const openTab = (name: string | RegExp) => fireEvent.mouseDown(tab(name), { button: 0 });
const writes = () => server.state.writes.map((w) => ({ action: w.action, input: w.input as Record<string, unknown>, expectedVersion: w.expectedVersion }));
const aliasList = () => screen.findByRole('listbox', { name: 'Alias 목록' }, slow);
const option = (alias: string) => screen.getByRole('option', { name: new RegExp(`^${alias},`) });
const selectedAlias = () => screen.queryAllByRole('option').find((o) => o.getAttribute('aria-selected') === 'true')?.getAttribute('aria-label')?.split(',')[0] ?? null;
const ALLOWED_KEYS = ['v', 'equipment', 'step', 'window'];
/** The innermost element whose whole text is `text` (timestamps sit in their own no-wrap spans). */
const textIs = (text: string) => (_: string, el: Element | null) => el?.textContent === text && [...(el?.children ?? [])].every((c) => c.textContent !== text);

describe('Fleet', () => {
  it('lists the synthetic equipment with the status words; the 상태 column filter narrows the rows', async () => {
    mount('engineer');
    expect(await screen.findByText('게시됨 · Drift 미확인', {}, slow)).toBeTruthy();
    expect(screen.getByText('초안')).toBeTruthy();
    expect(screen.getByText('관측 없음')).toBeTruthy();
    fireEvent.click(button('상태 필터'));
    fireEvent.click(await screen.findByRole('checkbox', { name: '초안' }));
    fireEvent.click(button('적용'));
    await waitFor(() => expect(screen.queryByText('eq-synth-01')).toBeNull(), slow);
    expect(screen.getByText('eq-synth-02')).toBeTruthy();
    expect(screen.queryByText('eq-synth-03')).toBeNull();
    expect(Object.keys(params())).toEqual(['v']);
  });

  it('the breadcrumb names the menu once, and the latest window is one short line with the full value in its title', async () => {
    mount('engineer');
    await screen.findByText('게시됨 · Drift 미확인', {}, slow);
    expect(screen.getByRole('navigation', { name: /breadcrumb|이동 경로|경로/i }).textContent).not.toContain('설비 온보딩');
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('설비 온보딩');
    const short = screen.getAllByText('2026-01-01 10:00–10:30')[0]!;
    expect(short.getAttribute('title')).toBe('2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000');
  });

  it('a row opens the equipment with a push and no other key', async () => {
    mount('engineer');
    const before = window.history.length;
    fireEvent.click(await screen.findByRole('button', { name: 'eq-synth-01 열기' }, slow));
    await waitFor(() => expect(params()).toEqual({ v: '1', equipment: 'eq-synth-01' }), slow);
    expect(window.history.length).toBe(before + 1);
    expect(await screen.findByRole('tablist', { name: '온보딩 단계' }, slow)).toBeTruthy();
  });
});

describe('page keys', () => {
  it('a tab is a pushed step; Back walks tab → equipment → Fleet; only equipment, step and window reach the address', async () => {
    mount('engineer', '&equipment=eq-synth-01');
    await screen.findByRole('tablist', { name: '온보딩 단계' }, slow);
    openTab(/^Inventory/);
    await waitFor(() => expect(params().step).toBe('inventory'), slow);
    openTab(/^Drift/);
    await waitFor(() => expect(params().step).toBe('drift'), slow);
    for (const key of Object.keys(params())) expect(ALLOWED_KEYS).toContain(key);
    act(() => window.history.back());
    await waitFor(() => expect(params().step).toBe('inventory'), slow);
    act(() => window.history.back());
    await waitFor(() => expect(params().step).toBeUndefined(), slow);
    expect(params().equipment).toBe('eq-synth-01');
  });

  it.each([
    ['an unknown step', '&equipment=eq-synth-01&step=publish-dialog'],
    ['a window that is not 64 hex digits', '&equipment=eq-synth-01&window=latest'],
  ])('rejects %s with the page-key warning', async (_name, search) => {
    mount('engineer', search);
    expect(await screen.findByRole('button', { name: /초기화|복구|되돌리기/ }, slow)).toBeTruthy();
  });

  it('the Sample Window selector pushes `window` and the Inventory is read for that window', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=inventory');
    const trigger = await screen.findByRole('combobox', { name: 'Sample Window' }, slow);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'g2 · 교체 대기 · 2026-01-01 10:00–10:30' }, slow));
    await waitFor(() => expect(params().window).toBe(STAGED), slow);
    await waitFor(() => expect(server.state.queries.some((q) => q.endpoint === 'eqv.observedInventory' && (q.params as { windowHash: string }).windowHash === STAGED)).toBe(true), slow);
    expect(await screen.findByText(/표본 기간 2026-01-01T10:00:00.000/, {}, slow)).toBeTruthy();
  });

  it('the header names the vendor and model as the Fleet does; the selector leads with generation and state', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=inventory');
    const trigger = await screen.findByRole('combobox', { name: 'Sample Window' }, slow);
    expect(screen.getByText('Synth Maker / Synth Model')).toBeTruthy();
    expect(trigger.textContent).toBe('g1 · 사용 중 · 2026-01-01 10:00–10:30');
    expect(screen.getAllByRole('heading', { name: '관측 Inventory' }).length).toBeLessThanOrEqual(1);
  });
});

describe('Mapping', () => {
  it('j/k move through the Role-grouped aliases; / goes to the search', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    const list = await aliasList();
    fireEvent.keyDown(list, { key: 'j' });
    const first = selectedAlias();
    expect(first).not.toBeNull();
    fireEvent.keyDown(list, { key: 'j' });
    expect(selectedAlias()).not.toBe(first);
    fireEvent.keyDown(list, { key: 'k' });
    expect(selectedAlias()).toBe(first);
    fireEvent.keyDown(list, { key: '/' });
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Alias 검색' }));
    expect(within(list).getAllByRole('group').length).toBeGreaterThan(1);
  });

  it.each([
    ['I ignores the alias', 'PM1', 'i', () => expect(within(option('PM1')).getByText(/무시/)).toBeTruthy()],
    ['A opens the Component palette', 'PM1', 'a', () => expect(screen.getByRole('combobox', { name: 'Component 필터' })).toBeTruthy()],
    ['R opens the rule dialog with a preview', 'PM1', 'r', () => expect(screen.getByRole('heading', { name: /PM1에서 규칙 만들기/ })).toBeTruthy()],
    ['Enter confirms; on a verified exact rule of the save scope it says why nothing changed', 'LLA', 'Enter', () => expect(screen.getByText('저장 범위에 이미 같은 verified 정확 규칙이 있습니다', { selector: '[role=status]' })).toBeTruthy()],
  ])('%s', async (_name, alias, key, check) => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    const list = await aliasList();
    fireEvent.click(option(alias));
    fireEvent.keyDown(list, { key });
    await waitFor(check, slow);
  });

  it('the rule dialog shows no problem on open even when the prefilled target is empty; a submit shows it', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    const list = await aliasList();
    fireEvent.click(option('PM9'));
    fireEvent.keyDown(list, { key: 'r' });
    const dialog = await screen.findByRole('dialog', {}, slow);
    expect(within(dialog).queryByRole('list', { name: '규칙 문제' })).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: '규칙 추가' }));
    expect(await within(dialog).findByRole('list', { name: '규칙 문제' }, slow)).toBeTruthy();
  });

  it('the save scope names the model as the Fleet does; undo and redo are icon buttons with their shortcut in the name', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    await aliasList();
    expect(screen.getByLabelText('Model (Synth Maker / Synth Model)')).toBeTruthy();
    expect(button('실행 취소 · Ctrl/Cmd+Z').textContent).toBe('');
    expect(button('다시 실행 · Ctrl/Cmd+Shift+Z').textContent).toBe('');
  });

  it('an edit is unsaved until 저장, which writes the Model scope at the version read; Ctrl+Z undoes', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    const list = await aliasList();
    fireEvent.click(option('PM1'));
    fireEvent.keyDown(list, { key: 'i' });
    expect(await screen.findByText('저장 안 됨 · Model', {}, slow)).toBeTruthy();
    fireEvent.keyDown(list, { key: 'z', ctrlKey: true });
    await waitFor(() => expect(screen.queryByText('저장 안 됨 · Model')).toBeNull(), slow);
    fireEvent.keyDown(list, { key: 'i' });
    fireEvent.click(button('저장'));
    await waitFor(() => expect(writes()).toEqual([{ action: 'eqv.saveAliasRules', input: expect.objectContaining({ level: 'model', vendorId: 'synth-maker', modelId: 'synth-model' }), expectedVersion: '1' }]), slow);
    expect(await screen.findByText('저장됨', {}, slow)).toBeTruthy();
  });

  it('the Board follows a click on the drawing (EV#60)', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    await aliasList();
    fireEvent.click(await screen.findByTestId('select-pm-a', {}, slow));
    expect(selectedAlias()).toBe('PM1');
  });

  it('marks «새 규칙 반영 가능» where the saved rules now resolve an alias differently from the published Mapping Version', async () => {
    const model = server.state.rules.get('model/synth-maker/synth-model')!;
    (model.document.rules as { id: string; certainty: string }[]).find((r) => r.id === 'efem')!.certainty = 'assumed';
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    await aliasList();
    expect(option('EFEM_R1').getAttribute('aria-label')).toContain('새 규칙 반영 가능');
    expect(option('LLA').getAttribute('aria-label')).not.toContain('새 규칙 반영 가능');
  });

  describe('save versions (#2035)', () => {
    const MODEL = 'model/synth-maker/synth-model';
    const CONFLICT = '다른 사용자가 먼저 저장했습니다. 다시 불러온 뒤 편집하세요.';
    /** Another person saves the model file: PM9 is ignored, and the version moves to 2. */
    const otherSavesModel = () => {
      const current = server.state.rules.get(MODEL)!;
      const document = structuredClone(current.document);
      (document.rules as unknown[]).push({ id: 'ignore-pm9', match: { exact: ['PM9'] }, target: { ignore: true }, certainty: 'verified' });
      server.state.rules.set(MODEL, { document, version: current.version + 1 });
    };
    const modelReads = () => server.state.queries.filter((q) => q.endpoint === 'eqv.aliasRules' && (q.params as { level: string }).level === 'model').length;
    const ignored = (alias: string) => option(alias).getAttribute('aria-label')!.startsWith(`${alias}, 무시`);
    const saveButton = () => button('저장') as HTMLButtonElement;

    it('(a) a conflict locks 저장 until 다시 불러오기, which rebuilds the Board from the other file; the next save sends its version', async () => {
      mount('engineer', '&equipment=eq-synth-01&step=mapping');
      const list = await aliasList();
      otherSavesModel();
      const reads = modelReads();
      fireEvent.click(option('PM1'));
      fireEvent.keyDown(list, { key: 'i' });
      await screen.findByText('저장 안 됨 · Model', {}, slow);
      fireEvent.click(saveButton());
      expect(await screen.findByText(CONFLICT, {}, slow)).toBeTruthy();
      // The engine refetches the rules after a conflict; the Board keeps its version, so 저장 stays locked.
      await waitFor(() => expect(modelReads()).toBeGreaterThan(reads), slow);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
      expect(saveButton().disabled).toBe(true);
      fireEvent.click(saveButton());
      expect(writes().map((w) => w.expectedVersion)).toEqual(['1']);
      expect(server.state.rules.get(MODEL)!.version).toBe(2);

      fireEvent.click(button('다시 불러오기'));
      const dialog = await screen.findByRole('alertdialog', {}, slow);
      expect(within(dialog).getByText(/저장하지 않은 Mapping 변경을 버립니다/)).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: '버리고 다시 불러오기' }));
      await waitFor(() => expect(ignored('PM9')).toBe(true), slow);
      expect(ignored('PM1')).toBe(false);
      expect(screen.queryByText(CONFLICT)).toBeNull();
      // The opener left with the conflict: focus lands on the Alias list.
      await waitFor(() => expect(document.activeElement).toBe(list), slow);
      fireEvent.click(option('PM1'));
      fireEvent.keyDown(list, { key: 'i' });
      await screen.findByText('저장 안 됨 · Model', {}, slow);
      fireEvent.click(saveButton());
      await waitFor(() => expect(writes().map((w) => w.expectedVersion)).toEqual(['1', '2']), slow);
      expect(await screen.findByText('저장됨', {}, slow)).toBeTruthy();
      expect(JSON.stringify(server.state.rules.get(MODEL)!.document)).toContain('ignore-pm9');
    });

    it('(b) after an equipment-scope save refetches a newer model file, a model save sends the model version first read', async () => {
      // Hold the model rules refetch until the user has a model edit, so the newer version reaches a dirty Board.
      let release = () => {};
      const held = new Promise<void>((resolve) => { release = resolve; });
      let holding = false;
      const query = server.query;
      server.query = async (req) => {
        if (holding && req.endpoint === 'eqv.aliasRules' && (req.params as { level: string }).level === 'model') await held;
        return query(req);
      };
      mount('engineer', '&equipment=eq-synth-01&step=mapping');
      const list = await aliasList();
      otherSavesModel();
      holding = true;
      fireEvent.click(screen.getByLabelText('설비 (eq-synth-01)'));
      fireEvent.click(option('PM1'));
      fireEvent.keyDown(list, { key: 'i' });
      await screen.findByText('저장 안 됨 · 설비', {}, slow);
      fireEvent.click(saveButton());
      await waitFor(() => expect(writes()).toEqual([expect.objectContaining({ input: expect.objectContaining({ level: 'equipment' }), expectedVersion: '1' })]), slow);
      await screen.findByText('저장됨', {}, slow);
      fireEvent.click(screen.getByLabelText('Model (Synth Maker / Synth Model)'));
      fireEvent.click(option('TM_R1'));
      fireEvent.keyDown(list, { key: 'i' });
      await screen.findByText('저장 안 됨 · Model', {}, slow);
      await act(async () => { release(); await new Promise((resolve) => setTimeout(resolve, 50)); });
      fireEvent.click(saveButton());
      await waitFor(() => expect(writes()).toHaveLength(2), slow);
      expect(writes()[1]).toEqual(expect.objectContaining({ input: expect.objectContaining({ level: 'model' }), expectedVersion: '1' }));
      expect(await screen.findByText(CONFLICT, {}, slow)).toBeTruthy();
      expect(JSON.stringify(server.state.rules.get(MODEL)!.document)).toContain('ignore-pm9');
    });

    it('(c) a clean Board takes another person\'s save that a refetch brings, without asking', async () => {
      mount('engineer', '&equipment=eq-synth-01&step=mapping');
      const list = await aliasList();
      otherSavesModel();
      expect(ignored('PM9')).toBe(false);
      // An equipment-scope save refetches every rules file; the Board is clean afterwards.
      fireEvent.click(screen.getByLabelText('설비 (eq-synth-01)'));
      fireEvent.click(option('PM1'));
      fireEvent.keyDown(list, { key: 'i' });
      await screen.findByText('저장 안 됨 · 설비', {}, slow);
      fireEvent.click(saveButton());
      await waitFor(() => expect(ignored('PM9')).toBe(true), slow);
      expect(ignored('PM1')).toBe(true);
      expect(screen.queryByRole('alertdialog')).toBeNull();
      expect(screen.queryByText(CONFLICT)).toBeNull();
    });

    it('(d) a newer file that lands while a clean draft save is in flight never pairs the old model file with the new version', async () => {
      // Hold the model rules reads and the equipment-scope write independently (the technique of (b)).
      let releaseRead = () => {};
      const heldRead = new Promise<void>((resolve) => { releaseRead = resolve; });
      let holdReads = false;
      let heldReads = 0;
      let releaseSave = () => {};
      const heldSave = new Promise<void>((resolve) => { releaseSave = resolve; });
      let holdSave = false;
      let saveStarted = false;
      const query = server.query;
      const action = server.action;
      server.query = async (req) => {
        if (holdReads && req.endpoint === 'eqv.aliasRules' && (req.params as { level: string }).level === 'model') { heldReads += 1; await heldRead; }
        return query(req);
      };
      server.action = async (req) => {
        if (holdSave && req.action === 'eqv.saveAliasRules' && (req.input as { level: string }).level === 'equipment') { saveStarted = true; await heldSave; }
        return action(req);
      };
      // Without its rule, LLA is an automatic draft (the Template places it), so the Board can save while clean.
      const model = server.state.rules.get(MODEL)!;
      model.document.rules = (model.document.rules as { id: string }[]).filter((r) => r.id !== 'll');
      mount('engineer', '&equipment=eq-synth-01&step=mapping');
      const list = await aliasList();
      otherSavesModel();
      holdReads = true;
      // A Model save conflicts; its model refetch is held, and 다시 불러오기 rebuilds from the cached first read.
      fireEvent.click(option('PM1'));
      fireEvent.keyDown(list, { key: 'i' });
      await screen.findByText('저장 안 됨 · Model', {}, slow);
      fireEvent.click(saveButton());
      expect(await screen.findByText(CONFLICT, {}, slow)).toBeTruthy();
      await waitFor(() => expect(heldReads).toBeGreaterThan(0), slow);
      fireEvent.click(button('다시 불러오기'));
      fireEvent.click(within(await screen.findByRole('alertdialog', {}, slow)).getByRole('button', { name: '버리고 다시 불러오기' }));
      await waitFor(() => expect(screen.queryByText(CONFLICT)).toBeNull(), slow);
      // A clean Board with automatic drafts saves at the equipment scope; the write is held.
      fireEvent.click(screen.getByLabelText('설비 (eq-synth-01)'));
      expect(await screen.findByText(/^초안 \d+건/, {}, slow)).toBeTruthy();
      holdSave = true;
      fireEvent.click(saveButton());
      await waitFor(() => expect(saveStarted).toBe(true), slow);
      // The newer model file lands while the save is pending, then the save answers.
      await act(async () => { releaseRead(); await new Promise((resolve) => setTimeout(resolve, 50)); });
      await act(async () => { releaseSave(); await new Promise((resolve) => setTimeout(resolve, 50)); });
      await screen.findByText(/저장됨|변경 없음/, {}, slow);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
      // A later Model save either conflicts at the old version or carries the other person's rule.
      fireEvent.click(screen.getByLabelText('Model (Synth Maker / Synth Model)'));
      fireEvent.click(option('TM_R1'));
      fireEvent.keyDown(list, { key: 'i' });
      await screen.findByText('저장 안 됨 · Model', {}, slow);
      fireEvent.click(saveButton());
      await waitFor(() => expect(writes()).toHaveLength(3), slow);
      const last = writes()[2]!;
      expect(last.input).toEqual(expect.objectContaining({ level: 'model' }));
      expect(last.expectedVersion === '1' || JSON.stringify(last.input.document).includes('ignore-pm9')).toBe(true);
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
      expect(JSON.stringify(server.state.rules.get(MODEL)!.document)).toContain('ignore-pm9');
    });
  });

  it('unsaved edits survive a step tab switch, which moves without asking (#1745)', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    const list = await aliasList();
    fireEvent.click(option('PM1'));
    fireEvent.keyDown(list, { key: 'i' });
    await screen.findByText('저장 안 됨 · Model', {}, slow);
    openTab(/^Inventory/);
    await waitFor(() => expect(params().step).toBe('inventory'), slow);
    openTab(/^Mapping/);
    await aliasList();
    expect(within(option('PM1')).getByText(/무시/)).toBeTruthy();
  });

  it('the Mapping tab names unsaved edits from any step (UX-13)', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    const list = await aliasList();
    expect(tab(/^Mapping/).textContent).not.toMatch(/저장 안 됨/);
    fireEvent.click(option('PM1'));
    fireEvent.keyDown(list, { key: 'i' });
    await screen.findByText('저장 안 됨 · Model', {}, slow);
    openTab(/^Inventory/);
    await waitFor(() => expect(params().step).toBe('inventory'), slow);
    expect(tab(/^Mapping/).textContent).toContain('· 저장 안 됨');
  });
});

describe('검증·게시', () => {
  it('publish review shows the alias diff, the Layout Revision and Binding lines, then publishes the Revision first and the Mapping', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(review);
    const dialog = await screen.findByRole('alertdialog', {}, slow);
    expect(within(dialog).getByText('추가 0 · 삭제 0 · 변경 0 · 변경 없음 7')).toBeTruthy();
    expect(within(dialog).getByText(/^eq-synth-01-layout · revision [0-9a-f]{12} \(이전 기록 없음\)$/)).toBeTruthy();
    expect(within(dialog).getByText(textIs('열린 binding(2026-01-01T10:04:30.000 ~)을 2026-01-01T10:30:00.000에서 닫습니다'))).toBeTruthy();
    expect(within(dialog).getByText((_, el) => /^새 binding 2026-01-01T10:30:00.000 ~ \(열림\)/.test(el?.textContent ?? '') && el?.classList.contains('block') === true)).toBeTruthy();
    expect(within(dialog).getByText('2026-01-01 10:00–10:30 · g1')).toBeTruthy();
    expect(within(dialog).getByText('변경 없음')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '게시' }));
    await waitFor(() => expect(writes().map((w) => w.action)).toEqual(['eqv.publishRevision', 'eqv.publishMapping']), slow);
    expect(writes()[0]).toEqual({ action: 'eqv.publishRevision', input: { layoutId: 'eq-synth-01-layout' }, expectedVersion: '1' });
    expect(writes()[1]).toMatchObject({ input: { equipmentId: 'eq-synth-01', layoutId: 'eq-synth-01-layout', layoutRevision: `sha256:${'b'.repeat(64)}`, effectiveFrom: '2026-01-01T10:30:00.000', windowHash: G1 }, expectedVersion: '2' });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Mapping을 게시했습니다', 'info'), slow);
  });

  it('after a publish the Bindings are read again and effectiveFrom takes the new default, with no error', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(review);
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, slow)).getByRole('button', { name: '게시' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Mapping을 게시했습니다', 'info'), slow);
    const reads = () => server.state.queries.filter((q) => q.endpoint === 'eqv.bindings').length;
    await waitFor(() => expect(reads()).toBeGreaterThan(1), slow);
    const input = screen.getByLabelText(/effectiveFrom/) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe(''), slow);
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(document.getElementById('effective-from-hint')?.className).not.toContain('text-text-danger');
  });

  it('without eqv-studio:layout-publish, a draft with no Revision yet keeps 게시 검토 disabled and names the missing right', async () => {
    mount('publisher', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect(document.getElementById('publish-reason')?.textContent).toMatch(/eqv-studio:layout-publish/), slow);
    expect((review as HTMLButtonElement).disabled).toBe(true);
  });

  it.each([
    ['empty', '', null],
    ['not Site Wall-clock', '2026-13-01 10:00', /^형식이 올바르지 않습니다/],
    ['not after the latest Binding', '2026-01-01T10:00:00.000', /^마지막 binding\(2026-01-01T10:04:30.000\)보다 늦어야 합니다/],
  ])('an effectiveFrom that is %s disables 게시 검토 with a short header line; the input names the reason', async (_name, value, reason) => {
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.change(screen.getByLabelText(/effectiveFrom/), { target: { value } });
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(true), slow);
    expect(document.getElementById('publish-reason')?.textContent).toBe('effectiveFrom 확인 필요');
    if (reason) expect(document.getElementById('effective-from-hint')?.textContent).toMatch(reason);
  });

  it('Mapping Conflicts do not block; clicking one draws its rings and the dashed observation line', async () => {
    const draft = server.state.drafts.get('eq-synth-01-layout')!;
    draft.document = { ...draft.document, transferCapabilities: [] };
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const conflicts = await screen.findByRole('list', { name: 'Mapping Conflict 목록' }, slow);
    const review = button('게시 검토') as HTMLButtonElement;
    await waitFor(() => expect(review.disabled).toBe(false), slow);
    const first = within(conflicts).getAllByRole('button')[0]!;
    fireEvent.click(first);
    const highlight = JSON.parse(screen.getByTestId('viewer').getAttribute('data-highlight')!) as { componentIds: string[]; transfers?: { label: string }[] };
    expect(highlight.componentIds).toHaveLength(2);
    expect(highlight.transfers?.[0]?.label).toMatch(/^관측 이송 .+ → .+ \d+건 \(Transfer Capability 없음\)$/);
    fireEvent.click(first);
    expect(screen.getByTestId('viewer').getAttribute('data-highlight')).toBe('');
  });

  it('rules saved by someone else since the review: the server answers mapping/changed; the dialog says so, stays open and recomputes from the re-read rules (#2053)', async () => {
    server.state.refuseMapping = { outcome: 'invalid', code: 'changed' };
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(review);
    const dialog = await screen.findByRole('alertdialog', {}, slow);
    expect(within(dialog).getByText('추가 0 · 삭제 0 · 변경 0 · 변경 없음 7')).toBeTruthy();
    const shown = /mapping ([0-9a-f]{12})$/.exec(within(dialog).getByText((_, el) => /^새 binding .* · mapping [0-9a-f]{12}$/.test(el?.textContent ?? '') && el?.classList.contains('block') === true).textContent ?? '')?.[1];
    // Another author saves the equipment rule (PM2 becomes verified) while this dialog is open.
    const key = 'equipment/eq-synth-01';
    const saved = server.state.rules.get(key)!;
    const document = structuredClone(saved.document) as { rules: { certainty: string }[] };
    document.rules[0]!.certainty = 'verified';
    server.state.rules.set(key, { document: document as never, version: saved.version + 1 });
    const ruleReads = () => server.state.queries.filter((q) => q.endpoint === 'eqv.aliasRules').length;
    const before = ruleReads();
    fireEvent.click(within(dialog).getByRole('button', { name: '게시' }));
    const sent = await waitFor(() => { const w = writes().find((x) => x.action === 'eqv.publishMapping'); expect(w).toBeTruthy(); return w!.input as { expectedMappingHash: string }; }, slow);
    expect(sent.expectedMappingHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(sent.expectedMappingHash.slice(7, 19)).toBe(shown);
    await waitFor(() => expect(ruleReads()).toBeGreaterThanOrEqual(before + 4), slow);
    const open = await screen.findByRole('alertdialog', {}, slow);
    await waitFor(() => expect(within(open).getByText('추가 0 · 삭제 0 · 변경 1 · 변경 없음 6')).toBeTruthy(), slow);
    expect(within(open).getByRole('alert').textContent).toBe('규칙이 바뀌었습니다. 다시 확인한 뒤 게시하세요.');
    expect(notify).not.toHaveBeenCalledWith('Mapping을 게시했습니다', 'info');
  });

  it('the rules-changed notice belongs to the refused review: a Sample Window change by Back/Forward clears it (#2053)', async () => {
    server.state.refuseMapping = { outcome: 'invalid', code: 'changed' };
    mount('engineer', `&equipment=eq-synth-01&step=validate&window=${STAGED}`);
    const trigger = await screen.findByRole('combobox', { name: 'Sample Window' }, slow);
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    const active = (await screen.findAllByRole('option', {}, slow)).find((o) => !/교체 대기/.test(o.textContent ?? ''))!;
    fireEvent.click(active);
    await waitFor(() => expect(params().window).not.toBe(STAGED), slow);
    const openReview = async () => {
      const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
      await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
      fireEvent.click(review);
      return screen.findByRole('alertdialog', {}, slow);
    };
    fireEvent.click(within(await openReview()).getByRole('button', { name: '게시' }));
    await waitFor(() => expect(within(screen.getByRole('alertdialog')).getByRole('alert').textContent).toBe('규칙이 바뀌었습니다. 다시 확인한 뒤 게시하세요.'), slow);
    act(() => window.history.back());
    await waitFor(() => expect(params().window).toBe(STAGED), slow);
    act(() => window.history.forward());
    await waitFor(() => expect(params().window).not.toBe(STAGED), slow);
    expect(within(await openReview()).queryByRole('alert')).toBeNull();
  });

  it('a server refusal as the same as the latest publish says so in the dialog', async () => {
    server.state.refuseMapping = { outcome: 'invalid', code: 'same-as-latest' };
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(review);
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, slow)).getByRole('button', { name: '게시' }));
    expect(await screen.findByText('이전 게시와 같습니다', {}, slow)).toBeTruthy();
  });

  it('a server refusal windowHash/not_active says why in the dialog', async () => {
    server.state.refuseMapping = { outcome: 'invalid', code: 'not_active' };
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(review);
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, slow)).getByRole('button', { name: '게시' }));
    expect(await screen.findByText('활성 Sample Window에서만 게시할 수 있습니다', {}, slow)).toBeTruthy();
  });
});

describe('Data, Template and Drift', () => {
  it('replace asks first and writes the staged window; retire is a destructive confirm naming the Mapping use', async () => {
    mount('engineer', '&equipment=eq-synth-01');
    fireEvent.click(await screen.findByRole('button', { name: /g2로 교체$/ }, slow));
    let dialog = await screen.findByRole('alertdialog', {}, slow);
    fireEvent.click(within(dialog).getByRole('button', { name: '교체' }));
    await waitFor(() => expect(writes()).toEqual([{ action: 'eqv.replaceSampleWindow', input: { equipmentId: 'eq-synth-01', windowHash: STAGED }, expectedVersion: undefined }]), slow);
    fireEvent.click(await screen.findByRole('button', { name: /퇴역$/ }, slow));
    dialog = await screen.findByRole('alertdialog', {}, slow);
    expect(within(dialog).getByText('2개')).toBeTruthy();
    expect(within(dialog).getByText(/되돌릴 수 없습니다/)).toBeTruthy();
  });

  it('the 교체 dialog and the Drift header use the short range with the full value in its title (UX-10)', async () => {
    mount('engineer', '&equipment=eq-synth-01');
    fireEvent.click(await screen.findByRole('button', { name: /g2로 교체$/ }, slow));
    const dialog = await screen.findByRole('alertdialog', {}, slow);
    expect(within(dialog).getByText('2026-01-01 10:00–10:30').getAttribute('title')).toBe('2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000');
    cleanup();
    mount('engineer', '&equipment=eq-synth-01&step=drift');
    await screen.findByText('Drift를 판단할 수 없습니다', {}, slow);
    expect(screen.getByText('2026-01-01 10:00–10:30').getAttribute('title')).toBe('2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000');
  });

  it('starting from the rank-1 EV Template creates the Layout draft at version 0 and opens Mapping; browsing does not write', async () => {
    mount('engineer', '&equipment=eq-synth-02&step=template');
    const starts = await screen.findAllByRole('button', { name: '이 EV Template으로 시작' }, slow);
    fireEvent.mouseDown(tab('번들 EV Template'), { button: 0 });
    fireEvent.click(await screen.findByRole('button', { name: /lithography-dual-stage/ }, slow));
    expect(screen.getByTestId('viewer').getAttribute('data-layout')).toBe('lithography-dual-stage');
    expect(writes()).toEqual([]);
    fireEvent.mouseDown(tab('제안'), { button: 0 });
    fireEvent.click((await screen.findAllByRole('button', { name: '이 EV Template으로 시작' }, slow))[0]!);
    await waitFor(() => expect(writes()).toEqual([{ action: 'eqv.saveDraft', input: expect.objectContaining({ layoutId: 'eq-synth-02-layout' }), expectedVersion: '0' }]), slow);
    await waitFor(() => expect(params().step).toBe('mapping'), slow);
    expect(starts.length).toBeGreaterThan(0);
  });

  it('an equipment with no Sample Window says so on 데이터, with the import as the way out', async () => {
    mount('engineer', '&equipment=eq-synth-03');
    expect(await screen.findByText('Sample Window가 없습니다', {}, slow)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sample Window 가져오기' })).toBeTruthy();
  });

  it('a drifted equipment lists the changes as the «Drift 검토» table; a row action opens Mapping', async () => {
    const latest = server.state.bindings.get('eq-synth-01')!.at(-1)!.mappingHash;
    const inventory = structuredClone(server.state.inventories[G1]!) as { aliases: { alias: string }[] };
    inventory.aliases = inventory.aliases.filter((a) => a.alias !== 'PM9');
    server.state.baselines.set(`eq-synth-01/${latest}`, inventory);
    mount('engineer', '&equipment=eq-synth-01&step=drift');
    const table = await screen.findByRole('table', { name: /Drift 검토/ }, slow);
    expect(within(table).getByText('PM9')).toBeTruthy();
    fireEvent.click(within(table).getAllByRole('button', { name: /Mapping에서 검토/ })[0]!);
    await waitFor(() => expect(params().step).toBe('mapping'), slow);
  });

  it('Drift of a published equipment without a stored Baseline is unknown with the reason, never «no drift»', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=drift');
    expect(await screen.findByText('Drift를 판단할 수 없습니다', {}, slow)).toBeTruthy();
    expect(screen.getByText('Baseline Inventory가 없습니다')).toBeTruthy();
    expect(screen.queryByText('기준 대비 Drift 없음')).toBeNull();
  });
});

describe('read only (eqv-studio:view and eqv:view)', () => {
  it.each([
    ['data', 'eq-synth-01', [/교체$/, /퇴역$/]],
    ['template', 'eq-synth-02', ['이 EV Template으로 시작', 'Generic Layout으로 시작']],
    ['mapping', 'eq-synth-01', ['저장', '배정 (A)', '확정 (Enter)', '무시 (I)', '규칙화 (R)', /실행 취소/]],
    ['validate', 'eq-synth-01', ['게시 검토']],
  ])('%s shows no write control', async (step, equipment, names) => {
    mount('viewer', `&equipment=${equipment}&step=${step}`);
    await screen.findByRole('tablist', { name: '온보딩 단계' }, slow);
    await waitFor(() => expect(screen.queryByRole('status')?.textContent ?? '').not.toMatch(/불러오는/), slow);
    if (step === 'mapping') { fireEvent.click(option('PM1')); expect(screen.getByText('조회 전용 · alias와 Component 확인 가능')).toBeTruthy(); }
    for (const name of names) expect(maybe(name), String(name)).toBeNull();
  });
});


// ---- Sample Window import and equipment registration (#1658 import PR, ADR-0140) ----
const windowsDir = join(process.cwd(), '../../../packages/eqv/assets/observations/eq-synth-02/windows');
const synth02 = readFileSync(join(windowsDir, readdirSync(windowsDir)[0]!), 'utf8');
/** eq-synth-02's synthetic batch, re-addressed (every record names the target) or reprocessed as another Data Generation (EV#105). */
const batchFile = (text: string, name = 'w.batch.json', type = 'application/json') => new File([text], name, { type });
const forEquipment = (equipmentId: string) => synth02.replaceAll('"eq-synth-02"', JSON.stringify(equipmentId));
const reprocessed = () => JSON.stringify(JSON.parse(synth02)).replaceAll('"dataGeneration":"g1"', '"dataGeneration":"g7"');
const importDialog = async () => {
  fireEvent.click(await screen.findByRole('button', { name: 'Sample Window 가져오기' }, slow));
  return screen.findByRole('dialog', { name: 'Sample Window 가져오기' }, slow);
};
const pick = (dialog: HTMLElement, file: File) => fireEvent.change(within(dialog).getByLabelText('Sample Window 파일'), { target: { files: [file] } });
const confirmButton = (dialog: HTMLElement) => within(dialog).getByRole('button', { name: '가져오기' });

describe('Sample Window import', () => {
  it('previews the file\'s facts, then a confirm uploads it and imports by id; the window joins the table and the selector', async () => {
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile(forEquipment('eq-synth-03')));
    const range = await within(dialog).findByText('2026-01-01 10:00–10:30', {}, slow);
    expect(range.getAttribute('title')).toBe('2026-01-01T10:00:00.000 – 2026-01-01T10:30:00.000');
    expect(within(dialog).getByText('g1')).toBeTruthy();
    expect(within(dialog).getByText('29건')).toBeTruthy();
    expect(within(dialog).getByRole('status').textContent).toBe('가져올 수 있습니다');
    expect(within(dialog).getByText('site-synth')).toBeTruthy();
    expect(server.state.uploads).toEqual([]);
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(writes()).toEqual([{ action: 'eqv.importSampleWindow', input: { equipmentId: 'eq-synth-03', uploadId: 'F-1' }, expectedVersion: undefined }]), slow);
    expect(server.state.uploads).toMatchObject([{ name: 'w.batch.json', mimeType: 'application/json' }]);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Sample Window 가져오기' })).toBeNull(), slow);
    const table = await screen.findByRole('table', { name: /Sample Windows/ }, slow);
    expect(within(table).getByText('사용 중')).toBeTruthy();
    expect((await screen.findByRole('combobox', { name: 'Sample Window' }, slow)).textContent).toBe('g1 · 사용 중 · 2026-01-01 10:00–10:30');
    expect(notify).toHaveBeenCalledWith('Sample Window를 가져왔습니다', 'info');
    // The empty state's button is gone: focus moves to the import button above the new table (UX-9).
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sample Window 가져오기' })), slow);
  });

  it.each([
    ['a file over 32 MiB', () => { const f = batchFile('{}'); Object.defineProperty(f, 'size', { value: 33_554_433 }); return f; }, '32 MiB를 넘는 파일은 가져올 수 없습니다.'],
    ['a file that is not *.batch.json', () => batchFile(forEquipment('eq-synth-03'), 'w.json'), '*.batch.json 파일만 가져올 수 있습니다.'],
    ['a *.batch.json of another type', () => batchFile(forEquipment('eq-synth-03'), 'w.batch.json', 'text/plain'), '*.batch.json 파일만 가져올 수 있습니다.'],
    ['a file that is not JSON', () => batchFile('{not json'), 'JSON으로 읽을 수 없습니다.'],
  ])('refuses %s before uploading', async (_what, file, message) => {
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, file());
    expect(await within(dialog).findByText(message, {}, slow)).toBeTruthy();
    expect(confirmButton(dialog).hasAttribute('disabled')).toBe(true);
    expect(server.state.uploads).toEqual([]);
  });

  it('validation problems are listed and block the confirm', async () => {
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile(synth02));
    expect(await within(dialog).findByText(/가져올 수 없습니다 · 문제 \d+건/, {}, slow)).toBeTruthy();
    expect(within(dialog).getAllByText(/equipment-mismatch/).length).toBeGreaterThan(0);
    expect(confirmButton(dialog).hasAttribute('disabled')).toBe(true);
    expect(server.state.uploads).toEqual([]);
  });

  it.each([
    ['too large', { outcome: 'invalid' as const, code: 'too_large' }, '파일이 32 MiB를 넘어 올리지 못했습니다.'],
    ['forbidden', { outcome: 'forbidden' as const }, '권한이 없어 파일을 올리지 못했습니다.'],
    ['conflict', { outcome: 'conflict' as const }, '같은 요청으로 다른 파일이 이미 올라갔습니다. 파일을 다시 고르세요.'],
    ['error', { outcome: 'error' as const }, '파일을 올리지 못했습니다. 다시 시도하세요.'],
  ])('an upload answered %s says so and imports nothing', async (_what, refusal, message) => {
    server.state.refuseUpload = refusal;
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile(forEquipment('eq-synth-03')));
    await within(dialog).findByText('site-synth', {}, slow);
    fireEvent.click(confirmButton(dialog));
    expect(await within(dialog).findByText(message, {}, slow)).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it('a server refusal of the import lists its codes', async () => {
    server.state.refuseImport = { outcome: 'invalid', path: ['file', 'from'], code: 'window-overlap' };
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile(forEquipment('eq-synth-03')));
    await within(dialog).findByText('site-synth', {}, slow);
    fireEvent.click(confirmButton(dialog));
    expect(await within(dialog).findByText('서버가 가져오기를 거부했습니다', {}, slow)).toBeTruthy();
    expect(within(dialog).getByText(/window-overlap/)).toBeTruthy();
  });

  it('a reprocessed generation of the active range is imported as 교체 대기 and replaced only through 교체', async () => {
    mount('engineer', '&equipment=eq-synth-02');
    const dialog = await importDialog();
    pick(dialog, batchFile(reprocessed()));
    expect(await within(dialog).findByText(/교체 대기로 가져옵니다/, {}, slow)).toBeTruthy();
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(writes().map((w) => w.action)).toEqual(['eqv.importSampleWindow']), slow);
    fireEvent.click(await screen.findByRole('button', { name: /g7로 교체$/ }, slow));
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, slow)).getByRole('button', { name: '교체' }));
    await waitFor(() => expect(writes().map((w) => w.action)).toEqual(['eqv.importSampleWindow', 'eqv.replaceSampleWindow']), slow);
  });

  it('a check that fails settles to one problem line, never a stuck «검사 중…» (C2)', async () => {
    const digest = vi.spyOn(globalThis.crypto.subtle, 'digest').mockRejectedValue(new Error('no crypto.subtle'));
    try {
      mount('engineer', '&equipment=eq-synth-03');
      const dialog = await importDialog();
      pick(dialog, batchFile(forEquipment('eq-synth-03')));
      expect(await within(dialog).findByText('파일을 검사하지 못했습니다.', {}, slow)).toBeTruthy();
      expect(within(dialog).queryByText('검사 중…')).toBeNull();
      expect(confirmButton(dialog).hasAttribute('disabled')).toBe(true);
    } finally { digest.mockRestore(); }
  });

  it('another equipment\'s file reads as one Korean line per problem, with the hint naming both equipment; paths stay in a closed «자세히» (UX-1, UX-2)', async () => {
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile(synth02));
    expect(await within(dialog).findByText('다른 설비의 Sample Window입니다.', {}, slow)).toBeTruthy();
    const hint = within(dialog).getByText('이 파일은 eq-synth-02의 Sample Window입니다. eq-synth-03의 파일을 고르세요.');
    expect(confirmButton(dialog).getAttribute('aria-describedby')).toBe(hint.id);
    expect(within(dialog).queryByText(/문제를 고친 파일/)).toBeNull();
    const lines = within(dialog).getAllByRole('listitem').filter((li) => !li.closest('details'));
    expect(lines.every((li) => !/[a-z]+-[a-z]+ ·/.test(li.textContent ?? ''))).toBe(true);
    const details = within(dialog).getByText('자세히').closest('details')!;
    expect(details.open).toBe(false);
    expect(within(details).getAllByText(/^equipment-mismatch · equipmentId — /)).toHaveLength(1);
    expect(within(dialog).getByRole('status').textContent).toBe(`가져올 수 없습니다 · 문제 ${lines.length}건`);
  });

  it('a JSON that is not a batch is one line «Sample Window(batch) 파일 형식이 아닙니다.» (UX-1)', async () => {
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile('{"hello":1}', 'notbatch.batch.json'));
    expect(await within(dialog).findByText('Sample Window(batch) 파일 형식이 아닙니다.', {}, slow)).toBeTruthy();
    expect(within(dialog).getByRole('status').textContent).toBe('가져올 수 없습니다 · 문제 1건');
    expect(within(dialog).getByText('원천 변환기가 만든 *.batch.json 파일을 고르세요.')).toBeTruthy();
  });

  it('the same content as a stored window keeps 가져오기 off: «이미 있는 window입니다» (UX-3)', async () => {
    mount('engineer', '&equipment=eq-synth-02');
    const dialog = await importDialog();
    pick(dialog, batchFile(synth02));
    await waitFor(() => expect(within(dialog).getByRole('status').textContent).toBe('이미 있는 window입니다'), slow);
    expect(confirmButton(dialog).hasAttribute('disabled')).toBe(true);
    expect(confirmButton(dialog).getAttribute('aria-describedby')).toBe(within(dialog).getByRole('status').id);
  });

  it('the content of a retired window is refused in the preview, as the server would (C1)', async () => {
    server.state.windows['eq-synth-02']![0]!.state = 'retired';
    mount('engineer', '&equipment=eq-synth-02');
    const dialog = await importDialog();
    pick(dialog, batchFile(synth02));
    expect(await within(dialog).findByText('퇴역한 window와 같은 내용입니다.', {}, slow)).toBeTruthy();
    expect(within(dialog).getByText('퇴역한 window는 다시 가져올 수 없습니다. 다른 파일을 고르세요.')).toBeTruthy();
    expect(confirmButton(dialog).hasAttribute('disabled')).toBe(true);
  });

  it('a reprocessed generation of a range that already has a staged window is refused in the preview, with no upload (C3)', async () => {
    mount('engineer', '&equipment=eq-synth-01');
    const dialog = await importDialog();
    pick(dialog, batchFile(JSON.stringify(JSON.parse(forEquipment('eq-synth-01'))).replaceAll('"dataGeneration":"g1"', '"dataGeneration":"g7"')));
    expect(await within(dialog).findByText('같은 구간에 교체 대기 window가 이미 있습니다.', {}, slow)).toBeTruthy();
    expect(within(dialog).queryByText(/교체 대기로 가져옵니다/)).toBeNull();
    expect(confirmButton(dialog).hasAttribute('disabled')).toBe(true);
    expect(server.state.uploadCalls).toEqual([]);
  });

  it('a server refusal reads as the same Korean lines, with the paths in «자세히» (UX-1)', async () => {
    server.state.refuseImport = { outcome: 'invalid', path: ['file'], code: 'staged_exists' };
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile(forEquipment('eq-synth-03')));
    await within(dialog).findByText('site-synth', {}, slow);
    fireEvent.click(confirmButton(dialog));
    expect(await within(dialog).findByText('같은 구간에 교체 대기 window가 이미 있습니다.', {}, slow)).toBeTruthy();
    expect(within(dialog).getByText('데이터 탭에서 교체 대기 window를 먼저 «교체»한 뒤 가져오세요.')).toBeTruthy();
  });

  it('a retry after a refused import uploads with the same idempotency key (C5)', async () => {
    server.state.refuseImport = { outcome: 'invalid', path: ['uploadId'], code: 'not_found' };
    mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile(forEquipment('eq-synth-03')));
    await within(dialog).findByText('site-synth', {}, slow);
    fireEvent.click(confirmButton(dialog));
    expect(await within(dialog).findByText('올린 파일을 찾을 수 없습니다.', {}, slow)).toBeTruthy();
    fireEvent.click(confirmButton(dialog));
    await waitFor(() => expect(writes().map((w) => w.action)).toEqual(['eqv.importSampleWindow', 'eqv.importSampleWindow']), slow);
    expect(server.state.uploadCalls).toHaveLength(2);
    expect(server.state.uploadCalls[1]!.idempotencyKey).toBe(server.state.uploadCalls[0]!.idempotencyKey);
  });

  it('while uploading the confirm reads «올리는 중…» with the dialog busy; leaving the page aborts the upload (UX-7, C6)', async () => {
    server.state.holdUpload = true;
    const view = mount('engineer', '&equipment=eq-synth-03');
    const dialog = await importDialog();
    pick(dialog, batchFile(forEquipment('eq-synth-03')));
    await within(dialog).findByText('site-synth', {}, slow);
    fireEvent.click(confirmButton(dialog));
    const busy = await within(dialog).findByRole('button', { name: '올리는 중…' }, slow);
    expect(busy.hasAttribute('disabled')).toBe(true);
    expect(dialog.querySelector('[aria-busy="true"]')).not.toBeNull();
    const { signal } = server.state.uploadCalls[0]!;
    expect(signal?.aborted).toBe(false);
    view.unmount();
    expect(signal?.aborted).toBe(true);
    expect(writes()).toEqual([]);
  });

  it('without the upload port the control is absent and a muted line says why', async () => {
    mountAt(server, 'engineer', '&equipment=eq-synth-01', { upload: false });
    expect(await screen.findByText('이 환경에서는 파일을 올릴 수 없어 Sample Window를 가져올 수 없습니다.', {}, slow)).toBeTruthy();
    expect(maybe('Sample Window 가져오기')).toBeNull();
  });
});

describe('equipment registration', () => {
  it('registers an equipment under a Fleet Model; it appears in Fleet as 관측 없음', async () => {
    mount('engineer');
    fireEvent.click(await screen.findByRole('button', { name: '설비 등록' }, slow));
    const dialog = await screen.findByRole('dialog', { name: '설비 등록' }, slow);
    fireEvent.change(within(dialog).getByLabelText(/설비 ID/), { target: { value: 'eq-new-01' } });
    fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: 'New 01' } });
    fireEvent.keyDown(within(dialog).getByRole('combobox', { name: /Model/ }), { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Synth Maker / Synth Model' }, slow));
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    await waitFor(() => expect(writes()).toEqual([{ action: 'eqv.registerEquipment', input: { equipmentId: 'eq-new-01', label: 'New 01', vendorId: 'synth-maker', modelId: 'synth-model' }, expectedVersion: undefined }]), slow);
    expect(await screen.findByText('eq-new-01', {}, slow)).toBeTruthy();
    expect(screen.getAllByText('관측 없음')).toHaveLength(2);
  });

  it('refuses an id the address cannot carry before writing', async () => {
    mount('engineer');
    fireEvent.click(await screen.findByRole('button', { name: '설비 등록' }, slow));
    const dialog = await screen.findByRole('dialog', { name: '설비 등록' }, slow);
    const id = within(dialog).getByLabelText(/설비 ID/);
    fireEvent.change(id, { target: { value: 'eq new' } });
    // Not on every keystroke (UX-11): the rule shows after the field is left, in a polite live region.
    expect(within(dialog).queryByText(/영문·숫자로 시작/)).toBeNull();
    fireEvent.blur(id);
    const error = within(dialog).getByText('영문·숫자로 시작하고 영문·숫자와 . _ - 만 씁니다.');
    expect(error.getAttribute('aria-live')).toBe('polite');
    expect(id.getAttribute('aria-describedby')).toBe(error.id);
    expect(within(dialog).getByRole('button', { name: '등록' }).hasAttribute('disabled')).toBe(true);
  });

  it('a refused registration returns focus to the ID input (UX-9)', async () => {
    mount('engineer');
    fireEvent.click(await screen.findByRole('button', { name: '설비 등록' }, slow));
    const dialog = await screen.findByRole('dialog', { name: '설비 등록' }, slow);
    fireEvent.change(within(dialog).getByLabelText(/설비 ID/), { target: { value: 'EQ-SYNTH-01' } });
    fireEvent.change(within(dialog).getByLabelText(/이름/), { target: { value: 'Dup' } });
    const model = within(dialog).getByRole('combobox', { name: /Model/ });
    fireEvent.keyDown(model, { key: 'ArrowDown' });
    fireEvent.click(await screen.findByRole('option', { name: 'Synth Maker / Synth Model' }, slow));
    // Radix hands focus back to the trigger in a timer after the list closes; under load that timer could land after the refocus.
    await waitFor(() => expect(document.activeElement).toBe(model), slow);
    fireEvent.click(within(dialog).getByRole('button', { name: '등록' }));
    expect(await within(dialog).findByText(/이미 등록된 설비 ID입니다/, {}, slow)).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(within(dialog).getByLabelText(/설비 ID/)), slow);
  });

  it('the «모두 정하세요» line is read, not shown, and describes the disabled button (UX-11)', async () => {
    mount('engineer');
    fireEvent.click(await screen.findByRole('button', { name: '설비 등록' }, slow));
    const dialog = await screen.findByRole('dialog', { name: '설비 등록' }, slow);
    const reason = within(dialog).getByText('설비 ID, 이름, Model을 모두 정하세요.');
    expect(reason.className).toContain('sr-only');
    expect(within(dialog).getByRole('button', { name: '등록' }).getAttribute('aria-describedby')).toBe(reason.id);
  });

  it('Fleet shows the registered name under the id, and the equipment header beside it (UX-4)', async () => {
    mount('engineer');
    const table = await screen.findByRole('table', { name: /Fleet/ }, slow);
    expect(within(table).getByText('Synth cluster 01')).toBeTruthy();
    cleanup();
    mount('engineer', '&equipment=eq-synth-01');
    expect(await screen.findByText('Synth cluster 01', {}, slow)).toBeTruthy();
  });

  it('with no Model to pick, the dialog says where the first equipment is registered; an empty Fleet promises nothing it cannot do (UX-5)', async () => {
    server.state.fleet = [];
    mount('engineer');
    expect(await screen.findByText('등록된 설비가 없습니다', {}, slow)).toBeTruthy();
    expect(screen.queryByText(/등록한 뒤 Sample Window를 가져오세요/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '설비 등록' }));
    const dialog = await screen.findByRole('dialog', { name: '설비 등록' }, slow);
    expect(within(dialog).getByText('등록할 Model이 아직 없습니다. EV 개발 도구에서 첫 설비를 등록하세요.')).toBeTruthy();
  });

  it('without eqv-studio:window-import the empty Fleet and 데이터 do not ask to import or register', async () => {
    server.state.fleet = [];
    mount('viewer');
    expect(await screen.findByText('등록된 설비가 없습니다', {}, slow)).toBeTruthy();
    expect(screen.queryByText(/등록하세요|가져오세요/)).toBeNull();
    cleanup();
    server.state.fleet = createServer().state.fleet;
    mount('viewer', '&equipment=eq-synth-03');
    expect(await screen.findByText('Sample Window가 없습니다', {}, slow)).toBeTruthy();
    expect(screen.queryByText(/등록하세요|가져오세요/)).toBeNull();
  });

  it('a viewer sees neither registration nor import', async () => {
    mount('viewer');
    await screen.findByText('게시됨 · Drift 미확인', {}, slow);
    expect(maybe('설비 등록')).toBeNull();
    cleanup();
    mount('viewer', '&equipment=eq-synth-01');
    await screen.findByRole('table', { name: /Sample Windows/ }, slow);
    expect(maybe('Sample Window 가져오기')).toBeNull();
  });
});
