import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { House } from 'lucide-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider, PlatformProvider, createRegistry } from '@ap/kernel';
import { noContext, testAdapter, testSession, testSpace } from '@ap/kernel/testing';
import { groupId, spaceId } from '@ap/contracts';
import { AnalysisChartFrame, type AnalysisChartFrameProps, type ChartPoint, type ChartSeries } from '../AnalysisChartFrame';
import { equalSeriesIds, laneLayout, seriesExtremes, LANE_GAP_RATIO, NOMINAL_LANE_WIDTH } from '../chartLanes';
import type { EChartProps } from '../EChart';

vi.mock('../EChartImpl', () => ({ default: FakePlot }));

type Plotted = { id?: string; type?: string; stack?: string; silent?: boolean; tooltip?: { show?: boolean }; emphasis?: { disabled?: boolean }; itemStyle?: { color?: string }; data?: unknown[] };
type Option = { series: Plotted[]; grid: { right: number }; xAxis: { axisLabel?: { show?: boolean }; name?: string; max?: number }; yAxis: { data: string[] } };
let plotProps: EChartProps | null = null;
const option = () => plotProps!.option as unknown as Option;
const overlay = () => option().series.find(s => s.id === '__overlay') as unknown as { markLine?: { data: { name: string; xAxis: number; label: { width: number } }[] } };
function FakePlot(props: EChartProps) { plotProps = props; return <div role="img" aria-label={props.ariaLabel} />; }

const registry = createRegistry({
  spaces: [testSpace()], groups: [{ id: groupId('overview'), label: { ko: '개요', en: 'Overview' }, icon: House, space: spaceId('analytics') }],
  menus: [{ id: 'home', group: groupId('overview'), primary: true, label: { ko: '홈', en: 'Home' }, description: { ko: '', en: '' }, path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: noContext, pageType: 'analysis', features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [] }],
});
const session = testSession(['platform:view']);
const adapter = testAdapter({ session: () => session });
const ROWS = ['R1', 'R2', 'R3', 'R4'];
const line = (id: string, values: (number | null)[]): ChartSeries => ({ id, name: id.toUpperCase(), color: 'chart-blue', kind: 'bar', points: ROWS.map((x, i) => [x, values[i]]) });
// a has a null at R3, c is constant, d is hidden through visibleSeriesIds.
const SERIES = [line('a', [4, 2, null, 6]), line('b', [1, 3, 2, 5]), line('c', [2, 2, 2, 2]), line('d', [9, 9, 9, 9])];
const VISIBLE = ['a', 'b', 'c'];
async function mount(extra: Partial<AnalysisChartFrameProps> = {}) {
  window.history.replaceState(null, '', '/?v=1');
  const frame = (more: Partial<AnalysisChartFrameProps>) => <I18nProvider><PlatformProvider adapter={adapter} registry={registry}>
    <AnalysisChartFrame chartId="sa" title="Lanes" series={SERIES} visibleSeriesIds={VISIBLE} xType="category" orientation="horizontal" stacked unit="s" rowPitch={26} {...extra} {...more} />
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
const realSeries = () => option().series.filter(s => !s.id!.startsWith('__'));
const spacers = () => option().series.filter(s => s.id!.startsWith('__spacer'));

beforeEach(() => { plotProps = null; vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('laneLayout (#690o)', () => {
  it('sizes lanes by the series maximum, counts null as 0 and keeps an all-zero lane', async () => {
    const layout = laneLayout([line('a', [4, 2, null, 6]), line('z', [0, null, 0, 0]), line('b', [1, 3, 2, 5])], ROWS);
    expect(layout.lanes.map(l => l.width)).toEqual([6, 0, 5]);
    const gap = 11 * LANE_GAP_RATIO;
    expect(layout.gap).toBeCloseTo(gap);
    expect(layout.lanes.map(l => l.start)).toEqual([0, 6 + gap, 6 + 2 * gap].map(v => expect.closeTo(v, 6)));
    expect(layout.span).toBeCloseTo(11 + 2 * gap);
  });
});

describe('laneLayout zero-width lanes (#690o, D16)', () => {
  it('gives every lane a nominal width when all are 0, so the starts stay distinct', async () => {
    const layout = laneLayout([line('a', [0, null, 0, 0]), line('b', [null, null, null, null])], ROWS);
    expect(layout.lanes.map(l => l.width)).toEqual([NOMINAL_LANE_WIDTH, NOMINAL_LANE_WIDTH]);
    expect(layout.lanes[1].start).toBeGreaterThan(layout.lanes[0].start);
    expect(layout.span).toBeGreaterThan(0);
  });
});

describe('seriesExtremes (#690o)', () => {
  it('finds min and max rows per series, skipping null, rejected points, and series with < 2 measured rows or no spread', async () => {
    const reject = (point: ChartPoint) => point.x !== 'R4';
    const result = seriesExtremes([SERIES[0], SERIES[1], SERIES[2], line('lonely', [5, null, null, null])], reject);
    expect([...result.keys()]).toEqual(['a', 'b']);
    expect(result.get('a')).toEqual({ min: { x: 'R2', value: 2 }, max: { x: 'R1', value: 4 } });
    expect(result.get('b')).toEqual({ min: { x: 'R1', value: 1 }, max: { x: 'R2', value: 3 } });
  });
  it('skips a series with fewer than 2 measured rows and one whose measured values are all equal, and lists only the equal one', async () => {
    const series = [line('lonely', [5, null, null, null]), line('same', [2, 2, null, 2]), line('spread', [1, 2, 3, 4])];
    expect([...seriesExtremes(series).keys()]).toEqual(['spread']);
    expect([...equalSeriesIds(series)]).toEqual(['same']);
    // Rejected points do not count: only R1 is left measured.
    expect([...equalSeriesIds([line('x', [2, 2, 2, 2])], point => point.x === 'R1')]).toEqual([]);
  });
  it('handles a single-series detail', async () => {
    expect(seriesExtremes([line('only', [3, 9, 5, null])]).get('only')).toEqual({ min: { x: 'R1', value: 3 }, max: { x: 'R2', value: 9 } });
  });
});

describe('startAlign zero-width lanes in the option (#690o, D16)', () => {
  it('keeps a zero lane\'s name with a readable label budget', async () => {
    await mount({ series: [SERIES[0], line('z', [0, null, 0, 0]), SERIES[1]], visibleSeriesIds: ['a', 'z', 'b'], startAlign: true });
    const marks = overlay().markLine!.data;
    expect(marks.map(d => d.name)).toEqual(['A', 'Z', 'B']);
    expect(marks[1].label.width).toBeGreaterThanOrEqual(40);
  });
  it('keeps lane names and distinct starts on the axis when every visible lane is zero', async () => {
    await mount({ series: [line('p', [0, 0, 0, 0]), line('q', [null, null, null, null])], visibleSeriesIds: ['p', 'q'], startAlign: true });
    const marks = overlay().markLine!.data;
    expect(marks.map(d => d.name)).toEqual(['P', 'Q']);
    expect(marks[1].xAxis).toBeGreaterThan(marks[0].xAxis);
    expect(option().xAxis.max).toBeGreaterThan(marks[1].xAxis);
  });
});

describe('startAlign (#690o)', () => {
  it('inserts spacers with laneWidth(k-1) + gap - v(row, k-1), so each piece starts at its lane start in every row', async () => {
    await mount({ startAlign: true });
    const widths = [6, 5, 2];
    const gap = 13 * LANE_GAP_RATIO;
    const bars = realSeries();
    expect(bars.map(s => s.id)).toEqual(VISIBLE);
    expect(spacers().map(s => s.id)).toEqual(['__spacer-1', '__spacer-2']);
    const a = bars[0].data as (number | null)[]; const b = bars[1].data as (number | null)[];
    spacers()[0].data!.forEach((v, row) => expect(v).toBeCloseTo(widths[0] + gap - (a[row] ?? 0)));
    spacers()[1].data!.forEach((v, row) => expect(v).toBeCloseTo(widths[1] + gap - (b[row] ?? 0)));
    // Replay the stack in series order: the offset before piece k is laneStart(k) in every row.
    const starts = [0, widths[0] + gap, widths[0] + widths[1] + 2 * gap];
    ROWS.forEach((_, row) => {
      let offset = 0;
      option().series.filter(s => s.id !== '__overlay').forEach(s => {
        const real = bars.indexOf(s);
        if (real >= 0) { expect(offset).toBeCloseTo(starts[real]); }
        offset += (s.data![row] as number | null) ?? 0;
      });
    });
  });

  it('makes spacers silent, tooltip-hidden, emphasis-free and transparent, and keeps them out of the legend, selector and table', async () => {
    await mount({ startAlign: true, pointActivation: { on: 'click', onActivate: () => {} } });
    for (const s of spacers()) {
      expect(s).toMatchObject({ type: 'bar', stack: 'total', silent: true, tooltip: { show: false }, emphasis: { disabled: true }, itemStyle: { color: 'transparent' } });
    }
    const picker = screen.getByRole('combobox', { name: '차트 지점 선택' });
    expect(within(picker).getAllByRole('option').map(o => o.textContent).join('|')).not.toMatch(/spacer/i);
    expect(screen.queryByText(/__spacer/)).toBeNull();
    expect((await tableText()).join('|')).not.toMatch(/spacer/i);
  });

  it('shows lane names instead of axis numbers and unit, with separators at lane starts', async () => {
    await mount({ startAlign: true });
    expect(option().xAxis.axisLabel).toEqual({ show: false });
    expect(option().xAxis.name).toBeUndefined();
    expect(overlay().markLine!.data.map(d => d.name)).toEqual(['A', 'B', 'C']);
    expect(overlay().markLine!.data.map(d => d.xAxis)).toEqual([0, expect.closeTo(6.26, 5), expect.closeTo(11.52, 5)]);
  });

  it('leaves the Frame output unchanged without startAlign', async () => {
    await mount();
    expect(spacers()).toEqual([]);
    expect(option().xAxis.name).toBe('s');
    expect(option().xAxis.axisLabel).toBeUndefined();
    expect(overlay().markLine).toBeUndefined();
    expect(realSeries().map(s => s.data)).toEqual([[4, 2, null, 6], [1, 3, 2, 5], [2, 2, 2, 2]]);
  });

  it('keeps table values identical with and without it', async () => {
    const off = await mount(); const withoutAlign = await tableText(); off.unmount();
    await mount({ startAlign: true });
    expect(await tableText()).toEqual(withoutAlign);
  });

  it('recomputes lanes from the visible series', async () => {
    const view = await mount({ startAlign: true });
    view.update({ visibleSeriesIds: ['a', 'c'] });
    expect(realSeries().map(s => s.id)).toEqual(['a', 'c']);
    expect(spacers()).toHaveLength(1);
    expect(overlay().markLine!.data.map(d => d.name)).toEqual(['A', 'C']);
  });

  it('turns Brush off with a reason and stops advertising brushing', async () => {
    await mount({ startAlign: true });
    const brush = screen.getByRole('button', { name: '구간 선택' }) as HTMLButtonElement;
    expect(brush.disabled).toBe(true);
    expect(brush.title).toContain('시작 위치 맞춤');
    expect(screen.getByRole('region', { name: '선택 요약' }).textContent).not.toContain('구간 선택으로');
  });

  it('does nothing with fewer than 2 visible series: normal value axis and unit, Brush stays, no warning', async () => {
    await mount({ startAlign: true, visibleSeriesIds: ['a'] });
    expect(spacers()).toEqual([]);
    expect(option().xAxis.name).toBe('s');
    expect(option().xAxis.axisLabel).toBeUndefined();
    expect(overlay().markLine).toBeUndefined();
    expect((screen.getByRole('button', { name: '구간 선택' }) as HTMLButtonElement).disabled).toBe(false);
    expect(console.warn).not.toHaveBeenCalled();
  });

  it('warns and does nothing outside horizontal stacked', async () => {
    await mount({ startAlign: true, stacked: false });
    expect(spacers()).toEqual([]);
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('startAlign'));
    expect((screen.getByRole('button', { name: '구간 선택' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe.each([[false], [true]])('minMax with startAlign=%s (#690o)', align => {
  const item = (id: string, row: string) => (realSeries().find(s => s.id === id)!.data![ROWS.indexOf(row)]) as { itemStyle?: { borderWidth: number; borderColor: string; shadowBlur?: number }; label?: { show: boolean; formatter: string } } | number | null;

  it('outlines each series\' min and max segment thickly with a 최소/최대 label, and nothing else', async () => {
    await mount({ startAlign: align, minMax: true, isPointSelectable: (point: ChartPoint) => point.x !== 'R4' });
    expect(item('a', 'R2')).toMatchObject({ itemStyle: { borderWidth: 3 }, label: { show: true, formatter: '최소' } });
    expect(item('a', 'R1')).toMatchObject({ itemStyle: { borderWidth: 3 }, label: { show: true, formatter: '최대' } });
    expect(item('b', 'R1')).toMatchObject({ label: { formatter: '최소' } });
    expect(item('b', 'R2')).toMatchObject({ label: { formatter: '최대' } });
    const min = (item('a', 'R2') as { itemStyle: { borderColor: string } }).itemStyle.borderColor;
    const max = (item('a', 'R1') as { itemStyle: { borderColor: string } }).itemStyle.borderColor;
    expect(min).not.toBe(max);
    expect(item('a', 'R3')).toBeNull();
    expect(item('a', 'R4')).toBe(6); // rejected point: neither min nor max
    expect(realSeries().find(s => s.id === 'c')!.data).toEqual([2, 2, 2, 2]);
  });

  it('puts each label on a chip (surface background, emphasis border) and places it by mode, reserving right room', async () => {
    await mount({ startAlign: align, minMax: true });
    const label = (row: string) => (item('a', row) as { label: Record<string, unknown> }).label;
    for (const row of ['R2', 'R4']) {
      expect(label(row)).toMatchObject({ backgroundColor: expect.any(String), borderWidth: 1, padding: expect.any(Array) });
    }
    expect(label('R2').borderColor).not.toBe(label('R4').borderColor);
    expect(label('R2').position).toBe('right');
    expect(label('R4').position).toBe(align ? 'insideRight' : 'right');
    expect(option().grid.right).toBeGreaterThan(20);
  });

  it('keeps the normal right margin when min/max is off', async () => {
    await mount({ startAlign: align });
    expect(option().grid.right).toBe(20);
  });

  it('states all values equal for the selected constant series, in the summary and the picker', async () => {
    await mount({ startAlign: align, minMax: true, visibleSeriesIds: ['c'], pointActivation: { on: 'click', onActivate: () => {} } });
    expect(screen.getByRole('region', { name: '선택 요약' }).textContent).toContain('C: 모든 값이 같음');
    const options = within(screen.getByRole('combobox', { name: '차트 지점 선택' })).getAllByRole('option').map(o => o.textContent);
    expect(options[0]).toContain('모든 값이 같음');
    expect(item('c', 'R1')).toBe(2);
  });

  it('keeps the row focus cue next to the min/max outline', async () => {
    await mount({ startAlign: align, minMax: true, activeCategory: 'R2' });
    expect(item('a', 'R2')).toMatchObject({ itemStyle: { borderWidth: 3, shadowBlur: 6 } });
    expect(item('c', 'R2')).toMatchObject({ itemStyle: { borderWidth: 2 } });
    expect(item('c', 'R3')).toBe(2);
  });

  it('is absent when off, and names min and max for the keyboard picker and the selection summary', async () => {
    const view = await mount({ startAlign: align, pointActivation: { on: 'click', onActivate: () => {} } });
    expect(item('a', 'R2')).toBe(2);
    view.update({ minMax: true });
    const options = within(screen.getByRole('combobox', { name: '차트 지점 선택' })).getAllByRole('option').map(o => o.textContent);
    expect(options.find(t => t!.startsWith('R2 · A'))).toContain('최소');
    expect(options.find(t => t!.startsWith('R4 · A'))).toContain('최대');
    expect(screen.getByRole('region', { name: '선택 요약' }).textContent).toContain('A: 최소 R2 2 · 최대 R4 6');
  });
});
