// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { createServer, mountAt, params, type Roles, type Server } from './test-support';

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
    fireEvent.click(await screen.findByRole('option', { name: /g2$/ }, slow));
    await waitFor(() => expect(params().window).toBe(STAGED), slow);
    await waitFor(() => expect(server.state.queries.some((q) => q.endpoint === 'eqv.observedInventory' && (q.params as { windowHash: string }).windowHash === STAGED)).toBe(true), slow);
    expect(await screen.findByText(/표본 기간 2026-01-01T10:00:00.000/, {}, slow)).toBeTruthy();
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

  it('unsaved edits hold a tab switch (the address guard waits for the shell) and stay', async () => {
    mount('engineer', '&equipment=eq-synth-01&step=mapping');
    const list = await aliasList();
    fireEvent.click(option('PM1'));
    fireEvent.keyDown(list, { key: 'i' });
    await screen.findByText('저장 안 됨 · Model', {}, slow);
    openTab(/^Inventory/);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(params().step).toBe('mapping');
    expect(within(option('PM1')).getByText(/무시/)).toBeTruthy();
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
    expect(within(dialog).getByText('열린 binding(2026-01-01T10:04:30.000 ~)을 2026-01-01T10:30:00.000에서 닫습니다')).toBeTruthy();
    expect(within(dialog).getByText(/^새 binding 2026-01-01T10:30:00.000 ~ \(열림\)/)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: '게시' }));
    await waitFor(() => expect(writes().map((w) => w.action)).toEqual(['eqv.publishRevision', 'eqv.publishMapping']), slow);
    expect(writes()[0]).toEqual({ action: 'eqv.publishRevision', input: { layoutId: 'eq-synth-01-layout' }, expectedVersion: '1' });
    expect(writes()[1]).toMatchObject({ input: { equipmentId: 'eq-synth-01', layoutId: 'eq-synth-01-layout', layoutRevision: `sha256:${'b'.repeat(64)}`, effectiveFrom: '2026-01-01T10:30:00.000', baseline: expect.objectContaining({ equipmentId: 'eq-synth-01' }) }, expectedVersion: '2' });
    await waitFor(() => expect(notify).toHaveBeenCalledWith('Mapping을 게시했습니다', 'info'), slow);
  });

  it.each([
    ['empty', '', /^effectiveFrom 형식이 올바르지 않습니다/],
    ['not after the latest Binding', '2026-01-01T10:00:00.000', /^effectiveFrom은 마지막 binding/],
  ])('an effectiveFrom that is %s disables 게시 검토 with one reason line', async (_name, value, reason) => {
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.change(screen.getByLabelText(/effectiveFrom/), { target: { value } });
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(true), slow);
    expect(document.getElementById('publish-reason')?.textContent).toMatch(reason);
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

  it('a server refusal as the same as the latest publish says so in the dialog', async () => {
    server.state.refuseMapping = { outcome: 'invalid', code: 'same-as-latest' };
    mount('engineer', '&equipment=eq-synth-01&step=validate');
    const review = await screen.findByRole('button', { name: '게시 검토' }, slow);
    await waitFor(() => expect((review as HTMLButtonElement).disabled).toBe(false), slow);
    fireEvent.click(review);
    fireEvent.click(within(await screen.findByRole('alertdialog', {}, slow)).getByRole('button', { name: '게시' }));
    expect(await screen.findByText('이전 게시와 같습니다', {}, slow)).toBeTruthy();
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

