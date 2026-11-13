import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { readColorToken } from '@ap/ui/theme';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartSeries } from '../AnalysisChartFrame';
import { laneLayout } from '../chartLanes';
import type { EChartProps } from '../EChart';

vi.mock('../EChartImpl', () => ({ default: FakePlot }));

type Label = { show?: boolean; color?: string; formatter?: unknown; offset?: number[] };
type Datum = number | null | { value: unknown; label?: Label; symbol?: string; tip?: string };
type Plotted = { id?: string; type?: string; label?: Label & { formatter?: (p: { value: unknown }) => string }; data?: Datum[]; tooltip?: unknown };
type Option = { series: Plotted[]; grid: { right: number } };
let plotProps: EChartProps | null = null;
const option = () => plotProps!.option as unknown as Option;
const bySeries = (id: string) => option().series.find(s => s.id === id)!;
const total = () => bySeries('__total');
const overlay = () => option().series.find(s => s.id === '__overlay') as unknown as { markLine?: { data: { name: string }[] } };
function FakePlot(props: EChartProps) { plotProps = props; return <div role="img" aria-label={props.ariaLabel} />; }

const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('mars') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: true }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const ROWS = ['R1', 'R2', 'R3', 'R4'];
const bar = (id: string, color: ChartSeries['color'], values: (number | null)[]): ChartSeries => ({ id, name: id.toUpperCase(), color, kind: 'bar', points: ROWS.map((x, i) => [x, values[i]]) });
// Wide segments in R1 and R4; a tiny one (a/R2), a zero (b/R2) and a null (a/R3).
const SERIES = [bar('a', 'chart-blue', [800, 20, null, 600]), bar('b', 'chart-series-1', [100, 0, 200, 400])];
async function mount(extra: Partial<AnalysisChartFrameProps> = {}) {
  window.history.replaceState(null, '', '/?v=1');
  const frame = (more: Partial<AnalysisChartFrameProps>) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisChartFrame chartId="vl" title="Labels" series={SERIES} xType="category" orientation="horizontal" stacked unit="s" rowPitch={26} {...extra} {...more} />
  </PlatformProvider></I18nProvider>;
  const view = render(frame({}));
  await screen.findByRole('img');
  return { ...view, update: (more: Partial<AnalysisChartFrameProps>) => view.rerender(frame(more)) };
}
const tableText = async () => {
  fireEvent.click(screen.getByRole('button', { name: '더보기' }));
  fireEvent.click(await screen.findByText('같은 데이터를 표로 보기'));
  return screen.getAllByRole('row').map(row => row.textContent);
};
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => { plotProps = null; warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('valueLabels unset (#580d)', () => {
  it('adds no labels, no total series and no label margin, whatever the new props say (the main-derived option is pinned in buildChartOption.baseline.test.ts)', async () => {
    await mount({ reaggregation: 'sum', serverTotals: new Map([['R1', 1]]) });
    const o = option();
    expect(o.grid.right).toBe(20);
    expect(o.series.some(s => s.id === '__total' || s.label !== undefined)).toBe(false);
    expect(bySeries('a').data).toEqual([800, 20, null, 600]);
  });
  it('ignores valueLabels outside a horizontal stacked chart, with a dev warning', async () => {
    await mount({ valueLabels: 'both', stacked: false, reaggregation: 'sum' });
    expect(option().series.some(s => s.id === '__total' || s.label !== undefined)).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('valueLabels applies only'));
  });
});

describe('segment labels (#580d, UX-6/12/13)', () => {
  it('puts the short number inside, shows nothing for null, and leaves the fit to ECharts\' resolved geometry (chartValueLabels.render.test.ts)', async () => {
    await mount({ valueLabels: 'segment' });
    const a = bySeries('a') as Plotted & { labelLayout?: unknown };
    expect(a.label).toMatchObject({ show: true, position: 'inside' });
    expect(a.label!.formatter!({ value: 12345 })).toContain(',');
    expect(a.label!.formatter!({ value: null })).toBe('');
    expect(typeof a.labelLayout).toBe('function');
    expect(a.data).toEqual([800, 20, null, 600]);
  });
  it('colours the text per fill from the tokens', async () => {
    await mount({ valueLabels: 'segment' });
    expect(bySeries('a').label!.color).toBe(readColorToken('text-primary'));
    expect(bySeries('b').label!.color).toBe(readColorToken('text-on-accent'));
    expect(bySeries('a').label).not.toHaveProperty('backgroundColor');
  });
  it('puts a fill outside the supported set on a surface chip', async () => {
    await mount({ valueLabels: 'segment', series: [bar('a', 'chart-heat-div-0', [800, 20, null, 600]), bar('b', 'chart-series-1', [100, 0, 200, 400])] });
    expect(bySeries('a').label).toMatchObject({ color: readColorToken('text-primary'), backgroundColor: readColorToken('surface-card') });
  });
  it('lets a 최소/최대 chip replace the label of its own segment', async () => {
    await mount({ valueLabels: 'segment', minMax: true });
    const a = bySeries('a').data!;
    expect(a[0]).toMatchObject({ label: { show: true, formatter: '최대' } });
    expect(a[0]).not.toMatchObject({ label: { show: false } });
  });
  it('draws no segment label for exactly one shown series, with startAlign too (the totals stay)', async () => {
    await mount({ valueLabels: 'segment', startAlign: true, visibleSeriesIds: ['a'] });
    expect(bySeries('a').label).toBeUndefined();
    expect(option().series.some(s => s.id!.startsWith('__spacer'))).toBe(false);
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('startAlign'));
  });
  it.each(['segment', 'both'] as const)('draws no segment label for one shown series, valueLabels %s, and keeps the total', async valueLabels => {
    await mount({ valueLabels, reaggregation: 'sum', visibleSeriesIds: ['b'] });
    expect(bySeries('b').label).toBeUndefined();
    if (valueLabels === 'both') expect(total().data).toHaveLength(4);
  });
  it('keeps them inside the lane segments with startAlign', async () => {
    await mount({ valueLabels: 'segment', startAlign: true });
    expect(bySeries('a').label).toMatchObject({ show: true, position: 'inside' });
    expect(bySeries('b').label).toMatchObject({ show: true, position: 'inside' });
  });
});

describe('totals (#580d, UX-7/8)', () => {
  it('draws a row total for an additive measure and marks a row with a null as partial', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'sum' });
    const data = total().data as { value: [number, string]; label: { formatter: string; offset: number[] }; symbol?: string; tip?: string }[];
    expect(data.map(d => d.value[1])).toEqual(ROWS);
    expect(data[0].label.formatter).toBe('900');
    expect(data[0].symbol).toBeUndefined();
    expect(data[2]).toMatchObject({ symbol: 'diamond', tip: 'A 미측정', label: { formatter: '≥ 200' } });
    expect(data[2].label.formatter).not.toBe(data[0].label.formatter);
  });
  it('widens the right margin for the largest total', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'sum', series: [bar('a', 'chart-blue', [99999, 1, 1, 1])] });
    expect(option().grid.right).toBeGreaterThanOrEqual(20 + 6 * 8);
  });
  it('draws nothing per row for a measure that is not added and says so once', async () => {
    await mount({ valueLabels: 'both', reaggregation: 'ratioOfSums' });
    expect(option().series.some(s => s.id === '__total')).toBe(false);
    expect(screen.getAllByText('합계 없음 — 이 측정은 더하지 않습니다')).toHaveLength(1);
  });
  it('draws the server total for a measure that is not added while every series is shown', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'ratioOfSums', serverTotals: new Map([['R1', 0.5], ['R2', null]]) });
    const data = total().data as { value: [number, string]; label: { formatter: string } }[];
    expect(data.map(d => d.value[1])).toEqual(['R1']);
    expect(data[0].label.formatter).toBe('0.5');
    expect(screen.queryByText(/합계 없음/)).toBeNull();
  });
  it('drops the server total while a series is hidden: no per-row number and the one-line 합계 없음', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'ratioOfSums', serverTotals: new Map([['R1', 0.5]]), visibleSeriesIds: ['a'] });
    expect(option().series.some(s => s.id === '__total')).toBe(false);
    expect(screen.getAllByText('합계 없음 — 이 측정은 더하지 않습니다')).toHaveLength(1);
  });
  it('names the number 표시 합계 once while a series is hidden, in the line and in the table', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'sum', visibleSeriesIds: ['a'] });
    expect((total().data as { label: { formatter: string } }[])[0].label.formatter).toBe('800');
    expect(screen.getAllByText(/^표시 합계 —/)).toHaveLength(1);
    const rows = await tableText();
    expect(rows[0]).toContain('표시 합계');
  });
  it('writes the partial marker and the missing series into the table', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'sum' });
    const rows = await tableText();
    expect(rows[0]).toContain('합계');
    expect(rows[3]).toContain('≥ 200 (A 미측정)');
    expect(screen.getAllByText(/^◇ ≥ 합계/)).toHaveLength(1);
    expect(screen.getByText('◇ ≥ 합계: 미측정 계열이 있는 행의 합계')).toBeTruthy();
  });
  it('drops the partial note with partialTotalNote={false}', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'sum', partialTotalNote: false });
    expect(screen.queryByText(/^◇ ≥ 합계/)).toBeNull();
    expect(total().data).toHaveLength(4);
  });
  it.each(['sum', 'ratioOfSums'] as const)('says no 합계 없음 when every series is hidden (%s); the status sentence explains', async reaggregation => {
    await mount({ valueLabels: 'both', reaggregation, visibleSeriesIds: [] });
    expect(screen.queryByText(/합계 없음/)).toBeNull();
    expect(screen.getByText('표시할 시리즈를 모두 껐습니다')).toBeTruthy();
    expect(screen.getByRole('button', { name: '모두 보이기' })).toBeTruthy();
  });
  it('puts the totals in one fixed right column with startAlign', async () => {
    await mount({ valueLabels: 'both', reaggregation: 'sum', startAlign: true });
    const span = laneLayout(SERIES, ROWS).span;
    const xs = (total().data as { value: [number, string] }[]).map(d => d.value[0]);
    expect(new Set(xs)).toEqual(new Set([span]));
    expect(bySeries('a').label).toMatchObject({ show: true, position: 'inside' });
    // values are unchanged by startAlign
    expect((await tableText())[1]).toContain('900');
  });
  it('shifts a plain bar total clear of the 최소/최대 chip', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'sum' });
    const plain = (total().data as { label: { offset: number[] } }[])[0].label.offset[0];
    cleanup();
    await mount({ valueLabels: 'total', reaggregation: 'sum', minMax: true });
    const rows = total().data as { label: { offset: number[] } }[];
    // R1: series b is the stack end and is no extreme there; R4 is b's max, so its chip sits at the bar end.
    expect(rows[0].label.offset[0]).toBe(plain);
    expect(rows[3].label.offset[0]).toBeGreaterThan(plain);
  });
  it('still shifts a total whose chip segment ends at the stack end when a measured-zero series follows it', async () => {
    const zeroTail = [bar('a', 'chart-blue', [800, 300, 100, 50]), bar('b', 'chart-series-1', [0, 0, 0, 0])];
    await mount({ series: zeroTail, valueLabels: 'total', reaggregation: 'sum' });
    const plain = (total().data as { label: { offset: number[] } }[])[0].label.offset[0];
    cleanup();
    await mount({ series: zeroTail, valueLabels: 'total', reaggregation: 'sum', minMax: true });
    const rows = total().data as { label: { offset: number[] } }[];
    // a is max on R1 and min on R4; b (all zeros) is no extreme. The zero tail leaves a's end as the stack end.
    expect(rows[0].label.offset[0]).toBeGreaterThan(plain);
    expect(rows[3].label.offset[0]).toBeGreaterThan(plain);
    // R2/R3 carry no chip.
    expect(rows[1].label.offset[0]).toBe(plain);
    expect(rows[2].label.offset[0]).toBe(plain);
  });
  it('does not shift totals in startAlign even with 최소/최대 on', async () => {
    await mount({ valueLabels: 'total', reaggregation: 'sum', startAlign: true, minMax: true });
    const offsets = (total().data as { label: { offset: number[] } }[]).map(d => d.label.offset[0]);
    expect(new Set(offsets).size).toBeLessThanOrEqual(2);
    expect(Math.max(...offsets)).toBeLessThan(4 + 8 + 1);
  });
});

describe('Compare series count as series (F3)', () => {
  const previous = [bar('pa', 'chart-teal', [700, 10, 5, 500]), bar('pb', 'chart-series-2', [90, 1, 150, 300])];
  const compareOn = async (extra: Partial<AnalysisChartFrameProps>) => {
    const view = await mount({ compareSeries: previous, ...extra });
    fireEvent.click(await screen.findByRole('button', { name: '비교' }));
    return view;
  };
  it('names an additive total 표시 합계 when only a previous-period series is hidden', async () => {
    const all = ['a', 'b', 'pa', 'pb'];
    const view = await compareOn({ valueLabels: 'total', reaggregation: 'sum', visibleSeriesIds: all });
    expect(screen.queryByText(/^표시 합계 —/)).toBeNull();
    view.update({ visibleSeriesIds: ['a', 'b', 'pa'] });
    expect(screen.getAllByText(/^표시 합계 —/)).toHaveLength(1);
  });
  it('drops the server total when only a previous-period series is hidden', async () => {
    const serverTotals = new Map([['R1', 0.5]]);
    const view = await compareOn({ valueLabels: 'total', reaggregation: 'ratioOfSums', serverTotals, visibleSeriesIds: ['a', 'b', 'pa', 'pb'] });
    expect(total().data).toHaveLength(1);
    view.update({ visibleSeriesIds: ['a', 'b', 'pa'] });
    expect(option().series.some(s => s.id === '__total')).toBe(false);
    expect(screen.getAllByText('합계 없음 — 이 측정은 더하지 않습니다')).toHaveLength(1);
  });
});

describe('a server total follows the missing-segment policy (F2)', () => {
  it('marks a row with a null segment partial, names it, and draws nothing for an all-null row', async () => {
    const series = [bar('a', 'chart-blue', [null, 5, null, 1]), bar('b', 'chart-series-1', [0, 5, null, 2])];
    await mount({ series, valueLabels: 'total', reaggregation: 'ratioOfSums', serverTotals: new Map([['R1', 5], ['R2', 9], ['R3', 7]]) });
    const data = total().data as { value: [number, string]; symbol?: string; tip?: string; label: { formatter: string } }[];
    expect(data.map(d => d.value[1])).toEqual(['R1', 'R2']);
    expect(data[0]).toMatchObject({ symbol: 'diamond', tip: 'A 미측정', label: { formatter: '≥ 5' } });
    expect(data[1].symbol).toBeUndefined();
  });
});

describe('total text follows the current formatter (F7)', () => {
  it('rebuilds the text and the right margin when valueFormat changes,', async () => {
    const view = await mount({ valueLabels: 'total', reaggregation: 'sum', valueFormat: v => `${v}` });
    const text = () => (total().data as { label: { formatter: string } }[]).map(d => d.label.formatter);
    expect(text()).toEqual(['900', '20', '≥ 200', '1000']);
    const narrow = option().grid.right;
    view.update({ valueFormat: v => `${v} 초 합계 길게` });
    expect(text()[0]).toBe('900 초 합계 길게');
    expect(option().grid.right).toBeGreaterThan(narrow);
  });
  it('keeps the option identity when an unrelated render passes an equal formatter', async () => {
    const view = await mount({ valueLabels: 'total', reaggregation: 'sum', valueFormat: v => `${v}` });
    const before = plotProps!.option;
    view.update({ valueFormat: v => `${v}` });
    expect(plotProps!.option).toBe(before);
  });
});

describe('stacking a measure that is not additive (#580d, UX-9)', () => {
  it.each(['ratioOfSums', 'recomputeFromDistribution', 'none'] as const)('warns in development for %s', async reaggregation => {
    await mount({ reaggregation });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('not additive'));
  });
  it('warns once per misuse, not on every rerender or active-row change', async () => {
    const view = await mount({ reaggregation: 'ratioOfSums', valueLabels: 'total', activeCategory: 'R1', onActiveCategoryChange: () => {} });
    const count = () => warn.mock.calls.filter(c => String(c[0]).includes('not additive')).length;
    expect(count()).toBe(1);
    view.update({ activeCategory: 'R2', onActiveCategoryChange: () => {} });
    view.update({ activeCategory: 'R3', onActiveCategoryChange: () => {} });
    expect(count()).toBe(1);
    expect(warn.mock.calls.filter(c => String(c[0]).includes('without reaggregation')).length).toBe(0);
  });
  it('warns once for valueLabels without reaggregation and once for valueLabels outside a stacked chart', async () => {
    const view = await mount({ valueLabels: 'total', activeCategory: 'R1', onActiveCategoryChange: () => {} });
    view.update({ activeCategory: 'R2', onActiveCategoryChange: () => {} });
    expect(warn.mock.calls.filter(c => String(c[0]).includes('without reaggregation'))).toHaveLength(1);
    view.update({ stacked: false });
    view.update({ stacked: false, activeCategory: 'R3', onActiveCategoryChange: () => {} });
    expect(warn.mock.calls.filter(c => String(c[0]).includes('valueLabels applies only'))).toHaveLength(1);
  });
  it('does not warn for sum', async () => {
    await mount({ reaggregation: 'sum' });
    expect(warn).not.toHaveBeenCalledWith(expect.stringContaining('not additive'));
  });
});

describe('markLines unit and metricVersion (#580d, UX-14)', () => {
  const lines = [{ y: 100, label: '목표' }, { y: 5, label: '비율', unit: '%' }, { y: 7, label: '구버전', metricVersion: 'v1' }];
  it('does not draw a line in another unit or version and names it, once, outside the toolbar', async () => {
    await mount({ stacked: false, markLines: lines, metricVersion: 'v2' });
    expect(overlay().markLine!.data.map(d => d.name)).toEqual(['목표']);
    const note = screen.getByText('비율 기준선은 단위가 달라 표시하지 않음');
    expect(screen.getByText('구버전 기준선은 단위가 달라 표시하지 않음')).toBeTruthy();
    expect(note.closest('[role="toolbar"]')).toBeNull();
    expect(note.className).not.toContain('text-text-muted');
  });
  it('leaves a line alone when the fields are omitted or equal', async () => {
    await mount({ stacked: false, markLines: [{ y: 1, label: 'A' }, { y: 2, label: 'B', unit: 's', metricVersion: 'v2' }], metricVersion: 'v2' });
    expect(overlay().markLine!.data.map(d => d.name)).toEqual(['A', 'B']);
    expect(screen.queryByText(/기준선은 단위가 달라/)).toBeNull();
  });
  it('shows no note under startAlign, which draws no reference lines at all', async () => {
    await mount({ markLines: lines, startAlign: true });
    expect(overlay().markLine!.data.map(d => d.name)).toEqual(['A', 'B']);
    expect(screen.queryByText(/기준선은 단위가 달라/)).toBeNull();
  });
});
