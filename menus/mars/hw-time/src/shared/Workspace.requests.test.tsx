// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter } from '@ap/kernel/testing';
import type { ApiResponse, MenuQuery } from '@ap/contracts';
import HwTimePage from '../HwTimePage';
import { registry, session, settle } from '../pages/analysis/test-support';

const requests: MenuQuery[] = [];
const respond = (query: MenuQuery): ApiResponse<unknown> => {
  const { drillModule, drillMotion } = query.params as { drillModule?: string; drillMotion?: string };
  const ids = drillModule ? ['Chuck', 'Dechuck'] : ['PM1', 'PM2'];
  const values = drillMotion ? { Chuck: 99 } : { [ids[0]!]: 99, [ids[1]!]: 2 };
  const row = { id: drillModule ? 'EQ-001.H1' : 'EQ-001', equipmentId: 'EQ-001', ...(drillModule ? { subItem: 'H1' } : {}), values,
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
  const adapter = testAdapter({ session: () => session, menuQuery: async query => { requests.push(query); return respond(query); } });
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${extra}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><HwTimePage params={{}} /></PlatformProvider></I18nProvider>);

  await settle();
}
function openPanel() { /* Filters are an always-present workspace panel. */ }
beforeEach(() => { requests.length = 0; vi.stubGlobal('localStorage', memoryStorage()); vi.stubGlobal('sessionStorage', memoryStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState(null, '', '/'); });

describe('table check projection with the real table and query hooks (C1)', () => {
  it.each([
    ['', 'Module', 'PM1', '101.00'],
    ['&drillModule=PM1', 'Module', 'PM1', '101.00'],
    ['&drillModule=PM1&drillMotion=Chuck', 'Module', 'PM1', '101.00'],
  ])('%s changes visible columns, totals and server judgements without a request', async (search, list, id, total) => {
    await mount('table', search);
    const table = await screen.findByRole('table', { name: 'HW Time 동작시간 표' });
    await waitFor(() => expect(within(table).getAllByText(total).length).toBeGreaterThan(0));
    expect(within(table).getByText('HTM 상한 초과')).toBeTruthy();
    openPanel();
    const before = requests.length;
    fireEvent.click(within(screen.getByRole('tree', { name: list })).getByRole('checkbox', { name: new RegExp(id) }));
    await settle();
    expect(requests).toHaveLength(before);
    expect(within(table).queryByRole('columnheader', { name: new RegExp(id) })).toBeNull();
    expect(within(table).queryByText(total)).toBeNull();
    expect(within(table).queryByText('HTM 상한 초과')).toBeNull();
    if (true) {
      expect(within(table).getAllByText('2.00')).toHaveLength(2);
      expect(within(table).getByText('HTM 하한 미달')).toBeTruthy();
    }
  });
});

describe('linked panels keep mounted empty projection behavior (C3)', () => {
  it.each(['table'] as const)('%s keeps query owners when every Module is cleared and one is restored', async view => {
    await mount(view);
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    openPanel();
    const body = screen.getByRole('table', { name: 'HW Time 동작시간 표' });
    const tree = screen.getByRole('tree', { name: 'Module' });
    const before = requests.length;
    for (const check of within(tree).getAllByRole('checkbox')) fireEvent.click(check);
    expect(await screen.findByText('선택한 항목 없음')).toBeTruthy();
    fireEvent.click(within(tree).getByRole('checkbox', { name: /PM1/ }));
    await settle();
    expect(requests).toHaveLength(before);
    expect(body.isConnected).toBe(true);
    expect(screen.queryByText('선택한 항목 없음')).toBeNull();
  });
});

describe('catalog-aware drill gates (C4)', () => {
  it.each((['table'] as const).flatMap(view => [
    { view, search: '&moduleType=TR&drillModule=PM1', bad: 'drillModule', kept: null },
    { view, search: '&moduleType=TR&drillModule=TR1&drillMotion=Chuck', bad: 'drillMotion', kept: 'TR1' },
  ]))('$view $search retains invalid URL values and sends zero automatic reads until exact recovery', async ({ view, search, bad, kept }) => {
    await mount(view, `${search}&trend=EQ-001.H1`);
    expect(requests).toHaveLength(0);
    const before = new URLSearchParams(window.location.search);
    expect(before.get(bad)).not.toBeNull();
    const recover = screen.getByRole('button', { name: /초기화|복구|지우기/ });
    fireEvent.click(recover);
    await settle();
    const after = new URLSearchParams(window.location.search);
    expect(after.has(bad)).toBe(false);
    expect(after.get('moduleType')).toBe('TR');
    expect(after.get('trend')).toBe('EQ-001.H1');
    if (kept) expect(after.get('drillModule')).toBe(kept);
  });
});
