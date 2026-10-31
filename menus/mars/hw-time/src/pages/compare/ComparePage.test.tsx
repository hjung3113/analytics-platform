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
      {/* Mirrors the Frame rule (pinned in AnalysisChartFrame.rowFocus.test.tsx): only a drawn category is named as the active row. */}
      <p data-testid={`${props.chartId}-active-shown`}>{props.activeCategory != null && categories.includes(props.activeCategory) ? props.activeCategory : ''}</p>
      <p data-testid={`${props.chartId}-reveal`}>{String(props.revealActive)}</p>
      {categories.filter(x => !x.includes('MEG')).slice(0, 4).map(x => <button key={`pick-${x}`} type="button" onClick={() => props.onActiveCategoryChange?.(x, 'pointer')}>{`pick ${props.chartId} ${x}`}</button>)}
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
  spaces: [{ id: spaceId('mars'), label: { ko: '분석', en: 'Analytics' }, description: { ko: '목적', en: 'Purpose' }, permission: menuPermission('analytics:view'), homeMenuId: 'hw-time-steps' }],
  groups: [{ id: groupId('hwTime'), label: { ko: '동작시간분석', en: 'Operation time' }, icon: LayoutDashboard, space: spaceId('mars') }],
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

const failed = (outcome: 'empty' | 'error') => ({ status: 'done' as const, missing: [], completedAt: 1, refetch: () => undefined, response: { outcome, data: null, assessments: [], trust: null, correlationId: 'fixture', ...(outcome === 'error' ? { message: 'boom' } : {}) } as ApiResponse<HwTimeLevelData> });

describe('HW Time compare page', () => {
  it.each([
    ['loading', () => ({ status: 'loading' as const, response: null, missing: [], completedAt: null, refetch: () => undefined }), '불러오는 중입니다.'],
    ['empty', () => failed('empty'), '조건에 맞는 결과가 없습니다.'],
    ['error', () => failed('error'), '데이터를 불러오지 못했습니다. 본문에서 다시 시도하세요.'],
  ])('the Inspector target follows the query when it is %s, not always loading (#1158)', async (_name, state, copy) => {
    data.level.mockImplementation(() => state());
    await renderPage();
    fireEvent.pointerDown(screen.getByRole('button', { name: '분석 대상' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '분석 대상' })); });
    const peek = await screen.findByRole('dialog', { name: '분석 대상' });
    expect(peek.textContent).toContain(copy);
    // The legend says the same while the summary is not answered: nothing to draw, and it is not a bare "no legend".
    if (copy !== '불러오는 중입니다.') {
      fireEvent.pointerDown(screen.getByRole('button', { name: '계층 범례' }));
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
      expect((await screen.findByRole('tree', { name: '계층 범례' })).textContent).toContain(copy);
    }
  });

  it('declares the manifest with the agreed keys', () => {
    const menu = manifests.find(item => item.id === 'hw-time-compare')!;
    expect(menu.path).toBe('/hw-time/compare');
    expect(menu.primary).toBeUndefined();
    expect(menu.label).toEqual({ ko: 'HW Time 비교', en: 'HW Time compare' });
    expect(menu.pageKeys).toEqual(['drillModule', 'drillMotion', 'trend', 'sort', 'row', 'scroll', 'minmax', 'align']);
    expect(menu.contextResetKeys).toEqual(['drillModule', 'drillMotion', 'trend', 'row']);
    expect(menu.drill?.resetKeys).toEqual(['row']);
    expect(menu.group).toBe(manifests[0].group);
    expect(menu.features).toEqual(manifests[0].features);
    expect(menu.drill?.levels).toEqual(manifests[0].drill?.levels);
  });

  it('one static persistKey and one preset at every depth: summary | composition over detail+trend', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(workspace().getAttribute('data-persist')).toBe('hw-compare');
    // Panel order is the reading order of the narrow stack: summary, composition, detail, trend.
    expect(panelIds()).toEqual(['panel summary', 'panel module', 'panel detail', 'panel trend']);
    const presets = JSON.parse(workspace().getAttribute('data-layout')!);
    expect(presets).toHaveLength(1);
    expect(presets[0]).toEqual({ type: 'branch', dir: 'row', sizes: [34, 66], children: [
      { type: 'group', panels: ['summary'] },
      { type: 'branch', dir: 'column', sizes: [48, 52], children: [{ type: 'group', panels: ['module'] }, { type: 'group', panels: ['detail', 'trend'] }] },
    ] });
  });

  it('L3 draws every Motion in the context and only the selected Motion in the detail', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(JSON.parse(screen.getByTestId('hw-compare-module-series').textContent!).map((s: { id: string }) => s.id)).toEqual(MOTIONS);
    expect(JSON.parse(screen.getByTestId('hw-compare-detail-series').textContent!).map((s: { id: string }) => s.id)).toEqual(['Pump']);
    expect(screen.getByTestId('hw-compare-module-selector').textContent).not.toContain('MEG');
  });

  it.each(['module', 'detail'])('a row picked in the %s Frame sets row and both Frames get it as activeCategory', async side => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(screen.getByTestId('hw-compare-module-active').textContent).toBe('null');
    fireEvent.click(screen.getByRole('button', { name: `pick hw-compare-${side} EQ-001 · H3` }));
    expect(searchParams().get('row')).toBe('EQ-001.H3');
    expect(screen.getByTestId('hw-compare-module-active').textContent).toBe('EQ-001 · H3');
    expect(screen.getByTestId('hw-compare-detail-active').textContent).toBe('EQ-001 · H3');
    expect(screen.getByTestId('hw-compare-module-reveal').textContent).toBe('true');
    expect(screen.getByTestId('hw-compare-detail-reveal').textContent).toBe('true');
  });

  it('a row restored from the URL is active', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    expect(screen.getByTestId('hw-compare-detail-active').textContent).toBe('EQ-001 · H2');
  });

  it.each([
    ['row', 'bogus', '선택 행'], ['row', '', '선택 행'], ['sort', 'bogus', '정렬'], ['sort', '', '정렬'],
    ['trend', 'EQ-001.H1,bogus', '추세 행'], ['trend', '', '추세 행'],
  ])('a malformed %s=%j shows the warning and sends no query; Reset clears it', async (key, raw, field) => {
    await renderPage(`&drillModule=PM1&drillMotion=Pump&${key}=${raw}`);
    expect(screen.getByText('필터 값이 올바르지 않습니다')).toBeTruthy();
    expect(screen.getByText(`${field} “${raw}”`, { exact: false })).toBeTruthy();
    expect(data.level.mock.calls.every(call => call[1] === false)).toBe(true);
    expect(data.trend.mock.calls.every(call => call[1] === false)).toBe(true);
    expect(screen.queryByTestId('hw-compare-detail-active')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '초기화' })); });
    expect(searchParams().has(key)).toBe(false);
    expect(searchParams().get('drillMotion')).toBe('Pump');
    expect(await screen.findByTestId('hw-compare-detail-active')).toBeTruthy();
  });

  it('adding a trend row writes the key and requests the trend panel; the action is only the applicable one; none at L1', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&trend=EQ-001.H1');
    expect(workspace().getAttribute('data-reveal')).toBe('null');
    expect(screen.queryByRole('button', { name: '추세에 추가 EQ-001 · H1' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '추세에서 제거 EQ-001 · H1' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: '추세에 추가 EQ-001 · H2' })[0]!);
    expect(searchParams().get('trend')).toBe('EQ-001.H1,EQ-001.H2');
    // revealTrend is off for this page (#912 a): the detail tab stays active, only the badge changes.
    expect(workspace().getAttribute('data-reveal')).toBe('null');
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
    expect(screen.getByTestId('hw-compare-module-pitch').textContent).toBe('26');
    expect(screen.getByTestId('hw-compare-detail-pitch').textContent).toBe('26');
    cleanup();
    await renderPage('&drillModule=PM1&drillMotion=Pump&scroll=0');
    expect(screen.getByTestId('hw-compare-module-pitch').textContent).toBe('');
    expect(screen.getByTestId('hw-compare-detail-pitch').textContent).toBe('');
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
    for (const id of ['hw-compare-module', 'hw-compare-detail']) expect(screen.getByTestId(`${id}-options`).textContent).toBe('align=true minmax=true');
    cleanup();
    await renderPage('&drillModule=PM1');
    expect(screen.getByTestId('hw-compare-module-options').textContent).toBe('align=false minmax=false');
  });

  it('the legend hides a Motion in both stacks; hiding the selected Motion empties the detail', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Chuck/ }));
    expect(screen.getByTestId('hw-compare-module-visible').textContent).toBe('Dechuck,Pump,Vent,Transfer');
    expect(screen.getByTestId('hw-compare-detail-visible').textContent).toBe('Pump');
    fireEvent.click(screen.getByRole('checkbox', { name: /Pump/ }));
    expect(screen.getByTestId('hw-compare-detail-visible').textContent).toBe('');
    expect(screen.getByTestId('hw-compare-detail-legend').textContent).toBe('false');
  });

  it('the composition fills at the Module step; the summary drills by segment', async () => {
    await renderPage('&drillModule=PM1');
    expect(screen.getByTestId('hw-compare-module-series').textContent).toContain('Chuck');
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
    expect(screen.getAllByText(/미측정 값이 있는 행 \d+개/).length).toBeGreaterThan(0);
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

  it('going up through the breadcrumb clears the row in that one navigation', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    fireEvent.click(screen.getByRole('button', { name: 'pick hw-compare-detail EQ-001 · H3' }));
    expect(searchParams().get('row')).toBe('EQ-001.H3');
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: /Module: PM1/ }));
    expect(searchParams().has('row')).toBe(false);
    expect(searchParams().get('drillModule')).toBe('PM1');
    expect(window.history.length).toBe(before + 1);
  });

  it('the URL is the truth: Back to the path a row was picked on restores that row', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    fireEvent.click(screen.getByRole('button', { name: 'pick hw-compare-detail EQ-001 · H3' }));
    const pickedOn = window.location.search;
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^segment Pump EQ-001/ })[0]!);
    expect(screen.getByTestId('hw-compare-detail-active').textContent).toBe('null');
    fireEvent.click(screen.getByRole('button', { name: 'pick hw-compare-detail EQ-001 · H1' }));
    expect(searchParams().get('row')).toBe('EQ-001.H1');
    // pick, Pump, PM2, 전체 are four entries after the entry the first row was picked on.
    act(() => { window.history.go(-4); });
    await waitFor(() => expect(window.location.search).toBe(pickedOn));
    expect(screen.getByTestId('hw-compare-detail-active').textContent).toBe('EQ-001 · H3');
  });

  it('a URL row that does not belong to the current level shows no active row', async () => {
    await renderPage('&drillModule=PM1&row=EQ-001.H3');
    expect(screen.getByTestId('hw-compare-module-active-shown').textContent).toBe('');
    cleanup();
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H3');
    expect(screen.getByTestId('hw-compare-detail-active-shown').textContent).toBe('EQ-001 · H3');
  });

  it('a row that arrives with the URL stays active, and history Back restores the row as it was', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    expect(screen.getByTestId('hw-compare-detail-active').textContent).toBe('EQ-001 · H2');
    fireEvent.click(screen.getByRole('button', { name: /Module: PM1/ }));
    expect(screen.queryByTestId('hw-compare-detail-active')).toBeNull();
    act(() => { window.history.back(); });
    await waitFor(() => expect(screen.getByTestId('hw-compare-detail-active').textContent).toBe('EQ-001 · H2'));
    expect(searchParams().get('row')).toBe('EQ-001.H2');
  });

  it.each([['', 'hw-compare-summary'], ['&drillModule=PM1', 'hw-compare-module'], ['&drillModule=PM1&drillMotion=Pump', 'hw-compare-detail']])('%s stack asks the Frame for segment and total labels over additive seconds', async (query, chart) => {
    await renderPage(query);
    expect(screen.getByTestId(`${chart}-labels`).textContent).toBe('valueLabels=both reaggregation=sum');
  });

  it('legend tree Enter drills like the segment click; the name click only toggles visibility', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    const tree = await screen.findByRole('tree', { name: '계층 범례' });
    expect(within(tree).queryByRole('treeitem', { current: true })).toBeNull();
    fireEvent.click(within(tree).getByText('PM2'));
    expect(searchParams().get('drillModule')).toBeNull();
    fireEvent.keyDown(within(tree).getByRole('treeitem', { name: /PM2/ }), { key: 'Enter' });
    expect(searchParams().get('drillModule')).toBe('PM2');
    expect(searchParams().get('drillMotion')).toBeNull();
    expect(data.level).toHaveBeenCalledWith({ drillModule: 'PM2' }, true);
  });

  it('legend tree Enter at L2 drills to the Motion and L3 marks it current', async () => {
    await renderPage('&drillModule=PM1');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    fireEvent.keyDown(within(await screen.findByRole('tree', { name: '계층 범례' })).getByRole('treeitem', { name: /Pump/ }), { key: 'Enter' });
    expect(searchParams().get('drillMotion')).toBe('Pump');
    if (!screen.queryByRole('tree', { name: '계층 범례' })) await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    const tree = await screen.findByRole('tree', { name: '계층 범례' });
    expect(within(tree).getByRole('treeitem', { current: true }).getAttribute('data-id')).toBe('Pump');
  });

  it('a hidden Motion stays hidden through a Motion drill and back up to the same Module; another Module resets it', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Chuck/ }));
    expect(screen.getByTestId('hw-compare-module-visible').textContent).toBe('Dechuck,Pump,Vent,Transfer');
    fireEvent.keyDown(within(await screen.findByRole('tree', { name: '계층 범례' })).getByRole('treeitem', { name: /Vent/ }), { key: 'Enter' });
    expect(searchParams().get('drillMotion')).toBe('Vent');
    expect(screen.getByTestId('hw-compare-module-visible').textContent).toBe('Dechuck,Pump,Vent,Transfer');
    fireEvent.click(screen.getByRole('button', { name: /Module: PM1/ }));
    expect(screen.getByTestId('hw-compare-module-visible').textContent).toBe('Dechuck,Pump,Vent,Transfer');
  });

  it('a hidden Module in the summary stays hidden after entering a Module and going back; the composition keeps its own hidden Motions', async () => {
    await renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    fireEvent.click(await screen.findByRole('checkbox', { name: /PM2/ }));
    expect(screen.getByTestId('hw-compare-summary-visible').textContent).toBe('PM1,PM3,PM4');
    fireEvent.click(screen.getByRole('button', { name: 'segment PM1 EQ-001' }));
    expect(searchParams().get('drillModule')).toBe('PM1');
    expect(screen.getByTestId('hw-compare-summary-visible').textContent).toBe('PM1,PM3,PM4');
    // Hiding in the composition leaves the summary alone.
    if (!screen.queryByRole('tree', { name: '계층 범례' })) await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Chuck/ }));
    expect(screen.getByTestId('hw-compare-module-visible').textContent).toBe('Dechuck,Pump,Vent,Transfer');
    expect(screen.getByTestId('hw-compare-summary-visible').textContent).toBe('PM1,PM3,PM4');
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    expect(screen.getByTestId('hw-compare-summary-visible').textContent).toBe('PM1,PM3,PM4');
  });

  it.each([
    ['delayed', () => ({ status: 'loading' as const, response: null, missing: [], completedAt: null, refetch: () => undefined }), null],
    ['failed', () => ({ status: 'done' as const, missing: [], completedAt: 1, refetch: () => undefined, response: { outcome: 'error', data: null, assessments: [], trust: null, correlationId: 'fixture', message: 'boom' } as ApiResponse<HwTimeLevelData> }), '구성을 불러오지 못했습니다.'],
    ['empty', () => ({ status: 'done' as const, missing: [], completedAt: 1, refetch: () => undefined, response: { outcome: 'empty', data: null, assessments: [], trust: null, correlationId: 'fixture' } as ApiResponse<HwTimeLevelData> }), '이 Module에는 구성 기록이 없습니다.'],
  ])('a %s composition leaves the legend without Module rows: nothing to drill, no Motion request carries a Module id', async (_name, pending, copy) => {
    data.level.mockImplementation((drill: HwTimeDrill, enabled: boolean) => (drill.drillModule && !drill.drillMotion && enabled ? pending() : done(fixtureFor(drill))));
    await renderPage('&drillModule=PM2');
    await waitFor(() => expect(data.level.mock.calls.some(([drill, enabled]) => enabled && drill.drillModule === 'PM2' && !drill.drillMotion)).toBe(true));
    if (copy) {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '분석 대상' })); });
      expect((await screen.findByRole('dialog', { name: '분석 대상' })).textContent).toContain(copy);
    }
    const legendButton = screen.getByRole('button', { name: '계층 범례' });
    if (copy) fireEvent.pointerDown(legendButton);
    await act(async () => { fireEvent.click(legendButton); });
    const tree = await screen.findByRole('tree', { name: '계층 범례' });
    if (copy) expect(tree.textContent).toContain(copy);
    expect(within(tree).queryByRole('treeitem')).toBeNull();
    expect(screen.queryByRole('button', { name: /단계로 이동/ })).toBeNull();
    fireEvent.keyDown(tree, { key: 'Enter' });
    expect(searchParams().has('drillMotion')).toBe(false);
    expect(data.level.mock.calls.every(([drill, on]) => !(on && drill.drillMotion))).toBe(true);
  });

  it('a hidden Motion does not carry over to another Module', async () => {
    await renderPage('&drillModule=PM1');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    fireEvent.click(await screen.findByRole('checkbox', { name: /Chuck/ }));
    expect(screen.getByTestId('hw-compare-module-visible').textContent).toBe('Dechuck,Pump,Vent,Transfer');
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    expect(screen.getByTestId('hw-compare-module-visible').textContent).toBe('Chuck,Dechuck,Pump,Vent,Transfer');
  });

  it('every legend row offers a drill button and the Enter description', async () => {
    await renderPage('&drillModule=PM1');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '계층 범례' })); });
    const tree = within(await screen.findByRole('tree', { name: '계층 범례' }));
    const item = tree.getByRole('treeitem', { name: /Pump/ });
    expect(tree.getByRole('button', { name: 'Pump 단계로 이동' })).toBeTruthy();
    expect(document.getElementById(item.getAttribute('aria-describedby')!.split(' ')[0]!)?.textContent).toBe('Enter: 이 단계로 이동');
  });
});


it('declares compact page spacing from the real consumer (#1141)', async () => {
  await renderPage();
  const content = document.querySelector('[data-platform-page-content]')!;
  expect(content.classList.contains('px-4')).toBe(true);
  expect(content.classList.contains('pt-3')).toBe(true);
  expect(content.classList.contains('pb-4')).toBe(true);
});
