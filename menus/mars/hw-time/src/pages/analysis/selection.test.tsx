// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as kernel from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import type { MenuQuery } from '@ap/contracts';
import { answer, chartRenders, fixtureMatrix, renderOverview, requests, settle } from './test-support';

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
    expect(output).toHaveBeenCalledWith('moduleMotions', 'motionEquipment', { available: ['MEM-PHOTO-0103'], subscribeHighlight: false });
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

  const addPanel = within(screen.getByTestId('workspace-actions')).getByRole('button', { name: /패널 추가/ });
  fireEvent.keyDown(addPanel, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: 'PM1 · Motion별' }));

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
  fireEvent.keyDown(add, { key: 'Enter' });
  const menu = within(await screen.findByRole('menu'));
  expect(menu.getAllByRole('menuitem')).toHaveLength(1);
  fireEvent.click(menu.getByRole('menuitem'));
  await waitFor(() => expect(tableReads()[0]?.params).toMatchObject({ motionEquipment: ['MEM-PHOTO-0105'] }));
  expect(row.queryByRole('button', { name: '새 패널' })).toBeNull();
  fireEvent.click(within(screen.getByRole('group', { name: '분석 선택' })).getByRole('button', { name: '설비 MEM-PHOTO-0105' }));
  const editor = within(screen.getByRole('dialog', { name: '설비 MEM-PHOTO-0105' }));
  fireEvent.click(editor.getByRole('checkbox', { name: 'MEM-PHOTO-0103' }));
  fireEvent.click(editor.getByRole('checkbox', { name: 'MEM-PHOTO-0105' }));
  fireEvent.click(editor.getByRole('button', { name: '적용' }));
  await waitFor(() => expect(tableReads().at(-1)?.params).toMatchObject({ motionEquipment: ['MEM-PHOTO-0103'] }));
});

it('opens the raw table body on the first add from a maximized chart', async () => {
  await renderOverview('&moduleType=PM&drillMotion=Pump&drillModule=PM1&motionEquipment=MEM-PHOTO-0105', answer,
    { realWorkspace: true, realChart: 'hw-current' });
  fireEvent.click(screen.getByRole('button', { name: 'PM1 · Pump · 설비별 최대화' }));
  expect(screen.getByRole('button', { name: '원래 크기로' })).toBeTruthy();
  const add = within(screen.getByRole('group', { name: '다음 분석' })).getByRole('button', { name: '새 패널' });
  fireEvent.keyDown(add, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('menuitem', { name: '원본 표' }));
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
