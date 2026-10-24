// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { LayoutDashboard } from 'lucide-react';
import { HW_TIME_CONTEXT, hwTime, type HwTimeLevelData, type HwTimeRow } from '../../endpoints';
import { manifests } from '../../index';
import TablePage from './TablePage';

// jsdom has no canvas: the Frame is replaced by a stub that exposes the series and the rows the drawer hands it.
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    return <section aria-label={String(props.title)} data-chart={props.chartId}>
      <p data-testid={`${props.chartId}-series`}>{props.series.map(s => `${s.id}:${s.points.map(([x, v]) => `${x}=${v}`).join(',')}`).join('|')}</p>
    </section>;
  }
  return { ...actual, AnalysisChartFrame };
});

const MODULES = ['PM1', 'PM2', 'PM3', 'PM4'];
const MOTIONS = ['Chuck', 'Dechuck', 'Pump', 'Vent', 'Transfer'];
const eq = (n: number) => `EQ-${String(n).padStart(3, '0')}`;
const sum = (values: Record<string, number | null>) => Object.values(values).includes(null) ? null : Object.values(values).reduce<number>((a, v) => a + (v ?? 0), 0);
const equipmentRows = (): HwTimeRow[] => Array.from({ length: 3 }, (_, i) => {
  const values = Object.fromEntries(MODULES.map(m => [m, m === 'PM3' && i === 0 ? null : 10 + i]));
  return { id: eq(i + 1), equipmentId: eq(i + 1), values, total: sum(values) };
});
const subRows = (motions: string[], nullAt: (n: number) => boolean, meg: boolean): HwTimeRow[] => [1, 2].flatMap(n => [
  ...['H1', 'H2'].map((item, j) => {
    const values = Object.fromEntries(motions.map(m => [m, nullAt(n * 2 + j) ? null : 1.5 + j]));
    return { id: `${eq(n)}.${item}`, equipmentId: eq(n), subItem: item as 'H1', values, total: sum(values) } satisfies HwTimeRow;
  }),
  ...(meg ? [{ id: `${eq(n)}.MEG`, equipmentId: eq(n), auxiliary: { kind: 'MEG' as const, label: 'MEG 4.0317' }, values: {}, total: null }] : []),
]);
const block = (ids: string[], rows: HwTimeRow[]) => ({ series: ids.map(id => ({ id, name: id, color: 'chart-blue' })), rows, totals: { values: {}, total: null } });
const levelData = (module?: string, motion?: string): HwTimeLevelData => {
  if (!module) return { ...block(MODULES, equipmentRows()), level: 0, limits: { maxRows: 120 } };
  if (!motion) return { ...block(MOTIONS, subRows(MOTIONS, n => module === 'PM3' && n === 2, true)), level: 1, limits: { maxRows: 120 } };
  const context = block(MOTIONS, subRows(MOTIONS, () => false, false));
  const rows = module === 'PM4' && motion === 'Vent' ? [] : subRows([motion], n => module === 'PM3' && n === 2, false);
  return { ...context, level: 2, context, detail: block([motion], rows), limits: { maxRows: 120 } };
};

const assessments = (['collection', 'processing_delay', 'coverage'] as const).map(kind => ({ kind, state: 'clear' as const }));
const ok = (data: unknown): ApiResponse<never> => ({ outcome: 'ok', data, assessments, trust: null, correlationId: 'fixture' }) as ApiResponse<never>;
const calls: MenuQuery[] = [];
const adapter = testAdapter({
  menuQuery: async (req: MenuQuery) => {
    calls.push(req);
    const p = req.params as Record<string, unknown>;
    if (req.endpoint === hwTime.levelRows.id) return ok(levelData(p.drillModule as string | undefined, p.drillMotion as string | undefined));
    if (req.endpoint === hwTime.tableRows.id) {
      const data = levelData(p.drillModule as string | undefined, p.drillMotion as string | undefined);
      const rows = (data.level === 2 ? data.detail!.rows : data.rows).map(row => ({ ...row, ...row.values }));
      return ok({ rows, total: rows.length });
    }
    if (req.endpoint === hwTime.trend.id) return ok({ limits: { maxRows: 8 }, rows: (p.rowIds as string[]).map(id => ({ id, points: [{ at: '2026-09-25', value: 4 }, { at: '2026-09-26', value: null }] })) });
    return ok([]);
  },
  session: () => session,
});

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('analytics') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 1 }] });

function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
async function renderPage(search = '') {
  window.history.replaceState(null, '', `/hw-time/table?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><TablePage params={{}} /><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
  await screen.findByRole('table', { name: 'HW Time 동작시간 표' }, { timeout: 8000 });
}
const searchParams = () => new URLSearchParams(window.location.search);
const headers = () => screen.getAllByRole('columnheader').map(h => h.textContent ?? '');
const tableCalls = () => calls.filter(c => c.endpoint === hwTime.tableRows.id).map(c => c.params as Record<string, unknown>);

let restoreGeometry: () => void;
beforeEach(() => { restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); calls.length = 0; vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('HW Time table manifest', () => {
  const menu = manifests.find(m => m.id === 'hw-time-table')!;
  it('declares the table menu with the steps menu\'s group, permission and Context', () => {
    const steps = manifests.find(m => m.id === 'hw-time-steps')!;
    expect(menu.label).toEqual({ ko: 'HW Time 표', en: 'HW Time table' });
    expect(menu.path).toBe('/hw-time/table');
    expect(menu.description).toEqual({ ko: 'EquipmentID·하위 항목별 동작시간을 표로 보고 행 상세를 엽니다.', en: 'Browse operation time per EquipmentID and sub-item in a table and open row details.' });
    expect(menu.group).toBe(steps.group);
    expect(menu.permission).toBe(steps.permission);
    expect(menu.context).toEqual(contextCapabilities(HW_TIME_CONTEXT));
    expect(menu.features).toEqual({ ...NO_FEATURES, export: true, board: true });
    expect(menu.drill?.levels.map(level => level.key)).toEqual(['drillModule', 'drillMotion']);
    expect(menu.pageKeys).toEqual(['drillModule', 'drillMotion', 'sort', 'page', 'focus']);
    expect(menu.contextResetKeys).toEqual(['drillModule', 'drillMotion', 'page', 'focus']);
  });
});

describe('HW Time table page', () => {
  it.each([
    ['', ['EquipmentID', ...MODULES.map(m => `${m} (초)`), '합계 (초)']],
    ['&drillModule=PM1', ['EquipmentID', '하위 항목', ...MOTIONS.map(m => `${m} (초)`), '합계 (초)']],
    ['&drillModule=PM1&drillMotion=Pump', ['EquipmentID', '하위 항목', 'Pump (초)', '합계 (초)']],
  ])('lists the columns the level dictates (%s)', async (search, expected) => {
    await renderPage(search);
    expect(headers().filter(h => expected.some(name => h.includes(name))).length).toBe(expected.length);
    for (const name of expected) expect(headers().some(h => h.includes(name))).toBe(true);
  });

  it('enters the next level only through a visible 들어가기 button and shows two decimals', async () => {
    await renderPage();
    expect(screen.getByRole('table').textContent).toContain('11.00');
    fireEvent.click(screen.getAllByRole('button', { name: 'PM2 들어가기' })[0]);
    expect(searchParams().get('drillModule')).toBe('PM2');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Chuck 들어가기' }, { timeout: 8000 }))[0]);
    expect(searchParams().get('drillMotion')).toBe('Chuck');
  });

  it('pages and sorts on the server at L3 and keeps unmeasured values apart from 0', async () => {
    await renderPage('&drillModule=PM3&drillMotion=Pump');
    await waitFor(() => expect(tableCalls().length).toBeGreaterThan(0));
    expect(tableCalls()[0]).toMatchObject({ drillModule: 'PM3', drillMotion: 'Pump', page: 0, pageSize: 25, sorting: [] });
    expect(screen.getAllByText('미측정').length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getAllByRole('columnheader').find(h => h.textContent?.includes('합계'))!).getByRole('button'));
    await waitFor(() => expect(tableCalls().some(p => JSON.stringify(p.sorting) === JSON.stringify([{ id: 'total', desc: true }]))).toBe(true));
    expect(searchParams().get('sort')).not.toBeNull();
  });

  it('sorts a series column on the server by its flat field at every level', async () => {
    await renderPage('&drillModule=PM1');
    await waitFor(() => expect(tableCalls().length).toBeGreaterThan(0));
    expect(tableCalls()[0]).toMatchObject({ drillModule: 'PM1', page: 0, pageSize: 25, sorting: [] });
    expect(tableCalls()[0]).not.toHaveProperty('drillMotion');
    fireEvent.click(within(screen.getAllByRole('columnheader').find(h => h.textContent?.includes('Pump'))!).getByRole('button'));
    await waitFor(() => expect(tableCalls().some(p => (p.sorting as { id: string }[])[0]?.id === 'Pump')).toBe(true));
  });

  it.each(['', '&drillModule=PM1', '&drillModule=PM1&drillMotion=Pump'])('offers export through the table at every level (%s)', async search => {
    await renderPage(search);
    expect(screen.getAllByRole('button', { name: /내보내기/ })).toHaveLength(1);
    expect(hwTime.exportRows.limits?.maxRows).toBe(120);
  });

  it('shows MEG rows by label without a drill or a row action', async () => {
    await renderPage('&drillModule=PM1');
    const megRow = (await screen.findAllByRole('row')).find(row => row.textContent?.includes('MEG'))!;
    expect(megRow.textContent).toContain('MEG 4.03 초');
    expect(within(megRow).queryByRole('button', { name: /들어가기|보기/ })).toBeNull();
  });

  it('opens the drawer with that row\'s stack and trend, and returns focus to the row action on close', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    const action = await screen.findByRole('button', { name: 'EQ-001 · H1 보기' });
    act(() => action.focus());
    fireEvent.click(action);
    expect(searchParams().get('focus')).toBe('EQ-001.H1');
    expect(await screen.findByRole('heading', { name: 'EQ-001 · H1' })).toBeTruthy();
    expect(screen.getByTestId('hw-time-table-drawer-stack-series').textContent).toBe('Pump:EQ-001 · H1=1.5');
    await waitFor(() => expect(screen.getByTestId('hw-time-table-drawer-trend-series').textContent).toContain('EQ-001.H1:2026-09-25=4'));
    fireEvent.click(screen.getByRole('button', { name: '상세 닫기' }));
    await waitFor(() => expect(searchParams().get('focus')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'EQ-001 · H1 보기' }));
  });

  it('draws a plain message for PM4 Vent and marks partial rows for PM3', async () => {
    window.history.replaceState(null, '', '/hw-time/table?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&drillModule=PM4&drillMotion=Vent');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><TablePage params={{}} /><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('PM4 Module에는 Vent 동작 기록이 없습니다', {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    cleanup();
    await renderPage('&drillModule=PM3&drillMotion=Pump');
    expect(await screen.findByText(/일부 미측정 1행/)).toBeTruthy();
  });
});
