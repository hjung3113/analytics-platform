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
    return <section aria-label={String(props.title)} data-chart={props.chartId}>
      <p data-testid={`${props.chartId}-categories`}>{categories.length}</p>
      <p data-testid={`${props.chartId}-visible`}>{(props.visibleSeriesIds ?? []).join(',')}</p>
      {props.series.flatMap(s => s.points.filter(([, v]) => v !== null).slice(0, 3).map(([x, v]) =>
        <button key={`${s.id}-${x}`} type="button" onClick={() => props.pointActivation?.onActivate({ x, seriesId: s.id, value: v })}>{`segment ${s.id} ${x}`}</button>))}
      {categories.slice(0, 3).flatMap(x => (props.pointActions ?? []).map(action =>
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
  ...(meg ? [{ id: `${eq(i + 1)}.MEG`, equipmentId: eq(i + 1), auxiliary: { kind: 'MEG' as const, label: 'MEG 3.25' }, values: {}, total: null }] : []),
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
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('analytics') }],
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
    expect(screen.getByTitle(/^Module PM1 · \d+\.\d{2} 초$/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^segment Dechuck EQ-001\.H1$/ }));
    expect(searchParams().get('drillMotion')).toBe('Dechuck');
    const summary = await screen.findByTitle(/^Module PM1 · Motion Dechuck · \d+\.\d{2} 초$/);
    expect(summary).toBeTruthy();
    expect(screen.getByTestId('hw-time-steps-L3-categories').textContent).toBe('96');
  });

  it('L2 auxiliary MEG rows keep their label and carry no bars', async () => {
    await renderPage('&drillModule=PM1');
    expect(screen.queryByRole('button', { name: /segment \w+ EQ-001\.MEG/ })).toBeNull();
    expect(screen.getByTestId('hw-time-steps-L2-categories').textContent).toBe('120');
  });

  it('PM4 Vent detail says there is nothing recorded, in plain Korean', async () => {
    await renderPage('&drillModule=PM4&drillMotion=Vent');
    expect(screen.getByText('PM4 Module에는 Vent 동작 기록이 없습니다')).toBeTruthy();
    expect(screen.queryByRole('region', { name: /상세/ })).toBeNull();
  });

  it('PM3 missing values read 미측정 in page text, never 0', async () => {
    await renderPage('&drillModule=PM3');
    expect(screen.getByText(/미측정 값이 있는 행 \d+개/)).toBeTruthy();
    cleanup();
    data.level.mockImplementation((drill: HwTimeDrill) => done({ ...fixtureFor(drill), totals: { values: {}, total: null } }));
    await renderPage('&drillModule=PM3');
    expect(screen.getByTitle('Module PM3 · 미측정')).toBeTruthy();
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
    fireEvent.click(screen.getByRole('button', { name: '추세에 추가 EQ-001.H1' }));
    expect(searchParams().get('trend')).toBe('EQ-001.H1');
    expect((await screen.findByRole('button', { name: /^추세 \(1행\)/ })).getAttribute('aria-expanded')).toBe('true');
    expect(data.trend).toHaveBeenLastCalledWith(['EQ-001.H1'], true);
    fireEvent.click(screen.getByRole('button', { name: '추세에서 제거 EQ-001.H1' }));
    expect(searchParams().get('trend')).toBeNull();
    expect((await screen.findByRole('button', { name: /^추세 \(0행\)/ })).getAttribute('aria-expanded')).toBe('false');
  });

  it('offers no trend action at L1 (equipment ids never match the trend row format) and shows the empty trend copy', async () => {
    await renderPage();
    expect(screen.queryByRole('button', { name: /추세에 추가/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /^추세 \(0행\)/ }));
    expect(screen.getByText('행을 추가하세요')).toBeTruthy();
  });

  it('restores the level and the trend rows from the URL', async () => {
    await renderPage('&drillModule=PM2&drillMotion=Pump&trend=EQ-002.H3,bogus');
    expect(screen.getByTitle(/^Module PM2 · Motion Pump/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /^추세 \(1행\)/ }).getAttribute('aria-expanded')).toBe('true');
    expect(data.trend).toHaveBeenLastCalledWith(['EQ-002.H3'], true);
  });

  it('section collapse and option changes never query with new parameters', async () => {
    await renderPage('&drillModule=PM1');
    const before = distinctParams();
    const calls = data.level.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: '계층 범례' }));
    fireEvent.click(screen.getByRole('button', { name: '옵션' }));
    fireEvent.click(screen.getByRole('button', { name: '옵션' }));
    expect(data.level.mock.calls.length).toBe(calls);
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: '벤치마크' })); });
    await act(async () => { fireEvent.click(screen.getByRole('radio', { name: '큰 순' })); });
    expect(searchParams().get('benchmark')).toBe('1');
    expect(searchParams().get('sort')).toBe('total-desc');
    expect(distinctParams()).toEqual(before);
  });

  it('the legend controls the visible series handed to the Frame', async () => {
    await renderPage('&drillModule=PM1');
    expect(screen.getByTestId('hw-time-steps-L2-visible').textContent).toBe('Chuck,Dechuck,Pump,Vent,Transfer');
    fireEvent.click(screen.getByRole('checkbox', { name: /Pump/ }));
    expect(screen.getByTestId('hw-time-steps-L2-visible').textContent).toBe('Chuck,Dechuck,Vent,Transfer');
  });
});
