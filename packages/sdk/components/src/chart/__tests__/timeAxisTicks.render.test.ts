// @vitest-environment node
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent } from 'echarts/components';
import { SVGRenderer } from 'echarts/renderers';
import { describe, expect, it } from 'vitest';
import { buildChartOption, resolveChartPalette, timeBucketStep } from '../buildChartOption';
import { baselineInput } from '../__fixtures__/baselineInput';

echarts.use([LineChart, BrushComponent, DataZoomComponent, GridComponent, MarkAreaComponent, MarkLineComponent, ToolboxComponent, TooltipComponent, SVGRenderer]);

const hour = 3_600_000;
const at = (x: string) => Date.parse(`${x}Z`);
const november = (h: number) => `2026-11-18T${String(h).padStart(2, '0')}:00:00`;
const threeHourly = [9, 12, 15, 18, 21].map(november);
const daily = ['17', '18', '19'].map(day => `2026-11-${day}T09:00:00`);
const monthly = ['01', '02', '03', '04'].map(month => `2026-${month}-01T09:00:00`);
const hourly = (start: string, count: number, step = 1) =>
  Array.from({ length: count }, (_, index) => new Date(at(start) + index * step * hour).toISOString().slice(0, 19));

describe('timeBucketStep', () => {
  it.each([
    { cadence: 'hourly', xs: [9, 10, 11].map(november), hours: 1 },
    { cadence: 'three-hour', xs: [18, 12, 9].map(november), hours: 3 },
    { cadence: 'daily', xs: daily, hours: 24 },
    { cadence: 'calendar month', xs: monthly, hours: 28 * 24 },
  ])('returns the smallest positive gap for $cadence data', ({ xs, hours }) => {
    expect(timeBucketStep([{ points: xs.map(x => [x, 1]) }])?.step).toBe(hours * hour);
  });

  it('returns no step for a single point', () => {
    expect(timeBucketStep([{ points: [[november(9), 1]] }]).step).toBeUndefined();
  });

  it('orders bucket boundaries across series and ignores duplicate x values', () => {
    expect(timeBucketStep([
      { points: [[november(15), 1], [november(9), 1]] },
      { points: [[november(12), null], [november(9), 2]] },
    ])).toEqual({ step: 3 * hour, boundaries: [9, 12, 15].map(november).map(at) });
  });
});

type TimeAxis = {
  getTicksCoords(): { tickValue: number }[];
  getViewLabels(): { tick: { value: number } }[];
  scale: { getExtent(): [number, number] };
};

function withTimeChart(
  xs: string[],
  check: (chart: echarts.EChartsType, readAxis: () => TimeAxis) => void,
  viewport?: { width: number; zoom?: readonly [number, number]; compareXs?: string[] },
) {
  const input = baselineInput({
    horizontal: false, stacked: false, xType: 'time', rowPitch: undefined, extremes: undefined, markLines: undefined,
    displayed: [
      { id: 'a', name: 'A', color: 'chart-blue', points: xs.map((x, index) => [x, index + 1]) },
      ...(viewport?.compareXs ? [{ id: 'b', name: 'B', color: 'chart-blue', points: viewport.compareXs.map((x, index): [string, number] => [x, index + 1]) }] as const : []),
    ],
    ...(viewport?.compareXs ? { previousIds: new Set(['b']) } : {}),
    ...(viewport ? { chartWidth: viewport.width, zoom: viewport.zoom ?? [0, 100] } : {}),
  });
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: viewport?.width ?? 800, height: 300 });
  try {
    chart.setOption({ ...buildChartOption({ ...input, palette: resolveChartPalette(input.displayed) }), animation: false, useUTC: true });
    const instance = chart as unknown as { getModel(): { getComponent(name: string): { axis: TimeAxis } } };
    check(chart, () => instance.getModel().getComponent('xAxis').axis);
  } finally {
    chart.dispose();
  }
}

function expectTicks(axis: TimeAxis, xs: string[]) {
  const expected = xs.map(at);
  expect(axis.getTicksCoords().map(tick => tick.tickValue)).toEqual(expected);
  expect(axis.getViewLabels().map(label => label.tick.value)).toEqual(expected);
}

describe('time-axis bucket ticks (#2579)', () => {
  it('anchors sparse hourly ticks at the first observed bucket at 320px', () => {
    const xs = [1, 2, 7, 13, 19].map(november);
    withTimeChart(xs, (_chart, readAxis) => {
      expectTicks(readAxis(), [1, 7, 13, 19].map(november));
    }, { width: 320 });
  });

  it('renders only the observed tick for a single bucket on an automatic extent', () => {
    const x = november(9);
    withTimeChart([x], (_chart, readAxis) => {
      expectTicks(readAxis(), [x]);
      const [min, max] = readAxis().scale.getExtent();
      expect(min).toBeLessThan(at(x));
      expect(max).toBeGreaterThan(at(x));
    });
  });

  it('keeps all eight three-hour catalog ticks across midnight at 1440px', () => {
    const xs = hourly(november(9), 8, 3);
    withTimeChart(xs, (_chart, readAxis) => expectTicks(readAxis(), xs), { width: 1440 });
  });

  it('uses two-hour ticks anchored at midnight for 24 hourly buckets at 1100px', () => {
    const xs = hourly('2026-11-25T11:00:00', 24);
    withTimeChart(xs, (chart, readAxis) => {
      expectTicks(readAxis(), hourly('2026-11-25T12:00:00', 12, 2));
      expect(chart.renderToSVGString()).toContain('>26</text>');
    }, { width: 1100 });
  });

  it('uses twelve-hour ticks for a week of hourly buckets at 1100px', () => {
    const xs = hourly('2026-11-25T00:00:00', 168);
    withTimeChart(xs, (_chart, readAxis) => {
      expectTicks(readAxis(), hourly(xs[0], 14, 12));
    }, { width: 1100 });
  });

  it('returns to hourly ticks when zoomed to six hourly buckets at 1100px', () => {
    const xs = hourly('2026-11-25T00:00:00', 168);
    withTimeChart(xs, (chart, readAxis) => {
      expectTicks(readAxis(), xs.slice(48, 54));
      const { xAxis } = chart.getOption() as { xAxis: { axisTick: { customValues: number[] }; axisLabel: { customValues: number[] } }[] };
      expect(xAxis[0].axisTick.customValues).toEqual(xs.slice(48, 54).map(at));
      expect(xAxis[0].axisLabel.customValues).toEqual(xs.slice(48, 54).map(at));
    }, { width: 1100, zoom: [47.5 / 167 * 100, 53.5 / 167 * 100] });
  });

  it('keeps the first-bucket phase when a midnight grid misses the three-hour buckets', () => {
    const xs = hourly(november(10), 24, 3);
    withTimeChart(xs, (_chart, readAxis) => {
      expectTicks(readAxis(), hourly(xs[0], 12, 6));
    }, { width: 1100 });
  });

  it('uses calendar months when fourteen-day ticks no longer fit', () => {
    const xs = hourly('2026-01-01T09:00:00', 365, 24);
    const expected = Array.from({ length: 12 }, (_, month) => new Date(Date.UTC(2026, month, 1, 9)).toISOString().slice(0, 19));
    withTimeChart(xs, (_chart, readAxis) => expectTicks(readAxis(), expected), { width: 1100 });
  });

  it('uses alternate calendar months for two years of monthly buckets at 1100px', () => {
    const xs = Array.from({ length: 24 }, (_, month) => new Date(Date.UTC(2026, month, 1, 9)).toISOString().slice(0, 19));
    withTimeChart(xs, (_chart, readAxis) => {
      expectTicks(readAxis(), xs.filter((_, index) => index % 2 === 0));
    }, { width: 1100 });
  });

  it.each([
    { cadence: 'three-hour', xs: threeHourly },
    { cadence: 'hourly', xs: [9, 10, 11, 12, 13].map(november) },
    { cadence: 'three-hour with a gap', xs: [9, 12, 18, 21].map(november) },
    { cadence: 'calendar month', xs: monthly },
  ])('renders tick marks and labels at $cadence data boundaries', ({ xs }) => {
    withTimeChart(xs, (_chart, readAxis) => expectTicks(readAxis(), xs));
  });

  it('keeps only whole multiples from the first bucket when later points are offset', () => {
    withTimeChart([9, 12, 15, 19, 22].map(november), (_chart, readAxis) => {
      expectTicks(readAxis(), [9, 12, 15].map(november));
    });
  });

  it('reanchors ticks at the first visible bucket when zoom exposes only offset buckets', () => {
    withTimeChart([9, 12, 15].map(november), (_chart, readAxis) => {
      expectTicks(readAxis(), [19, 22].map(november));
    }, { width: 1100, zoom: [9 / 13 * 100, 100], compareXs: [19, 22].map(november) });
  });

  it('falls back to visible buckets when the grid tick sits just outside the engine-rounded window (C3)', () => {
    const seconds = [0, 3, 6, 10, 13].map(sec => `1970-01-01T00:00:${String(sec).padStart(2, '0')}`);
    withTimeChart(seconds, (_chart, readAxis) => {
      expectTicks(readAxis(), seconds.slice(3));
    }, { width: 1100, zoom: [46.16, 100] });
  });

  it('reanchors a calendar grid when zoom exposes only off-phase months', () => {
    const xs = ['01', '04', '06'].map(month => `2026-${month}-01T09:00:00`);
    withTimeChart(xs, (_chart, readAxis) => {
      expectTicks(readAxis(), xs.slice(1));
    }, { width: 1100, zoom: [50, 100] });
  });

  it.each([
    { cadence: 'daily', xs: daily, labels: ['2026-11-17', '2026-11-18', '2026-11-19'] },
    { cadence: 'monthly', xs: monthly, labels: ['2026-01', '2026-02', '2026-03', '2026-04'] },
  ])('renders distinct calendar labels for $cadence buckets at 09:00', ({ xs, labels }) => {
    withTimeChart(xs, (chart) => {
      const svg = chart.renderToSVGString();
      for (const label of labels) expect(svg).toContain(`>${label}</text>`);
    });
  });

  it('retains bucket-aligned ticks after inside zoom with off-boundary endpoints', () => {
    withTimeChart(threeHourly, (chart, readAxis) => {
      expect(readAxis().scale.getExtent()).toEqual([at(november(9)), at(november(21))]);
      chart.dispatchAction({ type: 'dataZoom', start: 10, end: 65 });
      expect(readAxis().scale.getExtent()).toEqual([at(november(9)) + 1.2 * hour, at(november(9)) + 7.8 * hour]);
      expectTicks(readAxis(), [november(12), november(15)]);

      chart.dispatchAction({ type: 'dataZoom', start: 20, end: 31 });
      expectTicks(readAxis(), [november(12)]);
    });
  });
});

it('follows points edited in place under the same series array (no identity cache)', () => {
  const points: [string, number][] = [['2026-09-01T00:00:00', 1], ['2026-09-01T01:00:00', 2]];
  const series = [{ points }];
  expect(timeBucketStep(series).step).toBe(3_600_000);
  points[1] = ['2026-09-01T03:00:00', 2];
  expect(timeBucketStep(series).step).toBe(3 * 3_600_000);
});
