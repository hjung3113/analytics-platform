// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { EQUIPMENT_SELECTION_DIMENSION, type MenuQuery, type PanelInstance } from '@ap/contracts';
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
const chart = (id: string) => JSON.parse(screen.getByTestId(`hw-${id}`).textContent!) as { series: { id: string; points: [string, number | null][] }[] };
const points = (id: string) => chart(id).series.map(series => [series.id, series.points]);

let views: SavedViews;
function Views() { views = useSavedViews(); return null; }
async function mount(instances: PanelInstance[] | null, { realChart, realWorkspace = true, page = step4 }: { realChart?: string; realWorkspace?: boolean; page?: [string, string][] } = {}) {
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page, chartOptions: {}, layout: null, panels: instances && { version: 1, instances },
  })]);
  const open = async (id: string) => {
    await renderOverview('', days, { savedViews: store, children: <Views />, realWorkspace, showDetail: true, realChart });
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
async function create(kind: string, measure: string) {
  const picker = within(await openPanelPicker());
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
