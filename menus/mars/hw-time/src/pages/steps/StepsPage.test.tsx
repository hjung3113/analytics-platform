// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId, type ApiResponse } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { LayoutDashboard } from 'lucide-react';
import type { HwTimeBlock, HwTimeDrill, HwTimeLevelData, HwTimeRow, HwTimeSeries, HwTimeTrendData } from '../../endpoints';
import { manifests } from '../../index';

const data = vi.hoisted(() => ({ level: vi.fn(), trend: vi.fn() }));
vi.mock('../../shared/data', () => ({ useHwTimeLevel: data.level, useHwTimeTrend: data.trend }));

// jsdom has no canvas: the Frame is replaced by a stub that exposes what the page hands it (series, categories, point callbacks).
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    const categories = [...new Set(props.series.flatMap(s => s.points.map(([x]) => x)))];
    const selectable = props.series.flatMap(s => s.points.map(([x, value]) => ({ x, seriesId: s.id, value }))).filter(point => props.isPointSelectable?.(point) ?? true);
    const actionsFor = (point: import('@ap/components').ChartPoint) => (typeof props.pointActions === 'function' ? props.pointActions(point) : props.pointActions ?? []);
    return <section aria-label={String(props.title)} data-chart={props.chartId}>
      {props.description && <p>{props.description}</p>}
      <p data-testid={`${props.chartId}-categories`}>{categories.length}</p>
      <p data-testid={`${props.chartId}-pitch`}>{props.rowPitch}</p>
      <p data-testid={`${props.chartId}-series`}>{JSON.stringify(props.series.map(s => ({ id: s.id, meg: s.points.filter(([x]) => x.includes('MEG')) })))}</p>
      <p data-testid={`${props.chartId}-visible`}>{(props.visibleSeriesIds ?? []).join(',')}</p>
      {props.series.flatMap(s => s.points.filter(([, v]) => v !== null).slice(0, 3).map(([x, v]) =>
        <button key={`${s.id}-${x}`} type="button" onClick={() => props.pointActivation?.onActivate({ x, seriesId: s.id, value: v })}>{`segment ${s.id} ${x}`}</button>))}
      <p data-testid={`${props.chartId}-legend`}>{String(props.legend !== false)}</p>
      <p data-testid={`${props.chartId}-labels`}>{`valueLabels=${String(props.valueLabels)} reaggregation=${String(props.reaggregation)}`}</p>
      <p data-testid={`${props.chartId}-options`}>{`align=${String(props.startAlign)} minmax=${String(props.minMax)}`}</p>
      {/* The Frame's selector: points the page marks non-selectable are skipped, so they are neither listed nor reachable. */}
      <p data-testid={`${props.chartId}-selector`}>{selectable.map(p => p.x).join('|')}</p>
      {/* The menu list is evaluated for the selected point, as the Frame does. */}
      {selectable.filter(p => !p.x.includes('MEG')).map(p => p.x).filter((x, i, all) => all.indexOf(x) === i).slice(0, 3).flatMap(x =>
        actionsFor({ x, seriesId: props.series[0]?.id ?? '', value: null }).map(action =>
          <button key={`${action.id}-${x}`} type="button" onClick={() => action.onSelect({ x, seriesId: props.series[0]?.id ?? '', value: null })}>{`${action.label} ${x}`}</button>))}
    </section>;
  }
  return { ...actual, AnalysisChartFrame };
});

const MODULES = ['PM1', 'PM2', 'PM3', 'PM4'];
const MOTIONS = ['Chuck', 'Dechuck', 'Pump', 'Vent', 'Transfer'];
const series = (ids: string[]): HwTimeSeries[] => ids.map(id => ({ id, name: id, color: 'chart-blue' }));
const eq = (n: number) => `EQ-${String(n).padStart(3, '0')}`;
const block = (seriesIds: string[], rows: HwTimeRow[]): HwTimeBlock => {
  const sum = (ids: (number | null)[]) => ids.some(v => v === null) ? null : ids.reduce<number>((a, v) => a + (v ?? 0), 0);
  const values = Object.fromEntries(seriesIds.map(id => [id, sum(rows.filter(r => !r.auxiliary).map(r => r.values[id] ?? null))]));
  return { series: series(seriesIds), rows, totals: { values, total: sum(Object.values(values)) } };
};
const level1 = (): HwTimeLevelData => ({
  ...block(MODULES, Array.from({ length: 24 }, (_, i) => {
    const values = Object.fromEntries(MODULES.map(m => [m, m === 'PM3' && i % 5 === 0 ? null : 10 + i]));
    return { id: eq(i + 1), equipmentId: eq(i + 1), values, total: Object.values(values).includes(null) ? null : 40 + 4 * i };
  })),
  level: 0, limits: { maxRows: 120 },
});
const subRows = (motionIds: string[], nullAt: (n: number) => boolean, meg: boolean): HwTimeRow[] => Array.from({ length: 24 }, (_, i) => [
  ...['H1', 'H2', 'H3', 'H4'].map((item, j) => {
    const values = Object.fromEntries(motionIds.map(m => [m, nullAt(i * 4 + j) ? null : 1.5 + j]));
    return { id: `${eq(i + 1)}.${item}`, equipmentId: eq(i + 1), subItem: item as 'H1', values, total: Object.values(values).includes(null) ? null : 1.5 * motionIds.length } satisfies HwTimeRow;
  }),
  ...(meg ? [{ id: `${eq(i + 1)}.MEG`, equipmentId: eq(i + 1), auxiliary: { kind: 'MEG' as const, label: 'MEG 4.0317' }, values: Object.fromEntries(motionIds.map(m => [m, 9])), total: 9 }] : []),
]).flat();
const level2 = (module: string): HwTimeLevelData => ({ ...block(MOTIONS, subRows(MOTIONS, n => module === 'PM3' && n % 7 === 0, true)), level: 1, limits: { maxRows: 120 } });
const level3 = (module: string, motion: string): HwTimeLevelData => {
  const context = block(MOTIONS, subRows(MOTIONS, () => false, false));
  const detail = module === 'PM4' && motion === 'Vent' ? block([motion], []) : block([motion], subRows([motion], n => module === 'PM3' && n % 11 === 0, false));
  return { ...context, level: 2, context, detail, limits: { maxRows: 120 } };
};
const fixtureFor = (drill: HwTimeDrill) => !drill.drillModule ? level1() : !drill.drillMotion ? level2(drill.drillModule) : level3(drill.drillModule, drill.drillMotion);

const done = <T,>(payload: T) => ({
  status: 'done' as const, missing: [], completedAt: 1, refetch: () => undefined,
  response: { outcome: 'ok', data: payload, assessments: [], trust: null, correlationId: 'fixture' } as ApiResponse<T>,
});
const trendData = (ids: string[]): HwTimeTrendData => ({
  limits: { maxRows: 8 },
  rows: ids.map(id => ({ id, points: Array.from({ length: 8 }, (_, i) => ({ at: `2026-09-${18 + i}`, value: 1 + i })) })),
});

const registry = createRegistry({
  permissions: [menuPermission('analytics:view')],
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('mars') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } } });
const adapter = testAdapter({ session: () => session });

async function renderPage(search = '') {
  const { default: StepsPage } = await import('./StepsPage');
  window.history.replaceState(null, '', `/hw-time/steps?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><StepsPage params={{}} /></PlatformProvider></I18nProvider>);
  await screen.findByRole('group', { name: '분석 보조' });
}
const searchParams = () => new URLSearchParams(window.location.search);
const distinctParams = () => new Set(data.level.mock.calls.map(call => JSON.stringify(call[0])));

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  data.level.mockImplementation((drill: HwTimeDrill) => done(fixtureFor(drill)));
  data.trend.mockImplementation((ids: string[]) => done(trendData(ids)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });

describe('HW Time steps page', () => {
  it('L1 draws one row per EquipmentID and a Module segment activation sets drillModule', async () => {
    await renderPage();
    expect(screen.getByTestId('hw-time-steps-L1-categories').textContent).toBe('24');
    expect(screen.queryByRole('navigation', { name: '드릴 경로' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'segment PM1 EQ-001' }));
    expect(searchParams().get('drillModule')).toBe('PM1');
    expect(data.level).toHaveBeenLastCalledWith({ drillModule: 'PM1' }, true);
    expect((await screen.findByTestId('hw-time-steps-L2-categories')).textContent).toBe('120');
  });

  it('L2 Motion activation reaches L3 and pins the Module·Motion summary above the hero', async () => {
    await renderPage('&drillModule=PM1');
    expect(screen.getByTitle(/^Module PM1 · [\d,]+\.\d{2} 초$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^segment Dechuck EQ-001 · H1$/ }));
    expect(searchParams().get('drillMotion')).toBe('Dechuck');
    const summary = await screen.findByTitle(/^Module PM1 · Motion Dechuck · [\d,]+\.\d{2} 초$/);
    expect(summary).toBeTruthy();
    expect(screen.getByTestId('hw-time-steps-L3-categories').textContent).toBe('96');
  });

  it('L2 auxiliary MEG rows keep a 2-decimal label with the unit, carry no values, and never reach the callbacks', async () => {
    await renderPage('&drillModule=PM1');
    expect(screen.queryByRole('button', { name: /segment \w+ EQ-001 MEG/ })).toBeNull();
    expect(screen.getByTestId('hw-time-steps-L2-categories').textContent).toBe('120');
    const series = JSON.parse(screen.getByTestId('hw-time-steps-L2-series').textContent!) as { id: string; meg: [string, number | null][] }[];
    expect(series.map(s => s.id)).toEqual(MOTIONS);
    for (const item of series) {
      expect(item.meg).toHaveLength(24);
      expect(item.meg[0]).toEqual(['EQ-001 MEG 4.03초', null]);
      expect(item.meg.every(([, value]) => value === null)).toBe(true);
    }
    // The Frame skips them in its selector (isPointSelectable), so no pick or action can name one.
    expect(screen.getByTestId('hw-time-steps-L2-selector').textContent).not.toContain('MEG');
    expect(screen.queryByRole('button', { name: /MEG/ })).toBeNull();
    expect(searchParams().get('drillMotion')).toBeNull();
    expect(searchParams().get('trend')).toBeNull();
  });

  it('hands the Frame no legend of its own (the Inspector owns it) and one applicable action per row', async () => {
    await renderPage('&drillModule=PM1&trend=EQ-001.H1');
    expect(screen.getByTestId('hw-time-steps-L2-legend').textContent).toBe('false');
    expect(screen.getByRole('button', { name: '추세에서 제거 EQ-001 · H1' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '추세에 추가 EQ-001 · H1' })).toBeNull();
    expect(screen.getByRole('button', { name: '추세에 추가 EQ-001 · H2' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: '추세에서 제거 EQ-001 · H2' })).toBeNull();
  });

  it('rows read EQ-001 · H1 and every stack panel uses a 26 px row pitch', async () => {
    await renderPage('&drillModule=PM1');
    expect(screen.getByRole('button', { name: 'segment Chuck EQ-001 · H1' })).toBeTruthy();
    expect(screen.getByTestId('hw-time-steps-L2-pitch').textContent).toBe('26');
    cleanup();
    await renderPage();
    expect(screen.getByTestId('hw-time-steps-L1-pitch').textContent).toBe('26');
  });

  it('PM4 Vent detail says there is nothing recorded, in plain Korean', async () => {
    await renderPage('&drillModule=PM4&drillMotion=Vent');
    expect(screen.getByText('PM4 Module에는 Vent 동작 기록이 없습니다')).toBeTruthy();
    expect(screen.queryByRole('region', { name: /상세/ })).toBeNull();
  });

  it('PM3 missing values read 미측정 in page text, never 0', async () => {
    await renderPage('&drillModule=PM3');
    expect(screen.getByText(/미측정 값이 있는 행 \d+개/)).toBeTruthy();
    expect(screen.getByTitle(/^Module PM3 · [\d,]+\.\d{2} 초 · 일부 미측정$/)).toBeTruthy();
    cleanup();
    data.level.mockImplementation((drill: HwTimeDrill) => {
      const full = fixtureFor(drill) as HwTimeLevelData;
      return done({ ...full, rows: full.rows.map(row => ({ ...row, values: Object.fromEntries(Object.keys(row.values).map(id => [id, null])) })) });
    });
    await renderPage('&drillModule=PM3');
    expect(screen.getByTitle('Module PM3 · 미측정')).toBeTruthy();
  });

  it('an empty result reads 기록 없음 and big totals use thousand separators', async () => {
    await renderPage('&drillModule=PM4&drillMotion=Vent');
    expect(screen.getByTitle('Module PM4 · Motion Vent · 기록 없음')).toBeTruthy();
    cleanup();
    data.level.mockImplementation(() => done({ ...level2('PM1'), rows: [{ id: 'EQ-001.H1', equipmentId: 'EQ-001', subItem: 'H1', values: { Chuck: 24988.505, Dechuck: null }, total: null }] }));
    await renderPage('&drillModule=PM1');
    expect(screen.getByTitle('Module PM1 · 24,988.51 초 · 일부 미측정')).toBeTruthy();
  });

  it('Inspector legend and options sections carry a summary when collapsed', async () => {
    await renderPage('&drillModule=PM1');
    const legend = screen.getByRole('button', { name: '계층 범례' });
    const options = screen.getByRole('button', { name: '옵션' });
    fireEvent.click(screen.getByRole('checkbox', { name: /Pump/ }));
    fireEvent.click(legend);
    fireEvent.click(options);
    expect(within(legend).getByText('5개 중 4개 표시')).toBeTruthy();
    expect(within(options).getByText('정렬: 기본')).toBeTruthy();
    fireEvent.click(options);
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: '큰 순' })); });
    fireEvent.click(options);
    expect(within(options).getByText('정렬: 큰 순')).toBeTruthy();
  });

  it('the align and minmax page keys toggle the Frame options at every level and the Options summary says so', async () => {
    await renderPage('&drillModule=PM1');
    const options = screen.getByRole('button', { name: '옵션' });
    expect(screen.getByTestId('hw-time-steps-L2-options').textContent).toBe('align=false minmax=false');
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: '시작 위치 맞춤' })); });
    expect(searchParams().get('align')).toBe('1');
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: '최소·최대 표시' })); });
    expect(searchParams().get('minmax')).toBe('1');
    expect(screen.getByTestId('hw-time-steps-L2-options').textContent).toBe('align=true minmax=true');
    fireEvent.click(options);
    expect(within(options).getByText('정렬: 기본 · 시작 위치 맞춤 · 최소·최대')).toBeTruthy();
    // Drilling to L3 keeps both on: they are page keys, not reset keys.
    fireEvent.click(screen.getByRole('button', { name: /^segment Dechuck EQ-001 · H1$/ }));
    expect((await screen.findByTestId('hw-time-steps-L3-options')).textContent).toBe('align=true minmax=true');
    fireEvent.click(options);
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: '시작 위치 맞춤' })); });
    expect(searchParams().get('align')).toBeNull();
  });

  it('drilling by segment moves focus to the current step chip (Kernel drill request)', async () => {
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'segment PM1 EQ-001' }));
    await screen.findByTestId('hw-time-steps-L2-categories');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Module: PM1' }));
  });

  it('Inspector target summary is taken from the response', async () => {
    await renderPage();
    const target = screen.getByRole('button', { name: '분석 대상' });
    fireEvent.click(target);
    expect(target.getAttribute('aria-expanded')).toBe('false');
    expect(within(target).getByText('선택 24 · 평가 24')).toBeTruthy();
  });

  it('adding a trend row opens the trend section and writes the trend key; removing the last collapses it', async () => {
    await renderPage('&drillModule=PM1');
    const toggle = screen.getByRole('button', { name: /^추세 \(0행\)/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('button', { name: '추세에서 제거 EQ-001 · H1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '추세에 추가 EQ-001 · H1' }));
    expect(searchParams().get('trend')).toBe('EQ-001.H1');
    expect((await screen.findByRole('button', { name: /^추세 \(1행\)/ })).getAttribute('aria-expanded')).toBe('true');
    expect(data.trend).toHaveBeenLastCalledWith(['EQ-001.H1'], true);
    expect(screen.queryByRole('button', { name: '추세에 추가 EQ-001 · H1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '추세에서 제거 EQ-001 · H1' }));
    expect(searchParams().get('trend')).toBeNull();
    expect((await screen.findByRole('button', { name: /^추세 \(0행\)/ })).getAttribute('aria-expanded')).toBe('false');
  });

  it('offers no trend action at L1 (equipment ids never match the trend row format) and shows the empty trend copy', async () => {
    await renderPage();
    expect(screen.queryByRole('button', { name: /추세에 추가/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /추세에서 제거/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: /벤치마크|그룹별/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^추세 \(0행\)/ }));
    expect(screen.getByText('행을 추가하세요')).toBeTruthy();
    expect(screen.getByText('Module을 골라 들어간 뒤 행을 추세에 추가하세요.')).toBeTruthy();
  });

  it.each(['&drillModule=PM1', '&drillModule=PM1&drillMotion=Dechuck'])('inside a Module (%s) the empty trend copy points at the detail rows', async query => {
    await renderPage(query);
    fireEvent.click(screen.getByRole('button', { name: /^추세 \(0행\)/ }));
    expect(screen.getByText('상세 행을 골라 추세에 추가하세요.')).toBeTruthy();
    expect(screen.queryByText(/Module을 골라/)).toBeNull();
  });

  it('restores the level and the trend rows from the URL', async () => {
    await renderPage('&drillModule=PM2&drillMotion=Pump&trend=EQ-002.H3');
    expect(screen.getByTitle(/^Module PM2 · Motion Pump/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^추세 \(1행\)/ }).getAttribute('aria-expanded')).toBe('true');
    expect(data.trend).toHaveBeenLastCalledWith(['EQ-002.H3'], true);
  });

  it('a malformed trend shows the warning, sends no trend query, and Reset clears trend only', async () => {
    await renderPage('&drillModule=PM2&drillMotion=Pump&trend=EQ-002.H3,bogus&sort=total-asc');
    expect(screen.getByText('필터 값이 올바르지 않습니다')).toBeTruthy();
    expect(screen.getByText(/추세 행 “EQ-002\.H3,bogus”/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^추세 \(/ })).toBeNull();
    expect(data.trend.mock.calls.every(call => call[1] === false)).toBe(true);
    expect(data.level.mock.calls.every(call => call[1] === false)).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '초기화' })); });
    expect(searchParams().has('trend')).toBe(false);
    expect(searchParams().get('sort')).toBe('total-asc');
    expect(searchParams().get('drillModule')).toBe('PM2');
    expect(screen.queryByText('필터 값이 올바르지 않습니다')).toBeNull();
    expect(screen.getByRole('button', { name: /^추세 \(0행\)/ })).toBeTruthy();
  });

  it.each(['bogus', ''])('a malformed sort (%j) shows the warning and sends no level query; Reset restores the chart', async raw => {
    await renderPage(`&drillModule=PM1&sort=${raw}`);
    expect(screen.getByText('필터 값이 올바르지 않습니다')).toBeTruthy();
    expect(screen.getByText(raw ? /정렬 “bogus”/ : /정렬 “”/)).toBeTruthy();
    expect(data.level.mock.calls.every(call => call[1] === false)).toBe(true);
    expect(screen.queryByTestId('hw-time-steps-L2-categories')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '초기화' })); });
    expect(searchParams().has('sort')).toBe(false);
    expect((await screen.findByTestId('hw-time-steps-L2-categories')).textContent).toBe('120');
    expect(data.level).toHaveBeenLastCalledWith({ drillModule: 'PM1' }, true);
  });

  it('an empty trend value is invalid; one Reset clears every bad key', async () => {
    await renderPage('&trend=&sort=bogus');
    expect(screen.getAllByText(/추세 행|정렬/).length).toBeGreaterThanOrEqual(2);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '초기화' })); });
    expect(searchParams().has('trend')).toBe(false);
    expect(searchParams().has('sort')).toBe(false);
  });

  it('section collapse and option changes never query with new parameters', async () => {
    await renderPage('&drillModule=PM1');
    const before = distinctParams();
    const calls = data.level.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '계층 범례' }));
    fireEvent.click(screen.getByRole('button', { name: '옵션' }));
    fireEvent.click(screen.getByRole('button', { name: '옵션' }));
    expect(data.level.mock.calls.length).toBe(calls);
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: '큰 순' })); });
    expect(searchParams().has('benchmark') || searchParams().has('grouped')).toBe(false);
    expect(searchParams().get('sort')).toBe('total-desc');
    expect(distinctParams()).toEqual(before);
  });

  it('the legend controls the visible series handed to the Frame', async () => {
    await renderPage('&drillModule=PM1');
    expect(screen.getByTestId('hw-time-steps-L2-visible').textContent).toBe('Chuck,Dechuck,Pump,Vent,Transfer');
    fireEvent.click(screen.getByRole('checkbox', { name: /Pump/ }));
    expect(screen.getByTestId('hw-time-steps-L2-visible').textContent).toBe('Chuck,Dechuck,Vent,Transfer');
  });

  it.each([['', 'hw-time-steps-L1'], ['&drillModule=PM1', 'hw-time-steps-L2'], ['&drillModule=PM1&drillMotion=Pump', 'hw-time-steps-L3']])('%s stack asks the Frame for segment and total labels over additive seconds', async (query, chart) => {
    await renderPage(query);
    expect(screen.getByTestId(`${chart}-labels`).textContent).toBe('valueLabels=both reaggregation=sum');
  });

  it('legend tree Enter drills like the segment click; the name click only toggles visibility', async () => {
    await renderPage();
    const tree = await screen.findByRole('tree', { name: '계층 범례' });
    expect(within(tree).queryByRole('treeitem', { current: true })).toBeNull();
    fireEvent.click(within(tree).getByText('PM2'));
    expect(searchParams().get('drillModule')).toBeNull();
    fireEvent.keyDown(within(tree).getByRole('treeitem', { name: /PM2/ }), { key: 'Enter' });
    expect(searchParams().get('drillModule')).toBe('PM2');
    expect(searchParams().get('drillMotion')).toBeNull();
    expect(data.level).toHaveBeenLastCalledWith({ drillModule: 'PM2' }, true);
  });

  it('legend tree Enter at L2 drills to the Motion and L3 marks it current', async () => {
    await renderPage('&drillModule=PM1');
    fireEvent.keyDown(within(await screen.findByRole('tree', { name: '계층 범례' })).getByRole('treeitem', { name: /Pump/ }), { key: 'Enter' });
    expect(searchParams().get('drillMotion')).toBe('Pump');
    const tree = await screen.findByRole('tree', { name: '계층 범례' });
    expect(within(tree).getByRole('treeitem', { current: true }).getAttribute('data-id')).toBe('Pump');
  });
});
