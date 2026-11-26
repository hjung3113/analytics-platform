// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as kernel from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, testSavedView, useSavedViews, type SavedViews } from '@ap/kernel/testing';
import { EQUIPMENT_SELECTION_DIMENSION, type MenuQuery, type PanelInstance } from '@ap/contracts';
import { MOTION_EQUIPMENT_KEY } from '../../endpoints';
import { answer, chartRenders, fixtureMatrix, openPanelPicker, renderOverview, requests, settle } from './test-support';

await vi.hoisted(async () => { (await import('@ap/components/testing/engines')).mockEchartsCanvas(); });

const workspace = '&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=moduleMotions&pins=table';
const url = () => new URLSearchParams(window.location.search);
const filter = () => url().getAll('motionEquipment');
const table = () => screen.getByRole('tab', { name: 'table' });
const chart = () => JSON.parse(screen.getByTestId('hw-module-motions').textContent!);
const realChart = { realChart: 'hw-module-motions' };
const equipmentAction = (name: string) => screen.getByRole('button', { name });
const clearEquipment = () => within(screen.getByRole('group', { name: '다음 분석' })).getByRole('button', { name: '지우기' });
const selection = (values: string[]) => values.map(value => `&motionEquipment=${value}`).join('');
// The first value is a fixture equipment (available); the rest are well-formed IDs the fixture does not show.
const fullSet = Array.from({ length: kernel.ANALYSIS_SELECTION_MAX_VALUES }, (_, index) => index === 0 ? 'MEM-PHOTO-0105' : `MEM-TEST-${String(index + 2).padStart(4, '0')}`);
const tableReads = () => requests.filter(request => ['hwTime.levelRows', 'hwTime.tableRows'].includes(request.endpoint));
const matrixReads = () => requests.filter(request => request.endpoint === 'hwTime.matrix');
const tableOnlyLink = '&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=table&motionEquipment=MEM-PHOTO-0105&motion=~none';

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('emphasizes the selected equipment only while pointing to the selection chip', async () => {
  await renderOverview(`${workspace}&row=MEM-PHOTO-0105&motionEquipment=MEM-PHOTO-0103`, answer, { showSelectionChips: true });
  const chip = within(screen.getByRole('group', { name: '분석 선택' })).getByRole('img');
  expect(chart().highlightedValues ?? []).toEqual([]);
  fireEvent.pointerEnter(chip);
  expect(chart().highlightedValues).toEqual(['MEM-PHOTO-0103']);
  expect(chart().activeCategory).toBe('MEM-PHOTO-0105');
  fireEvent.pointerLeave(chip);
  expect(chart().highlightedValues ?? []).toEqual([]);
});

it.each(['pointer', 'keyboard'])('marks the default HW Time source panel and bars on %s interaction', async gesture => {
  const picked = ['MEM-PHOTO-0105', 'MEM-PHOTO-0103'];
  await renderOverview(`&moduleType=PM&drillMotion=Pump&drillModule=PM1${selection(picked)}`, answer, { showSelectionChips: true, realWorkspace: true });
  const current = screen.getByTestId('hw-current');
  expect(current.closest('[data-dock-panel="current"]')).not.toBeNull();
  expect([...document.querySelectorAll('[data-dock-panel]')].map(panel => panel.getAttribute('data-dock-panel')).sort())
    .toEqual(['current', 'previous', 'tree', 'trend']);
  const chip = within(screen.getByRole('group', { name: '분석 선택' }));
  const clear = chip.getByRole('button', { name: /선택 지우기/ });
  const icon = chip.getByRole('img');
  const highlightedPanels = () => [...document.querySelectorAll('[data-analysis-source-highlighted]')].map(panel => panel.getAttribute('data-dock-panel'));
  const highlightedBars = () => JSON.parse(current.textContent!).highlightedValues ?? [];

  expect(highlightedPanels()).toEqual([]);
  expect(highlightedBars()).toEqual([]);
  if (gesture === 'pointer') fireEvent.pointerEnter(icon);
  else act(() => clear.focus());
  expect.soft(highlightedPanels()).toEqual(['current']);
  expect.soft(highlightedBars()).toEqual(picked);
  if (gesture === 'pointer') fireEvent.pointerLeave(icon);
  else act(() => clear.blur());
  expect(highlightedPanels()).toEqual([]);
  expect(highlightedBars()).toEqual([]);
});

it.each(['browse', 'select hw-module-motions'])('%s restores and changes the active row independently of the table filter', async gesture => {
  await renderOverview(`${workspace}&row=MEM-PHOTO-0105&motionEquipment=MEM-PHOTO-0103`);
  expect(chart().activeCategory).toBe('MEM-PHOTO-0105');
  fireEvent.click(screen.getByRole('button', { name: `${gesture} MEM-PHOTO-0103` }));
  await settle();
  expect(url().get('row')).toBe('MEM-PHOTO-0103');
  expect(filter()).toEqual(['MEM-PHOTO-0103']);
});

it('shows the receiver badge while the chart keyboard controls add and remove equipment', async () => {
  await renderOverview(`${workspace}&motionEquipment=MEM-PHOTO-0105`, request => {
    const response = answer(request);
    if (request.endpoint !== 'hwTime.levelRows' || !(request.params as { motionEquipment?: string[] }).motionEquipment) return response;
    return { ...response, data: { level: 0, series: [], rows: [{ id: 'MEM-PHOTO-0105', equipmentId: 'MEM-PHOTO-0105', values: {}, total: null }], totals: { values: {}, total: null }, limits: { maxRows: 120 } } };
  }, realChart);
  fireEvent.click(equipmentAction('선택에 지점 추가'));
  expect(filter()).toEqual(['MEM-PHOTO-0105', 'MEM-PHOTO-0103']);
  await waitFor(() => expect(table().getAttribute('aria-description')).toBe('필터됨 · 1 · 선택 적용'));
  fireEvent.click(equipmentAction('선택에서 지점 빼기'));
  expect(filter()).toEqual(['MEM-PHOTO-0105']);
  fireEvent.click(equipmentAction('선택에 지점 추가'));
  fireEvent.click(clearEquipment());
  await waitFor(() => expect(table().hasAttribute('aria-description')).toBe(false));
});

it('can remove the last equipment or clear from a single-Motion chart while preserving other conditions', async () => {
  await renderOverview(`${workspace}&motion=PM/Pump&row=MEM-PHOTO-0103&motionEquipment=MEM-PHOTO-0103`, answer, realChart);
  expect(chart().series.map((series: { id: string }) => series.id)).toEqual(['Pump']);
  fireEvent.click(equipmentAction('선택에서 지점 빼기'));
  expect(filter()).toEqual([]);
  fireEvent.click(equipmentAction('선택에 지점 추가'));
  fireEvent.click(clearEquipment());
  expect(filter()).toEqual([]);
  expect(chart().series.map((series: { id: string }) => series.id)).toEqual(['Pump']);
  expect(url().get('row')).toBe('MEM-PHOTO-0103');
});

it('warns on an oversized shared filter and holds table reads until recovery', async () => {
  await renderOverview(workspace + selection([...fullSet, 'MEM-PHOTO-0103']), answer, { waitForData: false });
  expect(screen.getByText('필터 값이 올바르지 않습니다')).toBeTruthy();
  expect(tableReads()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '초기화' }));
  await waitFor(() => expect(tableReads().length).toBeGreaterThan(0));
  expect(filter()).toEqual([]);
  expect(table()).toBeTruthy();
  expect(await screen.findByTestId('hw-module-motions')).toBeTruthy();
});

it('applies a shared filter with 51 values and 50 distinct IDs and explains the limit on adding', async () => {
  await renderOverview(workspace + selection([...fullSet, fullSet[0]!]), answer, realChart);
  expect(tableReads().length).toBeGreaterThan(0);
  for (const request of tableReads()) expect(request.params).toMatchObject({ motionEquipment: fullSet });
  fireEvent.click(equipmentAction('선택에 지점 추가'));
  expect(filter()).toEqual([...fullSet, fullSet[0]!]);
  expect(within(screen.getByRole('group', { name: '다음 분석' })).getByRole('status').textContent).toContain('최대 50개');
  expect(clearEquipment().hasAttribute('disabled')).toBe(false);
});

it.each([['empty', '0'], ['error', null]] as const)('shows the filtered count for a %s response only when answered', async (outcome, count) => {
  await renderOverview(`${workspace}&motionEquipment=MEM-PHOTO-0105`, request => request.endpoint === 'hwTime.levelRows'
    ? { ...answer(request), outcome, data: null } : answer(request));
  expect(table().getAttribute('data-count')).toBe(count);
});

function withoutSelectedEquipmentInModule(request: MenuQuery) {
  const response = answer(request);
  if (request.endpoint !== 'hwTime.matrix' || (request.params as { moduleType: string }).moduleType !== 'PM') return response;
  const matrix = fixtureMatrix('PM');
  return { ...response, data: { ...matrix, cells: matrix.cells.filter(cell => cell.equipmentId !== 'MEM-PHOTO-0105' || cell.moduleId !== 'PM1') } };
}

it('reports equipment present in the moduleMotions source data', async () => {
  const output = vi.spyOn(kernel, 'useAnalysisSelectionOutput');
  try {
    await renderOverview(workspace, withoutSelectedEquipmentInModule);
    expect(output).toHaveBeenCalledWith('moduleMotions', 'motionEquipment', { available: ['MEM-PHOTO-0103'], instanceId: 'moduleMotions', subscribeHighlight: false });
  } finally {
    output.mockRestore();
  }
});

it('leaves the table unfiltered when the source module has none of the selected equipment', async () => {
  await renderOverview(workspace + selection(['MEM-PHOTO-0105']), withoutSelectedEquipmentInModule);
  expect(filter()).toEqual(['MEM-PHOTO-0105']);
  expect(table().hasAttribute('aria-description')).toBe(false);
  for (const endpoint of ['hwTime.levelRows', 'hwTime.tableRows']) {
    const latest = tableReads().filter(request => request.endpoint === endpoint).at(-1);
    expect(latest).toBeDefined();
    expect(latest?.params).not.toHaveProperty('motionEquipment');
  }
});

it('leaves the table unfiltered when every Motion is unchecked', async () => {
  await renderOverview(workspace + '&motion=~none' + selection(['MEM-PHOTO-0105']), answer, { waitForData: false });
  expect(screen.getByText('선택한 항목 없음')).toBeTruthy();
  expect(filter()).toEqual(['MEM-PHOTO-0105']);
  await waitFor(() => expect(tableReads()).toHaveLength(2));
  for (const endpoint of ['hwTime.levelRows', 'hwTime.tableRows']) {
    const latest = tableReads().filter(request => request.endpoint === endpoint).at(-1);
    expect(latest).toBeDefined();
    expect(latest?.params).not.toHaveProperty('motionEquipment');
  }
});

// #2888 review: re-checking a Motion keeps the selection; until the source reports the new availability, the table waits
// instead of asking for unfiltered rows on the previous (empty) report.
it('never reads the table unfiltered while re-checking a Motion waits for the new availability', async () => {
  await renderOverview(workspace + '&motion=~none' + selection(['MEM-PHOTO-0105']), answer, { waitForData: false });
  await waitFor(() => expect(tableReads()).toHaveLength(2));
  await settle();
  // The unfiltered read is cached, so the adapter sees no request: watch what the table asks for on every render.
  const realQuery = kernel.useMenuQuery;
  const asked: unknown[] = [];
  const query = vi.spyOn(kernel, 'useMenuQuery').mockImplementation(((endpoint: Parameters<typeof realQuery>[0], params: unknown, enabled?: boolean, options?: unknown) => {
    if ((endpoint as { id: string }).id === 'hwTime.levelRows' && enabled !== false) asked.push(params);
    return (realQuery as (...args: unknown[]) => unknown)(endpoint, params, enabled, options);
  }) as never);
  try {
    fireEvent.click(within(screen.getByRole('tree', { name: '계층' })).getByRole('checkbox', { name: 'Pump' }));
    await settle();
    expect(asked.length).toBeGreaterThan(0);
    for (const params of asked) expect(params).toHaveProperty('motionEquipment', ['MEM-PHOTO-0105']);
  } finally {
    query.mockRestore();
  }
});

it.each(['ok', 'error'] as const)('waits for an unpinned matrix (%s) before reading the table once', async outcome => {
  let releaseMatrix!: () => void;
  const matrix = new Promise<void>(resolve => { releaseMatrix = resolve; });
  await renderOverview(tableOnlyLink, async request => {
    if (request.endpoint !== 'hwTime.matrix') return answer(request);
    await matrix;
    return outcome === 'ok' ? answer(request) : { ...answer(request), outcome, data: null };
  }, { waitForData: false });
  await waitFor(() => expect(matrixReads()).toHaveLength(1));
  expect.soft(tableReads()).toEqual([]);
  expect(screen.queryByRole('tab', { name: 'moduleMotions' })).toBeNull();

  await act(async () => releaseMatrix());
  await waitFor(() => expect(tableReads()).toHaveLength(2));
  await settle();
  expect(matrixReads()).toHaveLength(1);
  const context = {
    scopeId: 'MEM', from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00',
    roomNames: null, prcGroups: null, condition: null, membershipBasis: null, selection: null,
  };
  const params = { moduleType: 'PM', ...(outcome === 'error' ? { motionEquipment: ['MEM-PHOTO-0105'] } : {}) };
  expect(tableReads().filter(request => request.endpoint === 'hwTime.levelRows')).toEqual([
    { endpoint: 'hwTime.levelRows', context, params },
  ]);
  expect(tableReads().filter(request => request.endpoint === 'hwTime.tableRows')).toEqual([
    { endpoint: 'hwTime.tableRows', context, params: { ...params, page: 0, pageSize: 25, sorting: [] } },
  ]);
  expect(filter()).toEqual(['MEM-PHOTO-0105']);
});

it('keeps the table loaded when Back restores an unavailable equipment chip on a table-only link', async () => {
  await renderOverview(tableOnlyLink, answer, { waitForData: false, showSelectionChips: true });
  const panel = within(screen.getByRole('region', { name: 'panel table' }));
  const loadedTable = await panel.findByRole('table');
  expect(tableReads().map(read => read.endpoint).sort()).toEqual(['hwTime.levelRows', 'hwTime.tableRows']);
  const before = tableReads().length;
  fireEvent.click(screen.getByRole('button', { name: '설비 선택 지우기' }));
  expect(filter()).toEqual([]);
  await act(async () => {
    const traversed = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history.back();
    await traversed;
  });
  expect(filter()).toEqual(['MEM-PHOTO-0105']);
  expect(matrixReads()).toHaveLength(1);
  expect(tableReads().slice(before)).toEqual([]);
  expect(panel.getByRole('table')).toBe(loadedTable);
});

it('restores a filtered step 3 table after visiting an unpinned step 4 source', async () => {
  await renderOverview('&moduleType=PM&drillMotion=Pump&pins=table&motionEquipment=MEM-PHOTO-0105',
    withoutSelectedEquipmentInModule, { showSelectionChips: true });
  const original = window.location.href;
  expect(filter()).toEqual(['MEM-PHOTO-0105']);
  fireEvent.click(screen.getByRole('button', { name: '설비 선택 지우기' }));
  expect(filter()).toEqual([]);

  const tree = within(screen.getByRole('region', { name: 'panel tree' }));
  fireEvent.click(tree.getByRole('button', { name: 'PM1 단계로 이동' }));
  expect(url().get('drillModule')).toBe('PM1');
  expect(screen.queryByRole('tab', { name: 'moduleMotions' })).toBeNull();
  await screen.findByTestId('hw-overview-trend');
  await settle();
  expect(matrixReads()).toHaveLength(1);

  const before = tableReads().length;
  await act(async () => {
    const traversed = new Promise<void>(resolve => window.addEventListener('popstate', () => resolve(), { once: true }));
    window.history.go(-2);
    await traversed;
  });
  await settle();
  expect(window.location.href).toBe(original);
  const restored = tableReads().slice(before);
  expect(restored.filter(request => request.endpoint === 'hwTime.levelRows').map(request => request.params))
    .toEqual([{ moduleType: 'PM', motionEquipment: ['MEM-PHOTO-0105'] }]);
  expect(restored.filter(request => request.endpoint === 'hwTime.tableRows').map(request => request.params))
    .toEqual([{ moduleType: 'PM', motionEquipment: ['MEM-PHOTO-0105'], page: 0, pageSize: 25, sorting: [] }]);
});

it('keeps the current chart mounted when the dedicated moduleMotions panel is added', async () => {
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1');
  const current = screen.getByTestId('hw-current');
  expect(screen.queryByTestId('hw-module-motions')).toBeNull();

  const picker = within(await openPanelPicker());
  fireEvent.click(picker.getByRole('button', { name: 'PM1 · Motion별' }));

  expect(await screen.findByTestId('hw-module-motions')).toBeTruthy();
  expect(screen.getByTestId('hw-current')).toBe(current);
});

it.each([
  ['', 'hw-current'],
  ['&pins=moduleMotions', 'hw-module-motions'],
])('updates only the mapped source chart on a chip hover round trip (%s)', async (pins, sourceId) => {
  chartRenders.mockClear();
  await renderOverview(`&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0103${pins}`, answer, { showSelectionChips: true });
  const previousRenders = () => chartRenders.mock.calls.filter(([id]) => id === 'hw-previous').length;
  expect(previousRenders()).toBeGreaterThan(0);
  const originalCount = previousRenders();
  const originalUrl = window.location.href;
  const chip = within(screen.getByRole('group', { name: '분석 선택' })).getByRole('img');
  const marks = () => JSON.parse(screen.getByTestId(sourceId).textContent!).highlightedValues ?? [];

  fireEvent.pointerEnter(chip);
  expect(marks()).toEqual(['MEM-PHOTO-0103']);
  fireEvent.pointerLeave(chip);
  expect(marks()).toEqual([]);
  expect(window.location.href).toBe(originalUrl);
  expect(previousRenders()).toBe(originalCount);
});

it('adds the eligible raw table and follows the equipment set from the workspace', async () => {
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105', answer,
    { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  const row = within(screen.getByRole('group', { name: '다음 분석' }));
  const add = row.getByRole('button', { name: '새 패널' });
  expect(tableReads()).toEqual([]);
  fireEvent.click(add);
  // A catalog with categories opens the categorized picker from a selection (#2744): one row per eligible panel, follow and hold (#2862).
  const picker = within(await screen.findByRole('dialog', { name: '새 패널' }));
  expect(picker.getAllByRole('button').map(item => item.getAttribute('aria-label'))).toEqual(['원본 표', '원본 표 · 붙잡기']);
  fireEvent.click(picker.getByRole('button', { name: '원본 표' }));
  await waitFor(() => expect(tableReads()[0]?.params).toMatchObject({ motionEquipment: ['MEM-PHOTO-0105'] }));
  expect(row.queryByRole('button', { name: '새 패널' })).toBeNull();
  fireEvent.click(within(screen.getByRole('group', { name: '분석 선택' })).getByRole('button', { name: '설비 MEM-PHOTO-0105' }));
  const editor = within(screen.getByRole('dialog', { name: '설비 MEM-PHOTO-0105' }));
  fireEvent.click(editor.getByRole('checkbox', { name: 'MEM-PHOTO-0103' }));
  fireEvent.click(editor.getByRole('checkbox', { name: 'MEM-PHOTO-0105' }));
  fireEvent.click(editor.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(tableReads().at(-1)?.params).toMatchObject({ motionEquipment: ['MEM-PHOTO-0103'] }));
});

const heldLink = '&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105';
const tableTab = () => document.querySelector<HTMLElement>('[role="tab"][data-tab-panel-id="table"]')!;
const newPanel = async (name: string) => {
  fireEvent.click(within(screen.getByRole('group', { name: '다음 분석' })).getByRole('button', { name: '새 패널' }));
  fireEvent.click(within(await screen.findByRole('dialog', { name: '새 패널' })).getByRole('button', { name }));
  await settle();
};
const pickEquipment = async (from: string, to: string) => {
  fireEvent.click(within(screen.getByRole('group', { name: '분석 선택' })).getByRole('button', { name: `설비 ${from}` }));
  const editor = within(screen.getByRole('dialog', { name: `설비 ${from}` }));
  fireEvent.click(editor.getByRole('checkbox', { name: to }));
  fireEvent.click(editor.getByRole('checkbox', { name: from }));
  fireEvent.click(editor.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(filter()).toEqual([to]));
  await settle();
};
const panelMenu = async (panel: string, item: string) => {
  fireEvent.keyDown(screen.getByRole('button', { name: `${panel} 동작` }), { key: 'Enter' });
  return screen.findByRole('menuitem', { name: item });
};
const readsOf = (endpoint: string) => tableReads().filter(read => read.endpoint === endpoint);
const followsTo = (value: string) => waitFor(() => {
  for (const endpoint of ['hwTime.levelRows', 'hwTime.tableRows']) expect(readsOf(endpoint).at(-1)?.params).toMatchObject({ motionEquipment: [value] });
});

it('holds the raw table to the equipment of that moment and follows again on request (#2862)', async () => {
  await renderOverview(heldLink, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  await newPanel('원본 표 · 붙잡기');
  await followsTo('MEM-PHOTO-0105');
  expect(tableTab().getAttribute('aria-description')).toContain('붙잡음 · 설비 1대');
  // The URL selection changes; the held table is not read again at all (R C9).
  const before = tableReads().length;
  await pickEquipment('MEM-PHOTO-0105', 'MEM-PHOTO-0103');
  expect(tableReads()).toHaveLength(before);
  // «따라가기로 바꾸기» from the table's ⋯ menu reads the URL selection again.
  fireEvent.click(tableTab());
  fireEvent.click(await panelMenu('원본 표 · 붙잡음', '따라가기로 바꾸기'));
  await followsTo('MEM-PHOTO-0103');
});

it('stores the same held table input through panel settings and New Panel, and reopens both', async () => {
  const store = createFakeSavedViewStore([]);
  let views!: SavedViews;
  let setPage!: ReturnType<typeof kernel.usePlatform>['setPage'];
  function Probe() {
    views = useSavedViews();
    ({ setPage } = kernel.usePlatform());
    return null;
  }
  await renderOverview(heldLink, answer, {
    realWorkspace: true, realChart: 'hw-current', showDetail: true, savedViews: store, children: <Probe />,
  });
  await waitFor(() => expect(views.status).toBe('ready'));
  const save = async (name: string) => {
    const result = await act(() => views.saveAs({ name, kind: 'menu-view' }));
    if (!result.ok || result.value.view.kind !== 'menu-view' || !result.value.view.panels) throw new Error('Failed to save held table');
    return result.value.view;
  };
  const settings = async () => {
    fireEvent.click(tableTab());
    fireEvent.click(await panelMenu('원본 표', '패널 설정'));
    return within(await screen.findByRole('dialog', { name: '원본 표' }));
  };

  await newPanel('원본 표 · 붙잡기');
  const added = await save('Held from New Panel');
  fireEvent.keyDown(tableTab(), { key: 'F10', shiftKey: true });
  fireEvent.click(await screen.findByRole('menuitem', { name: '따라가기로 바꾸기' }));
  const drawer = await settings();
  expect(drawer.getByRole('radio', { name: '따라가기', checked: true })).toBeTruthy();
  fireEvent.click(drawer.getByRole('radio', { name: '무시' }));
  fireEvent.click(drawer.getByRole('radio', { name: '거르기' }));
  fireEvent.click(drawer.getByRole('radio', { name: '붙잡기' }));
  await waitFor(() => expect(tableTab().getAttribute('aria-description')).toContain('붙잡음 · 설비 1대'));
  const edited = await save('Held from Settings');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });

  const heldInput = (view: typeof added) => {
    const panels = view.panels!.instances;
    const input = panels.find(panel => panel.id === 'table')?.inputs[0];
    if (input?.mode !== 'hold') throw new Error('Missing held table input');
    const { from, ...held } = input;
    const source = panels.flatMap(panel => panel.outputs.map(output => ({ reference: `${panel.id}.${output.key}`, output })))
      .find(entry => entry.reference === from)?.output;
    return { ...held, source };
  };
  expect(heldInput(edited)).toEqual(heldInput(added));
  expect(heldInput(added)).toEqual({
    key: MOTION_EQUIPMENT_KEY, mode: 'hold', value: { shape: 'set', values: ['MEM-PHOTO-0105'] },
    source: { key: MOTION_EQUIPMENT_KEY, dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' },
  });
  for (const view of [added, edited]) {
    await act(async () => { expect(await views.select(view.id)).toMatchObject({ ok: true }); });
    await followsTo('MEM-PHOTO-0105');
    expect(tableTab().getAttribute('aria-description')).toContain('붙잡음 · 설비 1대');
    expect((await save(`Reopened ${view.id}`)).panels).toEqual(view.panels);
    const before = tableReads().length;
    act(() => setPage({ [MOTION_EQUIPMENT_KEY]: ['MEM-PHOTO-0103'] }));
    await settle();
    expect(filter()).toEqual(['MEM-PHOTO-0103']);
    expect(tableReads()).toHaveLength(before);
  }
});

it('keeps a held table when the drill moves up a step (#2862 R C3)', async () => {
  await renderOverview(heldLink, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  await newPanel('원본 표 · 붙잡기');
  await followsTo('MEM-PHOTO-0105');
  const before = tableReads().length;
  fireEvent.click(screen.getByRole('button', { name: 'Pump 단계로 이동' }));
  await settle();
  expect(url().get('drillModule')).toBeNull();
  await waitFor(() => expect(tableTab().getAttribute('aria-description')).toContain('붙잡음 · 설비 1대'));
  expect(tableReads().slice(before).every(read => (read.params as { motionEquipment?: string[] }).motionEquipment?.join() === 'MEM-PHOTO-0105')).toBe(true);
});

it('keeps a restored held table and the drawn chart it names across a drill up, and saves a valid graph (#2862 R2 C3)', async () => {
  const chart: PanelInstance = { id: 'moduleMotions', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs: [{ key: 'motionEquipment', dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] };
  const held: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: 'motionEquipment', from: 'moduleMotions.motionEquipment', mode: 'hold', value: { shape: 'set', values: ['MEM-PHOTO-0105'] } }] };
  const store = createFakeSavedViewStore([testSavedView({ id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context: { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' }, page: [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], ['motionEquipment', 'MEM-PHOTO-0103']],
    chartOptions: {}, layout: null, panels: { version: 1, instances: [chart, held] } })]);
  let views!: SavedViews;
  function Probe() { views = useSavedViews(); return null; }
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0103', answer,
    { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true, savedViews: store, children: <Probe /> });
  await waitFor(() => expect(views.status).toBe('ready'));
  await act(async () => { await views.select('saved'); });
  await followsTo('MEM-PHOTO-0105');
  fireEvent.click(screen.getByRole('button', { name: 'Pump 단계로 이동' }));
  await settle();
  expect(url().get('drillModule')).toBeNull();
  await waitFor(() => expect(tableTab().getAttribute('aria-description')).toContain('붙잡음 · 설비 1대'));
  const result = await act(() => views.saveAs({ name: 'Up', kind: 'menu-view' }));
  expect(result).toMatchObject({ ok: true, value: { view: { panels: { version: 1, instances: [held, chart] } } } });
});

// Activates a background tab as the keyboard does (the dock reads the focused tab on Enter).
const pressTab = (tab: HTMLElement) => { tab.focus(); fireEvent.keyDown(tab, { key: 'Enter' }); };
const tabOf = (slot: string) => document.querySelector<HTMLElement>(`[role="tab"][data-tab-panel-id="${slot}"]`);
const readsWith = (value: string) => tableReads().filter(read => (read.params as { motionEquipment?: string[] }).motionEquipment?.join() === value);

it('picking «원본 표» while only a held table is open adds a following one beside it (#2862 ② R C5)', async () => {
  await renderOverview(heldLink, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  await newPanel('원본 표 · 붙잡기');
  await followsTo('MEM-PHOTO-0105');
  await pickEquipment('MEM-PHOTO-0105', 'MEM-PHOTO-0103');
  fireEvent.click(tableTab());
  fireEvent.click(await panelMenu('원본 표 · 붙잡음', '숨기기'));
  await settle();
  await newPanel('원본 표');
  await waitFor(() => expect(tabOf('saved-instance-table-2')).not.toBeNull());
  expect(tabOf('saved-instance-table-2')!.getAttribute('aria-description') ?? '').not.toContain('붙잡음');
  await waitFor(() => expect(readsWith('MEM-PHOTO-0103').length).toBeGreaterThan(0));
});

it('offers «원본 표 · 붙잡기» beside a placed following table in the real workspace, and adds the held one next to it (#2862 ②)', async () => {
  await renderOverview(`${heldLink}&pins=table`, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  await followsTo('MEM-PHOTO-0105');
  expect(tabOf('table')!.textContent).toMatch(/^원본 표\d*$/);
  fireEvent.click(within(screen.getByRole('group', { name: '다음 분석' })).getByRole('button', { name: '새 패널' }));
  // The following table is placed: only its other mode is offered.
  const picker = within(await screen.findByRole('dialog', { name: '새 패널' }));
  expect(picker.getByRole('button', { name: '원본 표 · 붙잡기' })).toBeTruthy();
  expect(picker.queryByRole('button', { name: '원본 표' })).toBeNull();
  fireEvent.click(picker.getByRole('button', { name: '원본 표 · 붙잡기' }));
  await settle();
  await waitFor(() => expect(tabOf('saved-instance-table-held')?.textContent).toMatch(/^원본 표 · 붙잡음/));
  expect(tabOf('table')!.textContent).toMatch(/^원본 표\d*$/);
  expect(tabOf('saved-instance-table-held')!.getAttribute('aria-description')).toContain('붙잡음 · 설비 1대');
});

const bodyShown = (slot: string) => {
  const panel = document.querySelector(`[data-dock-panel="${slot}"]`);
  return panel !== null && !panel.hasAttribute('inert') && !panel.closest('[inert],[hidden]');
};

it.each(['following first', 'held first'] as const)('shows both raw table bodies at once when the %s, and after «기본 배치» (#2862 ② R C1)', async order => {
  if (order === 'following first') {
    await renderOverview(`${heldLink}&pins=table`, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
    await followsTo('MEM-PHOTO-0105');
    await newPanel('원본 표 · 붙잡기');
  } else {
    // A saved view opens the held table as a tab behind the chart; «원본 표» from the chart adds the following one.
    const held: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
      inputs: [{ key: 'motionEquipment', from: 'held-source.motionEquipment', mode: 'hold', value: { shape: 'set', values: ['MEM-PHOTO-0105'] } }] };
    const source: PanelInstance = { id: 'held-source', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs: [{ key: 'motionEquipment', dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' }] };
    const store = createFakeSavedViewStore([testSavedView({ id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
      context: { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' }, page: [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], ['motionEquipment', 'MEM-PHOTO-0103']],
      chartOptions: {}, layout: null, panels: { version: 1, instances: [held, source] } })]);
    let views!: SavedViews;
    function Probe() { views = useSavedViews(); return null; }
    await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0103', answer,
      { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true, savedViews: store, children: <Probe /> });
    await waitFor(() => expect(views.status).toBe('ready'));
    await act(async () => { await views.select('saved'); });
    await newPanel('원본 표');
  }
  await waitFor(() => expect(document.querySelectorAll('[role="tab"][data-tab-panel-id*="table"]')).toHaveLength(2));
  const slots = [...document.querySelectorAll('[role="tab"][data-tab-panel-id*="table"]')].map(tab => tab.getAttribute('data-tab-panel-id')!);
  await waitFor(() => expect(slots.map(bodyShown)).toEqual([true, true]));
  fireEvent.click(screen.getByRole('button', { name: '기본 배치' }));
  await settle();
  await waitFor(() => expect(slots.map(bodyShown)).toEqual([true, true]));
});


it('shows the second raw table when the chart was maximized, and brings a hidden second back (#2862 ② R2 C1)', async () => {
  await renderOverview(`${heldLink}&pins=table`, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  await followsTo('MEM-PHOTO-0105');
  fireEvent.click(screen.getByRole('button', { name: 'PM1 · Pump · 설비별 최대화' }));
  await settle();
  await newPanel('원본 표 · 붙잡기');
  await waitFor(() => expect(['table', 'saved-instance-table-held'].map(bodyShown)).toEqual([true, true]));
  // Both hidden: «새 패널» offers the table again and the held one that takes the values comes back, not only the first.
  fireEvent.click(await panelMenu('원본 표 · 붙잡음', '숨기기'));
  await settle();
  fireEvent.click(await panelMenu('원본 표', '숨기기'));
  await settle();
  expect([tabOf('table'), tabOf('saved-instance-table-held')]).toEqual([null, null]);
  await newPanel('원본 표 · 붙잡기');
  await waitFor(() => expect(bodyShown('saved-instance-table-held')).toBe(true));
});

it('keeps the pinned following table beside a held one across a drill up (#2862 ② R2 C11)', async () => {
  await renderOverview(`${heldLink}&pins=table`, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  await followsTo('MEM-PHOTO-0105');
  await newPanel('원본 표 · 붙잡기');
  await waitFor(() => expect(tabOf('saved-instance-table-held')).not.toBeNull());
  fireEvent.click(screen.getByRole('button', { name: 'Pump 단계로 이동' }));
  await settle();
  expect(url().get('drillModule')).toBeNull();
  await waitFor(() => expect([...document.querySelectorAll('[role="tab"][data-tab-panel-id*="table"]')].map(tab => tab.getAttribute('data-tab-panel-id')).sort()).toEqual(['saved-instance-table-held', 'table']));
});

it('brings a hidden first table back when a hold makes the pair (#2862 ② R3 C1)', async () => {
  await renderOverview(`${heldLink}&pins=table`, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  await followsTo('MEM-PHOTO-0105');
  pressTab(tableTab());
  fireEvent.click(await panelMenu('원본 표', '숨기기'));
  await settle();
  expect(tabOf('table')).toBeNull();
  await newPanel('원본 표 · 붙잡기');
  await waitFor(() => expect(['table', 'saved-instance-table-held'].map(bodyShown)).toEqual([true, true]));
});

it('reveals a persisted hidden following table when a hold makes the pair (#3080 C5)', async () => {
  const storage = memoryStorage();
  const writes = vi.spyOn(storage, 'setItem');
  vi.stubGlobal('localStorage', storage);
  await renderOverview(`${heldLink}&pins=table`, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  await followsTo('MEM-PHOTO-0105');
  pressTab(tableTab());
  fireEvent.click(await panelMenu('원본 표', '숨기기'));
  await waitFor(() => expect(writes.mock.calls.some(([, value]) => value.replaceAll(String.raw`\"`, '"').includes('"hidden":["table"]'))).toBe(true));
  expect(tabOf('table')).toBeNull();
  await newPanel('원본 표 · 붙잡기');
  await waitFor(() => expect(['table', 'saved-instance-table-held'].map(bodyShown)).toEqual([true, true]));
});

it('draws the pinned following table beside a held one that took the declared slot, after a drill up, and keeps it when unpinned (#2862 ② R3 C11)', async () => {
  await renderOverview(heldLink, answer, { realWorkspace: true, realChart: 'hw-current', showSelectionChips: true });
  const tableSlots = () => [...document.querySelectorAll('[role="tab"][data-tab-panel-id*="table"]')].map(tab => tab.getAttribute('data-tab-panel-id')).sort();
  await newPanel('원본 표 · 붙잡기');
  pressTab(tabOf('current')!);
  await settle();
  await newPanel('원본 표');
  await waitFor(() => expect(tableSlots()).toEqual(['saved-instance-table-2', 'table']));
  const pin = () => screen.getByRole('button', { name: '원본 표 · 붙잡음 고정' });
  fireEvent.click(pin());
  await settle();
  expect(pin().getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Pump 단계로 이동' }));
  await settle();
  expect(url().get('drillModule')).toBeNull();
  await waitFor(() => expect(tableSlots()).toEqual(['saved-instance-table-2', 'table']));
  fireEvent.click(pin());
  await settle();
  expect(pin().getAttribute('aria-pressed')).toBe('false');
  await waitFor(() => expect(tableSlots()).toEqual(['saved-instance-table-2', 'table']));
});

it('holds a second raw table beside the following one, and a later hold changes that one instead of adding a third (#2862 ②)', async () => {
  await renderOverview(`${heldLink}&pins=table`, answer, { realChart: 'hw-current', showSelectionChips: true });
  const config = () => JSON.parse(screen.getByTestId('workspace').getAttribute('data-config')!);
  const holdTable = async () => { fireEvent.click(screen.getByRole('button', { name: 'hold table' })); await settle(); };
  await followsTo('MEM-PHOTO-0105');
  await holdTable();
  expect(config().ids.filter((id: string) => id === 'table' || id.startsWith('saved-instance-table-'))).toEqual(['table', 'saved-instance-table-held']);
  // Both share a row of their own, out of the step preset group (R C1).
  expect([config().placement.table, config().placement['saved-instance-table-held']]).toEqual([{ row: 'table-pair' }, { row: 'table-pair' }]);
  expect(JSON.stringify(config().preset.layout)).not.toMatch(/"table/);
  expect(screen.getByRole('tab', { name: 'saved-instance-table-held' }).getAttribute('aria-description')).toContain('붙잡음 · 설비 1대');
  expect(screen.getByRole('tab', { name: 'table' }).getAttribute('aria-description') ?? '').not.toContain('붙잡음');
  expect([config().titles.table, config().titles['saved-instance-table-held']]).toEqual(['원본 표', '원본 표 · 붙잡음']);
  // The selection moves on: the following table reads it, the held one keeps the moment it was held.
  const held = readsWith('MEM-PHOTO-0105').length;
  await pickEquipment('MEM-PHOTO-0105', 'MEM-PHOTO-0103');
  await waitFor(() => expect(readsWith('MEM-PHOTO-0103').length).toBeGreaterThan(0));
  expect(readsWith('MEM-PHOTO-0105')).toHaveLength(held);
  // Holding again changes the held table: still two instances.
  await holdTable();
  expect(config().ids.filter((id: string) => id === 'table' || id.startsWith('saved-instance-table-'))).toEqual(['table', 'saved-instance-table-held']);
});

it.each([
  ['keeps the «모듈 동작» chart the value came from', `${heldLink}&pins=moduleMotions`, 'hw-module-motions', false, ['moduleMotions']],
  ['does not keep a «모듈 동작» chart added after holding from the current bars', heldLink, 'hw-current', true, []],
])('%s (#2862 R C7)', async (_name, link, real, addLater, kept) => {
  await renderOverview(link, answer, { realChart: real, showSelectionChips: true });
  // The mocked workspace hands over the hold draft the «새 패널» menu would.
  fireEvent.click(screen.getByRole('button', { name: 'hold table' }));
  await settle();
  if (addLater) {
    const picker = within(await openPanelPicker());
    fireEvent.click(picker.getByRole('button', { name: /Motion별/ }));
    await settle();
  }
  const config = JSON.parse(screen.getByTestId('workspace').getAttribute('data-config')!);
  expect(config.ids).toEqual(expect.arrayContaining(['moduleMotions', 'table']));
  expect(config.keep).toEqual(kept);
});

it('opens the raw table body on the first add from a maximized chart', async () => {
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105', answer,
    { realWorkspace: true, realChart: 'hw-current' });
  fireEvent.click(screen.getByRole('button', { name: 'PM1 · Pump · 설비별 최대화' }));
  expect(screen.getByRole('button', { name: '원래 크기로' })).toBeTruthy();
  const add = within(screen.getByRole('group', { name: '다음 분석' })).getByRole('button', { name: '새 패널' });
  fireEvent.click(add);
  fireEvent.click(within(await screen.findByRole('dialog', { name: '새 패널' })).getByRole('button', { name: '원본 표' }));
  await waitFor(() => {
    expect(document.querySelector('[role="tab"][data-tab-panel-id="table"]')?.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('region', { name: 'HW Time 동작시간 표' })
      .closest('[data-dock-panel="table"]')?.getAttribute('data-dock-visible')).toBe('true');
  });
});

it('drills the selected point into its module from the current bars', async () => {
  await renderOverview('&moduleType=PM&drillMotion=Pump', answer, { realChart: 'hw-current' });
  fireEvent.click(screen.getByRole('button', { name: '이 지점만 선택' }));
  const drill = within(screen.getByRole('group', { name: '다음 분석' })).getByRole('button', { name: '나누기' });
  fireEvent.keyDown(drill, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Module · PM1' }));
  expect(url().get('drillModule')).toBe('PM1');
});

it.each([
  { pins: '', chartId: 'hw-current', motion: 'Pump' },
  { pins: '&pins=moduleMotions', chartId: 'hw-module-motions' },
])('requests raw table rows for the selected step-4 equipment ($chartId)', async ({ pins, chartId, motion }) => {
  await renderOverview(`&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105${pins}`, answer,
    { realChart: chartId, showDetail: true });
  expect(tableReads()).toEqual([]);
  fireEvent.click(within(screen.getByRole('group', { name: '다음 분석' })).getByRole('button', { name: '원본 행' }));
  await waitFor(() => expect(tableReads()).toEqual([expect.objectContaining({
    endpoint: 'hwTime.tableRows', context: expect.objectContaining({ scopeId: 'MEM' }),
    params: expect.objectContaining({ moduleType: 'PM', drillModule: 'PM1', motionEquipment: ['MEM-PHOTO-0105'], ...(motion && { drillMotion: motion }) }),
  })]));
  expect((tableReads()[0]?.params as { drillMotion?: string }).drillMotion).toBe(motion);
  expect(await screen.findByRole('dialog', { name: '원본 행' })).toBeTruthy();
});
