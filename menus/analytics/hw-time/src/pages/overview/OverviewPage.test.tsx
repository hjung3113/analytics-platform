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
    return <div data-testid="workspace" data-persist={props.persistKey} data-reveal={JSON.stringify(props.revealRequest ?? null)} data-mode={String(props.initialMode ?? 'fit')} data-compact={props.compactPreset ?? ''} data-layout={JSON.stringify(props.presets.map(p => p.layout))}>
      {props.panels.map(panel => <section key={panel.id} aria-label={`panel ${panel.id}`} data-badge={panel.badge ? panel.badge.count ?? '' : ''} data-tone={panel.badge?.tone ?? ''} data-primary={String(panel.primary === true)} data-badge-text={panel.badge ? (typeof panel.badge.description === 'string' ? panel.badge.description : panel.badge.description.ko) : ''}>{panel.render()}</section>)}
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
  const { default: OverviewPage } = await import('./OverviewPage');
  window.history.replaceState(null, '', `/hw-time/overview?v=1&scopeId=MEM&from=2026-09-19T09:00:00&to=2026-09-26T09:00:00${search}`);
  render(<I18nProvider><PlatformProvider adapter={adapter} registry={registry}><OverviewPage params={{}} /></PlatformProvider></I18nProvider>);
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

const panel = (id: string) => screen.getByLabelText(`panel ${id}`);

describe('HW Time overview page', () => {
  it('declares the manifest with the agreed keys', () => {
    const menu = manifests.find(item => item.id === 'hw-time-overview')!;
    expect(menu.path).toBe('/hw-time/overview');
    expect(menu.primary).toBeUndefined();
    expect(menu.label).toEqual({ ko: 'HW Time 개요', en: 'HW Time overview' });
    expect(menu.description).toEqual({ ko: '순위·현재 단계·문맥·상세·추세·범례를 한 화면에 쌓아 봅니다.', en: 'See ranking, current level, context, detail, trend and legend stacked on one screen.' });
    expect(menu.pageKeys).toEqual(['drillModule', 'drillMotion', 'trend', 'sort', 'row', 'minmax', 'align']);
    expect(menu.contextResetKeys).toEqual(['drillModule', 'drillMotion', 'trend', 'row']);
    expect(menu.group).toBe(manifests[0].group);
    expect(menu.permission).toBe(manifests[0].permission);
    expect(menu.context).toEqual(manifests[0].context);
    expect(menu.features).toEqual(manifests[0].features);
    expect(menu.drill?.levels).toEqual(manifests[0].drill?.levels);
    expect(menu.drill?.resetKeys).toEqual(['row']);
    const others = manifests.filter(item => item.id !== 'hw-time-overview').map(item => item.icon);
    expect(others).not.toContain(menu.icon);
  });

  it.each([
    ['', 'hw-overview-l1', ['panel ranking', 'panel level', 'panel trend', 'panel legend'], 'level'],
    ['&drillModule=PM1', 'hw-overview-l2', ['panel ranking', 'panel level', 'panel trend', 'panel legend'], 'level'],
    ['&drillModule=PM1&drillMotion=Pump', 'hw-overview-l3', ['panel ranking', 'panel context', 'panel detail', 'panel trend', 'panel legend'], 'detail'],
  ])('%s starts stacked, uses its own persistKey, and has the right panels and primary', async (query, key, panels, primary) => {
    await renderPage(query);
    expect(workspace().getAttribute('data-mode')).toBe('stack');
    expect(workspace().getAttribute('data-persist')).toBe(key);
    expect(panelIds()).toEqual(panels);
    expect(panels.filter(name => panel(name.slice(6)).getAttribute('data-primary') === 'true')).toEqual([`panel ${primary}`]);
    const presets = JSON.parse(workspace().getAttribute('data-layout')!);
    // The default arrangement is the first preset; the second is the compact one (see the next test).
    expect(presets).toHaveLength(2);
    // The analysis row comes first and is the larger one; trend | legend is the second row.
    expect(presets[0].sizes[0]).toBeGreaterThan(presets[0].sizes[1]);
    expect(presets[0].children.at(-1).children.map((child: { panels: string[] }) => child.panels[0])).toEqual(['trend', 'legend']);
  });

  it.each([
    ['', ['level', 'ranking', 'trend', 'legend']],
    ['&drillModule=PM1', ['level', 'ranking', 'trend', 'legend']],
    ['&drillModule=PM1&drillMotion=Pump', ['detail', 'context', 'ranking', 'trend', 'legend']],
  ])('%s: at narrow widths one tab group opens on the primary panel (compact preset)', async (query, order) => {
    await renderPage(query);
    expect(workspace().getAttribute('data-compact')).toBe('compact');
    const compact = JSON.parse(workspace().getAttribute('data-layout')!)[1];
    expect(compact).toEqual({ type: 'group', panels: order });
    const primary = panelIds().map(name => name!.slice(6)).find(id => panel(id).getAttribute('data-primary') === 'true');
    expect(compact.panels[0]).toBe(primary);
  });

  it('L3 first row is ranking | context | detail at 20/40/40; L1 and L2 are ranking | level at 25/75', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    const first = JSON.parse(workspace().getAttribute('data-layout')!)[0].children[0];
    expect(first.sizes).toEqual([20, 40, 40]);
    expect(first.children.map((child: { panels: string[] }) => child.panels[0])).toEqual(['ranking', 'context', 'detail']);
    cleanup();
    await renderPage('&drillModule=PM1');
    const level = JSON.parse(workspace().getAttribute('data-layout')!)[0].children[0];
    expect(level.sizes).toEqual([25, 75]);
    expect(level.children.map((child: { panels: string[] }) => child.panels[0])).toEqual(['ranking', 'level']);
  });

  it('L3 ranking ranks the context block (every Motion of the Module)', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(within(panel('ranking')).getAllByRole('listitem')).toHaveLength(50);
    expect(within(panel('ranking')).getAllByRole('listitem')[0]!.textContent).toMatch(/^1\./);
  });

  it('L3 draws every Motion in the context and only the selected Motion in the detail', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(JSON.parse(screen.getByTestId('hw-overview-L3-context-series').textContent!).map((s: { id: string }) => s.id)).toEqual(MOTIONS);
    expect(JSON.parse(screen.getByTestId('hw-overview-L3-detail-series').textContent!).map((s: { id: string }) => s.id)).toEqual(['Pump']);
  });

  it('stacked panels keep rowPitch 26', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    for (const id of ['hw-overview-L3-context', 'hw-overview-L3-detail']) expect(screen.getByTestId(`${id}-pitch`).textContent).toBe('26');
  });

  it.each(['context', 'detail'])('a row picked in the %s Frame sets row and both Frames get it as activeCategory', async side => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    expect(screen.getByTestId('hw-overview-L3-context-active').textContent).toBe('null');
    fireEvent.click(screen.getByRole('button', { name: `pick hw-overview-L3-${side} EQ-001 · H3` }));
    expect(searchParams().get('row')).toBe('EQ-001.H3');
    expect(screen.getByTestId('hw-overview-L3-context-active').textContent).toBe('EQ-001 · H3');
    expect(screen.getByTestId('hw-overview-L3-detail-active').textContent).toBe('EQ-001 · H3');
    expect(screen.getByTestId('hw-overview-L3-context-reveal').textContent).toBe('true');
    expect(screen.getByTestId('hw-overview-L3-detail-reveal').textContent).toBe('true');
  });

  it('a row restored from the URL is active; a malformed row is ignored', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    expect(screen.getByTestId('hw-overview-L3-detail-active').textContent).toBe('EQ-001 · H2');
    cleanup();
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=bogus');
    expect(screen.getByTestId('hw-overview-L3-detail-active').textContent).toBe('null');
  });

  it('adding a trend row writes the key, requests the trend panel and badges it; none at L1', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&trend=EQ-001.H1');
    expect(workspace().getAttribute('data-reveal')).toBe('null');
    expect(panel('trend').getAttribute('data-badge')).toBe('1');
    expect(panel('trend').getAttribute('data-badge-text')).toBe('추세에 1행');
    expect(screen.queryByRole('button', { name: '추세에 추가 EQ-001 · H1' })).toBeNull();
    expect(screen.getAllByRole('button', { name: '추세에서 제거 EQ-001 · H1' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole('button', { name: '추세에 추가 EQ-001 · H2' })[0]!);
    expect(searchParams().get('trend')).toBe('EQ-001.H1,EQ-001.H2');
    expect(JSON.parse(workspace().getAttribute('data-reveal')!)).toEqual({ panelId: 'trend', seq: 1 });
    expect(panel('trend').getAttribute('data-badge')).toBe('2');
    cleanup();
    await renderPage();
    expect(screen.queryByRole('button', { name: /추세에 추가|추세에서 제거/ })).toBeNull();
    expect(screen.getByText('행을 추가하세요')).toBeTruthy();
    expect(panel('trend').getAttribute('data-badge-text')).toBe('');
  });

  it.each([
    ['&drillModule=PM3&drillMotion=Pump', { detail: 9 }, ['ranking', 'context', 'trend', 'legend']],
    ['&drillModule=PM3', { level: 14 }, ['ranking', 'trend', 'legend']],
    ['', { level: 5 }, ['ranking', 'trend', 'legend']],
    ['&drillModule=PM1&drillMotion=Pump', {}, ['ranking', 'context', 'detail', 'trend', 'legend']],
  ])('%s: the unmeasured warning badge is on %j only, with the fixture\'s exact row count', async (query, warned, quiet) => {
    await renderPage(query);
    // Fixture: the L1 and L2 blocks carry unmeasured rows (PM3 at L1, PM3 at L2); at L3 only the PM3 detail does. PM1 has none.
    // Counts: L1 rows i % 5 === 0 of 24 = 5; PM3 L2 rows n % 7 === 0 of 96 data rows = 14; PM3 L3 detail rows n % 11 === 0 of 96 = 9 (auxiliary MEG rows excluded).
    for (const [id, count] of Object.entries(warned)) {
      expect(panel(id).getAttribute('data-tone')).toBe('warning');
      expect(panel(id).getAttribute('data-badge-text')).toBe(`일부 미측정 ${count}행`);
    }
    for (const id of quiet) expect(panel(id).getAttribute('data-tone')).toBe('');
  });

  it('the Inspector is a rail: 분석 대상 and 옵션 are icon buttons whose peek shows the content; the legend is not in it', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    for (const name of ['분석 대상', '옵션']) expect(screen.getByRole('button', { name })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /계층 범례/ })).toBeNull();
    expect(screen.queryByRole('checkbox', { name: '시작 위치 맞춤' })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '옵션' })); });
    expect(await screen.findByRole('checkbox', { name: '시작 위치 맞춤' })).toBeTruthy();
    expect(screen.queryByRole('checkbox', { name: '행 스크롤 보기' })).toBeNull();
    fireEvent.pointerDown(screen.getByRole('button', { name: '분석 대상' }));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '분석 대상' })); });
    expect(await screen.findByText('선택 24 · 평가 24')).toBeTruthy();
  });

  it('the minmax and align keys reach every stack panel', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&minmax=1&align=1');
    for (const id of ['hw-overview-L3-context', 'hw-overview-L3-detail']) expect(screen.getByTestId(`${id}-options`).textContent).toBe('align=true minmax=true');
    cleanup();
    await renderPage('&drillModule=PM1');
    expect(screen.getByTestId('hw-overview-L2-options').textContent).toBe('align=false minmax=false');
  });

  it('the legend panel hides a Motion in both stacks; hiding the selected Motion empties the detail', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    fireEvent.click(within(panel('legend')).getByRole('checkbox', { name: /Chuck/ }));
    expect(screen.getByTestId('hw-overview-L3-context-visible').textContent).toBe('Dechuck,Pump,Vent,Transfer');
    expect(screen.getByTestId('hw-overview-L3-detail-visible').textContent).toBe('Pump');
    fireEvent.click(within(panel('legend')).getByRole('checkbox', { name: /Pump/ }));
    expect(screen.getByTestId('hw-overview-L3-detail-visible').textContent).toBe('');
  });

  it.each([['', 'hw-overview-L1'], ['&drillModule=PM1', 'hw-overview-L2']])('the legend panel hides a series in the %s level stack', async (query, chart) => {
    await renderPage(query);
    const first = within(panel('legend')).getAllByRole('checkbox')[0]!;
    const before = screen.getByTestId(`${chart}-visible`).textContent!.split(',');
    fireEvent.click(first);
    expect(screen.getByTestId(`${chart}-visible`).textContent!.split(',')).toEqual(before.slice(1));
  });

  it('L1 and L2 drill by segment and clear the row in the same navigation', async () => {
    await renderPage('&drillModule=PM1&row=EQ-001.H3');
    fireEvent.click(screen.getByRole('button', { name: 'segment Dechuck EQ-001 · H3' }));
    expect(searchParams().get('drillMotion')).toBe('Dechuck');
    expect(searchParams().has('row')).toBe(false);
    cleanup();
    await renderPage('&row=EQ-001.H3');
    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    expect(searchParams().get('drillModule')).toBe('PM2');
    expect(searchParams().has('row')).toBe(false);
  });

  it('PM4 Vent says nothing is recorded and PM3 reads 미측정 in the summary', async () => {
    await renderPage('&drillModule=PM4&drillMotion=Vent');
    expect(screen.getByText('PM4 Module에는 Vent 동작 기록이 없습니다')).toBeTruthy();
    expect(screen.getByTitle('Module PM4 · Motion Vent · 기록 없음')).toBeTruthy();
    expect(panel('detail').getAttribute('data-tone')).toBe('');
    cleanup();
    await renderPage('&drillModule=PM3');
    expect(screen.getByText(/미측정 값이 있는 행 \d+개/)).toBeTruthy();
    expect(screen.getByTitle(/^Module PM3 · [\d,]+\.\d{2} 초 · 일부 미측정$/)).toBeTruthy();
  });

  it('going up through the breadcrumb clears the row in that one navigation', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    fireEvent.click(screen.getByRole('button', { name: 'pick hw-overview-L3-detail EQ-001 · H3' }));
    expect(searchParams().get('row')).toBe('EQ-001.H3');
    const before = window.history.length;
    fireEvent.click(screen.getByRole('button', { name: /Module: PM1/ }));
    expect(searchParams().has('row')).toBe(false);
    expect(searchParams().get('drillModule')).toBe('PM1');
    expect(window.history.length).toBe(before + 1);
  });

  it('the URL is the truth: Back to the path a row was picked on restores that row', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump');
    fireEvent.click(screen.getByRole('button', { name: 'pick hw-overview-L3-detail EQ-001 · H3' }));
    const pickedOn = window.location.search;
    fireEvent.click(screen.getByRole('button', { name: '전체' }));
    fireEvent.click(screen.getByRole('button', { name: 'segment PM2 EQ-001' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^segment Pump EQ-001/ })[0]!);
    expect(screen.getByTestId('hw-overview-L3-detail-active').textContent).toBe('null');
    fireEvent.click(screen.getByRole('button', { name: 'pick hw-overview-L3-detail EQ-001 · H1' }));
    // pick, Pump, PM2, 전체 are four entries after the entry the first row was picked on.
    act(() => { window.history.go(-4); });
    await waitFor(() => expect(window.location.search).toBe(pickedOn));
    expect(screen.getByTestId('hw-overview-L3-detail-active').textContent).toBe('EQ-001 · H3');
  });

  it('a URL row that does not belong to the current level shows no active row', async () => {
    await renderPage('&drillModule=PM1&row=EQ-001.H3');
    expect(screen.getByTestId('hw-overview-L2-active-shown').textContent).toBe('');
  });

  it('a non-drill write (the align option) keeps the row', async () => {
    await renderPage('&drillModule=PM1&drillMotion=Pump&row=EQ-001.H2');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '옵션' })); });
    fireEvent.click(await screen.findByRole('checkbox', { name: '시작 위치 맞춤' }));
    expect(searchParams().get('align')).toBe('1');
    expect(searchParams().get('row')).toBe('EQ-001.H2');
  });

  it.each([['', 'hw-overview-L1'], ['&drillModule=PM1', 'hw-overview-L2'], ['&drillModule=PM1&drillMotion=Pump', 'hw-overview-L3-detail']])('%s stack asks the Frame for segment and total labels over additive seconds', async (query, chart) => {
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
