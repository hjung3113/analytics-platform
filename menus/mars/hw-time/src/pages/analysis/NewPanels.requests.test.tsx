// @vitest-environment jsdom
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { renderOverview, requests, settle, answer } from './test-support';

beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });
const base = '&moduleType=PM&drillMotion=Pump&drillModule=PM1';
const respond: typeof answer = request => {
  const response = answer(request);
  if (request.endpoint === 'hwTime.equipmentDays') return { ...response, data: { rows: [{ equipmentId: 'MEM-PHOTO-0103', date: '2026-09-20', judgement: { value: 4, lower: 2, upper: 3, status: 'over' } }] } };
  if (request.endpoint === 'hwTime.boundHistory') return { ...response, data: [] };
  return response;
};
describe('new panel request boundaries', () => {
  it.each(['verdict=bad', 'verdict=OVER', 'date=2026-02-30', 'date=2026-09-18', 'date=2026-09-27'])('rejects %s before any read', async key => {
    await renderOverview(`${base}&${key}&pins=scatter`, respond, { waitForData: false });
    expect(requests).toHaveLength(0);
    expect(screen.getByRole('button', { name: /초기화|복구|지우기/ })).toBeTruthy();
  });
  it('donut and Pareto reuse matrices and hide unavailable creation actions', async () => {
    await renderOverview(`${base}&pins=donut&pins=pareto`, respond);
    expect(screen.getByTestId('hw-verdict-donut')).toBeTruthy();
    const pareto = JSON.parse(screen.getByTestId('hw-pareto').textContent!);
    expect(pareto.kind).toBe('pareto');
    expect(pareto.maxItems).toBe(pareto.items.length);
    expect(screen.queryByRole('button', { name: 'Finding/VOC 만들기' })).toBeNull();
    expect(screen.queryByText('HW Time 분석 지점에서 Finding/VOC를 만드는 목적지·입력 계약 없음')).toBeNull();
    expect(requests.map(request => request.endpoint).sort()).toEqual(['hwTime.matrix', 'hwTime.runs']);
  });
  it('queries history only when added', async () => {
    await renderOverview(`${base}&pins=boundHistory`, respond);
    expect(requests.filter(request => request.endpoint === 'hwTime.boundHistory')).toHaveLength(1);
    expect(requests.some(request => request.endpoint === 'hwTime.equipmentDays')).toBe(false);
  });
  it('only scatter receives verdict and date query inputs', async () => {
    await renderOverview(`${base}&pins=scatter&verdict=over&date=2026-09-20`, respond);
    const runs = requests.filter(request => request.endpoint === 'hwTime.runs');
    expect(runs).toHaveLength(2);
    expect(runs.map(request => request.params)).toEqual(expect.arrayContaining([
      { moduleType: 'PM', drillModule: 'PM1', drillMotion: 'Pump' },
      { moduleType: 'PM', drillModule: 'PM1', drillMotion: 'Pump', verdict: 'over', date: '2026-09-20' },
    ]));
  });
  it('drill changes keep both outputs and refetch only panels querying that drill', async () => {
    await renderOverview(`${base}&pins=equipmentDays&pins=boundHistory&verdict=over&date=2026-09-20`, respond);
    const before = requests.length;
    fireEvent.click(within(screen.getByRole('tree', { name: '계층' })).getByText('Vent', { exact: true })); await settle();
    const page = new URLSearchParams(window.location.search);
    expect(page.get('verdict')).toBe('over');
    expect(page.get('date')).toBe('2026-09-20');
    expect(page.get('scopeId')).toBe('MEM');
    expect(page.get('from')).toBe('2026-09-19T09:00:00');
    expect(requests.slice(before).map(request => request.endpoint).sort()).toEqual(['hwTime.boundHistory', 'hwTime.equipmentDays']);
  });
});
