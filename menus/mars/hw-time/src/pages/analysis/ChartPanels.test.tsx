// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EQUIPMENT_SELECTION_DIMENSION, PANEL_INSTANCES_MAX, type ApiResponse, type MenuQuery, type PanelInstance } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, testSavedView, useSavedViews, type SavedViews } from '@ap/kernel/testing';
import { MOTION_EQUIPMENT_KEY } from '../../endpoints';
import { answer, openPanelPicker, renderOverview, requests } from './test-support';

await vi.hoisted(async () => { (await import('@ap/components/testing/engines')).mockEchartsCanvas(); });

const context = { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };
const step4: [string, string][] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1']];
const output = { key: 'selection', dimension: EQUIPMENT_SELECTION_DIMENSION, shape: 'set' } as const;
const bar = (id: string, measure: string): PanelInstance => ({ id, inputs: [], outputs: [output],
  source: { kind: 'chart', config: { version: 1, kind: 'bar', x: { field: 'equipment', type: 'category' }, measures: [{ field: measure }] } } });
const line = (id: string, measure: string): PanelInstance => ({ id, inputs: [], outputs: [],
  source: { kind: 'chart', config: { version: 1, kind: 'line', x: { field: 'day', type: 'time' }, measures: [{ field: measure }], split: { field: 'equipment' } } } });
const days = (request: MenuQuery) => request.endpoint !== 'hwTime.equipmentDays' ? answer(request) : { ...answer(request), data: { rows: [
  { equipmentId: 'MEM-PHOTO-0103', date: '2026-09-19', judgement: { value: 4, lower: null, upper: null, status: 'normal' } },
  { equipmentId: 'MEM-PHOTO-0103', date: '2026-09-20', judgement: { value: 5, lower: null, upper: null, status: 'normal' } },
  { equipmentId: 'MEM-PHOTO-0105', date: '2026-09-19', judgement: { value: 6, lower: null, upper: null, status: 'normal' } },
] } };
const chart = (id: string) => JSON.parse(screen.getByTestId(`hw-${id}`).textContent!) as { series: { id: string; unit?: string; points: [string, number | null][] }[] };
const points = (id: string) => chart(id).series.map(series => [series.id, series.points]);

let views: SavedViews;
function Views() {
  const { setGlobal, setPage } = usePlatform();
  views = useSavedViews();
  return <>
    <button onClick={() => setPage({ drillModule: 'PM1' })}>Drill to PM1</button>
    <button onClick={() => setGlobal({ from: '2026-09-20T09:00:00' })}>Change period</button>
  </>;
}
const step3 = step4.filter(([key]) => key !== 'drillModule');
async function mount(instances: PanelInstance[] | null, { realChart, realWorkspace = true, page = step4, respond = days }: {
  realChart?: string; realWorkspace?: boolean; page?: [string, string][]; respond?: (request: MenuQuery) => ApiResponse<unknown>;
} = {}) {
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page, chartOptions: {}, layout: null, panels: instances && { version: 1, instances },
  })]);
  const open = async (id: string) => {
    await renderOverview('', respond, { savedViews: store, children: <Views />, realWorkspace, showDetail: true, realChart });
    await waitFor(() => expect(views.status).toBe('ready'));
    await act(async () => { expect(await views.select(id)).toMatchObject({ ok: true }); });
  };
  await open('saved');
  return open;
}
async function saveAs(name: string) {
  const saved = await act(() => views.saveAs({ name, kind: 'menu-view' }));
  if (!saved.ok || saved.value.view.kind !== 'menu-view') throw new Error(`Failed to save ${name}`);
  return saved.value.view;
}
async function create(kind: string, measure: string, { pin = true } = {}) {
  const picker = within(await openPanelPicker());
  const pinning = picker.getByRole('checkbox', { name: '추가하면 고정' });
  if ((pinning.getAttribute('aria-checked') === 'true') !== pin) fireEvent.click(pinning);
  fireEvent.click(picker.getByRole('radio', { name: kind }));
  fireEvent.click(picker.getByRole('radio', { name: measure }));
  fireEvent.click(picker.getByRole('radio', { name: '설비' }));
  fireEvent.click(picker.getByRole('button', { name: '더하기' }));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: '패널 추가' })).toBeNull());
}
async function openSettings(name: string) {
  fireEvent.keyDown(await screen.findByRole('tab', { name }), { key: 'F10', shiftKey: true });
  fireEvent.click(await screen.findByRole('menuitem', { name: '패널 설정' }));
  return within(await screen.findByRole('dialog', { name }));
}

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it('draws a bar made with «종류로 만들기», saves it in a view and reopens it with the same instance', async () => {
  const open = await mount(null);
  await create('막대', 'Module 평균 동작시간');
  expect(await screen.findByRole('tab', { name: 'Module 평균 동작시간 · 설비' })).toBeTruthy();
  expect(points('chart-1')).toEqual([['moduleSeconds', [['MEM-PHOTO-0103', 20], ['MEM-PHOTO-0105', 20]]]]);
  expect(chart('chart-1').series[0]?.unit).toBe('초');
  const view = await saveAs('Generated bar');
  expect(view.panels?.instances).toEqual([bar('chart-1', 'moduleSeconds')]);

  cleanup();
  await open(view.id);
  expect(await screen.findByRole('tab', { name: 'Module 평균 동작시간 · 설비' })).toBeTruthy();
  expect(points('chart-1')).toEqual([['moduleSeconds', [['MEM-PHOTO-0103', 20], ['MEM-PHOTO-0105', 20]]]]);
  expect((await saveAs('Reopened')).panels?.instances).toEqual([bar('chart-1', 'moduleSeconds')]);
});

it('draws a line over the days of the drilled Module and Motion', async () => {
  await mount(null);
  await create('선', 'Motion 평균 동작시간');
  expect(await screen.findByRole('tab', { name: 'Motion 평균 동작시간 · 설비' })).toBeTruthy();
  await waitFor(() => expect(points('chart-1')).toEqual([
    ['MEM-PHOTO-0103', [['2026-09-19T00:00:00', 4], ['2026-09-20T00:00:00', 5]]],
    ['MEM-PHOTO-0105', [['2026-09-19T00:00:00', 6], ['2026-09-20T00:00:00', null]]],
  ]));
  expect(requests.filter(request => request.endpoint === 'hwTime.equipmentDays').map(request => request.params))
    .toContainEqual({ moduleType: 'PM', drillModule: 'PM1', drillMotion: 'Pump' });
});

it('publishes a generated bar selection that a saved table input reads', async () => {
  const table: PanelInstance = { id: 'table', source: { kind: 'declared', panel: 'table' }, outputs: [],
    inputs: [{ key: MOTION_EQUIPMENT_KEY, from: 'chart-1.selection', mode: 'follow' }] };
  await mount([bar('chart-1', 'motionSeconds'), table], { realChart: 'hw-chart-1', realWorkspace: false });
  const frame = within(await screen.findByRole('region', { name: 'hw-chart-1' }));
  fireEvent.click(await frame.findByRole('button', { name: '이 지점만 선택' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).getAll('chart-1.selection')).toEqual(['MEM-PHOTO-0103']));
  await waitFor(() => expect(requests.some(request => ['hwTime.levelRows', 'hwTime.tableRows'].includes(request.endpoint)
    && (request.params as Record<string, unknown>)[MOTION_EQUIPMENT_KEY]?.toString() === 'MEM-PHOTO-0103')).toBe(true));
});

it('shows the reason on a saved chart the menu can no longer make and draws the others', async () => {
  const retired = bar('chart-1', 'retiredSeconds');
  await mount([retired, line('chart-2', 'moduleSeconds')]);
  expect(await screen.findByText('이 메뉴에 없는 지표입니다')).toBeTruthy();
  expect(screen.queryByTestId('hw-chart-1')).toBeNull();
  await waitFor(() => expect(points('chart-2').map(([id]) => id)).toEqual(['MEM-PHOTO-0103', 'MEM-PHOTO-0105']));
  expect((await saveAs('Kept')).panels?.instances).toEqual([retired, line('chart-2', 'moduleSeconds')]);
});

it('redraws on a drawer mapping change and blocks saving while the mapping is rejected', async () => {
  await mount([bar('chart-1', 'moduleSeconds')]);
  const drawer = await openSettings('Module 평균 동작시간 · 설비');
  fireEvent.click(drawer.getByRole('button', { name: 'Motion 평균 동작시간' }));
  await waitFor(() => expect(points('chart-1')).toEqual([['motionSeconds', [['MEM-PHOTO-0103', 4], ['MEM-PHOTO-0105', 4]]]]));
  expect(screen.getByRole('tab', { name: 'Motion 평균 동작시간 · 설비' })).toBeTruthy();
  expect((await saveAs('Remapped')).panels?.instances).toEqual([bar('chart-1', 'motionSeconds')]);

  const remapped = within(screen.getByRole('dialog', { name: 'Motion 평균 동작시간 · 설비' }));
  fireEvent.click(remapped.getByRole('button', { name: '설비 지우기' }));
  await waitFor(() => expect(views.saveBlocked).toEqual([{ ko: '지표와 기준을 고르세요', en: 'Choose a measure and a breakdown' }]));
  await expect(act(() => views.saveAs({ name: 'Blocked', kind: 'menu-view' }))).resolves.toMatchObject({ ok: false, code: 'blocked' });
  await expect(act(() => views.saveToSelected())).resolves.toMatchObject({ ok: false, code: 'blocked' });
  expect(points('chart-1')).toEqual([['motionSeconds', [['MEM-PHOTO-0103', 4], ['MEM-PHOTO-0105', 4]]]]);

  fireEvent.click(remapped.getByRole('button', { name: '설비' }));
  await waitFor(() => expect(views.saveBlocked).toEqual([]));
  expect((await saveAs('Fixed')).panels?.instances).toEqual([bar('chart-1', 'motionSeconds')]);
});

it('keeps a chart added with «추가하면 고정» through a drill and a period change and drops an unpinned one', async () => {
  await mount(null, { page: step3 });
  await create('막대', 'Module 평균 동작시간');
  await create('막대', 'Motion 평균 동작시간', { pin: false });
  await waitFor(() => expect(screen.getAllByText('Module 단계에서 그릴 수 있습니다.')).toHaveLength(2));
  expect((await saveAs('Pins are not stored')).panels?.instances).toEqual([bar('chart-1', 'moduleSeconds'), bar('chart-2', 'motionSeconds')]);

  fireEvent.click(screen.getByRole('button', { name: 'Drill to PM1' }));
  await waitFor(() => expect(points('chart-1')).toEqual([['moduleSeconds', [['MEM-PHOTO-0103', 20], ['MEM-PHOTO-0105', 20]]]]));
  expect(screen.queryByRole('tab', { name: 'Motion 평균 동작시간 · 설비' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Change period' }));
  await waitFor(() => expect(new URLSearchParams(window.location.search).get('from')).toBe('2026-09-20T09:00:00'));
  expect(await screen.findByRole('tab', { name: 'Module 평균 동작시간 · 설비' })).toBeTruthy();
});

it('refuses a generated chart past the saved panel limit', async () => {
  const others = Array.from({ length: PANEL_INSTANCES_MAX }, (_, index): PanelInstance => ({
    id: `other-${index}`, source: { kind: 'declared', panel: 'retired' }, inputs: [], outputs: [],
  }));
  await mount(others);
  await create('막대', 'Module 평균 동작시간');
  expect(screen.queryByRole('tab', { name: 'Module 평균 동작시간 · 설비' })).toBeNull();
  expect((await saveAs('Full')).panels?.instances).toEqual(others);
});

it.each([
  ['before the Module step', step3, 'Module 단계에서 그릴 수 있습니다.'],
  ['when the Motion checks leave out part of the Module', [...step4, ['motion', 'PM/Chuck']] as [string, string][], '현재 Module·Motion 선택으로는 이 차트를 조회할 수 없습니다.'],
])('explains a chart it cannot query %s', async (_name, page, reason) => {
  await mount([bar('chart-1', 'moduleSeconds')], { page });
  expect(await screen.findByText(reason)).toBeTruthy();
  expect(screen.queryByTestId('hw-chart-1')).toBeNull();
});

it('names the field by its label when the received rows cannot be drawn', async () => {
  const duplicated = (request: MenuQuery) => {
    const response = days(request);
    if (request.endpoint !== 'hwTime.equipmentDays') return response;
    const { rows } = response.data as { rows: unknown[] };
    return { ...response, data: { rows: [...rows, rows[0]] } };
  };
  await mount([line('chart-1', 'moduleSeconds')], { respond: duplicated });
  expect(await screen.findByText(/^받은 데이터로 이 차트를 그릴 수 없습니다: (날짜|설비)$/)).toBeTruthy();
});

it('unblocks saving when the drawer closes with a rejected mapping', async () => {
  await mount([bar('chart-1', 'moduleSeconds')]);
  const drawer = await openSettings('Module 평균 동작시간 · 설비');
  fireEvent.click(drawer.getByRole('button', { name: '설비 지우기' }));
  await waitFor(() => expect(views.saveBlocked).toHaveLength(1));
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(views.saveBlocked).toEqual([]);
  expect((await saveAs('Unchanged')).panels?.instances).toEqual([bar('chart-1', 'moduleSeconds')]);
});

it('keeps resetting a chart on a period change after a mapping-only edit', async () => {
  await mount([bar('chart-1', 'moduleSeconds')]);
  const drawer = await openSettings('Module 평균 동작시간 · 설비');
  fireEvent.click(drawer.getByRole('button', { name: 'Motion 평균 동작시간' }));
  expect(await screen.findByRole('tab', { name: 'Motion 평균 동작시간 · 설비' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Change period' }));
  await waitFor(() => expect(screen.queryByRole('tab', { name: 'Motion 평균 동작시간 · 설비' })).toBeNull());
});
