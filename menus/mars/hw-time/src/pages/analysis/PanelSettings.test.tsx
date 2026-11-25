// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PanelInstance } from '@ap/contracts';
import { usePlatform } from '@ap/kernel';
import { createFakeSavedViewStore, memoryStorage, testSavedView, useSavedViews, type SavedViews } from '@ap/kernel/testing';
import { MOTION_EQUIPMENT_KEY, hwTime, type HwTimeTableData } from '../../endpoints';
import { answer, renderOverview } from './test-support';

const context = { from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00' };
const page: [string, string][] = [['moduleType', 'PM'], ['drillMotion', 'Pump'], ['drillModule', 'PM1'], ['pins', 'table']];
let views: SavedViews;
function Controls() {
  const { setGlobal } = usePlatform();
  views = useSavedViews();
  return <button onClick={() => setGlobal({ from: '2026-09-20T09:00:00' })}>Change period</button>;
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
