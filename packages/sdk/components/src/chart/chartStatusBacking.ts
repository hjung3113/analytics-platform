import type { CustomSeriesOption } from 'echarts/charts';
import type { ChartOptionInput } from './buildChartOption';
import type { LaneLayout } from './chartLanes';
import { chartPointKey, statusBacking, statusBorderColor, statusRing, type ChartStatus } from './chartStatus';
import { toMs } from './analysisChartShared';

type RenderItem = Exclude<CustomSeriesOption['renderItem'], undefined | string>;
const BAR_MAX_WIDTH = 18;
const BAR_GAP = 0.1; // ECharts BarSeries' defaultBarGap.
const BORDER_WIDTH = 2;

/** A second stroke only where the native bar's severity border cannot contrast with its fill. */
export function barStatusBackingSeries(input: ChartOptionInput, statuses: ReadonlyMap<string, ChartStatus>, lanes: LaneLayout | null): CustomSeriesOption[] {
  if (!statuses.size) return [];
  const bars = input.displayed.filter(s => input.horizontal || s.kind === 'bar');
  const count = input.stacked ? 1 : bars.length;
  return bars.flatMap((series, slot) => {
    const n = input.displayed.indexOf(series);
    const pieces = series.points.flatMap(([x, value]) => {
      const status = statuses.get(chartPointKey({ seriesId: series.id, x }));
      if (!status || value === null || !Number.isFinite(value)) return [];
      const backing = statusBacking(status, input.palette.series[n].fill);
      if (!backing) return [];
      let start = 0;
      if (lanes) start = lanes.lanes[n].start;
      else if (input.stacked) for (const previous of bars.slice(0, slot)) {
        const v = previous.points.find(([category]) => category === x)?.[1];
        if (typeof v === 'number' && Number.isFinite(v) && (v >= 0) === (value >= 0)) start += v;
      }
      const category = input.xType === 'time' ? toMs(x) : input.categories.indexOf(x);
      return [{ category, start, end: start + value, backing, stroke: statusBorderColor(status, input.palette.series[n].fill) }];
    });
    if (!pieces.length) return [];
    const renderItem: RenderItem = (_params, api) => {
      const piece = pieces[Number(api.value(3))];
      const category = Number(api.value(0));
      const start = Number(api.value(1)); const end = Number(api.value(2));
      const layouts = api.barLayout!({ count, barMaxWidth: BAR_MAX_WIDTH, barMinWidth: 1, barGap: `${BAR_GAP * 100}%` });
      let layout: { width: number; offset: number } | undefined = layouts?.[input.stacked ? 0 : slot];
      if (!layout) {
        // Time axes do not expose barLayout. Use the same minimum interval, category gap and stack-count rule.
        const times = [...new Set(bars.flatMap(s => s.points.map(([x]) => toMs(x))))].sort((a, b) => a - b);
        const interval = Math.min(...times.slice(1).map((x, i) => x - times[i]));
        const band = Math.abs((api.size!([interval, 0]) as number[])[0]);
        const categoryGap = Math.max(35 - count * 4, 15) / 100;
        const width = Math.max(1, Math.min(BAR_MAX_WIDTH, band * (1 - categoryGap) / (count + (count - 1) * BAR_GAP)));
        const totalWidth = width * (count + (count - 1) * BAR_GAP);
        layout = { width, offset: -totalWidth / 2 + slot * width * (1 + BAR_GAP) };
      }
      const from = api.coord(input.horizontal ? [start, category] : [category, start]);
      const to = api.coord(input.horizontal ? [end, category] : [category, end]);
      // Native bar borders are inset by half their width; the stroke shares that centreline and the backing sits just inside it,
      // so neither crosses into a neighbouring piece (#2351).
      const length = input.horizontal ? Math.abs(to[0] - from[0]) : Math.abs(to[1] - from[1]);
      const border = Math.min(BORDER_WIDTH, layout.width, length);
      const backing = statusRing(Math.min(layout.width, length)).backing;
      const rect = (inset: number) => input.horizontal
        ? { x: Math.min(from[0], to[0]) + inset, y: from[1] + layout.offset + inset, width: Math.max(0, length - 2 * inset), height: Math.max(0, layout.width - 2 * inset) }
        : { x: from[0] + layout.offset + inset, y: Math.min(from[1], to[1]) + inset, width: Math.max(0, layout.width - 2 * inset), height: Math.max(0, length - 2 * inset) };
      return { type: 'group', children: [
        ...(backing ? [{ type: 'rect' as const, shape: rect(border + backing / 2), style: { fill: 'none', stroke: piece.backing, lineWidth: backing }, blur: { style: { opacity: 1 } } }] : []),
        { type: 'rect', shape: rect(border / 2), style: { fill: 'none', stroke: piece.stroke, lineWidth: border }, blur: { style: { opacity: 1 } } },
      ] };
    };
    return [{
      id: slot === 0 ? '__statusBarBacking' : `__statusBarBacking-${slot}`, type: 'custom', silent: true, animation: false, clip: true, z: 3,
      tooltip: { show: false }, ...(input.rightAxis && series.axis === 'right' ? { yAxisIndex: 1 } : {}),
      encode: input.horizontal ? { x: [1, 2], y: 0 } : { x: 0, y: [1, 2] },
      data: pieces.map((p, index) => [p.category, p.start, p.end, index]), renderItem,
    }];
  });
}
