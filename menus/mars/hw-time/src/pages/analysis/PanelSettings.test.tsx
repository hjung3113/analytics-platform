// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EQUIPMENT_SELECTION_DIMENSION, PANEL_INSTANCES_MAX, type MenuQuery, type PanelInstance } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, testSavedView, useSavedViews, type SavedViews } from '@ap/kernel/testing';
import { MOTION_EQUIPMENT_KEY, hwTime, type HwTimeTableData } from '../../endpoints';
import { answer, renderOverview } from './test-support';

await vi.hoisted(async () => { (await import('@ap/components/testing/engines')).mockEchartsCanvas(); });

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

async function openTableSettings({ tab, name = '원본 표' }: { tab?: HTMLElement; name?: string } = {}) {
  fireEvent.keyDown(tab ?? await screen.findByRole('tab', { name }), { key: 'F10', shiftKey: true });
  fireEvent.click(await screen.findByRole('menuitem', { name: '패널 설정' }));
  return screen.findByRole('dialog', { name });
}

async function mountPanelView(instances: PanelInstance[], { savedPage = page, children, realChart, equipment }: { savedPage?: typeof page; children?: ReactNode; realChart?: string; equipment?: string } = {}) {
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page: savedPage, chartOptions: {}, layout: null, panels: { version: 1, instances },
  })]);
  const open = async (id: string) => {
    await renderOverview('', answer, { savedViews: store, children: <><Controls equipment={equipment} />{children}</>, realWorkspace: true, showDetail: true, realChart });
    await waitFor(() => expect(views.status).toBe('ready'));
    await act(async () => { expect(await views.select(id)).toMatchObject({ ok: true }); });
  };
  await open('saved');
  return open;
}

function fillPanelView(instances: PanelInstance[]): PanelInstance[] {
  return [...instances, ...Array.from({ length: PANEL_INSTANCES_MAX - instances.length }, (_, index): PanelInstance => ({
    id: `other-${index}`, source: { kind: 'declared', panel: 'retired' }, inputs: [], outputs: [],
  }))];
}

const emptyTrend: PanelInstance = { id: 'trend', source: { kind: 'declared', panel: 'trend' }, inputs: [], outputs: [] };

it('reserves room for a carried trend when adding a panel after drilling down (#2999 C1)', async () => {
  const publisher: PanelInstance = { id: 'held-source', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] };
  const input = { key: MOTION_EQUIPMENT_KEY, from: `${publisher.id}.${MOTION_EQUIPMENT_KEY}`, mode: 'follow' } as const;
  const table: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, inputs: [input], outputs: [] };
  await mountPanelView(fillPanelView([emptyTrend, table, publisher]), {
    savedPage: page.filter(([key]) => key !== 'drillModule'),
  });
  const settings = await openTableSettings();
  fireEvent.click(within(settings).getByRole('radio', { name: '강조만' }));
  expect(within(settings).getByRole('radio', { name: '강조만', checked: true })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'PM1 단계로 이동' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('drillModule')).toBe('PM1'));
  fireEvent.keyDown(screen.getByRole('button', { name: /패널 추가/ }), { key: 'Enter' });
  const blocked = await screen.findByRole('menuitem', { name: /상한 초과 파레토/ });
  expect(blocked.getAttribute('aria-disabled')).toBe('true');
  expect(blocked.textContent).toContain('저장 한도 24개. 패널 ⋯에서 삭제하세요.');
  expect(screen.queryByRole('tab', { name: '상한 초과 파레토' })).toBeNull();
  fireEvent.keyDown(blocked, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

  fireEvent.click(screen.getByRole('button', { name: 'Pump 단계로 이동' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).has('drillModule')).toBe(false));
  const saved = await act(() => views.saveAs({ name: 'Back at the limit', kind: 'menu-view' }));
  expect(saved).toMatchObject({ ok: true, value: { view: { panels: { instances: expect.arrayContaining([
    emptyTrend, { ...table, inputs: [{ ...input, use: 'highlight' }] },
  ]) } } } });
});

it('refuses a step-4 drawer edit that would put a carried trend over the limit (#2999 C1)', async () => {
  const table: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, inputs: [], outputs: [] };
  await mountPanelView(fillPanelView([emptyTrend, table]));
  const settings = within(await openTableSettings());
  fireEvent.click(settings.getByRole('radio', { name: '거르기' }));
  expect(settings.getByRole('alert').textContent).toBe('저장 한도 24개. 패널 ⋯에서 삭제하세요.');
  expect(settings.getByRole('radio', { name: '무시', checked: true })).toBeTruthy();
});

it('keeps both table connections after following the second via «새 패널» and reopening (#2999 C2)', async () => {
  const equipmentId = 'MEM-PHOTO-0105';
  const publisher: PanelInstance = { id: 'current', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] };
  const connection = { key: MOTION_EQUIPMENT_KEY, from: `${publisher.id}.${MOTION_EQUIPMENT_KEY}` };
  const first: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ ...connection, mode: 'hold', use: 'highlight', value: { shape: 'set', values: [equipmentId] } }] };
  const second: PanelInstance = { ...first, id: 'table-2', inputs: [] };
  function SelectEquipment() {
    const { setPage } = usePlatform();
    return <button onClick={() => setPage({ [MOTION_EQUIPMENT_KEY]: [equipmentId] })}>Select equipment</button>;
  }
  const open = await mountPanelView([publisher, first, second], { realChart: 'hw-current', children: <SelectEquipment /> });
  fireEvent.click(screen.getByRole('button', { name: 'Select equipment' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).getAll(MOTION_EQUIPMENT_KEY)).toEqual([equipmentId]));
  const settings = within(await openTableSettings());
  fireEvent.click(settings.getByRole('radio', { name: '거르기' }));
  fireEvent.click(settings.getByRole('radio', { name: '붙잡기' }));
  expect(screen.getByRole('tab', { name: '원본 표 · 붙잡음 2' })).toBeTruthy();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  const actions = within(await screen.findByRole('group', { name: '다음 분석' }));
  fireEvent.keyDown(actions.getByRole('button', { name: '새 패널' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: '원본 표' }));
  expect(screen.getAllByRole('tab', { name: '원본 표 · 붙잡음' })).toHaveLength(1);
  const following = within(await openTableSettings());
  expect(following.getByRole('radio', { name: '거르기', checked: true })).toBeTruthy();
  expect(following.getByRole('radio', { name: '따라가기', checked: true })).toBeTruthy();

  const saved = await act(() => views.saveAs({ name: 'Both connections', kind: 'menu-view' }));
  if (!saved.ok || saved.value.view.kind !== 'menu-view') throw new Error('Failed to save both table connections');
  expect(saved.value.view.panels?.instances).toEqual([
    publisher, first, { ...second, inputs: [{ ...connection, mode: 'follow' }] },
  ]);
  cleanup();
  await open(saved.value.view.id);
  const held = within(await openTableSettings({ name: '원본 표 · 붙잡음' }));
  expect(held.getByRole('radio', { name: '강조만', checked: true })).toBeTruthy();
  expect(held.getByRole('radio', { name: '붙잡기', checked: true })).toBeTruthy();
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(within(await openTableSettings()).getByRole('radio', { name: '거르기', checked: true })).toBeTruthy();
});

it('deletes the second saved raw table and saves the first with its connection', async () => {
  const publisher: PanelInstance = { id: 'held-source', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] };
  const first: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: MOTION_EQUIPMENT_KEY, from: `${publisher.id}.${MOTION_EQUIPMENT_KEY}`, mode: 'follow', use: 'highlight' }] };
  const second: PanelInstance = { ...first, id: 'table-2', inputs: [] };
  await mountPanelView([first, second, publisher]);
  expect(await screen.findByRole('tab', { name: '원본 표' })).toBeTruthy();
  fireEvent.keyDown(await screen.findByRole('tab', { name: '원본 표 2' }), { key: 'F10', shiftKey: true });
  fireEvent.click(await screen.findByRole('menuitem', { name: '삭제' }));
  await waitFor(() => expect(screen.queryByRole('tab', { name: '원본 표 2' })).toBeNull());
  expect(screen.getAllByRole('tab', { name: /^원본 표/ })).toHaveLength(1);
  expect(screen.getByRole('tab', { name: '원본 표' })).toBeTruthy();
  const saved = await act(() => views.saveAs({ name: 'One raw table', kind: 'menu-view' }));
  expect(saved).toMatchObject({ ok: true, value: { view: {
    page: expect.arrayContaining([['pins', 'table']]),
    panels: { version: 1, instances: [first, publisher] },
  } } });
});

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
  const drawer = await openTableSettings({ name: '원본 표 · 붙잡음' });
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
  const retry = await openTableSettings({ tab: table });
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
  await mountPanelView([chart], { equipment });
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
    const tabs = screen.getAllByRole('tab', { name: /^원본 표/ });
    const copySlot = `saved-panel-${savedPanels.instances.findIndex(panel => panel.id === 'table~1')}`;
    expect(tabs.map(tab => tab.getAttribute('data-tab-panel-id'))).toEqual([copySlot]);
    expect(tabs).toHaveLength(1);
    const tab = screen.getByRole('tab', { name: '원본 표' });
    expect(within(await openTableSettings({ tab })).getByRole('radio', { name: '강조만', checked: true })).toBeTruthy();
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

it.each(['follow', 'hold'] as const)('highlights the %s selection without filtering after editing and reopening the saved view', async mode => {
  const selected = 'MEM-PHOTO-0103';
  const other = 'MEM-PHOTO-0105';
  function SelectEquipment() {
    const { setPage } = usePlatform();
    return <button onClick={() => setPage({ [MOTION_EQUIPMENT_KEY]: [selected] })}>Pick equipment for highlight</button>;
  }
  function ClearEquipment() {
    const { setPage } = usePlatform();
    return <button onClick={() => setPage({ [MOTION_EQUIPMENT_KEY]: null })}>Clear equipment for highlight</button>;
  }
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page, chartOptions: {}, layout: null, panels: null,
  })]);
  const mount = () => renderOverview('', request => {
    if (request.endpoint !== hwTime.tableRows.id) return answer(request);
    const equipment = (request.params as { motionEquipment?: string[] }).motionEquipment ?? [selected, other];
    const data: HwTimeTableData = {
      rows: equipment.map(equipmentId => ({ id: equipmentId, equipmentId, values: {}, total: 1 })), total: equipment.length,
    };
    return { ...answer(request), data };
  }, { savedViews: store, children: <><Controls /><SelectEquipment /><ClearEquipment /></>, realWorkspace: true, showDetail: true });
  const select = async (id: string) => {
    await waitFor(() => expect(views.status).toBe('ready'));
    await act(async () => { expect(await views.select(id)).toMatchObject({ ok: true }); });
    if (id === 'saved' || mode === 'follow') {
      fireEvent.click(screen.getByRole('button', { name: 'Pick equipment for highlight' }));
      await waitFor(() => expect(new URLSearchParams(window.location.search).get(MOTION_EQUIPMENT_KEY)).toBe(selected));
    }
  };
  const tablePanel = () => within(document.querySelector<HTMLElement>('[data-dock-panel="table"]')!);
  const table = async () => within(await tablePanel().findByRole('table', { name: 'HW Time 동작시간 표' }));
  const expectHighlighted = async () => {
    await waitFor(() => {
      const rows = within(tablePanel().getByRole('table', { name: 'HW Time 동작시간 표' }));
      expect(within(rows.getByRole('row', { name: new RegExp(selected) })).getByText('분석 선택에 포함')).toBeTruthy();
      expect(within(rows.getByRole('row', { name: new RegExp(other) })).queryByText('분석 선택에 포함')).toBeNull();
    });
  };
  await mount();
  await select('saved');
  const settings = await openTableSettings();
  const rows = await table();
  expect(await rows.findByRole('row', { name: new RegExp(selected) })).toBeTruthy();
  expect(rows.queryByRole('row', { name: new RegExp(other) })).toBeNull();
  fireEvent.click(within(settings).getByRole('radio', { name: '강조만' }));
  if (mode === 'hold') {
    fireEvent.click(within(settings).getByRole('radio', { name: '붙잡기' }));
    fireEvent.click(screen.getByRole('button', { name: 'Clear equipment for highlight' }));
  }
  await expectHighlighted();
  const saved = await act(() => views.saveAs({ name: 'Highlight equipment', kind: 'menu-view' }));
  if (!saved.ok) throw new Error('Failed to save the highlight setting');
  cleanup();
  await mount();
  await select(saved.value.view.id);
  const reopened = await openTableSettings({ name: mode === 'hold' ? '원본 표 · 붙잡음' : '원본 표' });
  await expectHighlighted();
  fireEvent.click(within(reopened).getByRole('radio', { name: '무시' }));
  await waitFor(() => {
    expect(screen.queryByText('분석 선택에 포함')).toBeNull();
    expect(tablePanel().getByRole('row', { name: new RegExp(other) })).toBeTruthy();
  });
});

it('saves the active default publisher and can hold a selection from the chart added after the table', async () => {
  const store = createFakeSavedViewStore([]);
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1', answer, {
    savedViews: store, children: <Controls />, realWorkspace: true, realChart: 'hw-module-motions', showDetail: true,
  });
  await waitFor(() => expect(views.status).toBe('ready'));
  for (const name of ['원본 표', 'PM1 · Motion별']) {
    fireEvent.keyDown(screen.getByRole('button', { name: /패널 추가/ }), { key: 'Enter' });
    const item = await screen.findByRole('menuitem', { name });
    expect(item.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(item);
    await waitFor(() => expect(screen.queryByRole('menuitem', { name })).toBeNull());
  }
  fireEvent.click(await screen.findByRole('tab', { name: /Motion별/ }));
  const chart = within((await screen.findByTestId('hw-module-motions')).closest('section')!);
  fireEvent.click(chart.getByRole('button', { name: '더보기' }));
  const pointTools = await screen.findByRole('dialog', { name: '더보기' });
  fireEvent.click(within(pointTools).getByRole('button', { name: '선택에 지점 추가' }));
  fireEvent.keyDown(pointTools, { key: 'Escape' });
  expect(new URLSearchParams(window.location.search).get(MOTION_EQUIPMENT_KEY)).toBe('MEM-PHOTO-0103');
  const saved = await act(() => views.saveAs({ name: 'Follow', kind: 'menu-view' }));
  const settings = await openTableSettings();
  expect.soft(within(settings).queryByText(/받는 선택.*PM1 · Motion별/)).toBeTruthy();
  expect.soft(saved).toMatchObject({ ok: true, value: { view: { panels: { instances: expect.arrayContaining([
    expect.objectContaining({ id: 'table', inputs: [{ key: MOTION_EQUIPMENT_KEY, from: `moduleMotions.${MOTION_EQUIPMENT_KEY}`, mode: 'follow' }] }),
  ]) } } } });
  fireEvent.click(within(settings).getByRole('radio', { name: '붙잡기' }));
  expect(within(settings).getByText('MEM-PHOTO-0103')).toBeTruthy();
});

it('restores a saved raw table with empty inputs in Ignore mode after a chart selection', async () => {
  const equipment = ['MEM-PHOTO-0103', 'MEM-PHOTO-0105'];
  const publisher: PanelInstance = { id: 'current', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] };
  const table: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, inputs: [], outputs: [] };
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page, chartOptions: {}, layout: null, panels: { version: 1, instances: [publisher, table] },
  })]);
  const reads: MenuQuery[] = [];
  await renderOverview('', request => {
    const response = answer(request);
    if (request.endpoint !== hwTime.levelRows.id && request.endpoint !== hwTime.tableRows.id) return response;
    reads.push(request);
    const equipmentIds = (request.params as { motionEquipment?: string[] }).motionEquipment ?? equipment;
    const rows = equipmentIds.map(equipmentId => ({ id: equipmentId, equipmentId, values: {}, total: 1 }));
    return request.endpoint === hwTime.levelRows.id
      ? { ...response, data: { ...response.data as object, rows } }
      : { ...response, data: { rows, total: rows.length } };
  }, { savedViews: store, children: <Controls />, realWorkspace: true, realChart: 'hw-current', showDetail: true });
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { expect(await views.select('saved')).toMatchObject({ ok: true }); });

  fireEvent.click(await screen.findByRole('button', { name: '더보기' }));
  const pointTools = await screen.findByRole('dialog', { name: '더보기' });
  fireEvent.click(within(pointTools).getByRole('button', { name: '선택에 지점 추가' }));
  fireEvent.keyDown(pointTools, { key: 'Escape' });
  expect(new URLSearchParams(window.location.search).getAll(MOTION_EQUIPMENT_KEY)).toEqual([equipment[0]]);

  const tab = await screen.findByRole('tab', { name: '원본 표' });
  fireEvent.keyDown(tab, { key: 'F10', shiftKey: true });
  fireEvent.keyDown(await screen.findByRole('menu'), { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  const rows = within(await screen.findByRole('table', { name: 'HW Time 동작시간 표' }));
  const sort = within(rows.getByRole('columnheader', { name: /EquipmentID/ })).getByRole('button');
  await waitFor(() => expect((sort as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(sort);
  await waitFor(() => expect(reads).toContainEqual(expect.objectContaining({
    endpoint: hwTime.tableRows.id, params: expect.objectContaining({ sorting: [{ id: 'equipmentId', desc: false }] }),
  })));
  expect(reads.some(request => request.endpoint === hwTime.levelRows.id)).toBe(true);
  for (const request of reads) expect(request.params).not.toHaveProperty(MOTION_EQUIPMENT_KEY);
  for (const id of equipment) expect(await rows.findByRole('row', { name: new RegExp(id) })).toBeTruthy();
  expect(rows.queryByText('분석 선택에 포함')).toBeNull();
  expect(within(await openTableSettings()).getByRole('radio', { name: '무시', checked: true })).toBeTruthy();
});

it('keeps two held table filters separate through level reads, paging, export, and reopening with the live selection cleared', async () => {
  const equipment = ['MEM-PHOTO-0103', 'MEM-PHOTO-0105'];
  const source: PanelInstance = { id: 'current', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: MOTION_EQUIPMENT_KEY, shape: 'set', dimension: EQUIPMENT_SELECTION_DIMENSION }] };
  const tables: PanelInstance[] = equipment.map((id, index) => ({
    id: index === 0 ? 'table' : 'table-copy', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: MOTION_EQUIPMENT_KEY, mode: 'hold', from: `current.${MOTION_EQUIPMENT_KEY}`, value: { shape: 'set', values: [id] } }],
  }));
  const store = createFakeSavedViewStore([testSavedView({
    id: 'held', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM', context,
    page: [...page, [MOTION_EQUIPMENT_KEY, equipment[1]!]], chartOptions: {}, layout: null, panels: { version: 1, instances: [source, ...tables] },
  })]);
  const reads: MenuQuery[] = [];
  function ClearLiveSelection() {
    const { setPage } = usePlatform();
    return <button onClick={() => setPage({ [MOTION_EQUIPMENT_KEY]: null })}>Clear live selection</button>;
  }
  const mount = async (id: string) => {
    await renderOverview('', request => {
      reads.push(request);
      const params = request.params as { motionEquipment?: string[]; page?: number };
      const rowIds = params.motionEquipment ?? equipment;
      const rows = rowIds.map(equipmentId => ({ id: equipmentId, equipmentId, values: {}, total: 1 }));
      const response = answer(request);
      if (request.endpoint === hwTime.levelRows.id) return { ...response, data: { ...response.data as object, rows } };
      if (request.endpoint === hwTime.tableRows.id) return { ...response, data: { rows, total: 26 } };
      if (request.endpoint === hwTime.exportRows.id) return { ...response, data: rows };
      return response;
    }, { savedViews: store, children: <><Controls /><ClearLiveSelection /></>, showDetail: true });
    await waitFor(() => expect(views.status).toBe('ready'));
    await act(async () => { expect(await views.select(id)).toMatchObject({ ok: true }); });
  };
  const tablePanel = (slot: string) => within(screen.getByRole('region', { name: `panel ${slot}` }));
  const expectHeldRows = async () => {
    for (const [index, slot] of ['table', 'saved-panel-2'].entries()) {
      const panel = tablePanel(slot);
      expect(await panel.findByRole('row', { name: new RegExp(equipment[index]!) })).toBeTruthy();
      expect(panel.queryByRole('row', { name: new RegExp(equipment[1 - index]!) })).toBeNull();
    }
  };
  await mount('held');
  fireEvent.click(screen.getByRole('button', { name: 'Clear live selection' }));
  await expectHeldRows();
  for (const id of equipment) expect(reads).toContainEqual(expect.objectContaining({
    endpoint: hwTime.levelRows.id, params: expect.objectContaining({ motionEquipment: [id] }),
  }));
  fireEvent.click(tablePanel('saved-panel-2').getByRole('button', { name: '다음' }));
  await waitFor(() => expect(reads).toContainEqual(expect.objectContaining({
    endpoint: hwTime.tableRows.id, params: expect.objectContaining({ page: 1, motionEquipment: [equipment[1]] }),
  })));
  fireEvent.keyDown(tablePanel('table').getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: /^필터 결과 전체 .*CSV로 내보내기$/ }));
  await waitFor(() => expect(reads).toContainEqual(expect.objectContaining({
    endpoint: hwTime.exportRows.id, params: expect.objectContaining({ motionEquipment: [equipment[0]] }),
  })));
  const saved = await act(() => views.saveAs({ name: 'Held tables', kind: 'menu-view' }));
  if (!saved.ok) throw new Error('Failed to save held tables');
  cleanup();
  await mount(saved.value.view.id);
  expect(new URLSearchParams(window.location.search).has(MOTION_EQUIPMENT_KEY)).toBe(false);
  await expectHeldRows();
});

it('blocks the table population and export until a rejected held filter is removed', async () => {
  const source: PanelInstance = { id: 'current', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: MOTION_EQUIPMENT_KEY, shape: 'set', dimension: 'stale-equipment' }] };
  const table: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: MOTION_EQUIPMENT_KEY, mode: 'hold', use: 'filter', from: `current.${MOTION_EQUIPMENT_KEY}`,
      value: { shape: 'set', values: ['MEM-PHOTO-0103'] } }],
  };
  const store = createFakeSavedViewStore([testSavedView({
    id: 'rejected', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM', context,
    page: page.filter(([key]) => key !== 'pins'), chartOptions: {}, layout: null, panels: { version: 1, instances: [source, table] },
  })]);
  const reads: MenuQuery[] = [];
  await renderOverview('', request => {
    if (request.endpoint === hwTime.levelRows.id || request.endpoint === hwTime.tableRows.id || request.endpoint === hwTime.exportRows.id) reads.push(request);
    return answer(request);
  }, { savedViews: store, children: <Controls />, realWorkspace: true, showDetail: true });

  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { expect(await views.select('rejected')).toMatchObject({ ok: true }); });
  fireEvent.click(await screen.findByRole('tab', { name: '원본 표 · 붙잡음' }));
  expect((await screen.findByText('붙잡은 설비 선택을 적용할 수 없습니다.')).closest('[role="alert"]')).toBeTruthy();
  expect(reads).toEqual([]);
  expect(screen.queryByRole('table', { name: 'HW Time 동작시간 표' })).toBeNull();
  expect(screen.queryByRole('button', { name: /^내보내기/ })).toBeNull();

  const settings = await openTableSettings({ name: '원본 표 · 붙잡음' });
  fireEvent.click(within(settings).getByRole('radio', { name: '무시' }));
  await waitFor(() => expect(reads.some(request => request.endpoint === hwTime.tableRows.id)).toBe(true));
  expect(screen.queryByText('붙잡은 설비 선택을 적용할 수 없습니다.')).toBeNull();
});

it('shows an unavailable follow connection when the saved source is no longer the live chart', async () => {
  const output = { key: MOTION_EQUIPMENT_KEY, shape: 'set', dimension: EQUIPMENT_SELECTION_DIMENSION } as const;
  const sources: PanelInstance[] = ['current', 'replacement'].map(id => ({
    id, source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs: [output],
  }));
  const table: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: MOTION_EQUIPMENT_KEY, mode: 'follow', from: `current.${MOTION_EQUIPMENT_KEY}` }],
  };
  const store = createFakeSavedViewStore([testSavedView({
    id: 'disconnected', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM', context,
    page: [...page, [MOTION_EQUIPMENT_KEY, 'MEM-PHOTO-0103']], chartOptions: {}, layout: null,
    panels: { version: 1, instances: [...sources, table] },
  })]);
  await renderOverview('', answer, { savedViews: store, children: <Controls />, realWorkspace: true, showDetail: true });
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { expect(await views.select('disconnected')).toMatchObject({ ok: true }); });
  expect(await screen.findByText('연결한 차트의 선택을 읽을 수 없습니다.')).toBeTruthy();
  expect(screen.queryByRole('table', { name: 'HW Time 동작시간 표' })).toBeNull();
});
