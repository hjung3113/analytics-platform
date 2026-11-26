// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { AnalysisSelectionChipZone } from '@ap/components';
import { PANEL_INSTANCE_INPUTS_MAX, PANEL_INSTANCES_MAX, type PanelInstance } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, testSavedView, useSavedViews, type SavedViews } from '@ap/kernel/testing';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MOTION_EQUIPMENT_KEY } from '../../../endpoints';
import { TREND_RANGE_OUTPUT } from '../../../panels';
import { answer, renderOverview, requests } from '../test-support';

const equipment = 'MEM-PHOTO-0105';
const following = 'MEM-PHOTO-0103';
const context = { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };
const page: [string, string][] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], [MOTION_EQUIPMENT_KEY, equipment]];
const range = '09-19/09-20';
const table = (id = 'table'): PanelInstance => ({ id, source: { kind: 'declared', panel: 'table' }, inputs: [], outputs: [] });
const action = '분석 선택 붙잡기';
const holdEquipment = `${action} · 설비 ${equipment}`;
const target = (id: string) => document.querySelector(`[data-selection-drop-panel="${id}"]`);
let views: SavedViews;
const hit = vi.fn();
function Controls() {
  views = useSavedViews();
  const { setPage } = usePlatform();
  return <>
    <button onClick={() => setPage({ [MOTION_EQUIPMENT_KEY]: [equipment] })}>Select equipment</button>
    <button onClick={() => setPage({ [MOTION_EQUIPMENT_KEY]: [following] })}>Change equipment</button>
    <button onClick={() => setPage({ [MOTION_EQUIPMENT_KEY]: null, [TREND_RANGE_OUTPUT.key]: range })}>Select date range</button>
  </>;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  vi.stubGlobal('sessionStorage', memoryStorage());
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: hit });
  requests.length = 0;
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(document, 'elementFromPoint');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

async function mount(instances: PanelInstance[], savedPage = page) {
  const store = createFakeSavedViewStore([testSavedView({
    id: 'saved', kind: 'menu-view', menuId: 'hw-time', menuSchemaVersion: 1, savedScopeId: 'MEM',
    context, page: savedPage, chartOptions: {}, layout: null, panels: { version: 1, instances },
  })]);
  await renderOverview('', answer, { savedViews: store, children: <Controls />, realWorkspace: true,
    slots: { contextBar: <AnalysisSelectionChipZone /> } });
  await waitFor(() => expect(views.status).toBe('ready'));
  await open('saved');
  await screen.findByRole('tab', { name: '원본 표' });
  fireEvent.click(screen.getByRole('button', { name: 'Select equipment' }));
}

async function open(id: string) {
  await act(async () => { expect(await views.select(id)).toMatchObject({ ok: true }); });
}

async function save(name: string) {
  const saved = await act(() => views.saveAs({ name, kind: 'menu-view' }));
  if (!saved.ok || saved.value.view.kind !== 'menu-view') throw new Error('Expected a saved menu view');
  return saved.value.view;
}

function pointer(target: Window | Element, type: string, x: number) {
  fireEvent(target, Object.assign(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: 110 }), { pointerId: 1 }));
}

async function dragTo(name: string, chipKey = MOTION_EQUIPMENT_KEY) {
  const trigger = await screen.findByRole('tab', { name });
  if (trigger.getAttribute('aria-selected') !== 'true') {
    fireEvent.keyDown(trigger, { key: 'F10', shiftKey: true });
    const settings = await screen.findByRole('menuitem', { name: '패널 설정' });
    fireEvent.keyDown(settings, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  }
  const tab = await screen.findByRole('tab', { name });
  document.querySelectorAll('.dv-groupview').forEach((group, index) => {
    vi.spyOn(group, 'getBoundingClientRect').mockReturnValue(new DOMRect(100 + index * 200, 100, 200, 200));
  });
  hit.mockReturnValue(tab);
  const zone = await screen.findByRole('group', { name: '분석 선택' });
  const chip = zone.querySelector(`[data-analysis-chip-edit="${chipKey}"]`)!;
  expect(chip).toBeTruthy();
  pointer(chip, 'pointerdown', 5);
  pointer(window, 'pointermove', 150);
}

async function item(tabName: string, name = holdEquipment) {
  fireEvent.keyDown(await screen.findByRole('tab', { name: tabName }), { key: 'F10', shiftKey: true });
  return screen.findByRole('menuitem', { name });
}

function expectDisabled(item: HTMLElement, reason: string) {
  expect(item.getAttribute('aria-disabled')).toBe('true');
  expect(document.getElementById(item.getAttribute('aria-describedby')!)?.textContent).toBe(reason);
}

it('holds the pointed-at second following table in place, restores it from a saved view and lets it follow again', async () => {
  const first = table();
  const second = table('table-2');
  const chart: PanelInstance = { id: 'motion-chart', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [], outputs: [] };
  await mount([first, second, chart]);
  await dragTo('원본 표 2');
  expect(target('saved-panel-1')?.getAttribute('data-selection-drop-state')).toBe('hovered');
  pointer(window, 'pointerup', 150);
  expect(await screen.findByRole('tab', { name: '원본 표 · 붙잡음' })).toBeTruthy();
  expect(screen.getByRole('tab', { name: '원본 표' })).toBeTruthy();
  const held = await save('Held by drop');
  const expected = { ...second, inputs: [{ key: MOTION_EQUIPMENT_KEY, from: 'held-source.motionEquipment', mode: 'hold', value: { shape: 'set', values: [equipment] } }] };
  expect(held.panels?.instances).toEqual([first, expected, chart, expect.objectContaining({ id: 'held-source' })]);
  const source = document.querySelector('[data-tab-panel-id="saved-panel-2"]') as HTMLElement;
  fireEvent.keyDown(source, { key: 'F10', shiftKey: true });
  expectDisabled(await screen.findByRole('menuitem', { name: '숨기기' }), '이 차트에서 붙잡은 패널이 있습니다');
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  await open('saved');
  expect(await screen.findByRole('tab', { name: '원본 표 2' })).toBeTruthy();
  await open(held.id);
  expect(await screen.findByRole('tab', { name: '원본 표 · 붙잡음' })).toBeTruthy();
  requests.length = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Change equipment' }));
  await waitFor(() => expect(requests.some(request => request.endpoint === 'hwTime.levelRows'
    && (request.params as { motionEquipment?: string[] }).motionEquipment?.includes(following))).toBe(true));
  const afterSelection = await save('Held after changing the selection');
  expect(afterSelection.panels?.instances).toEqual(held.panels?.instances);
  fireEvent.click(await item('원본 표 · 붙잡음', '따라가기로 바꾸기'));
  expect(await screen.findByRole('tab', { name: '원본 표 2' })).toBeTruthy();
  expect((await save('Following again')).panels?.instances.find(instance => instance.id === second.id)?.inputs).toEqual([
    { key: MOTION_EQUIPMENT_KEY, from: 'held-source.motionEquipment', mode: 'follow' },
  ]);
});

it('gives the keyboard menu and the drop identical saved panels, including a table shown only by a pin', async () => {
  await mount([], [...page, ['pins', 'table']]);
  fireEvent.click(await item('원본 표'));
  expect(await screen.findByRole('tab', { name: '원본 표 · 붙잡음' })).toBeTruthy();
  expect(screen.queryByRole('tab', { name: '원본 표' })).toBeNull();
  const fromMenu = await save('Held from menu');
  expect(fromMenu.page).not.toContainEqual(['pins', 'table']);
  await open('saved');
  fireEvent.click(screen.getByRole('button', { name: 'Select equipment' }));
  await dragTo('원본 표');
  pointer(window, 'pointerup', 150);
  expect(await screen.findByRole('tab', { name: '원본 표 · 붙잡음' })).toBeTruthy();
  const fromDrop = await save('Held by drop');
  expect(fromDrop.panels).toEqual(fromMenu.panels);
  expect(fromDrop.page).not.toContainEqual(['pins', 'table']);
  await open('saved');
  await screen.findByRole('tab', { name: '원본 표' });
  await open(fromDrop.id);
  expect(await screen.findAllByRole('tab', { name: '원본 표 · 붙잡음' })).toHaveLength(1);
  expect(screen.queryByRole('tab', { name: '원본 표' })).toBeNull();
  expect(screen.queryByRole('tab', { name: '원본 표 2' })).toBeNull();
});

it('shows the panel rejection and refuses a chip of a different dimension', async () => {
  await mount([table()]);
  fireEvent.click(screen.getByRole('button', { name: 'Select date range' }));
  await dragTo('원본 표', TREND_RANGE_OUTPUT.key);
  expect(target('table')?.textContent).toBe('설비 선택만 붙잡을 수 있습니다.');
  expect(target('previous')?.textContent).toBe('분석 선택을 받을 수 없는 패널');
  pointer(window, 'pointerup', 150);
  const blocked = await item('원본 표', `${action} · 날짜 09-19 – 09-20`);
  expectDisabled(blocked, '설비 선택만 붙잡을 수 있습니다.');
  expect((await save('Unchanged')).panels?.instances).toEqual([table()]);
});

it('refuses drag and menu when adding the held source would exceed 24 saved instances', async () => {
  const largest = [table(), ...Array.from({ length: PANEL_INSTANCES_MAX - 1 }, (_, index): PanelInstance => ({
    id: `retired-${index}`, source: { kind: 'declared', panel: 'retired' }, inputs: [], outputs: [],
  }))];
  await mount(largest);
  await dragTo('원본 표');
  const reason = '저장 한도 24개. 패널 ⋯에서 삭제하세요.';
  expect(target('table')?.textContent).toBe(reason);
  pointer(window, 'pointerup', 150);
  const blocked = await item('원본 표');
  expectDisabled(blocked, reason);
  fireEvent.click(blocked);
  expect((await save('At the limit')).panels?.instances).toEqual(largest);
});

it('refuses a hold when the table already has 16 non-equipment inputs', async () => {
  const publisher: PanelInstance = {
    id: 'motion-chart', source: { kind: 'declared', panel: 'moduleMotions' }, inputs: [],
    outputs: [{ key: 'other', dimension: 'other', shape: 'set' }],
  };
  const fullTable: PanelInstance = { ...table(), inputs: Array.from({ length: PANEL_INSTANCE_INPUTS_MAX }, (_, index) => ({
    key: `other${index}`, from: 'motion-chart.other', mode: 'follow',
  })) };
  const original = [fullTable, publisher];
  await mount(original, [...page, ['pins', 'table']]);
  await dragTo('원본 표');
  const reason = '패널 입력은 최대 16개까지 저장할 수 있습니다.';
  expect(target('table')?.getAttribute('data-selection-drop-state')).toBe('rejected');
  expect(target('table')?.textContent).toBe(reason);
  pointer(window, 'pointerup', 150);
  const blocked = await item('원본 표');
  expectDisabled(blocked, reason);
  fireEvent.click(blocked);
  const saved = await save('Unchanged at the input limit');
  expect(saved.panels?.instances).toEqual(original);
  expect(saved.page).toContainEqual(['pins', 'table']);
});
