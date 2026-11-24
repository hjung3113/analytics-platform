// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { PlatformPage } from '@ap/components';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { manifests } from '../../index';
import { useHwTimeFilter } from '../../shared/useHwTimeFilter';
import { HwTimeFilterContext } from '../../shared/HwTimeFilterContext';
import TablePage from './RawTablePanel';
const registry = createRegistry({  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: 'MARS', en: 'MARS' }, description: { ko: '분석', en: 'Analysis' }, homeMenuId: 'hw-time' }],
  groups: [{ id: groupId('hwTime'), label: { ko: 'HW Time', en: 'HW Time' }, icon: manifests[0].icon, space: spaceId('mars') }], menus: manifests });
const session = testSession(['analytics:view', 'platform:view']);
const row = { id: 'MEM-PHOTO-0103', equipmentId: 'MEM-PHOTO-0103', values: { LK1: 99, LK2: 2 }, total: 101,
  judgements: { LK1: { value: 99, lower: 1, upper: 2, status: 'under' as const }, LK2: { value: 2, lower: 1, upper: 2, status: 'over' as const } } };
const request = vi.fn(async (query: MenuQuery) => {
  const data = query.endpoint === 'hwTime.levelRows' ? { level: 0, series: ['LK1', 'LK2'].map(id => ({ id, name: id, color: 'chart-blue' })), rows: [row], totals: { values: row.values, total: 101 }, limits: { maxRows: 120 } }
    : { rows: [{ ...row, ...row.values }], total: 1 };
  return { outcome: 'ok' as const, data, assessments: [{ kind: 'collection' as const, state: 'clear' as const }, { kind: 'processing_delay' as const, state: 'clear' as const }, { kind: 'coverage' as const, state: 'clear' as const }], trust: null, correlationId: 'synthetic' };
});
const adapter = testAdapter({ session: () => session, menuQuery: request });
let restoreGeometry: (() => void) | undefined;
afterEach(() => { cleanup(); restoreGeometry?.(); vi.unstubAllGlobals(); });
function FilteredTable() {
  const filter = useHwTimeFilter();
  return <HwTimeFilterContext value={filter}><PlatformPage layout="fill"><TablePage params={{}} /></PlatformPage></HwTimeFilterContext>;
}
it('uses the checked type columns, recomputes the total, and displays the worst visible server judgement', async () => {
  restoreGeometry = stubCompactTableGeometry();
  vi.stubGlobal('localStorage', memoryStorage());
  window.history.replaceState(null, '', '/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&view=table&moduleType=LK&module=LK1');
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><FilteredTable /></PlatformProvider></I18nProvider>);
  const table = await screen.findByRole('table', { name: 'HW Time 동작시간 표' });
  await waitFor(() => expect(within(table).getByText('HTM 하한 미달')).toBeTruthy());
  expect(within(table).getByRole('columnheader', { name: /LK1/ })).toBeTruthy();
  expect(within(table).queryByRole('columnheader', { name: /LK2/ })).toBeNull();
  expect(within(table).getByRole('columnheader', { name: /판정/ })).toBeTruthy();
  expect(within(table).queryByText('HTM 상한 초과')).toBeNull();
  expect(within(table).queryByText('101.00')).toBeNull();
  expect(within(table).getAllByText('99.00')).toHaveLength(2);
  expect(within(within(table).getByRole('columnheader', { name: /판정/ })).queryByRole('button')).toBeNull();
  expect(request.mock.calls.filter(([query]) => query.endpoint === 'hwTime.tableRows')[0]?.[0].params).toMatchObject({ moduleType: 'LK' });
});
