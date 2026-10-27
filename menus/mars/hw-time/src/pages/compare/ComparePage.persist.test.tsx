// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupId, menuPermission, spaceId, type ApiResponse } from '@ap/contracts';
import { createRegistry, I18nProvider, PlatformProvider, useI18n } from '@ap/kernel';
import { memoryStorage, testAdapter, testSession } from '@ap/kernel/testing';
import { LayoutDashboard } from 'lucide-react';
import type { HwTimeBlock, HwTimeDrill, HwTimeLevelData, HwTimeRow, HwTimeSeries, HwTimeTrendData } from '../../endpoints';
import { manifests } from '../../index';

const data = vi.hoisted(() => ({ level: vi.fn(), trend: vi.fn() }));
/** Mounts per chart (a Frame that stays mounted counts once). */
const mounts = vi.hoisted(() => new Map<string, number>());
vi.mock('../../shared/data', () => ({ useHwTimeLevel: data.level, useHwTimeTrend: data.trend }));

// jsdom has no canvas: the Frame is replaced by a stub that exposes what the page hands it (series, categories, point callbacks).
vi.mock('@ap/components', async importOriginal => {
  const actual = await importOriginal<typeof import('@ap/components')>();
  function AnalysisChartFrame(props: import('@ap/components').AnalysisChartFrameProps) {
    useEffect(() => { mounts.set(props.chartId, (mounts.get(props.chartId) ?? 0) + 1); }, [props.chartId]);
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
    const { lang } = useI18n();
    return <div data-testid="workspace" data-persist={props.persistKey} data-reveal={JSON.stringify(props.revealRequest ?? null)} data-layout={JSON.stringify(props.presets.map(p => p.layout))}>
      <div role="tablist" aria-label={props.label[lang]}>
        {props.panels.map(panel => <button key={panel.id} type="button" role="tab">{panel.title[lang]}</button>)}
      </div>
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

function SetLanguage({ lang }: { lang: 'ko' | 'en' }) {
  const { setLang } = useI18n();
  useEffect(() => { setLang(lang); }, [lang, setLang]);
  return null;
}

async function renderPage(search = '', lang: 'ko' | 'en' = 'ko') {
  const { default: ComparePage } = await import('./ComparePage');
  window.history.replaceState(null, '', `/hw-time/compare?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><><SetLanguage lang={lang} /><PlatformProvider adapter={adapter} registry={registry}><ComparePage params={{}} /></PlatformProvider></></I18nProvider>);
  await screen.findByRole('group', { name: lang === 'ko' ? '분석 보조' : 'Analysis aids' });
}
const searchParams = () => new URLSearchParams(window.location.search);

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
  data.level.mockImplementation((drill: HwTimeDrill) => done(fixtureFor(drill)));
  data.trend.mockImplementation((ids: string[]) => done(trendData(ids)));
});
afterEach(() => { mounts.clear(); cleanup(); vi.unstubAllGlobals(); vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });


const panelIds = () => within(screen.getByTestId('workspace')).getAllByRole('region').map(el => el.getAttribute('aria-label')).filter(name => name?.startsWith('panel '));

const loading = { status: 'loading' as const, response: null, missing: [], completedAt: null, refetch: () => undefined };
const callsFor = (match: (drill: HwTimeDrill, enabled: boolean) => boolean) => data.level.mock.calls.filter(([drill, enabled]) => match(drill as HwTimeDrill, enabled as boolean));

describe('HW Time compare keeps the upper panels while drilling (#912)', () => {
  it('condition d: panel tabs name the selected Module and Motion without remounts', async () => {
    await renderPage();
    expect(screen.getByRole('tab', { name: 'Module별' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Module 구성' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    expect(await screen.findByRole('tab', { name: 'Module별 · PM2 선택' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Module PM2 구성' })).toBeTruthy();
    expect(mounts.get('hw-compare-summary')).toBe(1);
    expect(mounts.get('hw-compare-module')).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'segment Pump EQ-001 · H1' }));
    expect(await screen.findByRole('tab', { name: 'Module PM2 구성 · Pump 선택' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Module별 · PM2 선택' })).toBeTruthy();
    expect(mounts.get('hw-compare-summary')).toBe(1);
    expect(mounts.get('hw-compare-module')).toBe(1);

    cleanup();
    await renderPage('', 'en');
    expect(screen.getByRole('tab', { name: 'By Module' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    expect(await screen.findByRole('tab', { name: 'By Module · PM2 selected' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Module PM2 composition' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'segment Pump EQ-001 · H1' }));
    expect(await screen.findByRole('tab', { name: 'Module PM2 · Pump selected' })).toBeTruthy();
  });

  it('Module → Motion: the summary and the composition are not remounted; the detail is the only new chart', async () => {
    await renderPage('&drillModule=PM1');
    expect([...mounts.entries()]).toEqual([['hw-compare-summary', 1], ['hw-compare-module', 1]]);
    fireEvent.click(screen.getByRole('button', { name: 'segment Pump EQ-001 · H1' }));
    expect(searchParams().get('drillMotion')).toBe('Pump');
    expect(mounts.get('hw-compare-detail')).toBe(1);
    expect(mounts.get('hw-compare-summary')).toBe(1);
    expect(mounts.get('hw-compare-module')).toBe(1);
    // A sibling Motion keeps all three; so does going up and down again.
    fireEvent.click(screen.getAllByRole('button', { name: /^segment Vent EQ-001/ })[0]!);
    expect(searchParams().get('drillMotion')).toBe('Vent');
    expect([...mounts.values()]).toEqual([1, 1, 1]);
  });

  it('a missing lower input shows a waiting state in its own panel instead of removing it', async () => {
    await renderPage();
    expect(panelIds()).toEqual(['panel summary', 'panel module', 'panel detail', 'panel trend']);
    expect(within(screen.getByLabelText('panel module')).getByText('Module을 고르세요')).toBeTruthy();
    expect(within(screen.getByLabelText('panel detail')).getByText('Module을 고르세요')).toBeTruthy();
    cleanup();
    await renderPage('&drillModule=PM1');
    expect(within(screen.getByLabelText('panel detail')).getByText('Motion을 고르세요')).toBeTruthy();
    expect(screen.getByTestId('hw-compare-module-series')).toBeTruthy();
  });

  it('every panel has its own query and its own loading state', async () => {
    data.level.mockImplementation((drill: HwTimeDrill) => (drill.drillMotion === 'Pump' ? loading : done(fixtureFor(drill))));
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(screen.getByTestId('hw-compare-summary-categories')).toBeTruthy();
    expect(screen.getByTestId('hw-compare-module-categories')).toBeTruthy();
    expect(screen.queryByTestId('hw-compare-detail-categories')).toBeNull();
  });

  it('each panel projects only its own drill keys and queries only when its input exists', async () => {
    await renderPage('&drillModule=PM1');
    // Summary: never a Module or Motion. Composition: a Module, never a Motion. Detail: disabled until both exist.
    expect(callsFor(drill => drill.drillModule === undefined).every(([, enabled]) => enabled === true)).toBe(true);
    expect(callsFor(drill => drill.drillModule === 'PM1' && drill.drillMotion === undefined).length).toBeGreaterThan(0);
    expect(callsFor(drill => drill.drillMotion !== undefined).every(([, enabled]) => enabled === false)).toBe(true);
    expect(callsFor(drill => drill.drillModule === '' ).length).toBe(0);
  });

  it('a summary bar at any depth drills to that Module and clears Motion and row in one navigation', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    expect(searchParams().get('drillModule')).toBe('PM2');
    expect(searchParams().has('drillMotion')).toBe(false);
    expect(searchParams().has('row')).toBe(false);
    expect(window.history.length).toBe(before + 1);
  });

  it('the composition bar drills to a Motion', async () => {
    await renderPage('&drillModule=PM1');
    fireEvent.click(screen.getByRole('button', { name: 'segment Chuck EQ-001 · H1' }));
    expect(searchParams().get('drillMotion')).toBe('Chuck');
    expect(searchParams().get('drillModule')).toBe('PM1');
  });

  it('adding a trend row keeps the active tab: no reveal request, only the trend badge changes', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(screen.getByLabelText('panel trend').getAttribute('data-badge')).toBe('');
    fireEvent.click(screen.getAllByRole('button', { name: '추세에 추가 EQ-001 · H2' })[0]!);
    expect(screen.getByLabelText('panel trend').getAttribute('data-badge')).toBe('1');
    expect(screen.getByTestId('workspace').getAttribute('data-reveal')).toBe('null');
  });

  it('the Motion step shares the row between the composition and the detail; the Module step does not focus a row', async () => {
    await renderPage('&drillModule=PM1');
    expect(screen.getByTestId('hw-compare-module-active').textContent).toBe('undefined');
    cleanup();
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    expect(screen.getByTestId('hw-compare-module-active').textContent).toBe('EQ-001 · H2');
    expect(screen.getByTestId('hw-compare-detail-active').textContent).toBe('EQ-001 · H2');
  });
});
