// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      <p data-testid={`${props.chartId}-active`}>{String(props.activeCategory)}</p>
      <p data-testid={`${props.chartId}-reveal`}>{String(props.revealActive)}</p>
      {categories.filter(x => !x.includes('MEG')).slice(0, 4).map(x => <button key={`pick-${x}`} type="button" onClick={() => props.onActiveCategoryChange?.(x, 'pointer')}>{`pick ${props.chartId} ${x}`}</button>)}
      <p data-testid={`${props.chartId}-legend`}>{String(props.legend !== false)}</p>
      <p data-testid={`${props.chartId}-options`}>{`align=${String(props.startAlign)} minmax=${String(props.minMax)}`}</p>
      {/* The Frame's selector: points the page marks non-selectable are skipped, so they are neither listed nor reachable. */}
      <p data-testid={`${props.chartId}-selector`}>{selectable.map(p => p.x).join('|')}</p>
      {/* The menu list is evaluated for the selected point, as the Frame does. */}
      {selectable.filter(p => !p.x.includes('MEG')).map(p => p.x).filter((x, i, all) => all.indexOf(x) === i).slice(0, 3).flatMap(x =>
        actionsFor({ x, seriesId: props.series[0]?.id ?? '', value: null }).map(action =>
          <button key={`${action.id}-${x}`} type="button" onClick={() => action.onSelect({ x, seriesId: props.series[0]?.id ?? '', value: null })}>{`${action.label} ${x}`}</button>))}
    </section>;
  }
  function PanelWorkspace(props: import('@ap/components').PanelWorkspaceProps) {
    return <div data-testid="workspace" data-persist={props.persistKey} data-reveal={JSON.stringify(props.revealRequest ?? null)} data-layout={JSON.stringify(props.presets.map(p => p.layout))}>
      {props.panels.map(panel => <section key={panel.id} aria-label={`panel ${panel.id}`} data-badge={panel.badge ? panel.badge.count : ''}>{panel.render()}</section>)}
    </div>;
  }
  return { ...actual, AnalysisChartFrame, PanelWorkspace };
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
  spaces: [{ id: spaceId('analytics'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('analytics') }],
  menus: manifests,
});
const session = testSession(['analytics:view', 'platform:view'], { user: { id: 'analyst-a', name: 'analyst-a', title: { ko: '분석가', en: 'Analyst' } } });
const adapter = testAdapter({ session: () => session });

async function renderPage(search = '') {
  const { default: ComparePage } = await import('./ComparePage');
  window.history.replaceState(null, '', `/hw-time/compare?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><ComparePage params={{}} /></PlatformProvider></I18nProvider>);
  await screen.findByRole('group', { name: '분석 보조' });
}
const searchParams = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  data.level.mockImplementation((drill: HwTimeDrill) => done(fixtureFor(drill)));
  data.trend.mockImplementation((ids: string[]) => done(trendData(ids)));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });


const workspace = () => screen.getByTestId('workspace');
const panelIds = () => within(workspace()).getAllByRole('region').map(el => el.getAttribute('aria-label')).filter(name => name?.startsWith('panel '));

describe('HW Time compare page', () => {
  it('declares the manifest with the agreed keys', () => {
    const menu = manifests.find(item => item.id === 'hw-time-compare')!;
    expect(menu.path).toBe('/hw-time/compare');
    expect(menu.primary).toBeUndefined();
    expect(menu.label).toEqual({ ko: 'HW Time 비교', en: 'HW Time compare' });
    expect(menu.pageKeys).toEqual(['drillModule', 'drillMotion', 'trend', 'sort', 'row', 'scroll', 'minmax', 'align']);
    expect(menu.contextResetKeys).toEqual(['drillModule', 'drillMotion', 'trend', 'row']);
    expect(menu.group).toBe(manifests[0].group);
    expect(menu.features).toEqual(manifests[0].features);
    expect(menu.drill).toEqual(manifests[0].drill);
  });

  it.each([
    ['', 'hw-compare-l1', ['panel stack', 'panel trend']],
    ['&drillModule=PM1', 'hw-compare-l2', ['panel ranking', 'panel stack', 'panel trend']],
    ['&drillModule=PM1&drillMotion=Pump', 'hw-compare-l3', ['panel context', 'panel detail', 'panel trend']],
  ])('%s uses its own persistKey and panels', async (query, key, panels) => {
    await renderPage(query);
    expect(workspace().getAttribute('data-persist')).toBe(key);
    expect(panelIds()).toEqual(panels);
    const presets = JSON.parse(workspace().getAttribute('data-layout')!);
    expect(presets).toHaveLength(1);
    // The trend row is the last child of the column root, about 28% at every level.
    expect(presets[0].sizes).toEqual([72, 28]);
    expect(presets[0].children.at(-1)).toEqual({ type: 'group', panels: ['trend'] });
  });

  it('L3 draws every Motion in the context and only the selected Motion in the detail', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(JSON.parse(screen.getByTestId('hw-compare-L3-context-series').textContent!).map((s: { id: string }) => s.id)).toEqual(MOTIONS);
    expect(JSON.parse(screen.getByTestId('hw-compare-L3-detail-series').textContent!).map((s: { id: string }) => s.id)).toEqual(['Pump']);
    expect(screen.getByTestId('hw-compare-L3-context-selector').textContent).not.toContain('MEG');
  });

  it.each(['context', 'detail'])('a row picked in the %s Frame sets row and both Frames get it as activeCategory', async side => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(screen.getByTestId('hw-compare-L3-context-active').textContent).toBe('null');
    fireEvent.click(screen.getByRole('button', { name: `pick hw-compare-L3-${side} EQ-001 · H3` }));
    expect(searchParams().get('row')).toBe('EQ-001.H3');
    expect(screen.getByTestId('hw-compare-L3-context-active').textContent).toBe('EQ-001 · H3');
    expect(screen.getByTestId('hw-compare-L3-detail-active').textContent).toBe('EQ-001 · H3');
    expect(screen.getByTestId('hw-compare-L3-context-reveal').textContent).toBe('true');
    expect(screen.getByTestId('hw-compare-L3-detail-reveal').textContent).toBe('true');
  });

  it('a row restored from the URL is active; a malformed row is ignored', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    expect(screen.getByTestId('hw-compare-L3-detail-active').textContent).toBe('EQ-001 · H2');
    cleanup();
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=bogus');
    expect(screen.getByTestId('hw-compare-L3-detail-active').textContent).toBe('null');
  });

  it('adding a trend row writes the key and requests the trend panel; the action is only the applicable one; none at L1', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&trend=EQ-001.H1');
    expect(workspace().getAttribute('data-reveal')).toBe('null');
    expect(screen.queryByRole('button', { name: '추세에 추가 EQ-001 · H1' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '추세에서 제거 EQ-001 · H1' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: '추세에 추가 EQ-001 · H2' })[0]!);
    expect(searchParams().get('trend')).toBe('EQ-001.H1,EQ-001.H2');
    expect(JSON.parse(workspace().getAttribute('data-reveal')!)).toEqual({ panelId: 'trend', seq: 1 });
    expect(screen.getByLabelText('panel trend').getAttribute('data-badge')).toBe('2');
    cleanup();
    await renderPage();
    expect(screen.queryByRole('button', { name: /추세에 추가|추세에서 제거/ })).toBeNull();
    expect(screen.getByText('행을 추가하세요')).toBeTruthy();
  });

  it('the rail shows icon buttons and a peek opens the section content (no stack summaries)', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    for (const name of ['분석 대상', '계층 범례', '옵션']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByText('정렬: 기본 · 행 스크롤')).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '행 스크롤 보기' })).toBeNull();
    const calls = data.level.mock.calls.length;
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '옵션' })); });
    expect(await screen.findByRole('checkbox', { name: '행 스크롤 보기' })).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole('button', { name: '분석 대상' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '분석 대상' })); });
    expect(await screen.findByText('선택 24 · 평가 24')).toBeTruthy();
    expect(data.level.mock.calls.length).toBe(calls);
  });

  it('ScrollView: on by default (rowPitch 26 + revealActive), scroll=0 omits rowPitch', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(screen.getByTestId('hw-compare-L3-context-pitch').textContent).toBe('26');
    expect(screen.getByTestId('hw-compare-L3-detail-pitch').textContent).toBe('26');
    cleanup();
    await renderPage('&drillModule=PM1&drillMotion=Pump&scroll=0');
    expect(screen.getByTestId('hw-compare-L3-context-pitch').textContent).toBe('');
    expect(screen.getByTestId('hw-compare-L3-detail-pitch').textContent).toBe('');
  });

  it('the scroll toggle writes scroll=0 / clears it and keeps the row', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '옵션' })); });
    await act(async () => { fireEvent.click(await screen.findByRole('checkbox', { name: '행 스크롤 보기' })); });
    expect(searchParams().get('scroll')).toBe('0');
    expect(searchParams().get('row')).toBe('EQ-001.H2');
    await act(async () => { fireEvent.click(screen.getByRole('checkbox', { name: '행 스크롤 보기' })); });
    expect(searchParams().has('scroll')).toBe(false);
  });

  it('the minmax and align keys reach every stack panel', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&minmax=1&align=1');
    for (const id of ['hw-compare-L3-context', 'hw-compare-L3-detail']) expect(screen.getByTestId(`${id}-options`).textContent).toBe('align=true minmax=true');
    cleanup();
    await renderPage('&drillModule=PM1');
    expect(screen.getByTestId('hw-compare-L2-options').textContent).toBe('align=false minmax=false');
  });

  it('the legend hides a Motion in both stacks; hiding the selected Motion empties the detail', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Chuck/ }));
    expect(screen.getByTestId('hw-compare-L3-context-visible').textContent).toBe('Dechuck,Pump,Vent,Transfer');
    expect(screen.getByTestId('hw-compare-L3-detail-visible').textContent).toBe('Pump');
    fireEvent.click(screen.getByRole('checkbox', { name: /Pump/ }));
    expect(screen.getByTestId('hw-compare-L3-detail-visible').textContent).toBe('');
    expect(screen.getByTestId('hw-compare-L3-detail-legend').textContent).toBe('false');
  });

  it('L2 shows a ranking beside the Motion stack; L1 drills by segment', async () => {
    await renderPage('&drillModule=PM1');
    const list = screen.getByRole('list', { name: '합계 순위' });
    expect(within(list).getAllByRole('listitem').length).toBeGreaterThan(0);
    cleanup();
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'segment PM1 EQ-001' }));
    expect(searchParams().get('drillModule')).toBe('PM1');
  });

  it('PM4 Vent says nothing is recorded and PM3 reads 미측정 in the summary', async () => {
    await renderPage('&drillModule=PM4&drillMotion=Vent');
    expect(screen.getByText('PM4 Module에는 Vent 동작 기록이 없습니다')).toBeTruthy();
    expect(screen.getByTitle('Module PM4 · Motion Vent · 기록 없음')).toBeTruthy();
    cleanup();
    await renderPage('&drillModule=PM3');
    expect(screen.getByText(/미측정 값이 있는 행 \d+개/)).toBeTruthy();
    expect(screen.getByTitle(/^Module PM3 · [\d,]+\.\d{2} 초 · 일부 미측정$/)).toBeTruthy();
  });

  it('a drill step through the page clears the row in the same navigation (one history entry)', async () => {
    await renderPage('&drillModule=PM1&row=EQ-001.H3');
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'segment Dechuck EQ-001 · H3' }));
    expect(searchParams().get('drillMotion')).toBe('Dechuck');
    expect(searchParams().has('row')).toBe(false);
    expect(window.history.length).toBe(before + 1);
    cleanup();
    await renderPage('&row=EQ-001.H3');
    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    expect(searchParams().get('drillModule')).toBe('PM2');
    expect(searchParams().has('row')).toBe(false);
  });

  it('a row picked on one path is not carried to another path by the breadcrumb, and Back restores it', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    fireEvent.click(screen.getByRole('button', { name: 'pick hw-compare-L3-detail EQ-001 · H3' }));
    expect(searchParams().get('row')).toBe('EQ-001.H3');
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^segment Pump EQ-001/ })[0]!);
    expect(searchParams().has('row')).toBe(false);
    expect(screen.getByTestId('hw-compare-L3-detail-active').textContent).toBe('null');
    // The breadcrumb cannot clear a page key: the stale URL row is ignored on the new path.
    fireEvent.click(screen.getByRole('button', { name: 'pick hw-compare-L3-detail EQ-001 · H1' }));
    fireEvent.click(screen.getByRole('button', { name: /Module: PM2/ }));
    fireEvent.click(screen.getAllByRole('button', { name: /^segment Chuck EQ-001/ })[0]!);
    expect(searchParams().has('row')).toBe(false);
    expect(screen.getByTestId('hw-compare-L3-detail-active').textContent).toBe('null');
  });

  it('a row that arrives with the URL stays active, and history Back restores the row as it was', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    expect(screen.getByTestId('hw-compare-L3-detail-active').textContent).toBe('EQ-001 · H2');
    fireEvent.click(screen.getByRole('button', { name: /Module: PM1/ }));
    expect(screen.queryByTestId('hw-compare-L3-detail-active')).toBeNull();
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.getByTestId('hw-compare-L3-detail-active').textContent).toBe('EQ-001 · H2'));
    expect(searchParams().get('row')).toBe('EQ-001.H2');
  });
});
