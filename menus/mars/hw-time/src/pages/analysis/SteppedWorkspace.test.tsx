// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EQUIPMENT_SELECTION_DIMENSION, PANEL_INSTANCES_MAX, PANEL_INSTANCE_TOKEN_MAX } from '@ap/contracts';
import { usePlatform, useUnsavedGuard } from '@ap/kernel';
import type { MenuView, PanelInstance } from '@ap/contracts';
import { createFakeSavedViewStore, memoryStorage, testSavedView, useLeaveRequest, useSavedViews, type SavedViews } from '@ap/kernel/testing';
import { HELD_SOURCE_ID, heldOutput, instanceSlot } from './heldPanels';
import { answer, openPanelPicker, renderOverview, requests, settle } from './test-support';

const chart = (id = 'hw-current') => JSON.parse(screen.getByTestId(id).textContent!);
const config = () => JSON.parse(screen.getByTestId('workspace').getAttribute('data-config')!);
const tree = () => screen.getByRole('tree', { name: '계층' });
const node = (name: string) => within(tree()).getAllByText(name, { exact: true })[0]!;
const addButton = () => within(screen.getByTestId('workspace-actions')).getByRole('button', { name: '패널 추가' });
async function add(title: string, { pin = true } = {}) {
  const picker = within(await openPanelPicker(addButton()));
  if (!pin) fireEvent.click(picker.getByRole('checkbox', { name: '추가하면 고정' }));
  fireEvent.click(picker.getByRole('button', { name: title }));
  await settle();
}
let layoutStorage: Storage;
beforeEach(() => {
  requests.length = 0;
  layoutStorage = memoryStorage();
  vi.stubGlobal('localStorage', layoutStorage); vi.stubGlobal('sessionStorage', memoryStorage());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('HW Time saved view panels', () => {
  const makeInstance = (panel: string): PanelInstance => ({ id: panel, source: { kind: 'declared', panel }, inputs: [], outputs: [] });
  const missing = makeInstance('retired');
  const donut = makeInstance('donut');
  const pareto = makeInstance('pareto');
  const storedPanels = { version: 1, instances: [missing, donut] } as const;
  const saved = (over: Partial<MenuView> = {}) => testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context: { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' }, page: [], chartOptions: {},
    layout: null, panels: { version: storedPanels.version, instances: [...storedPanels.instances] }, ...over,
  });
  let views: SavedViews;
  let appliedPins: readonly string[];
  function Probe() {
    views = useSavedViews();
    appliedPins = usePlatform().pageParams('pins');
    return null;
  }
  async function mount(store: ReturnType<typeof createFakeSavedViewStore>, search = '') {
    await renderOverview(search, answer, { savedViews: store, children: <Probe /> });
    await waitFor(() => expect(views.status).toBe('ready'));
  }
  async function open(id: string) {
    await act(async () => { expect(await views.select(id)).toMatchObject({ ok: true }); });
  }

  const donutTitle = '판정 비율 도넛';
  const paretoTitle = '상한 초과 파레토';
  const aliasView = (id: string, instance = donut, over: Partial<MenuView> = {}) =>
    saved({ id, panels: { version: 1, instances: [{ ...instance, id: 'extra' }] }, ...over });
  const visible = (name: string) => screen.queryByRole('tab', { name }) !== null;
  async function real(store: ReturnType<typeof createFakeSavedViewStore>, children = <Probe />, search = '') {
    const app = await renderOverview(search, answer, { savedViews: store, children, realWorkspace: true, realChart: search ? 'hw-current' : undefined, showSelectionChips: Boolean(search) });
    await waitFor(() => expect(views.status).toBe('ready'));
    return app;
  }
  async function command(title: string, action: string) {
    fireEvent.keyDown(await screen.findByRole('tab', { name: title }), { key: 'F10', shiftKey: true });
    fireEvent.click(await screen.findByRole('menuitem', { name: action }));
    await settle();
  }
  async function copy(name: string) {
    const result = await act(() => views.saveAs({ name, kind: 'menu-view' }));
    if (!result.ok) throw new Error('Failed to save view');
    return result.value.view.id;
  }
  function flushLayout() { fireEvent(window, new Event('pagehide')); }
  function savedLayout(viewId: string, step = 1) {
    const entries: [string, string][] = JSON.parse(layoutStorage.getItem(`platform:workspace:v1:u1:hw-time:hw-time-s${step}-v1:scopes`) ?? '[]');
    return entries.find(([scope]) => scope === JSON.stringify(['MEM', viewId]))?.[1];
  }

  it('isolates Save As layout edits and clearing the picker (#3080 C1)', async () => {
    await real(createFakeSavedViewStore([aliasView('A')]));
    await open('A');
    const b = await copy('B');
    await command(donutTitle, '숨기기');
    flushLayout();
    await open('A');
    expect.soft(visible(donutTitle)).toBe(true);
    await open(b);
    expect.soft(visible(donutTitle)).toBe(false);
    await open('A');
    act(() => views.clearSelection());
    expect(views.selected).toBeNull();
    await command(donutTitle, '숨기기');
    flushLayout();
    await open('A');
    expect(visible(donutTitle)).toBe(true);
  });

  it('hands focus to the primary tab when the last saved alias is deleted (#3080 C5)', async () => {
    await real(createFakeSavedViewStore([aliasView('A')]));
    await open('A');
    await command(donutTitle, '삭제');
    expect(visible(donutTitle)).toBe(false);
    expect(document.activeElement?.getAttribute('data-tab-panel-id')).toBe('current');
  });

  // What views C and D save (#3080 C6); the first half checks it and the second half starts from it.
  const c6Search = '&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105';
  const c6Page: [string, string][] = [['drillModule', 'PM1'], ['drillMotion', 'Pump'], ['moduleType', 'PM']];
  const c6Publisher: PanelInstance = { id: 'current', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs: [heldOutput] };
  const c6HeldSource: PanelInstance = { ...c6Publisher, id: HELD_SOURCE_ID };
  const c6HeldTable: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: heldOutput.key, from: `${HELD_SOURCE_ID}.${heldOutput.key}`, mode: 'hold', value: { shape: 'set', values: ['MEM-PHOTO-0105'] } }] };
  const c6FollowingTable: PanelInstance = { id: 'table-2', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: heldOutput.key, from: `${c6Publisher.id}.${heldOutput.key}`, mode: 'follow' }] };
  const c6Instances = [c6HeldTable, c6FollowingTable, c6Publisher, c6HeldSource];

  // Split (main-fix, #3128): each saved-view open remounts the dock; one test opening many views passed the 15 s CI limit.
  it.each(['reopen C', 'save directly'])('keeps the second raw table slot when users %s (#3080 C6)', async flow => {
    const store = createFakeSavedViewStore([]);
    await real(store, <Probe />, c6Search);
    async function newTable(name: string) {
      fireEvent.click(await screen.findByRole('button', { name: '새 패널' }));
      fireEvent.click(within(await screen.findByRole('dialog', { name: '새 패널' })).getByRole('button', { name }));
      await settle();
    }
    await newTable('원본 표 · 붙잡기');
    const chartTab = screen.getByRole('tab', { name: 'PM1 · Pump · 설비별' });
    chartTab.focus();
    fireEvent.keyDown(chartTab, { key: 'Enter' });
    await newTable('원본 표');
    const tableId = () => screen.getByRole('tab', { name: '원본 표' }).dataset.tabPanelId;
    const slot = tableId();
    expect(slot).toBe(instanceSlot(c6FollowingTable));
    const c = await copy('C');
    if (flow === 'reopen C') await open(c);
    expect.soft(tableId()).toBe(slot);
    const d = await copy('D');
    for (const id of [c, d]) {
      const row = store.rows.get(id);
      if (row?.kind !== 'menu-view') throw new Error(`Expected saved menu view ${id}`);
      expect(row.page).toEqual(c6Page);
      expect(row.panels).toEqual({ version: 1, instances: c6Instances });
    }
  });

  it('keeps the second raw table hidden only in D when users reopen C and then D (#3080 C6)', async () => {
    const view = (id: string) => saved({ id, page: c6Page, panels: { version: 1, instances: c6Instances } });
    await real(createFakeSavedViewStore([view('C'), view('D')]), <Probe />, c6Search);
    await open('D');
    expect(screen.getByRole('tab', { name: '원본 표' }).dataset.tabPanelId).toBe(instanceSlot(c6FollowingTable));
    await command('원본 표', '숨기기');
    flushLayout();
    await open('C');
    expect.soft(visible('원본 표')).toBe(true);
    await open('D');
    expect(visible('원본 표')).toBe(false);
    expect(visible('원본 표 · 붙잡음')).toBe(true);
  });

  it('keeps B’s stored hide through a deferred open with a different alias set (#3080 C7)', async () => {
    const store = createFakeSavedViewStore([saved({ id: 'A', panels: { version: 1, instances: [pareto] } }), aliasView('B')]);
    await real(store);
    await open('B');
    await command(donutTitle, '숨기기');
    flushLayout();
    const before = savedLayout('B');
    expect(before).toBeDefined();
    const writes = vi.spyOn(layoutStorage, 'setItem');
    await open('A');
    flushLayout();
    writes.mockClear();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const get = store.get.bind(store);
    store.get = async id => { await gate; return get(id); };
    let pending!: ReturnType<SavedViews['select']>;
    act(() => { pending = views.select('B'); });
    expect(visible(paretoTitle)).toBe(true);
    await act(async () => { release(); expect(await pending).toMatchObject({ ok: true }); });
    flushLayout();
    expect.soft(visible(donutTitle)).toBe(false);
    expect(savedLayout('B')).toBe(before);
    expect(writes).not.toHaveBeenCalled();
  });

  function PeriodControls() {
    const [dirty, setDirty] = useState(false);
    const { setGlobal } = usePlatform();
    const request = useLeaveRequest();
    useUnsavedGuard(dirty, { leaves: 'address' });
    return <><Probe />
      <button onClick={() => setGlobal({ from: '2026-09-20T09:00:00' })}>Apply another period</button>
      <button onClick={() => setGlobal({ from: '2026-09-19T09:00:00' })}>Apply original period</button>
      <button onClick={() => setDirty(true)}>Hold navigation</button>
      {request && <button onClick={() => { setDirty(false); request.confirm(); }}>Confirm navigation</button>}
    </>;
  }

  it.each(['apply', 'guarded open'])('keeps A’s layout through %s and reopens its hidden alias (#3080 C7′)', async flow => {
    const page: MenuView['page'] = [['pins', 'pareto']];
    await real(createFakeSavedViewStore([aliasView('A', donut, { page }), saved({
      id: 'B', context: { from: '2026-09-20T09:00:00', to: '2026-09-26T09:00:00' }, page, panels: null,
    })]), <PeriodControls />);
    await open('A');
    await command(donutTitle, '숨기기');
    flushLayout();
    const before = savedLayout('A');
    expect(before).toBeDefined();
    if (flow === 'guarded open') {
      fireEvent.click(screen.getByRole('button', { name: 'Hold navigation' }));
      await act(async () => { expect(await views.select('B')).toMatchObject({ ok: false, reason: 'held' }); });
      fireEvent.click(screen.getByRole('button', { name: 'Confirm navigation' }));
      await waitFor(() => expect(views.selected?.view.id).toBe('B'));
    } else {
      fireEvent.click(screen.getByRole('button', { name: 'Apply another period' }));
      await waitFor(() => expect(views.state.modified).toBe(true));
      expect(views.selected?.view.id).toBe('A');
    }
    await settle();
    expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toHaveProperty('disabled', true);
    await command(paretoTitle, '숨기기');
    flushLayout();
    expect(savedLayout('A')).toBe(before);
    await open('A');
    expect(visible(donutTitle)).toBe(false);
    expect(visible(paretoTitle)).toBe(true);
    expect(screen.getByRole('button', { name: '숨긴 패널 1' })).toHaveProperty('disabled', false);
  });

  it.each(['overwrite', 'save as'] as const)('keeps the reset layout unbound after a deferred %s and period round trip (#3080 F1)', async mode => {
    const store = createFakeSavedViewStore([aliasView('A', donut, { page: [['pins', 'pareto']] })]);
    await real(store, <PeriodControls />);
    await open('A');
    await command(donutTitle, '숨기기');
    const tables = within(await openPanelPicker(screen.getByRole('button', { name: /패널 추가/ })));
    // Unpinned on purpose: the period reset must remove this table.
    fireEvent.click(tables.getByRole('checkbox', { name: '추가하면 고정', checked: true }));
    fireEvent.click(tables.getByRole('button', { name: '원본 표' }));
    await settle();
    expect(visible('원본 표')).toBe(true);
    flushLayout();
    const before = savedLayout('A');
    expect(before).toContain('saved-instance-extra');
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const update = store.update.bind(store);
    const save = store.save.bind(store);
    store.update = async (...args) => { await gate; return update(...args); };
    store.save = async (...args) => { await gate; return save(...args); };
    let pending!: ReturnType<SavedViews['saveAs']>;
    act(() => { pending = mode === 'overwrite' ? views.saveToSelected() : views.saveAs({ name: 'B', kind: 'menu-view' }); });
    fireEvent.click(screen.getByRole('button', { name: 'Apply another period' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '숨긴 패널 0' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Apply original period' }));
    await settle();
    expect(visible('원본 표')).toBe(false);
    const result = await act(async () => { release(); return pending; });
    if (!result.ok) throw new Error('Failed to save view');
    await command(paretoTitle, '숨기기');
    flushLayout();
    expect.soft(savedLayout('A')).toBe(before);
    if (mode === 'save as') {
      expect.soft(views.selected?.view.id).toBe('A');
      expect.soft(savedLayout(result.value.view.id)).toBeUndefined();
    }
    await open('A');
    expect(visible(donutTitle)).toBe(false);
  });

  it('pins the added Pareto slot when a donut owns its wire ID (#3080 F2)', async () => {
    await real(createFakeSavedViewStore([saved({ id: 'A', panels: { version: 1, instances: [{ ...donut, id: 'pareto' }] } })]));
    await open('A');
    const picker = within(await openPanelPicker(screen.getByRole('button', { name: /패널 추가/ })));
    expect(picker.getByRole('checkbox', { name: '추가하면 고정', checked: true })).toBeTruthy();
    fireEvent.click(picker.getByRole('button', { name: paretoTitle }));
    await settle();
    const slots = () => screen.getAllByRole('tab', { name: paretoTitle }).map(tab => tab.dataset.tabPanelId);
    expect(slots()).toEqual(['saved-instance-pareto_007e1']);
    expect(appliedPins).toContain('pareto');
    const tab = screen.getByRole('tab', { name: paretoTitle });
    tab.focus();
    fireEvent.keyDown(tab, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: `${paretoTitle} 고정`, pressed: true }));
    await settle();
    expect(slots()).toEqual(['saved-instance-pareto_007e1']);
    expect(appliedPins).not.toContain('pareto');
    expect(screen.getByRole('button', { name: `${paretoTitle} 고정`, pressed: false })).toBeTruthy();
  });

  it('keeps the canonical donut open on unpin beside a saved alias (#3080 F2)', async () => {
    await real(createFakeSavedViewStore([aliasView('A', donut, { page: [['pins', 'donut']] })]));
    await open('A');
    const tabs = () => screen.getAllByRole('tab', { name: donutTitle });
    const slots = () => tabs().map(tab => tab.dataset.tabPanelId);
    expect(slots()).toEqual(['saved-instance-extra', 'donut']);
    expect(appliedPins).toContain('donut');
    const canonical = tabs().find(tab => tab.dataset.tabPanelId === 'donut')!;
    canonical.focus();
    fireEvent.keyDown(canonical, { key: 'Enter' });
    fireEvent.click(await screen.findByRole('button', { name: `${donutTitle} 고정`, pressed: true }));
    await settle();
    expect(slots()).toEqual(expect.arrayContaining(['saved-instance-extra', 'donut']));
    expect(slots()).toHaveLength(2);
    expect(appliedPins).not.toContain('donut');
  });

  it('keeps a hidden following table in its allocated slot after deleting the wire ID collision (#3080 F3)', async () => {
    await real(createFakeSavedViewStore([saved({ id: 'A', page: stepFourPage, panels: { version: 1, instances: [{ ...donut, id: 'table' }] } })]));
    await open('A');
    const tableSlot = () => screen.getByRole('tab', { name: '원본 표' }).dataset.tabPanelId;
    expect(tableSlot()).toBe('saved-instance-table-2');
    await command('원본 표', '숨기기');
    flushLayout();
    expect(savedLayout('A', 4)).toContain('saved-instance-table-2');
    await command(donutTitle, '삭제');
    expect.soft(visible('원본 표')).toBe(false);
    const result = await act(() => views.saveToSelected());
    expect(result).toMatchObject({ ok: true, value: { view: { panels: { instances: expect.arrayContaining([
      expect.objectContaining({ id: 'table-2', source: { kind: 'declared', panel: 'table' } }),
    ]) } } } });
    await open('A');
    expect(visible('원본 표')).toBe(false);
    fireEvent.keyDown(screen.getByRole('button', { name: /숨긴 패널 [12]/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: /원본 표/ }));
    await waitFor(() => expect(tableSlot()).toBe('saved-instance-table-2'));
  });

  it('binds a reset configuration to the overwritten view without replay (#3080)', async () => {
    const page: MenuView['page'] = [['pins', 'pareto']];
    await real(createFakeSavedViewStore([aliasView('A', donut, { page })]), <PeriodControls />);
    await open('A');
    fireEvent.click(screen.getByRole('button', { name: 'Apply another period' }));
    await waitFor(() => expect(visible(donutTitle)).toBe(false));
    const result = await act(() => views.saveToSelected());
    expect(result).toMatchObject({ ok: true, value: { view: { id: 'A', panels: null } } });
    await command(paretoTitle, '숨기기');
    flushLayout();
    act(() => views.clearSelection());
    expect(visible(paretoTitle)).toBe(true);
    await open('A');
    expect(visible(paretoTitle)).toBe(false);
  });

  it('retains the live panel edit and selection on an in-place store swap (#3080 C8)', async () => {
    const store = () => createFakeSavedViewStore([aliasView('A')]);
    const app = await real(store());
    await open('A');
    await command(donutTitle, '삭제');
    act(() => app.replaceStore(store()));
    await waitFor(() => expect(views.status).toBe('ready'));
    expect(views.selected?.view.id).toBe('A');
    expect(visible(donutTitle)).toBe(false);
    expect(views.state.modified).toBe(true);
  });

  it('keeps hiding local to a view when the same instance id names different panels (#3080)', async () => {
    await real(createFakeSavedViewStore([aliasView('A'), aliasView('B', pareto)]));
    await open('A');
    await command(donutTitle, '숨기기');
    flushLayout();
    await open('B');
    expect.soft(visible(paretoTitle)).toBe(true);
    await open('A');
    expect(visible(donutTitle)).toBe(false);
  });

  it.each(['donut', 'held table'])('reports the actual pin capability for a restored %s alias (#3080)', async panel => {
    const held = panel === 'held table';
    const view = held ? saved({ page: stepFourPage, panels: { version: 1, instances: [makeInstance('table'), heldTable('held-copy'), equipmentSource()] } }) : aliasView('saved');
    await real(createFakeSavedViewStore([view]));
    await open('saved');
    await command(held ? '원본 표 · 붙잡음' : donutTitle, '이 패널 만든 방법');
    const body = await screen.findByRole('region', { name: '패널 설명 본문' });
    expect(within(body).getByText('고정').closest('li')?.textContent).toContain('미사용');
  });

  it('saves two added panels and restores their order after reopening and reloading', async () => {
    const store = createFakeSavedViewStore([]);
    await mount(store);
    await add('상한 초과 파레토', { pin: false });
    await add('판정 비율 도넛');
    const result = await act(() => views.saveAs({ name: 'Panels', kind: 'menu-view' }));
    expect(result).toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances: [pareto, donut] } } } });
    if (!result.ok) throw new Error('Failed to save view');
    cleanup();
    await mount(store, '&moduleType=PM');
    await open(result.value.view.id);
    await waitFor(() => expect(config().ids).toEqual(['tree', 'current', 'pareto', 'donut']));
    expect(screen.getByRole('tab', { name: 'current' }).getAttribute('aria-selected')).toBe('true');
    cleanup();
    await mount(store);
    await waitFor(() => expect(config().ids).toEqual(['tree', 'current', 'pareto', 'donut']));
  });

  it('frees one slot at the saved panel limit and lets the user add another panel', async () => {
    const copies = Array.from({ length: PANEL_INSTANCES_MAX - 1 }, (_, index) => ({ ...donut, id: `donut-${index}` }));
    const instances = [donut, ...copies];
    await mount(createFakeSavedViewStore([saved({ panels: { version: 1, instances } })]));
    await open('saved');
    await waitFor(() => expect(config().ids).toContain('donut'));
    const picker = within(await openPanelPicker(addButton()));
    const blocked = picker.getByRole('button', { name: '상한 초과 파레토', description: /패널 ⋯에서 삭제하세요\./ });
    expect(blocked.getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(picker.getByRole('searchbox', { name: '패널 검색' }), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '패널 추가' })).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'remove donut' }));
    await settle();
    expect(await act(() => views.saveAs({ name: '23 panels', kind: 'menu-view' })))
      .toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances: copies } } } });
    await add('상한 초과 파레토');
    expect(await act(() => views.saveAs({ name: '24 panels', kind: 'menu-view' })))
      .toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances: [...copies, pareto] } } } });
  });

  it('can revert deletion before saving, and reopens without the deleted pinned instance after saving', async () => {
    const store = createFakeSavedViewStore([saved({ page: [['pins', 'donut']], panels: { version: 1, instances: [donut, pareto] } })]);
    await mount(store);
    await open('saved');
    await waitFor(() => expect(config().pins.donut).toBe(true));
    expect(screen.queryByRole('button', { name: 'remove tree' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'remove current' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'remove donut' }));
    await settle();
    expect(config().ids).toEqual(['tree', 'current', 'pareto']);
    await act(async () => { expect(await views.revertToSaved()).toMatchObject({ ok: true }); });
    await waitFor(() => expect(config().pins.donut).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'remove donut' }));
    await settle();
    expect(await act(() => views.saveToSelected()))
      .toMatchObject({ ok: true, value: { view: { page: [], panels: { version: 1, instances: [pareto] } } } });
    cleanup();
    await mount(store);
    await open('saved');
    await waitFor(() => expect(config().ids).toEqual(['tree', 'current', 'pareto']));
  });

  it('restores a held table without drawing its selection source, and saves the same instances again (#2862)', async () => {
    const table: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
      inputs: [{ key: 'motionEquipment', from: 'held-source.motionEquipment', mode: 'hold', value: { shape: 'set', values: ['MEM-PHOTO-0105'] } }] };
    const source: PanelInstance = { id: 'held-source', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
      outputs: [{ key: 'motionEquipment', dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] };
    const store = createFakeSavedViewStore([saved({ panels: { version: 1, instances: [table, source] } })]);
    await mount(store, '&moduleType=PM&drillMotion=Pump&drillModule=PM1');
    await open('saved');
    await waitFor(() => expect(config().ids).toContain('table'));
    expect(config().ids).not.toContain('saved-instance-held-source');
    expect(config().ids).not.toContain('moduleMotions');
    const result = await act(() => views.saveAs({ name: 'Held', kind: 'menu-view' }));
    expect(result).toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances: [table, source] } } } });
  });

  const heldTable = (id: string, from = 'held-source.motionEquipment'): PanelInstance => ({ id, source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: 'motionEquipment', from, mode: 'hold', value: { shape: 'set', values: ['MEM-PHOTO-0105'] } }] });
  const equipmentSource = (dimension = EQUIPMENT_SELECTION_DIMENSION): PanelInstance => ({ id: 'held-source', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: 'motionEquipment', dimension, shape: 'set' }] });
  const tableReads = () => requests.filter(request => ['hwTime.levelRows', 'hwTime.tableRows'].includes(request.endpoint));

  it('reads each restored raw table on its own: one follows the URL, one keeps its equipment (#2862 R C4)', async () => {
    const following: PanelInstance = { ...makeInstance('table'), inputs: [{ key: 'motionEquipment', from: 'held-source.motionEquipment', mode: 'follow' }] };
    const instances = [following, heldTable('kept'), equipmentSource()];
    const page: [string, string][] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1']];
    await mount(createFakeSavedViewStore([saved({ page, panels: { version: 1, instances } })]), '&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0103');
    await open('saved');
    await waitFor(() => expect(config().ids).toEqual(expect.arrayContaining(['table', 'saved-instance-kept'])));
    expect(screen.getByRole('tab', { name: 'saved-instance-kept' }).getAttribute('aria-description')).toContain('붙잡음 · 설비 1대');
    expect(screen.getByRole('tab', { name: 'table' }).getAttribute('aria-description') ?? '').not.toContain('붙잡음');
    await waitFor(() => {
      const equipment = new Set(tableReads().map(read => (read.params as { motionEquipment?: string[] }).motionEquipment?.join()));
      expect(equipment).toEqual(new Set(['MEM-PHOTO-0103', 'MEM-PHOTO-0105']));
    });
    const result = await act(() => views.saveAs({ name: 'Two', kind: 'menu-view' }));
    expect(result).toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances } } } });
  });

  it('does not apply a held value whose saved source is another dimension, and saves it back unchanged (#2862 R C6)', async () => {
    const instances = [heldTable('table'), equipmentSource('module')];
    await mount(createFakeSavedViewStore([saved({ panels: { version: 1, instances } })]), '&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0103');
    await open('saved');
    expect(await screen.findByText('붙잡은 설비 선택을 적용할 수 없습니다.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'table' }).getAttribute('aria-description')).toBe('붙잡은 설비 선택을 적용할 수 없습니다.');
    expect(tableReads()).toEqual([]);
    expect(screen.queryByRole('table', { name: 'HW Time 동작시간 표' })).toBeNull();
    const result = await act(() => views.saveAs({ name: 'Other', kind: 'menu-view' }));
    expect(result).toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances } } } });
  });

  const motionChart = (id: string): PanelInstance => ({ id, source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: 'motionEquipment', dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] });

  it.each([
    ['keeps the one «모듈 동작» chart the hold came from', ['moduleMotions'], ['moduleMotions']],
    ['keeps neither «모듈 동작» chart when two are drawn, since the hold does not say which', ['moduleMotions', 'motion-b'], []],
  ])('%s (#2862 R2 C7)', async (_name, charts, kept) => {
    const step4: [string, string][] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], ['motionEquipment', 'MEM-PHOTO-0105']];
    await mount(createFakeSavedViewStore([saved({ page: step4, panels: { version: 1, instances: charts.map(motionChart) } })]), '&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105');
    await open('saved');
    await waitFor(() => expect(config().ids).toContain('moduleMotions'));
    fireEvent.click(screen.getByRole('button', { name: 'hold table' }));
    await settle();
    expect(config().ids).toContain('table');
    expect(config().keep).toEqual(kept);
  });

  it('numbers the second raw table when both follow, and a hold changes the later one (#2862 ② R C5)', async () => {
    const tables = [makeInstance('table'), { ...makeInstance('table'), id: 'table-2' }];
    const step4: [string, string][] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], ['motionEquipment', 'MEM-PHOTO-0105']];
    await mount(createFakeSavedViewStore([saved({ page: step4, panels: { version: 1, instances: tables } })]), '&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105');
    await open('saved');
    await waitFor(() => expect(config().ids).toEqual(expect.arrayContaining(['table', 'saved-instance-table-2'])));
    expect([config().titles.table, config().titles['saved-instance-table-2']]).toEqual(['원본 표', '원본 표 2']);
    fireEvent.click(screen.getByRole('button', { name: 'hold table' }));
    await settle();
    expect([config().titles.table, config().titles['saved-instance-table-2']]).toEqual(['원본 표', '원본 표 · 붙잡음']);
    expect(config().ids.filter((id: string) => id === 'table' || id.startsWith('saved-instance-') || id.startsWith('table-'))).toHaveLength(2);
  });

  const step4Page: [string, string][] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], ['motionEquipment', 'MEM-PHOTO-0105']];
  const step4Search = '&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105';

  it('opens the first two of three saved raw tables, and offers the third only for removal (#2862 ② R C13)', async () => {
    const tables = ['table', 'table-2', 'table-3'].map(id => ({ ...makeInstance('table'), id }));
    await mount(createFakeSavedViewStore([saved({ page: step4Page, panels: { version: 1, instances: tables } })]), step4Search);
    await open('saved');
    await waitFor(() => expect(config().ids).toEqual(expect.arrayContaining(['table', 'saved-instance-table-2', 'saved-instance-table-3'])));
    expect([config().titles.table, config().titles['saved-instance-table-2']]).toEqual(['원본 표', '원본 표 2']);
    expect(config().placement['saved-instance-table-3']).toBeUndefined();
    const third = () => screen.getByRole('region', { name: 'panel saved-instance-table-3' });
    expect(within(third()).getByText('같은 패널은 2개까지 함께 엽니다. 이 패널은 저장된 뷰에만 있습니다.')).toBeTruthy();
    const saveAs = async () => act(() => views.saveAs({ name: `Tables ${Math.random()}`, kind: 'menu-view' }));
    expect(await saveAs()).toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances: tables } } } });
    fireEvent.click(within(third()).getByRole('button', { name: 'remove saved-instance-table-3' }));
    await settle();
    expect(config().ids).not.toContain('saved-instance-table-3');
    expect(await saveAs()).toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances: tables.slice(0, 2) } } } });
  });

  it('keeps the automatic trend at step 4 beside a saved trend under another slot (#2862 ② R C11)', async () => {
    const trend = { ...makeInstance('trend'), id: 'trend-2' };
    await mount(createFakeSavedViewStore([saved({ page: step4Page, panels: { version: 1, instances: [makeInstance('donut'), trend] } })]), step4Search);
    await open('saved');
    await waitFor(() => expect(config().ids).toContain('saved-instance-trend-2'));
    expect(config().ids).toContain('trend');
    expect(config().placement.trend).toBe('below');
  });

  it('unpins the raw table even when the saved panels are full (#2862 ② R C2)', async () => {
    const instances = Array.from({ length: 24 }, (_, index) => ({ ...makeInstance('donut'), id: `donut-${index}` }));
    await mount(createFakeSavedViewStore([saved({ page: [...step4Page, ['pins', 'table']], panels: { version: 1, instances } })]), `${step4Search}&pins=table`);
    await open('saved');
    await waitFor(() => expect(config().pins.table).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: 'pin table' }));
    await settle();
    expect(config().ids).not.toContain('table');
    expect(new URLSearchParams(window.location.search).getAll('pins')).not.toContain('table');
  });

  it('opens the day basis from the URL and restores the same panel from a saved view', async () => {
    const store = createFakeSavedViewStore([]);
    const basisLocation = '&moduleType=PM&drillMotion=Pump&motionBasis=day';
    await renderOverview(basisLocation, answer, { savedViews: store, children: <Probe />, waitForData: false });
    await waitFor(() => expect(views.status).toBe('ready'));
    const verifyDayPanel = async () => {
      expect(await within(screen.getByRole('region', { name: 'panel current' })).findByTestId('hw-equipment-days')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Motion: Pump · 일별' })).toBeTruthy();
      expect(requests.find(request => request.endpoint === 'hwTime.equipmentDays')?.params).toEqual({ moduleType: 'PM', drillMotion: 'Pump' });
    };
    await verifyDayPanel();
    const result = await act(() => views.saveAs({ name: 'Day', kind: 'menu-view' }));
    if (!result.ok) throw new Error('Failed to save view');
    expect((result.value.view as MenuView).page).toContainEqual(['motionBasis', 'day']);
    cleanup();
    await mount(store);
    await open(result.value.view.id);
    expect(new URLSearchParams(window.location.search).get('motionBasis')).toBe('day');
    await verifyDayPanel();
  });

  it('renders a reason in the missing slot and renders the other panels', async () => {
    await mount(createFakeSavedViewStore([saved()]));
    await open('saved');
    expect(await screen.findByText('이 패널은 더 이상 없습니다: retired')).toBeTruthy();
    expect(await screen.findByTestId('hw-current')).toBeTruthy();
    expect(await screen.findByTestId('hw-verdict-donut')).toBeTruthy();
  });

  it.each([true, undefined] as const)('resets to the declared panels on a null open (unreadable: %s) and saves that configuration', async panelsUnreadable => {
    const store = createFakeSavedViewStore([saved({ panels: null, panelsUnreadable })]);
    await mount(store);
    await add('판정 비율 도넛');
    await open('saved');
    const reason = screen.queryByText('저장된 패널 구성을 읽을 수 없어 기본 패널로 열었습니다.');
    expect(reason !== null).toBe(panelsUnreadable === true);
    expect(config().ids).toEqual(['tree', 'current']);
    const result = await act(() => views.saveAs({ name: 'Current', kind: 'menu-view' }));
    expect(result).toMatchObject({ ok: true, value: { view: { panels: null } } });
  });

  it('opens a view that pins a missing panel with the reason slot, drops only that pin, and survives a drill', async () => {
    await mount(createFakeSavedViewStore([saved({ page: [['pins', 'retired'], ['pins', 'donut']] })]));
    await open('saved');
    expect(await screen.findByText('이 패널은 더 이상 없습니다: retired')).toBeTruthy();
    expect(await screen.findByTestId('hw-verdict-donut')).toBeTruthy();
    const result = await act(() => views.saveAs({ name: 'Opened', kind: 'menu-view' }));
    if (!result.ok) throw new Error('Failed to save view');
    expect(result.value.view).toMatchObject({ panels: storedPanels });
    expect((result.value.view as MenuView).page).toContainEqual(['pins', 'donut']);
    expect((result.value.view as MenuView).page).not.toContainEqual(['pins', 'retired']);
    fireEvent.click(screen.getByRole('button', { name: 'remove saved-instance-retired' }));
    await settle();
    expect(screen.queryByText('이 패널은 더 이상 없습니다: retired')).toBeNull();
    expect(config().pins.donut).toBe(true);
    fireEvent.click(node('PM'));
    await settle();
    expect(await screen.findByTestId('hw-current')).toBeTruthy();
    expect(config().pins.donut).toBe(true);
  });

  it('keeps the missing instance when saving after open', async () => {
    await mount(createFakeSavedViewStore([saved()]));
    await open('saved');
    const result = await act(() => views.saveAs({ name: 'Copy', kind: 'menu-view' }));
    expect(result).toMatchObject({ ok: true, value: { view: { panels: storedPanels } } });
  });

  const stepFourPage: MenuView['page'] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], ['pins', 'table']];

  it.each([
    ['판정 비율 도넛', { ...donut, id: 'extra' }, '도넛 차트', 'saved-instance-extra'],
    ['상한 초과 파레토', pareto, '파레토 차트', 'pareto'],
    ['PM1 · Pump · 설비별', { ...makeInstance('moduleMotions'), id: 'current' }, '가로 막대', 'current'],
  ] as const)('opens the declared recipe inside the %s slot', async (title, instance, shape, slotId) => {
    const primary = slotId === 'current';
    const store = createFakeSavedViewStore([saved({
      page: primary ? stepFourPage : [],
      panels: { version: 1, instances: [instance] },
    })]);
    await renderOverview('', answer, { savedViews: store, children: <Probe />, realWorkspace: true });
    await waitFor(() => expect(views.status).toBe('ready'));
    await open('saved');
    const tab = await screen.findByRole('tab', { name: title });
    expect(tab.dataset.tabPanelId).toBe(slotId);
    fireEvent.keyDown(tab, { key: 'F10', shiftKey: true });
    const recipe = await screen.findByRole('menuitem', { name: '이 패널 만든 방법' });
    if (primary) expect(screen.queryByRole('menuitem', { name: '숨기기' })).toBeNull();
    fireEvent.click(recipe);
    const slot = document.querySelector<HTMLElement>(`[data-dock-panel="${slotId}"]`);
    expect(slot).toBeTruthy();
    const body = await within(slot!).findByRole('region', { name: '패널 설명 본문' });
    expect(within(body).getByText(shape)).toBeTruthy();
    if (primary) {
      expect(within(body).getByText('AnalysisChartFrame')).toBeTruthy();
      for (const label of ['숨기기', '고정']) {
        expect(within(body).getByText(label).closest('li')?.textContent).toContain('미사용');
      }
    }
  });

  it.each([
    ['trend~1', 'trend', 'saved-instance-trend_007e1'],
    ['current~1', 'moduleMotions', 'saved-instance-current_007e1'],
    ['table~1', 'table', 'saved-instance-table_007e1'],
    ['A'.repeat(PANEL_INSTANCE_TOKEN_MAX), 'table', `saved-instance-${'_0041'.repeat(PANEL_INSTANCE_TOKEN_MAX)}`],
  ])(
    'opens %s in its own slot and preserves its record on save',
    async (id, panel, slot) => {
      const panels = { version: 1 as const, instances: [{ ...makeInstance(panel), id }] };
      await mount(createFakeSavedViewStore([saved({ page: stepFourPage, panels })]));
      await open('saved');
      const result = await act(() => views.saveAs({ name: 'Copy', kind: 'menu-view' }));
      expect(result).toMatchObject({ ok: true, value: { view: { panels } } });
      const tableSlot = panel === 'table' ? [] : ['table'];
      expect(config().ids).toEqual(['tree', 'previous', 'current', slot, ...tableSlot, 'trend']);
    },
  );

  it.each([0, 1])('assigns the pinned table slot to exact table at saved index %s', async canonicalIndex => {
    const exact = makeInstance('table');
    const extra = { ...exact, id: 'table~1' };
    const instances = canonicalIndex === 0 ? [exact, extra] : [extra, exact];
    await mount(createFakeSavedViewStore([saved({ page: stepFourPage, panels: { version: 1, instances } })]));
    await open('saved');
    expect(config().pins.table).toBe(true);
    const alias = 'saved-instance-table_007e1';
    const slots = canonicalIndex === 0 ? ['table', alias] : [alias, 'table'];
    expect(config().ids).toEqual(['tree', 'previous', 'current', ...slots, 'trend']);
  });

  it('keeps the drawn panel slots when an interleaved held source moves to the end on save', async () => {
    const source = equipmentSource();
    const table = heldTable('table~1');
    const extraDonut = { ...donut, id: 'donut~1' };
    const store = createFakeSavedViewStore([saved({
      page: stepFourPage, panels: { version: 1, instances: [source, table, extraDonut] },
    })]);
    const panelSlots = () => [screen.getAllByRole('tab').find(tab => tab.getAttribute('aria-description')?.includes('붙잡음'))?.textContent,
      screen.getByTestId('hw-verdict-donut').closest('section[aria-label^="panel "]')?.getAttribute('aria-label')];
    await mount(store);
    await open('saved');
    const before = panelSlots();
    const copy = await act(() => views.saveAs({ name: 'Interleaved source', kind: 'menu-view' }));
    if (!copy.ok) throw new Error('Failed to save view');
    expect(copy.value.view).toMatchObject({ panels: { instances: [table, extraDonut, source] } });

    cleanup();
    await mount(store);
    await open(copy.value.view.id);
    expect(panelSlots()).toEqual(before);
    expect(before).toEqual(['saved-instance-table_007e1', 'panel saved-instance-donut_007e1']);
  });

  it.each([['trend~1', 'trend'], ['current~1', 'moduleMotions'], ['table~1', 'table']])(
    'opens %s in its own slot and preserves its record on save',
    async (id, panel) => {
      const panels = { version: 1 as const, instances: [{ ...makeInstance(panel), id }] };
      await mount(createFakeSavedViewStore([saved({ page: stepFourPage, panels })]));
      await open('saved');
      const result = await act(() => views.saveAs({ name: 'Copy', kind: 'menu-view' }));
      expect(result).toMatchObject({ ok: true, value: { view: { panels } } });
      const tableSlot = panel === 'table' ? [] : ['table'];
      expect(config().ids).toEqual(['tree', 'previous', 'current', `saved-instance-${panel === 'moduleMotions' ? 'current' : panel}_007e1`, ...tableSlot, 'trend']);
    },
  );

  it.each([0, 1])('assigns the pinned table slot to exact table at saved index %s', async canonicalIndex => {
    const exact = makeInstance('table');
    const extra = { ...exact, id: 'table~1' };
    const instances = canonicalIndex === 0 ? [exact, extra] : [extra, exact];
    await mount(createFakeSavedViewStore([saved({ page: stepFourPage, panels: { version: 1, instances } })]));
    await open('saved');
    expect(config().pins.table).toBe(true);
    const slots = canonicalIndex === 0 ? ['table', 'saved-instance-table_007e1'] : ['saved-instance-table_007e1', 'table'];
    expect(config().ids).toEqual(['tree', 'previous', 'current', ...slots, 'trend']);
  });

  it('assigns the pin to the restored raw table when the declared slot is absent', async () => {
    const instances = [{ ...makeInstance('table'), id: 'table~1' }];
    await mount(createFakeSavedViewStore([saved({ page: stepFourPage, panels: { version: 1, instances } })]));
    await open('saved');
    expect(config().pins['saved-instance-table_007e1']).toBe(true);
  });
});

describe('HW Time approved stepped workspace', () => {
  it.each(['&drillModule=PM2', '&trend=PM2/Pump'])('adds and pins a distribution tab with target %s', async target => {
    await renderOverview(`&moduleType=PM&drillMotion=Pump${target}`, request => request.endpoint === 'hwTime.distribution'
      ? { ...answer(request), data: { bins: [{ start: 3, end: 4, count: 576 }], total: 576, equipment: 24, bounds: { lower: null, upper: null } } }
      : answer(request));
    expect(requests.some(request => request.endpoint === 'hwTime.distribution')).toBe(false);
    await add('분포 · 히스토그램');
    await screen.findByTestId('hw-overview-distribution');
    expect(chart('hw-overview-distribution')).toMatchObject({ kind: 'histogram', bins: [{ start: 3, end: 4, count: 576 }] });
    expect(config().ids).toContain('distribution');
    expect(config().placement.distribution).toBeUndefined();
    expect(config().pins.distribution).toBe(true);
    expect(requests.find(request => request.endpoint === 'hwTime.distribution')?.params).toEqual({ moduleType: 'PM', drillModule: 'PM2', drillMotion: 'Pump' });
    fireEvent.click(screen.getByRole('button', { name: 'pin distribution' }));
    expect(config().pins.distribution).toBe(false);
  });
  it('disables the distribution add item without a run target', async () => {
    await renderOverview('&moduleType=PM&drillMotion=Pump');
    const picker = within(await openPanelPicker(addButton()));
    expect(picker.getByRole('button', { name: '분포 · 히스토그램' }).getAttribute('aria-disabled')).toBe('true');
    expect(requests.some(request => request.endpoint === 'hwTime.distribution')).toBe(false);
  });
  it('restores a pinned distribution and hides unchecked Motion without another request', async () => {
    await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM2&pins=distribution', request => request.endpoint === 'hwTime.distribution'
      ? { ...answer(request), data: { bins: [{ start: 3, end: 4, count: 576 }], total: 576, equipment: 24, bounds: { lower: null, upper: null } } }
      : answer(request));
    const histogram = await screen.findByTestId('hw-overview-distribution');
    expect(config().pins.distribution).toBe(true);
    const count = requests.filter(request => request.endpoint === 'hwTime.distribution').length;
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'Pump' }));
    await settle();
    expect(histogram.closest('[hidden]')).toBeTruthy();
    expect(requests.filter(request => request.endpoint === 'hwTime.distribution')).toHaveLength(count);
  });
  it.each([
    ['', 1, ['tree', 'current'], true],
    ['&moduleType=TR', 2, ['tree', 'previous', 'current'], true],
    ['&moduleType=PM&drillMotion=Pump', 3, ['tree', 'previous', 'current'], false],
    ['&moduleType=PM&drillMotion=Pump&drillModule=PM2', 4, ['tree', 'previous', 'current', 'trend'], false],
  ] as const)('restores %s with only its defaults', async (search, step, ids, legend) => {
    await renderOverview(search);
    expect(config().ids).toEqual(ids); expect(config().persistKey).toBe(`hw-time-s${step}-v1`);
    expect(config().primary).toBe('current'); expect(chart().legend).toBe(legend);
    expect(addButton()).toBeTruthy();
    const current = within(screen.getByRole('region', { name: 'panel current' }));
    for (const name of ['정렬: 원래 순서', '최소·최대: 끔', '시작 맞춤: 끔']) expect(current.getByRole('button', { name })).toBeTruthy();
    expect(current.queryByRole('radio', { name: '설비 › Module' }) !== null).toBe(step === 2 || step === 3);
    expect(screen.queryByTestId('hw-time-filter-panel')).toBeNull();
    if (step === 4) {
      await screen.findByTestId('hw-overview-trend');
      expect(chart().series.map((series: { id: string }) => series.id)).toEqual(['Pump']);
      expect(chart().series[0].points.map(([x]: [string]) => x)).toEqual(['MEM-PHOTO-0103', 'MEM-PHOTO-0105']);
      expect(config().placement.trend).toBe('below');
    }
  });
  it('drills tree names in one path write without changing checks, and Module checks agree under every Motion', async () => {
    await renderOverview();
    fireEvent.click(node('PM')); await settle();
    expect(chart().series.map((series: { id: string }) => series.id)).toContain('Chuck');
    fireEvent.click(node('Pump')); await settle();
    fireEvent.click(node('PM2')); await settle();
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBe('PM2');
    expect(within(tree()).getByText('현재')).toBeTruthy();
    fireEvent.click(within(tree()).getByRole('button', { name: 'Chuck 펼치기' }));
    const checks = within(tree()).getAllByRole('checkbox', { name: 'PM2' });
    expect(checks).toHaveLength(2);
    fireEvent.click(checks[0]!); await settle();
    for (const check of within(tree()).getAllByRole('checkbox', { name: 'PM2' })) expect(check.getAttribute('aria-checked')).toBe('false');
    expect(new URLSearchParams(window.location.search).has('module')).toBe(false);
  });
  it('recovers an unavailable Motion day basis even when its descendant Module is still checked', async () => {
    await renderOverview('&moduleType=PM&drillMotion=Pump&motionBasis=day', answer, { waitForData: false });
    expect(await screen.findByTestId('hw-equipment-days')).toBeTruthy();
    fireEvent.click(node('PM1')); await settle();
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBe('PM1');
    const motion = screen.getByRole('button', { name: 'Motion: Pump · 일별' });
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'PM2' })); await settle();
    const beforeClick = new URLSearchParams(window.location.search);
    const checked = new URLSearchParams(window.history.state.apHidden.pairs).getAll('module');
    // Exercise the stale-chip path if the invalid parent survived the filter change.
    if (motion.isConnected) fireEvent.click(motion);
    expect(beforeClick.get('drillMotion')).toBeNull();
    expect(beforeClick.get('moduleType')).toBe('PM');
    expect(checked).toContain('PM1');
    expect(checked).not.toContain('PM2');
    expect(beforeClick.has('motionBasis')).toBe(false);
    expect(beforeClick.has('drillModule')).toBe(false);
    expect(motion.isConnected).toBe(false);
    expect(screen.getByText('나누기 기준을 사용할 수 없어 이전 단계로 이동했습니다.')).toBeTruthy();
  });
  it('Motion branch checks use the existing repeated filter and leave the Module checks selected', async () => {
    await renderOverview('&moduleType=PM');
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'Pump' })); await settle();
    expect(chart().series.map((series: { id: string }) => series.id)).not.toContain('Pump');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Pump 펼치기' }));
    for (const name of ['PM1', 'PM2', 'PM3', 'PM4']) expect(within(tree()).getByRole('checkbox', { name }).getAttribute('aria-checked')).toBe('true');
    expect(new URLSearchParams(window.location.search).has('motion')).toBe(false);
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'Pump' })); await settle();
    expect(chart().series.map((series: { id: string }) => series.id)).toContain('Pump');
  });
  it('with one checked Module, the Motion branch and its leaf change different filter keys', async () => {
    await renderOverview('&moduleType=PM&module=PM2');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Pump 펼치기' }));
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'Pump' })); await settle();
    expect(within(tree()).getByRole('checkbox', { name: 'Pump' }).getAttribute('aria-checked')).toBe('false');
    expect(within(tree()).getByRole('checkbox', { name: 'PM2' }).getAttribute('aria-checked')).toBe('true');
    expect(chart().series.map((series: { id: string }) => series.id)).not.toContain('Pump');
    expect(chart().series[0].points.map(([x]: [string]) => x)).toEqual(['MEM-PHOTO-0103 · PM2', 'MEM-PHOTO-0105 · PM2']);
    fireEvent.click(within(tree()).getByRole('checkbox', { name: 'PM2' })); await settle();
    expect(within(tree()).getByRole('checkbox', { name: 'PM2' }).getAttribute('aria-checked')).toBe('false');
    expect(within(tree()).getByRole('checkbox', { name: 'Pump' }).getAttribute('aria-checked')).toBe('false');
    expect(within(tree()).getByRole('checkbox', { name: 'Chuck' }).getAttribute('aria-checked')).toBe('true');
  });
  it('type checks aggregate only Motions, and toggling a type keeps its Module selections', async () => {
    await renderOverview('&moduleType=PM&module=PM2');
    const check = (name: string) => within(tree()).getByRole('checkbox', { name });
    expect(check('PM').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(check('Pump')); await settle();
    expect(check('PM').getAttribute('aria-checked')).toBe('mixed');
    fireEvent.click(check('PM')); await settle();
    expect(check('PM').getAttribute('aria-checked')).toBe('true');
    fireEvent.click(check('PM')); await settle();
    expect(check('PM').getAttribute('aria-checked')).toBe('false');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Pump 펼치기' }));
    expect(check('PM2').getAttribute('aria-checked')).toBe('true');
    expect(check('PM1').getAttribute('aria-checked')).toBe('false');
    expect(check('TR').getAttribute('aria-checked')).toBe('true');
  });
  it('show all restores both filter axes after every leaf is excluded', async () => {
    await renderOverview('&moduleType=PM&module=~none&motion=~none');
    fireEvent.click(screen.getByRole('button', { name: '모두 보이기' })); await settle();
    expect(screen.queryByRole('button', { name: '모두 보이기' })).toBeNull();
    expect(within(tree()).getByRole('checkbox', { name: 'Pump' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(tree()).getByRole('button', { name: 'Pump 펼치기' }));
    expect(within(tree()).getByRole('checkbox', { name: 'PM2' }).getAttribute('aria-checked')).toBe('true');
    expect(chart().series.map((series: { id: string }) => series.id)).toContain('Pump');
    expect(chart().series[0].points.map(([x]: [string]) => x)).toContain('MEM-PHOTO-0103 · PM2');
  });
  it('writes toolbar options, preserves them across steps, and shares grammar with the previous chart', async () => {
    await renderOverview('&moduleType=PM&barsSort=total-desc&barsGroup=module&barsMinMax=1&align=1');
    expect(chart()).toMatchObject({ minMax: true, startAlign: true });
    expect(chart('hw-previous')).toMatchObject({ minMax: true, startAlign: true });
    expect(chart().rowGroups.header).toBe('Module');
    fireEvent.keyDown(screen.getByRole('button', { name: '정렬: 합 큰 순' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitemradio', { name: '합 작은 순' })); await settle();
    expect(screen.getByRole('button', { name: '정렬: 합 작은 순' })).toBeTruthy();
    fireEvent.click(screen.getByRole('radio', { name: '설비 › Module' }));
    expect(chart().rowGroups.header).toBe('설비');
    fireEvent.click(screen.getByRole('button', { name: '최소·최대: 켬' }));
    expect(chart().minMax).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: '시작 맞춤: 켬' }));
    expect(chart().startAlign).toBe(false);
    fireEvent.click(node('Pump')); await settle();
    expect(chart()).toMatchObject({ minMax: false, startAlign: false });
  });
  it.each(['barsSort=bad', 'barsGroup=bad', 'barsMinMax=0', 'align=true', 'pins=table&pins=bad', 'trend=PM1/Place', 'row=bad', 'drillModule=PM1', 'moduleType=PM&drillMotion=Pick'])('rejects %s and reads nothing before recovery', async query => {
    await renderOverview(`&${query}`, undefined, { waitForData: false });
    expect(screen.getByRole('button', { name: /초기화|복구|지우기/ })).toBeTruthy(); expect(requests).toHaveLength(0);
  });
  it('carries a pinned scatter into step 4 and fetches no unopened table or Motion table', async () => {
    // A picked point makes runs available without a Module drill.
    await renderOverview('&moduleType=PM&drillMotion=Pump&trend=PM2/Pump');
    await add('분포');
    expect(config().ids).toContain('scatter');
    fireEvent.click(node('PM2')); await settle();
    expect(config().ids).toContain('scatter'); expect(config().pins.scatter).toBe(true);
    expect(requests.some(request => ['hwTime.motionStats', 'hwTime.levelRows', 'hwTime.tableRows'].includes(request.endpoint))).toBe(false);
  });
  it('drops an unpinned addition after changing steps', async () => {
    await renderOverview('&moduleType=PM');
    await add('원본 표', { pin: false });
    expect(config().ids).toContain('table');
    fireEvent.click(node('Pump')); await settle(); expect(config().ids).not.toContain('table');
  });
  it('adds Module-wide Motions from the cached matrix and reads the judgement table only when added', async () => {
    await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM2');
    const before = requests.length;
    await add('PM2 · Motion별');
    expect(chart('hw-module-motions').series.map((series: { id: string }) => series.id)).toContain('Chuck');
    expect(requests).toHaveLength(before);
    await add('HTM 판정 표');
    await screen.findByRole('table', { name: 'PM2 · Motion' });
    expect(requests.filter(request => request.endpoint === 'hwTime.motionStats')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Chuck 회차 보기' })); await settle();
    const params = new URLSearchParams(window.location.search);
    expect(params.get('drillModule')).toBe('PM2'); expect(params.get('drillMotion')).toBe('Chuck');
    fireEvent.click(screen.getByRole('button', { name: 'pin moduleMotions' }));
    expect(config().pins.moduleMotions).toBe(false);
    expect(config().ids).toContain('moduleMotions');
  });
  it('double-click opens the selected point trend, single click only selects, and step 1 activation drills to the type', async () => {
    await renderOverview();
    fireEvent.click(screen.getByRole('button', { name: 'select hw-current MEM-PHOTO-0103' }));
    expect(new URLSearchParams(window.location.search).get('row')).toBe('MEM-PHOTO-0103');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'activate hw-current MEM-PHOTO-0103' })); await settle();
    expect(new URLSearchParams(window.location.search).get('moduleType')).toBe('PM');
    expect(chart('hw-previous').activeCategory).toBe('MEM-PHOTO-0103');
    fireEvent.click(screen.getByRole('button', { name: 'select hw-current MEM-PHOTO-0103 · PM1' }));
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'activate hw-current MEM-PHOTO-0103 · PM1' }));
    await screen.findByTestId('hw-overview-trend');
    expect(config().ids).toContain('trend'); expect(config().placement.trend).toBeUndefined();
    expect(chart().activation).toBe('dblclick');
    expect(new URLSearchParams(window.location.search).get('drillModule')).toBeNull();
    expect(requests.find(request => request.endpoint === 'hwTime.runs')?.params).toMatchObject({ drillModule: 'PM1', drillMotion: 'Chuck' });
  });
  it.each(['double-click', 'point action'])('re-reveals the same target after returning to the main tab via %s', async activation => {
    await renderOverview('&moduleType=PM');
    const open = () => {
      if (activation === 'double-click') fireEvent.doubleClick(screen.getByRole('button', { name: 'activate hw-current MEM-PHOTO-0103 · PM1' }));
      else fireEvent.click(screen.getByRole('button', { name: 'point action hw-current trend' }));
    };
    open();
    await screen.findByTestId('hw-overview-trend');
    await waitFor(() => expect(screen.getByRole('tab', { name: 'trend' }).getAttribute('aria-selected')).toBe('true'));
    const first = config().revealRequest;
    const target = new URLSearchParams(window.history.state.apHidden.pairs).get('trend');
    fireEvent.click(screen.getByRole('tab', { name: 'current' }));
    expect(screen.getByRole('tab', { name: 'current' }).getAttribute('aria-selected')).toBe('true');
    open();
    await settle();
    expect(config().revealRequest.panelId).toBe('trend');
    expect(config().revealRequest.seq).toBeGreaterThan(first.seq);
    expect(screen.getByRole('tab', { name: 'trend' }).getAttribute('aria-selected')).toBe('true');
    expect(new URLSearchParams(window.history.state.apHidden.pairs).get('trend')).toBe(target);
  });
  it('offers the same drill and trend actions to keyboard point selection', async () => {
    await renderOverview('&moduleType=PM');
    expect(chart().actions).toEqual(['HTM 추세 열기', 'Chuck로 내려가기']);
    fireEvent.click(screen.getByRole('button', { name: 'point action hw-current drill' })); await settle();
    expect(new URLSearchParams(window.location.search).get('drillMotion')).toBe('Chuck');
    expect(config().ids).not.toContain('trend');
    expect(chart('hw-previous').activeCategory).toBe('MEM-PHOTO-0103 · PM1');
    await waitFor(() => expect(chart().legend).toBe(false));
  });
  it.each(['drill', 'explicit trend'] as const)('clears the trend range on %s change and restores it with one Back', async change => {
    await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM2&trend=PM2/Pump&trendRange=09-23/09-25');
    const search = () => new URLSearchParams(window.location.search);
    const trend = () => new URLSearchParams(window.history.state?.apHidden?.pairs).get('trend') ?? search().get('trend');
    expect(trend()).toBe('PM2/Pump');
    expect(search().get('trendRange')).toBe('09-23/09-25');

    if (change === 'drill') fireEvent.click(node('PM1'));
    else fireEvent.click(screen.getByRole('button', { name: 'point action hw-previous trend' }));
    if (change === 'drill') expect(search().get('drillModule')).toBe('PM1');
    else expect(trend()).toBe('PM1/Pump');
    expect(search().has('trendRange')).toBe(false);

    window.history.back();
    await waitFor(() => {
      expect(search().get('drillModule')).toBe('PM2');
      expect(trend()).toBe('PM2/Pump');
      expect(search().get('trendRange')).toBe('09-23/09-25');
    });
  });
  it.each(['double-click', 'point action'])('step 4 %s opens the previous point trend while pinned scatter follows the drill', async activation => {
    await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM2&pins=scatter');
    await screen.findByTestId('hw-overview-trend');
    await screen.findByTestId('hw-overview-scatter');
    if (activation === 'double-click') fireEvent.doubleClick(screen.getByRole('button', { name: 'activate hw-previous MEM-PHOTO-0103 · PM1' }));
    else fireEvent.click(screen.getByRole('button', { name: 'point action hw-previous trend' }));
    await waitFor(() => expect(within(screen.getByTestId('hw-overview-trend')).getByRole('heading', { name: 'PM1 · Pump 일 평균' })).toBeTruthy());
    expect(new URLSearchParams(window.history.state.apHidden.pairs).get('trend')).toBe('PM1/Pump');
    expect(requests.filter(request => request.endpoint === 'hwTime.runs').map(request => request.params)).toEqual([
      expect.objectContaining({ drillModule: 'PM2', drillMotion: 'Pump' }),
      expect.objectContaining({ drillModule: 'PM1', drillMotion: 'Pump' }),
    ]);
    expect(within(screen.getByTestId('hw-overview-scatter')).getByRole('heading', { name: 'PM2 · Pump 회차' })).toBeTruthy();
  });
  it('names the drilled Module type and Motion on the day heatmap header and chart (#3046)', async () => {
    let setPage: ReturnType<typeof usePlatform>['setPage'] | undefined;
    function Navigator() { setPage = usePlatform().setPage; return null; }
    const dayTitle = (motion: string) => `PM · ${motion} · 설비 × 날짜 히트맵`;
    const current = () => within(screen.getByRole('region', { name: 'panel current' }));
    await renderOverview('&moduleType=PM&drillMotion=Pump&motionBasis=day', answer, { children: <Navigator />, waitForData: false });
    await current().findByTestId('hw-equipment-days');
    expect(config().titles.current).toBe(dayTitle('Pump'));
    expect(current().getByRole('region', { name: dayTitle('Pump') })).toBeTruthy();
    act(() => setPage!({ drillMotion: 'Vent' }));
    await waitFor(() => expect(config().titles.current).toBe(dayTitle('Vent')));
    expect(await current().findByRole('region', { name: dayTitle('Vent') })).toBeTruthy();
    expect(new URLSearchParams(window.location.search).get('motionBasis')).toBe('day');
  });
  it('keeps the generic title on an equipment × day heatmap added from the panel catalogue (#3046)', async () => {
    await renderOverview('&moduleType=PM&drillMotion=Pump');
    await add('설비 × 날짜 히트맵');
    const added = within(screen.getByRole('region', { name: 'panel equipmentDays' }));
    await added.findByTestId('hw-equipment-days');
    expect(config().titles.equipmentDays).toBe('설비 × 날짜 히트맵');
    expect(added.getByRole('region', { name: '설비 × 날짜 히트맵' })).toBeTruthy();
    expect(config().titles.current).toBe('PM · Pump · 설비–Module별');
  });
});

 it('adds pinned panels as current-group tabs without changing step-4 row shares', async () => {
   await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=heatmap&pins=donut&pins=pareto');
   const preset = config().preset.layout;
   expect(preset.sizes).toEqual([60, 40]);
   expect(preset.children[1].panels).toEqual(['trend']);
   expect(preset.children[0].children[1].children[1].panels).toEqual(['current', 'heatmap', 'donut', 'pareto']);
   for (const id of ['heatmap', 'donut', 'pareto']) expect(config().placement[id]).toBeUndefined();
   const heatmap = chart('hw-overview-matrix');
   expect(heatmap.minRowHeight).toBe(24);
   expect(heatmap.statusDisplay).toBe('border');
 });
