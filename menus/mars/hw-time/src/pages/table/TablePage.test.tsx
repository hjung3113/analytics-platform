// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId, type ApiResponse, type MenuQuery } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { PlatformPage } from '@ap/components';
import { stubCompactTableGeometry } from '@ap/components/testing';
import { testAdapter, testSession } from '@ap/kernel/testing';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { LayoutDashboard } from 'lucide-react';
import { hwTime, type HwTimeLevelData, type HwTimeRow } from '../../endpoints';
import { manifests } from '../../index';
import TablePage from './RawTablePanel';
import { exportNumber } from './tableData';

// jsdom has no canvas: the Frame is replaced by a stub that exposes the series and the rows the drawer hands it.
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    return <section aria-label={String(props.title)} data-chart={props.chartId}>
      {props.description && <p>{props.description}</p>}
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
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } }, scopes: [{ id: 'MEM', label: 'MEM', grantedRooms: 1, totalRooms: 1 }] });

function DetailSlotHost() {
  const slot = useDetailPanelSlotHost();
  return <aside ref={slot.ref} aria-label="상세 패널" />;
}
async function renderPage(search = '', { linked = false } = {}) {
  window.history.replaceState(null, '', `/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><PlatformPage layout="fill"><TablePage params={{}} linked={linked} /></PlatformPage><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
  if (search.includes('focus=abc')) await screen.findByText(/열린 행.*abc/);
  else await screen.findByRole('table', { name: 'HW Time 동작시간 표' }, { timeout: 8000 });
}
const searchParams = () => new URLSearchParams(window.location.search);
const headers = () => screen.getAllByRole('columnheader').map(h => h.textContent ?? '');
const tableCalls = () => calls.filter(c => c.endpoint === hwTime.tableRows.id).map(c => c.params as Record<string, unknown>);

let restoreGeometry: () => void;
beforeEach(() => { restoreGeometry = stubCompactTableGeometry(); });
afterEach(() => { cleanup(); restoreGeometry(); calls.length = 0; vi.restoreAllMocks(); window.history.replaceState(null, '', '/'); });

describe('HW Time table page', () => {
  it.each([
    ['', ['EquipmentID', ...MODULES.map(m => `${m} (초)`), '합계 (초)']],
    ['&moduleType=PM&drillMotion=Pump&drillModule=PM1', ['EquipmentID', '하위 항목', 'Pump (초)', '합계 (초)']],
  ])('lists the columns the level dictates (%s)', async (search, expected) => {
    await renderPage(search);
    expect(headers().filter(h => expected.some(name => h.includes(name))).length).toBe(expected.length);
    for (const name of expected) expect(headers().some(h => h.includes(name))).toBe(true);
  });

  it('opens the Module type first when the raw-table Module action has no selected Motion', async () => {
    await renderPage();
    // The rows arrive after the headers; a slow runner reads the table before them.
    await waitFor(() => expect(screen.getByRole('table').textContent).toContain('11.00'), { timeout: 8000 });
    fireEvent.click(screen.getAllByRole('button', { name: 'PM2 들어가기' })[0]);
    expect(searchParams().get('moduleType')).toBe('PM');
    expect(searchParams().get('drillMotion')).toBeNull();
    expect(searchParams().get('drillModule')).toBeNull();
  });

  it('pages and sorts on the server at L3 and keeps unmeasured values apart from 0', async () => {
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM3');
    await waitFor(() => expect(tableCalls().length).toBeGreaterThan(0));
    expect(tableCalls()[0]).toMatchObject({ drillModule: 'PM3', drillMotion: 'Pump', page: 0, pageSize: 25, sorting: [] });
    expect(screen.getAllByText('미측정').length).toBeGreaterThan(0);
    fireEvent.click(within(screen.getAllByRole('columnheader').find(h => h.textContent?.includes('합계'))!).getByRole('button'));
    await waitFor(() => expect(tableCalls().some(p => JSON.stringify(p.sorting) === JSON.stringify([{ id: 'total', desc: true }]))).toBe(true));
    expect(searchParams().get('sort')).not.toBeNull();
  });

  it('sorts a series column on the server by its flat field', async () => {
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM1');
    await waitFor(() => expect(tableCalls().length).toBeGreaterThan(0));
    expect(tableCalls()[0]).toMatchObject({ drillModule: 'PM1', page: 0, pageSize: 25, sorting: [] });
    expect(tableCalls()[0]).toHaveProperty('drillMotion', 'Pump');
    fireEvent.click(within(screen.getAllByRole('columnheader').find(h => h.textContent?.includes('Pump'))!).getByRole('button'));
    await waitFor(() => expect(tableCalls().some(p => (p.sorting as { id: string }[])[0]?.id === 'Pump')).toBe(true));
  });

  it.each(['', '&moduleType=PM&drillMotion=Pump&drillModule=PM1'])('offers export through the table at every supported raw level (%s)', async search => {
    await renderPage(search);
    expect(screen.getAllByRole('button', { name: /내보내기/ })).toHaveLength(1);
    expect(hwTime.exportRows.limits?.maxRows).toBe(120);
  });

  it('sizes every column explicitly so 합계 fits at 1440 wide', async () => {
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM1');
    const width = (name: string) => parseFloat(screen.getAllByRole('columnheader').find(h => h.textContent?.includes(name))!.style.width);
    expect(width('EquipmentID')).toBe(112);
    expect(width('하위 항목')).toBe(88);
    expect(width('Pump')).toBe(100);
    expect(width('합계')).toBe(112);
    // 선택 40 + 7 value columns' worth of room: the row fits the 1440 main area (~1130) with the action column.
  });

  it('sizes L1 wider so a four-digit value stays on one line, and never breaks inside a number', async () => {
    await renderPage('');
    const width = (name: string) => parseFloat(screen.getAllByRole('columnheader').find(h => h.textContent?.includes(name))!.style.width);
    expect(width('EquipmentID')).toBe(128);
    expect(width('PM1')).toBe(124);
    expect(width('합계')).toBe(124);
    // 선택 40 + 128 + 5 * 124 + action 128 stays inside the ~1067px row area at 1440.
    const cells = await screen.findAllByText(/^\d{1,3}(,\d{3})*\.\d{2}$/);
    expect(cells.length).toBeGreaterThan(0);
    for (const cell of cells) expect([...cell.classList]).toEqual(expect.arrayContaining(['tabular', 'whitespace-nowrap']));
  });

  it('writes the value and total columns to the export with two decimals and 미측정 for a missing value', () => {
    // exportNumber is the exportValue of both column kinds.
    expect(exportNumber(4.5958000000000006, 'ko')).toBe(4.6);
    expect(exportNumber(314.26869999999997, 'ko')).toBe(314.27);
    expect(exportNumber(null, 'ko')).toBe('미측정');
    expect(exportNumber(undefined, 'en')).toBe('Not measured');
  });

  it('counts the selected Module and Motion sub-item rows', async () => {
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM1');
    expect(await screen.findByText(/Motion Pump · 4행/)).toBeTruthy();
  });

  it('lists each series of the row under the drawer bar with its value and unit, and 미측정 for a missing one', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'EQ-001 보기' }));
    const legend = await screen.findByRole('list', { name: '구성 범례' });
    const items = within(legend).getAllByRole('listitem').map(item => item.textContent);
    expect(items).toEqual(['PM110.00 초', 'PM210.00 초', 'PM3미측정', 'PM410.00 초']);
    expect(legend.querySelectorAll('[data-legend-swatch]')).toHaveLength(4);
  });

  it.each([
    ['', '설비 전체 일 합계'],
    ['&moduleType=PM&drillMotion=Pump&drillModule=PM1', '하위 항목 전체 일 합계 · Module·Motion과 무관'],
  ])('names the drawer trend as the daily total, not the row value (%s)', async (search, caption) => {
    await renderPage(search);
    fireEvent.click(await screen.findByRole('button', { name: search ? 'EQ-001 · H1 보기' : 'EQ-001 보기' }));
    expect(await screen.findByRole('region', { name: '일 추세' })).toBeTruthy();
    expect(screen.getByRole('region', { name: '일 추세' }).textContent).toContain(caption);
  });

  it('opens the drawer with that row\'s stack and trend, and returns focus to the row action on close', async () => {
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM1');
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

  it('keeps the equipment-total trend caption in the linked root table after a Module and Motion are chosen', async () => {
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM1', { linked: true });
    fireEvent.click(await screen.findByRole('button', { name: 'EQ-001 보기' }));
    expect(await screen.findByText('설비 전체 일 합계')).toBeTruthy();
    expect(screen.queryByText(/하위 항목 전체 일 합계/)).toBeNull();
  });

  it('shows the equipment trend in the L1 drawer', async () => {
    await renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'EQ-001 보기' }));
    expect(await screen.findByRole('heading', { name: 'EQ-001' })).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('hw-time-table-drawer-trend-series').textContent).toContain('EQ-001:2026-09-25=4'));
    expect(calls.some(c => c.endpoint === hwTime.trend.id && JSON.stringify((c.params as { rowIds: string[] }).rowIds) === '["EQ-001"]')).toBe(true);
  });

  it('says so and retries inside the drawer and above the table when the level read fails but the table loads', async () => {
    const original = adapter.menuQuery.bind(adapter);
    let failLevel = true;
    vi.spyOn(adapter, 'menuQuery').mockImplementation(async req => failLevel && req.endpoint === hwTime.levelRows.id
      ? ({ outcome: 'error', message: 'level read failed', assessments, trust: null, correlationId: 'level-fail' }) as ApiResponse<never>
      : original(req));
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM1');
    fireEvent.click(await screen.findByRole('button', { name: 'EQ-001 · H1 보기' }));
    const drawer = await screen.findByRole('heading', { name: 'EQ-001 · H1' });
    expect(searchParams().get('focus')).toBe('EQ-001.H1');
    const retries = await screen.findAllByRole('button', { name: '다시 시도' });
    expect(retries).toHaveLength(2);
    expect(screen.getAllByRole('alert').length).toBe(2);
    expect(drawer).toBeTruthy();
    failLevel = false;
    fireEvent.click(retries[retries.length - 1]);
    await waitFor(() => expect(screen.getByTestId('hw-time-table-drawer-stack-series').textContent).toBe('Pump:EQ-001 · H1=1.5'), { timeout: 8000 });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each(['error', 'empty'] as const)('shows one banner and compact states when the level read and the table get the same %s (#1175)', async outcome => {
    const same = () => ({ outcome, message: 'same response', data: outcome === 'empty' ? { rows: [], total: 0 } : null, assessments, trust: null, correlationId: 'same' }) as ApiResponse<never>;
    vi.spyOn(adapter, 'menuQuery').mockImplementation(async req => req.endpoint === hwTime.levelRows.id || req.endpoint === hwTime.tableRows.id ? same() : ok([]));
    window.history.replaceState(null, '', '/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><PlatformPage layout="fill"><TablePage params={{}} /></PlatformPage><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
    if (outcome === 'error') {
      // The level-failure box joins the page group; an empty level read is not drawn at all (levelFailure excludes it), so only error groups two widgets.
      const banner = await screen.findByRole('group', { name: '위젯 상태 요약' }, { timeout: 8000 });
      expect(banner.textContent).toContain('위젯 2개가 같은 이유로 열리지 않았습니다');
      expect(screen.getAllByRole('group', { name: '위젯 상태 요약' })).toHaveLength(1);
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole('group', { name: 'HW Time 동작시간 표' }).hasAttribute('data-widget-state')).toBe(true);
    } else {
      await screen.findByText(/결과가 0건입니다/, undefined, { timeout: 8000 });
      expect(screen.queryByRole('group', { name: '위젯 상태 요약' })).toBeNull();
    }
  });

  it('requests the second page with its page and pageSize and keeps it in the URL', async () => {
    const original = adapter.menuQuery.bind(adapter);
    vi.spyOn(adapter, 'menuQuery').mockImplementation(async req => {
      const response = await original(req);
      return req.endpoint === hwTime.tableRows.id && response.outcome === 'ok'
        ? ok({ rows: (response.data as { rows: unknown[] }).rows, total: 60 }) : response;
    });
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM1');
    await waitFor(() => expect(screen.getByRole('button', { name: '다음' }).hasAttribute('aria-disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(tableCalls().some(p => p.page === 1)).toBe(true));
    expect(tableCalls().find(p => p.page === 1)).toMatchObject({ drillModule: 'PM1', drillMotion: 'Pump', page: 1, pageSize: 25 });
    expect(searchParams().get('page')).toBe('2');
  });

  describe('export wiring', () => {
    const exportCalls = () => calls.filter(c => c.endpoint === hwTime.exportRows.id).map(c => c.params as Record<string, unknown>);
    const originalCreate = URL.createObjectURL;
    const originalRevoke = URL.revokeObjectURL;
    beforeEach(() => {
      URL.createObjectURL = () => 'blob:test';
      URL.revokeObjectURL = () => {};
      vi.spyOn(HTMLElement.prototype, 'click').mockImplementation(() => {});
    });
    // jsdom has neither function, and the table revokes its blob URL on a 1 s timer that can fire after this test: keep the no-op stubs where there is no original.
    afterEach(() => { if (originalCreate) URL.createObjectURL = originalCreate; if (originalRevoke) URL.revokeObjectURL = originalRevoke; });
    async function exportVia(name: string | RegExp) {
      fireEvent.keyDown(screen.getByRole('button', { name: /^내보내기/ }), { key: 'Enter' });
      fireEvent.click(await screen.findByRole('menuitem', { name }));
    }

    it('sends the selected ids with the drill keys and the active sorting', async () => {
      await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM1');
      fireEvent.click(within(screen.getAllByRole('columnheader').find(h => h.textContent?.includes('합계'))!).getByRole('button'));
      await waitFor(() => expect(tableCalls().some(p => (p.sorting as unknown[]).length === 1)).toBe(true));
      fireEvent.click(await screen.findByRole('checkbox', { name: '선택 EQ-001.H1' }));
      fireEvent.click(screen.getByRole('checkbox', { name: '선택 EQ-002.H2' }));
      await exportVia(/^선택 2행을 CSV로 내보내기$/);
      await waitFor(() => expect(exportCalls()).toHaveLength(1));
      expect(exportCalls()[0]).toEqual({ drillModule: 'PM1', drillMotion: 'Pump', ids: ['EQ-001.H1', 'EQ-002.H2'], sorting: [{ id: 'total', desc: true }] });
    });

    it.each([
      ['', {}],
      ['&moduleType=PM&drillMotion=Pump&drillModule=PM1', { drillModule: 'PM1', drillMotion: 'Pump' }],
    ])('sends no ids for the filtered scope and the level\'s drill keys (%s)', async (search, drill) => {
      await renderPage(search);
      await exportVia(/^필터 결과 전체 \d+행을 CSV로 내보내기$/);
      await waitFor(() => expect(exportCalls()).toHaveLength(1));
      expect(exportCalls()[0]).toEqual({ ...drill, ids: null, sorting: [] });
    });
  });

  it('draws a plain message for PM4 Vent and marks partial rows for PM3', async () => {
    window.history.replaceState(null, '', '/mars/hw-time?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00&moduleType=PM&drillMotion=Vent&drillModule=PM4');
    render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><DetailPanelSlotProvider><PlatformPage layout="fill"><TablePage params={{}} /></PlatformPage><DetailSlotHost /></DetailPanelSlotProvider></PlatformProvider></I18nProvider>);
    expect(await screen.findByText('PM4 Module에는 Vent 동작 기록이 없습니다', {}, { timeout: 8000 })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    cleanup();
    await renderPage('&moduleType=PM&drillMotion=Pump&drillModule=PM3');
    expect(await screen.findByText(/일부 미측정 1행/)).toBeTruthy();
  });
});


it('MEN-48 warns about malformed focus and can clear it', async () => {
  await renderPage('&focus=abc');
  expect(screen.getByText(/열린 행.*abc/)).toBeTruthy();
});
it('MEN-48 explains an unavailable focus and clears focus on drill', async () => {
  await renderPage('&focus=EQ-001.H1');
  expect(await screen.findByText('이 단계에 없는 행입니다.')).toBeTruthy();
  fireEvent.click(screen.getAllByRole('button', { name: 'PM2 들어가기' })[0]!);
  expect(searchParams().get('focus')).toBeNull();
});
