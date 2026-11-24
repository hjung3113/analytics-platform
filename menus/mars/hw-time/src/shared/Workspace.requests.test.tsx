// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter } from '@ap/kernel/testing';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import { registry, session, settle } from '../pages/analysis/test-support';

const requests: MenuQuery[] = [];
const respond = (query: MenuQuery): ApiResponse<unknown> => {
  const { drillModule, drillMotion } = query.params as { drillModule?: string; drillMotion?: string };
  const ids = drillModule ? ['Chuck', 'Dechuck'] : ['PM1', 'PM2'];
  const values = drillMotion ? { Chuck: 99 } : { [ids[0]!]: 99, [ids[1]!]: 2 };
  const row = { id: drillModule ? 'MEM-PHOTO-0103.H1' : 'MEM-PHOTO-0103', equipmentId: 'MEM-PHOTO-0103', ...(drillModule ? { subItem: 'H1' } : {}), values,
    total: drillMotion ? 99 : 101,
    judgements: Object.fromEntries(Object.entries(values).map(([id, value]) => [id, { value, lower: 1, upper: 5, status: value === 99 ? 'over' : 'under' }])) };
  const block = { series: Object.keys(values).map(id => ({ id, name: id, color: 'chart-blue' })), rows: [row], totals: { values, total: row.total } };
  const level = drillMotion ? 2 : Number(!!drillModule);
  let data: unknown;
  switch (query.endpoint) {
    case 'hwTime.levelRows': data = { ...block, level, ...(drillMotion ? { detail: block, context: block } : {}), limits: { maxRows: 120 } }; break;
    case 'hwTime.trend': data = { rows: [], limits: { maxRows: 8 } }; break;
    case 'hwTime.matrix': data = { equipment: [], modules: [], motions: [], cells: [], limits: { maxRows: 96 } }; break;
    case 'hwTime.motionStats': data = { rows: [] }; break;
    case 'hwTime.runs': data = { points: [], daily: [], bounds: [], shown: 0, total: 0 }; break;
    default: data = { rows: [{ ...row, ...values }], total: 1 };
  }
  return { outcome: 'ok', data, assessments: [{ kind: 'collection', state: 'clear' }, { kind: 'processing_delay', state: 'clear' }, { kind: 'coverage', state: 'clear' }], trust: null, correlationId: 'view-regression' };
};
async function mount(_view: string, extra = '') {
  const { default: HwTimePage } = await import('../HwTimePage');
  const adapter = testAdapter({ session: () => session, menuQuery: async query => { requests.push(query); return respond(query); } });
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&pins=table${extra}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><HwTimePage params={{}} /></PlatformProvider></I18nProvider>);

  await settle();
}
beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('optional raw table in stepped HW Time', () => {
  it.each(['&moduleType=PM&drillMotion=Chuck', '&moduleType=PM&drillMotion=Chuck&drillModule=PM1'])('%s projects Module checks without another request', async search => {
    await mount('table', search);
    const table = await screen.findByRole('table', { name: 'HW Time 동작시간 표' });
    await waitFor(() => expect(within(table).getAllByText('101.00').length).toBeGreaterThan(0));
    const before = requests.length;
    fireEvent.click(within(screen.getByRole('tree', { name: '계층' })).getByRole('checkbox', { name: 'PM1' }));
    await settle();
    expect(requests).toHaveLength(before);
    expect(within(table).queryByRole('columnheader', { name: /PM1/ })).toBeNull();
    expect(within(table).queryByText('101.00')).toBeNull();
    expect(within(table).getAllByText('2.00')).toHaveLength(2);
    expect(within(table).getByText('HTM 하한 미달')).toBeTruthy();
  });

  it('a raw Module action first chooses its type when no Motion is selected', async () => {
    await mount('table', '&moduleType=PM');
    const table = await screen.findByRole('table', { name: 'HW Time 동작시간 표' });
    fireEvent.click(within(table).getByRole('button', { name: 'PM1 들어가기' }));
    await settle();
    const page = new URLSearchParams(window.location.search);
    expect(page.get('moduleType')).toBe('PM'); expect(page.has('drillModule')).toBe(false);
    expect(screen.queryByRole('button', { name: /잘못된/ })).toBeNull();
  });

  it.each(['&moduleType=TR&drillMotion=Pick&drillModule=PM1', '&moduleType=TR&drillMotion=Chuck&drillModule=TR1'])('%s blocks every read before recovery', async search => {
    await mount('table', search);
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: /초기화|복구|지우기/ }));
    await settle();
    expect(requests.length).toBeGreaterThan(0);
  });
});
