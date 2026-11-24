import type { CustomSeriesOption } from 'echarts/charts';
import type { ChartOptionInput } from './buildChartOption';
import type { LaneLayout } from './chartLanes';
import { chartPointKey, statusBacking, statusBorderColor, statusRing, type ChartStatus } from './chartStatus';
import { toMs } from './analysisChartShared';
import { CHART_MARKS } from './chartMarks';

type RenderItem = Exclude<CustomSeriesOption['renderItem'], undefined | string>;
// The native bars' layout (CHART_ECHARTS_THEME), so each ring sits on its bar.
const { barMaxWidth: BAR_MAX_WIDTH, barGap, barCategoryGap } = CHART_MARKS;
const BAR_GAP = parseFloat(barGap) / 100;
const CATEGORY_GAP = parseFloat(barCategoryGap) / 100;
const HIGHLIGHT_WIDTH = 2;
// ECharts axisBand's fallback band for a single value on a time axis.
const SINGLE_TIME_BAND_RATIO = 0.8;

/**
 * The status ring of every status bar piece (#2351): a border inside the piece, plus a backing just inside it where the
 * border cannot contrast with the fill. Both are sized from the real piece by `statusRing`, so a thin piece keeps its fill;
 * the native bar draws no status border. Bar chip highlights use this geometry as a separate stroke.
 */
export function barStatusBackingSeries(input: ChartOptionInput, statuses: ReadonlyMap<string, ChartStatus>, lanes: LaneLayout | null, highlightedValues: ReadonlySet<string>, highlightedBarBorders: ReadonlyMap<string, number>): CustomSeriesOption[] {
  if (!statuses.size && !highlightedValues.size) return [];
  const bars = input.displayed.filter(s => input.horizontal || s.kind === 'bar');
  const count = input.stacked ? 1 : bars.length;
  const alignedByIndex = input.explicitStack && input.xType === 'time';
  const times = input.xType === 'time' ? [...new Set(bars.flatMap(s => s.points.map(([x]) => toMs(x))))].sort((a, b) => a - b) : [];
  const interval = times.reduce((min, x, index) => index === 0 ? min : Math.min(min, x - times[index - 1]), Infinity);
  return bars.flatMap((series, slot) => {
    const n = input.displayed.indexOf(series);
    const previousBars = bars.slice(0, slot);
    const pieces = series.points.flatMap(([x, value], index) => {
      const key = chartPointKey({ seriesId: series.id, x });
      const status = statuses.get(key);
      const highlighted = highlightedValues.has(x);
      if ((!status && !highlighted) || value === null || !Number.isFinite(value)) return [];
      const fill = input.palette.series[n].fill;
      const backing = status && statusBacking(status, fill);
      const stroke = status && statusBorderColor(status, fill);
      let start = 0;
      if (lanes) start = lanes.lanes[n].start;
      else if (input.stacked) for (const previous of previousBars) {
        const v = alignedByIndex ? previous.points[index]?.[1] : previous.points.find(([category]) => category === x)?.[1];
        if (typeof v === 'number' && Number.isFinite(v) && (v >= 0) === (value >= 0)) start += v;
      }
      const category = input.xType === 'time' ? toMs(x) : input.categories.indexOf(x);
      return [{ category, start, end: start + value, backing, stroke, highlighted, nativeBorder: highlightedBarBorders.get(key) ?? 0 }];
    });
    if (!pieces.length) return [];
    const renderItem: RenderItem = (params, api) => {
      const piece = pieces[Number(api.value(3))];
      const category = Number(api.value(0));
      const start = Number(api.value(1)); const end = Number(api.value(2));
      const layouts = api.barLayout!({ count, barMaxWidth: BAR_MAX_WIDTH, barMinWidth: 1, barGap, barCategoryGap });
      let layout: { width: number; offset: number } | undefined = layouts?.[input.stacked ? 0 : slot];
      if (!layout) {
        // Time axes do not expose barLayout. Use the same minimum interval and category gap.
        const singleTimeHighlight = highlightedValues.size > 0 && times.length === 1;
        let band: number;
        if (singleTimeHighlight) {
          const plot = params.coordSys;
          if (!plot || !('width' in plot) || typeof plot.width !== 'number') return;
          band = plot.width * SINGLE_TIME_BAND_RATIO;
        } else {
          band = Math.abs((api.size!([interval, 0]) as number[])[0]);
        }
        const width = Math.max(1, Math.min(BAR_MAX_WIDTH, band * (1 - CATEGORY_GAP) / (count + (count - 1) * BAR_GAP)));
        const totalWidth = width * (count + (count - 1) * BAR_GAP);
        const slotIndex = alignedByIndex || (input.stacked && highlightedValues.size > 0) ? 0 : slot;
        layout = { width, offset: -totalWidth / 2 + slotIndex * width * (1 + BAR_GAP) };
      }
      const { width, offset } = layout;
      const from = api.coord(input.horizontal ? [start, category] : [category, start]);
      const to = api.coord(input.horizontal ? [end, category] : [category, end]);
      const length = input.horizontal ? Math.abs(to[0] - from[0]) : Math.abs(to[1] - from[1]);
      const rect = (inset: number) => input.horizontal
        ? { x: Math.min(from[0], to[0]) + inset, y: from[1] + offset + inset, width: Math.max(0, length - 2 * inset), height: Math.max(0, width - 2 * inset) }
        : { x: from[0] + offset + inset, y: Math.min(from[1], to[1]) + inset, width: Math.max(0, width - 2 * inset), height: Math.max(0, length - 2 * inset) };
      // The status strokes stay inside their piece (#2351).
      const shortSide = Math.min(width, length);
      const { border, backing: ringBacking } = statusRing(shortSide);
      const backing = piece.backing ? ringBacking : 0;
      const children = [
        ...(piece.backing && backing ? [{ type: 'rect' as const, shape: rect(border + backing / 2), style: { fill: 'none', stroke: piece.backing, lineWidth: backing }, blur: { style: { opacity: 1 } } }] : []),
        ...(piece.stroke ? [{ type: 'rect' as const, ignore: !border, shape: rect(border / 2), style: { fill: 'none', stroke: piece.stroke, lineWidth: border }, blur: { style: { opacity: 1 } } }] : []),
      ];
      if (!piece.highlighted || !(shortSide > 0)) return { type: 'group', children };
      // Leave room for the existing cue and for the fill, even in a subpixel stack segment.
      const occupied = piece.stroke ? border + backing : piece.nativeBorder;
      const inset = Math.min(occupied, shortSide / 4);
      const lineWidth = Math.min(HIGHLIGHT_WIDTH, (shortSide - 2 * inset) / 4);
      return { type: 'group', children: [...children, {
        type: 'rect', shape: rect(inset + lineWidth / 2),
        style: { fill: 'none', stroke: input.palette.selection, lineWidth, lineDash: [4, 2] },
      }] };
    };
    return [{
      id: slot === 0 ? '__statusBarBacking' : `__statusBarBacking-${slot}`, type: 'custom', silent: true, animation: false, clip: true, z: 3,
      tooltip: { show: false }, ...(input.rightAxis && series.axis === 'right' ? { yAxisIndex: 1 } : {}),
      encode: input.horizontal ? { x: [1, 2], y: 0 } : { x: 0, y: [1, 2] },
      data: pieces.map((p, index) => [p.category, p.start, p.end, index]), renderItem,
    }];
  });
}
