// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as kernel from '@ap/kernel';
import { memoryStorage } from '@ap/kernel/testing';
import type { MenuQuery } from '@ap/contracts';
import { answer, fixtureMatrix, renderOverview, requests, settle } from './test-support';

const workspace = '&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=moduleMotions&pins=table';
const url = () => new URLSearchParams(window.location.search);
const filter = () => url().getAll('motionEquipment');
const table = () => screen.getByRole('tab', { name: 'table' });
const chart = () => JSON.parse(screen.getByTestId('hw-module-motions').textContent!);
const action = (id: string) => screen.getByRole<HTMLButtonElement>('button', { name: `point action hw-module-motions ${id}` });
const selection = (values: string[]) => values.map(value => `&motionEquipment=${value}`).join('');
const fullSet = Array.from({ length: kernel.ANALYSIS_SELECTION_MAX_VALUES }, (_, index) => `EQ-${String(index + 2).padStart(3, '0')}`);
const tableReads = () => requests.filter(request => ['hwTime.levelRows', 'hwTime.tableRows'].includes(request.endpoint));

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

it.each(['browse', 'select hw-module-motions'])('%s restores and changes the active row independently of the table filter', async gesture => {
  await renderOverview(`${workspace}&row=EQ-002&motionEquipment=EQ-001`);
  expect(chart().activeCategory).toBe('EQ-002');
  fireEvent.click(screen.getByRole('button', { name: `${gesture} EQ-001` }));
  await settle();
  expect(url().get('row')).toBe('EQ-001');
  expect(filter()).toEqual(['EQ-001']);
});

it('shows the receiver badge while explicit actions add and remove equipment', async () => {
  await renderOverview(`${workspace}&motionEquipment=EQ-002`, request => {
    const response = answer(request);
    if (request.endpoint !== 'hwTime.levelRows' || !(request.params as { motionEquipment?: string[] }).motionEquipment) return response;
    return { ...response, data: { level: 0, series: [], rows: [{ id: 'EQ-002', equipmentId: 'EQ-002', values: {}, total: null }], totals: { values: {}, total: null }, limits: { maxRows: 120 } } };
  });
  fireEvent.click(action('add-equipment'));
  expect(filter()).toEqual(['EQ-002', 'EQ-001']);
  await waitFor(() => expect(table().getAttribute('aria-description')).toBe('필터됨 · 1 · 선택 적용'));
  fireEvent.click(action('remove-equipment'));
  expect(filter()).toEqual(['EQ-002']);
  fireEvent.click(action('add-equipment'));
  fireEvent.click(action('clear-equipment'));
  await waitFor(() => expect(table().hasAttribute('aria-description')).toBe(false));
});

it('can remove the last equipment or clear from a single-Motion chart while preserving other conditions', async () => {
  await renderOverview(`${workspace}&motion=PM/Pump&row=EQ-002&motionEquipment=EQ-001`);
  expect(chart().series.map((series: { id: string }) => series.id)).toEqual(['Pump']);
  fireEvent.click(action('remove-equipment'));
  expect(filter()).toEqual([]);
  fireEvent.click(action('add-equipment'));
  fireEvent.click(action('clear-equipment'));
  expect(filter()).toEqual([]);
  expect(chart().series.map((series: { id: string }) => series.id)).toEqual(['Pump']);
  expect(url().get('row')).toBe('EQ-002');
});

it('warns on an oversized shared filter and holds table reads until recovery', async () => {
  await renderOverview(workspace + selection([...fullSet, 'EQ-001']), answer, { waitForData: false });
  expect(screen.getByText('필터 값이 올바르지 않습니다')).toBeTruthy();
  expect(tableReads()).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '초기화' }));
  await waitFor(() => expect(tableReads().length).toBeGreaterThan(0));
  expect(filter()).toEqual([]);
  expect(table()).toBeTruthy();
  expect(await screen.findByTestId('hw-module-motions')).toBeTruthy();
});

it('applies a shared filter with 51 values and 50 distinct IDs and explains why adding is disabled', async () => {
  await renderOverview(workspace + selection([...fullSet, fullSet[0]!]));
  expect(tableReads().length).toBeGreaterThan(0);
  for (const request of tableReads()) expect(request.params).toMatchObject({ motionEquipment: fullSet });
  expect(action('add-equipment').disabled).toBe(true);
  expect(chart().actions).toContain('원본 표 거르기에 추가 · EQ-001 (설비는 최대 50대까지 추가할 수 있습니다)');
  expect(action('clear-equipment').disabled).toBe(false);
});

it.each([['empty', '0'], ['error', null]] as const)('shows the filtered count for a %s response only when answered', async (outcome, count) => {
  await renderOverview(`${workspace}&motionEquipment=EQ-002`, request => request.endpoint === 'hwTime.levelRows'
    ? { ...answer(request), outcome, data: null } : answer(request));
  expect(table().getAttribute('data-count')).toBe(count);
});

function withoutSelectedEquipmentInModule(request: MenuQuery) {
  const response = answer(request);
  if (request.endpoint !== 'hwTime.matrix' || (request.params as { moduleType: string }).moduleType !== 'PM') return response;
  const matrix = fixtureMatrix('PM');
  return { ...response, data: { ...matrix, cells: matrix.cells.filter(cell => cell.equipmentId !== 'EQ-002' || cell.moduleId !== 'PM1') } };
}

it('reports equipment present in the moduleMotions source data', async () => {
  const output = vi.spyOn(kernel, 'useAnalysisSelectionOutput');
  try {
    await renderOverview(workspace, withoutSelectedEquipmentInModule);
    expect(output).toHaveBeenCalledWith('moduleMotions', 'motionEquipment', { available: ['EQ-001'] });
  } finally {
    output.mockRestore();
  }
});

it('leaves the table unfiltered when the source module has none of the selected equipment', async () => {
  await renderOverview(workspace + selection(['EQ-002']), withoutSelectedEquipmentInModule);
  expect(filter()).toEqual(['EQ-002']);
  expect(table().hasAttribute('aria-description')).toBe(false);
  for (const endpoint of ['hwTime.levelRows', 'hwTime.tableRows']) {
    const latest = tableReads().filter(request => request.endpoint === endpoint).at(-1);
    expect(latest).toBeDefined();
    expect(latest?.params).not.toHaveProperty('motionEquipment');
  }
});

it('leaves the table unfiltered when every Motion is unchecked', async () => {
  await renderOverview(workspace + '&motion=~none' + selection(['EQ-002']), answer, { waitForData: false });
  expect(screen.getByText('선택한 항목 없음')).toBeTruthy();
  expect(filter()).toEqual(['EQ-002']);
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
  const link = '&moduleType=PM&drillMotion=Pump&drillModule=PM1&pins=table&motionEquipment=EQ-002&motion=~none';
  await renderOverview(link, async request => {
    if (request.endpoint !== 'hwTime.matrix') return answer(request);
    await matrix;
    return outcome === 'ok' ? answer(request) : { ...answer(request), outcome, data: null };
  }, { waitForData: false });
  await waitFor(() => expect(requests.some(request => request.endpoint === 'hwTime.matrix')).toBe(true));
  expect.soft(tableReads()).toEqual([]);
  expect(screen.queryByRole('tab', { name: 'moduleMotions' })).toBeNull();

  await act(async () => releaseMatrix());
  await waitFor(() => expect(tableReads()).toHaveLength(2));
  await settle();
  const context = {
    scopeId: 'MEM', from: '2026-09-19T09:00:00', to: '2026-09-26T09:00:00',
    roomNames: null, prcGroups: null, condition: null, membershipBasis: null, selection: null,
  };
  const params = { moduleType: 'PM', ...(outcome === 'error' ? { motionEquipment: ['EQ-002'] } : {}) };
  expect(tableReads().filter(request => request.endpoint === 'hwTime.levelRows')).toEqual([
    { endpoint: 'hwTime.levelRows', context, params },
  ]);
  expect(tableReads().filter(request => request.endpoint === 'hwTime.tableRows')).toEqual([
    { endpoint: 'hwTime.tableRows', context, params: { ...params, page: 0, pageSize: 25, sorting: [] } },
  ]);
  expect(filter()).toEqual(['EQ-002']);
});
