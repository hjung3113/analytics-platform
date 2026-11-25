// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EQUIPMENT_SELECTION_DIMENSION, PANEL_INSTANCES_MAX, type PanelInstance } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, testSavedView, useSavedViews, type SavedViews } from '@ap/kernel/testing';
import { MOTION_EQUIPMENT_KEY, hwTime, type HwTimeTableData } from '../../endpoints';
import { answer, renderOverview } from './test-support';

const context = { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };
const page: [string, string][] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], ['pins', 'table']];
let views: SavedViews;
function Controls({ equipment }: { equipment?: string }) {
  const { setGlobal, setPage } = usePlatform();
  views = useSavedViews();
  return <>
    <button onClick={() => setGlobal({ from: '2026-09-20T09:00:00' })}>Change period</button>
    {equipment && <button onClick={() => setPage({ [MOTION_EQUIPMENT_KEY]: [equipment] })}>Select equipment</button>}
  </>;
}
async function openSettings() {
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page, chartOptions: {}, layout: null, panels: null,
  })]);
  await renderOverview('', answer, { savedViews: store, children: <Controls />, realWorkspace: true, showDetail: true });
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { expect(await views.select('saved')).toMatchObject({ ok: true }); });
  const tab = await screen.findByRole('tab', { name: '원본 표' });
  fireEvent.keyDown(tab, { key: 'F10', shiftKey: true });
  fireEvent.click(await screen.findByRole('menuitem', { name: '패널 설정' }));
  const trigger = await screen.findByRole('button', { name: '원본 표 동작' });
  return trigger;
}
beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('opens the named, non-modal settings drawer and returns focus to the panel menu on Escape', async () => {
  const trigger = await openSettings();
  const drawer = await screen.findByRole('dialog', { name: '원본 표' });
  expect(drawer.getAttribute('aria-modal')).toBe('false');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(trigger));
});

it('closes on a period change and saves the edited connection through the saved-view panels slot', async () => {
  await openSettings();
  fireEvent.click(await screen.findByRole('radio', { name: '강조만' }));
  await waitFor(() => expect(views.state.modified).toBe(true));
  fireEvent.click(screen.getByRole('button', { name: 'Change period' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(views.state.modified).toBe(true);
  const saved = await act(() => views.saveAs({ name: 'Edited', kind: 'menu-view' }));
  expect(saved).toMatchObject({ ok: true, value: { view: { panels: { instances: expect.arrayContaining([
    expect.objectContaining({ id: 'table', inputs: [expect.objectContaining({ use: 'highlight' })] }),
  ]) } } } });
});

async function openTableSettings(tab?: HTMLElement) {
  fireEvent.keyDown(tab ?? await screen.findByRole('tab', { name: '원본 표' }), { key: 'F10', shiftKey: true });
  fireEvent.click(await screen.findByRole('menuitem', { name: '패널 설정' }));
  return screen.findByRole('dialog', { name: '원본 표' });
}

async function mountPanelView(instances: PanelInstance[], equipment?: string) {
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page, chartOptions: {}, layout: null, panels: { version: 1, instances },
  })]);
  const open = async (id: string) => {
    await renderOverview('', answer, { savedViews: store, children: <Controls equipment={equipment} />, realWorkspace: true, showDetail: true });
    await waitFor(() => expect(views.status).toBe('ready'));
    await act(async () => { expect(await views.select(id)).toMatchObject({ ok: true }); });
  };
  await open('saved');
  return open;
}

it('keeps a drawn chart with a reserved ID when linking, reopening and ignoring', async () => {
  const chart: PanelInstance = { id: 'held-source-2', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs: [] };
  const open = await mountPanelView([chart]);
  expect(await screen.findByTestId('hw-module-motions')).toBeTruthy();
  fireEvent.click(within(await openTableSettings()).getByRole('radio', { name: '강조만' }));
  const linked = await act(() => views.saveAs({ name: 'Linked', kind: 'menu-view' }));
  if (!linked.ok || linked.value.view.kind !== 'menu-view') throw new Error('Failed to save linked view');

  cleanup();
  await open(linked.value.view.id);
  expect(await screen.findByTestId('hw-module-motions')).toBeTruthy();
  const drawer = await openTableSettings();
  expect(within(drawer).getByRole('radio', { name: '강조만', checked: true })).toBeTruthy();
  fireEvent.click(within(drawer).getByRole('radio', { name: '무시' }));
  const ignored = await act(() => views.saveAs({ name: 'Ignored', kind: 'menu-view' }));
  expect(ignored).toMatchObject({ ok: true, value: { view: { panels: { instances: [
    chart, { id: 'table', source: { kind: 'declared', panel: 'table' }, inputs: [], outputs: [] },
  ] } } } });

  const publisher = linked.value.view.panels?.instances.find(panel => panel.id !== chart.id && panel.outputs.length > 0);
  expect(publisher).toMatchObject({ id: expect.stringMatching(/^held-source(?:-|$)/), source: chart.source, inputs: [], outputs: [
    { key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' },
  ] });
  expect(linked.value.view.panels?.instances).toContainEqual(chart);
  expect(linked.value.view.panels?.instances.find(panel => panel.id === 'table')?.inputs).toEqual([
    { key: MOTION_EQUIPMENT_KEY, from: `${publisher?.id}.${MOTION_EQUIPMENT_KEY}`, mode: 'follow', use: 'highlight' },
  ]);
});

it.each([['무시', 'ignore'], ['따라가기', 'follow']] as const)('applies %s at the saved panel limit', async (label, action) => {
  const from = `held-source.${MOTION_EQUIPMENT_KEY}`;
  const hidden: PanelInstance = { id: 'held-source', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] };
  const table: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: MOTION_EQUIPMENT_KEY, from, mode: 'hold', value: { shape: 'set', values: ['MEM-PHOTO-0105'] } }] };
  const others: PanelInstance[] = Array.from({ length: PANEL_INSTANCES_MAX - 2 }, (_, index) => ({
    id: `other-${index}`, source: { kind: 'declared', panel: 'retired' }, inputs: [], outputs: [],
  }));
  await mountPanelView([...others, table, hidden]);
  const drawer = await openTableSettings();
  fireEvent.click(within(drawer).getByRole('radio', { name: label }));
  expect(within(drawer).queryByRole('alert')).toBeNull();
  const follow = action === 'follow';
  const saved = await act(() => views.saveAs({ name: 'Edited at limit', kind: 'menu-view' }));
  expect(saved).toMatchObject({ ok: true, value: { view: { panels: { instances: [
    ...others, { ...table, inputs: follow ? [{ key: MOTION_EQUIPMENT_KEY, from, mode: 'follow' }] : [] },
    ...(follow ? [hidden] : []),
  ] } } } });
});

it.each([
  ['reuses a saved chart', [{ id: 'motions', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs: [] }]],
  ['adds a new source', []],
] satisfies [string, PanelInstance[]][])('rejects an overflowing connection that %s and accepts it after deletion', async (_name, charts) => {
  const removable: PanelInstance = { id: 'removable', source: { kind: 'declared', panel: 'retired-removable' }, inputs: [], outputs: [] };
  const others: PanelInstance[] = Array.from({ length: PANEL_INSTANCES_MAX - 2 }, (_, index) => ({
    id: `other-${index}`, source: { kind: 'declared', panel: 'retired' }, inputs: [], outputs: [],
  }));
  await mountPanelView([...charts, removable, ...others]);
  const drawer = await openTableSettings();
  fireEvent.click(within(drawer).getByRole('radio', { name: '강조만' }));
  expect(within(drawer).getByRole('alert').textContent).toBe('저장 한도 24개. 패널 ⋯에서 삭제하세요.');
  expect(within(drawer).getByRole('radio', { name: '무시', checked: true })).toBeTruthy();
  expect(views.state.modified).toBe(false);

  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  const tab = screen.getByRole('tab', { name: 'retired-removable' });
  fireEvent.click(tab);
  fireEvent.keyDown(tab, { key: 'F10', shiftKey: true });
  fireEvent.click(await screen.findByRole('menuitem', { name: '삭제' }));
  await waitFor(() => expect(screen.queryByRole('tab', { name: 'retired-removable' })).toBeNull());
  const table = screen.getByRole('tab', { name: '원본 표' });
  fireEvent.click(table);
  const retry = await openTableSettings(table);
  fireEvent.click(within(retry).getByRole('radio', { name: '강조만' }));
  expect(within(retry).queryByRole('alert')).toBeNull();
  expect(within(retry).getByRole('radio', { name: '강조만', checked: true })).toBeTruthy();

  const saved = await act(() => views.saveAs({ name: 'Connected after deletion', kind: 'menu-view' }));
  if (!saved.ok || saved.value.view.kind !== 'menu-view') throw new Error('Failed to save connected view');
  const instances = saved.value.view.panels?.instances;
  expect(instances).toHaveLength(PANEL_INSTANCES_MAX);
  const publisher = instances?.find(panel => panel.source.kind === 'declared' && panel.source.panel === 'moduleMotions');
  expect(publisher?.outputs).toEqual([{ key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }]);
  expect(instances?.find(panel => panel.id === 'table')?.inputs).toEqual([
    { key: MOTION_EQUIPMENT_KEY, from: `${publisher?.id}.${MOTION_EQUIPMENT_KEY}`, mode: 'follow', use: 'highlight' },
  ]);
});

it('protects an unavailable source and saves the input held through panel settings after drilling up', async () => {
  const chart: PanelInstance = { id: 'motions', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs: [] };
  const equipment = 'MEM-PHOTO-0105';
  await mountPanelView([chart], equipment);
  fireEvent.click(screen.getByRole('button', { name: 'Select equipment' }));
  const drawer = await openTableSettings();
  fireEvent.click(within(drawer).getByRole('radio', { name: '거르기' }));
  fireEvent.click(within(drawer).getByRole('radio', { name: '붙잡기' }));
  expect(within(drawer).getByRole('radio', { name: '붙잡기', checked: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Pump 단계로 이동' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(new URLSearchParams(window.location.search).get('drillModule')).toBeNull();
  const source = await screen.findByRole('tab', { name: 'Module · Motion별' });
  fireEvent.click(source);
  expect(await screen.findByText('Module 단계에서 볼 수 있음')).toBeTruthy();
  fireEvent.keyDown(source, { key: 'F10', shiftKey: true });
  const menu = await screen.findByRole('menu');
  const reason = '이 차트에서 붙잡은 패널이 있습니다';
  for (const name of ['삭제', '숨기기']) {
    expect(within(menu).getByRole('menuitem', { name }).getAttribute('aria-disabled')).toBe('true');
    expect(within(menu).getByRole('menuitem', { name, description: reason })).toBeTruthy();
  }

  const saved = await act(() => views.saveAs({ name: 'Held after drilling up', kind: 'menu-view' }));
  expect(saved).toMatchObject({ ok: true, value: { view: { panels: { instances: expect.arrayContaining([
    { ...chart, outputs: [{ key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] },
    expect.objectContaining({ id: 'table', inputs: [{
      key: MOTION_EQUIPMENT_KEY, from: `${chart.id}.${MOTION_EQUIPMENT_KEY}`, mode: 'hold', value: { shape: 'set', values: [equipment] },
    }] }),
  ]) } } } });
});

it.each(['edit connections', 'add a panel'] as const)('keeps colliding wire IDs after save and reopen when users %s', async action => {
  const collisions: PanelInstance[] = (action === 'edit connections' ? ['current', 'table'] : ['pareto']).map(id => ({
    id, source: { kind: 'declared', panel: 'donut' }, inputs: [], outputs: [],
  }));
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page, chartOptions: {}, layout: null, panels: { version: 1, instances: collisions },
  })]);
  const mount = () => renderOverview('', answer, { savedViews: store, children: <Controls />, realWorkspace: true, showDetail: true });
  await mount();
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(() => views.select('saved'));
  if (action === 'edit connections') {
    fireEvent.click(within(await openTableSettings()).getByRole('radio', { name: '강조만' }));
    expect(screen.getAllByTestId('hw-current')).toHaveLength(1);
    expect(screen.queryByTestId('hw-module-motions')).toBeNull();
    expect(screen.getAllByRole('tab', { name: '원본 표' })).toHaveLength(1);
  } else {
    fireEvent.keyDown(screen.getByRole('button', { name: /패널 추가/ }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: '상한 초과 파레토' }));
  }
  const saved = await act(() => views.saveAs({ name: 'With collisions', kind: 'menu-view' }));
  if (!saved.ok || saved.value.view.kind !== 'menu-view' || !saved.value.view.panels) throw new Error('Failed to save view with panels');
  const savedPanels = saved.value.view.panels;
  expect(savedPanels).toMatchObject({ instances: expect.arrayContaining(collisions) });
  cleanup();
  await mount();
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { expect(await views.select(saved.value.view.id)).toMatchObject({ ok: true }); });
  const stored = await act(() => views.saveAs({ name: 'Reopened', kind: 'menu-view' }));
  expect(stored).toMatchObject({ ok: true, value: { view: { panels: savedPanels } } });
  expect(await screen.findAllByRole('tab', { name: '판정 비율 도넛' })).toHaveLength(collisions.length);
  if (action === 'edit connections') {
    expect(screen.getAllByTestId('hw-current')).toHaveLength(1);
    expect(savedPanels).toMatchObject({ instances: expect.arrayContaining([
      expect.objectContaining({ id: 'current~1', source: { kind: 'declared', panel: 'moduleMotions' } }),
      expect.objectContaining({ id: 'table~1', source: { kind: 'declared', panel: 'table' },
        inputs: [{ key: MOTION_EQUIPMENT_KEY, from: `current~1.${MOTION_EQUIPMENT_KEY}`, mode: 'follow', use: 'highlight' }] }),
    ]) });
    expect(await screen.findByTestId('hw-module-motions')).toBeTruthy();
    const tabs = screen.getAllByRole('tab', { name: '원본 표' });
    const copySlot = `saved-panel-${savedPanels.instances.findIndex(panel => panel.id === 'table~1')}`;
    expect(tabs.map(tab => tab.getAttribute('data-tab-panel-id'))).toEqual(expect.arrayContaining([copySlot, 'table']));
    expect(tabs).toHaveLength(2);
    const copyTab = tabs.find(tab => tab.getAttribute('data-tab-panel-id') === copySlot)!;
    expect(within(await openTableSettings(copyTab)).getByRole('radio', { name: '강조만', checked: true })).toBeTruthy();
  } else {
    expect(savedPanels).toMatchObject({ instances: expect.arrayContaining([
      expect.objectContaining({ id: 'pareto~1', source: { kind: 'declared', panel: 'pareto' } }),
    ]) });
    const copySlot = `saved-panel-${savedPanels.instances.findIndex(panel => panel.id === 'pareto~1')}`;
    const tabs = screen.getAllByRole('tab', { name: '상한 초과 파레토' });
    expect(tabs.map(tab => tab.getAttribute('data-tab-panel-id'))).toEqual(expect.arrayContaining([copySlot, 'pareto']));
    expect(tabs).toHaveLength(2);
  }
});

it.each([['sort', 'equipmentId:asc'], ['page', '2']])('closes on a table %s change and retains the edit', async (key, value) => {
  const tableData: HwTimeTableData = { rows: [{ id: 'fixture', equipmentId: 'MEM-PHOTO-0105', values: {}, total: 1 }], total: 50 };
  const savedViews = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page, chartOptions: {}, layout: null, panels: null,
  })]);
  await renderOverview('', request => request.endpoint === hwTime.tableRows.id ? { ...answer(request), data: tableData } : answer(request),
    { savedViews, children: <Controls />, realWorkspace: true, showDetail: true });
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(() => views.select('saved'));
  const settings = await openTableSettings();
  fireEvent.click(within(settings).getByRole('radio', { name: '강조만' }));
  const table = await screen.findByRole('table', { name: 'HW Time 동작시간 표' });
  const control = key === 'sort' ? within(within(table).getByRole('columnheader', { name: /EquipmentID/ })).getByRole('button')
    : screen.getByRole('button', { name: '다음' });
  await waitFor(() => expect((control as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(control);
  await waitFor(() => expect(new URLSearchParams(window.location.search).get(key)).toBe(value));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(views.state.modified).toBe(true);
  expect(within(await openTableSettings()).getByRole('radio', { name: '강조만', checked: true })).toBeTruthy();
});
