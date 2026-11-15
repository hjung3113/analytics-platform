import { formatText, type Lang } from '@ap/kernel';
import type { CustomSeriesOption } from 'echarts/charts';
import type { ChartSeries } from './AnalysisChartFrame';
import type { ChartPalette } from './buildChartOption';
import { toMs } from './analysisChartShared';
import { COMPONENTS_MESSAGES } from '../messages';

export type ChartBounds = ReadonlyMap<string, { lower?: number; upper?: number }>;
export type ChartBoundLabels = { upper?: string; lower?: string; band?: string };
type Bound = ChartBounds extends ReadonlyMap<string, infer V> ? V : never;
type BoundPart = 'upper' | 'lower' | 'band';
export const BOUND_DASH = { upper: [8, 4], lower: [2, 4] };
export const BOUND_OPACITY = 0.12;
export type BoundSegment = Bound & { from: string; to: string; start: number; end: number };
export type BoundProjection = {
  segments: BoundSegment[];
  at: (x: string) => Bound;
  extent?: { min: number; max: number };
  parts: BoundPart[];
  labels: Required<ChartBoundLabels>;
};
type BoundInput = {
  bounds?: ChartBounds; boundLabels?: ChartBoundLabels; lang: Lang;
  horizontal: boolean; xType: 'time' | 'category'; categories: readonly string[];
  displayed: readonly ChartSeries[]; previousIds: ReadonlySet<string>;
};

/** One sorted projection for plot, tooltip, keyboard, table and export. Missing sides clear the preceding step. */
export function projectChartBounds(i: BoundInput): BoundProjection | undefined {
  if (!i.bounds || i.horizontal) return undefined;
  const order = new Map(i.categories.map((x, n) => [x, n]));
  const position = (x: string) => i.xType === 'time' ? toMs(x) : order.get(x) ?? NaN;
  const xs = i.xType === 'category' ? [...i.categories] : [...new Set(i.displayed.filter(s => !i.previousIds.has(s.id)).flatMap(s => s.points.map(([x]) => x)))].sort((a, b) => position(a) - position(b));
  const first = xs[0]; const last = xs.at(-1);
  const entries = [...i.bounds].map(([x, bound]) => ({ x, pos: position(x), bound: {
    ...(Number.isFinite(bound.lower) ? { lower: bound.lower } : {}),
    ...(Number.isFinite(bound.upper) ? { upper: bound.upper } : {}),
  } })).filter(e => Number.isFinite(e.pos)).sort((a, b) => a.pos - b.pos);
  const segments: BoundSegment[] = [];
  if (first !== undefined && last !== undefined) for (let n = 0; n < entries.length; n++) {
    const entry = entries[n]; const next = entries[n + 1];
    const start = Math.max(entry.pos, position(first)); const end = Math.min(next?.pos ?? position(last), position(last));
    if (end < start || (end === start && entry.pos !== position(last))) continue;
    segments.push({ ...entry.bound, from: start === entry.pos ? entry.x : first, to: next && end === next.pos ? next.x : last, start, end });
  }
  const values = segments.flatMap(s => [s.lower, s.upper].filter((v): v is number => v !== undefined));
  const at = (x: string): Bound => {
    const pos = position(x);
    if (!Number.isFinite(pos) || first === undefined || last === undefined || pos < position(first) || pos > position(last)) return {};
    let lo = 0; let hi = entries.length;
    while (lo < hi) { const mid = Math.floor((lo + hi) / 2); if (entries[mid].pos <= pos) lo = mid + 1; else hi = mid; }
    return entries[lo - 1]?.bound ?? {};
  };
  const parts: BoundPart[] = (['upper', 'lower', 'band'] as const).filter(part => segments.some(s => part === 'band' ? s.upper !== undefined && s.lower !== undefined : s[part] !== undefined));
  return { segments, at, parts, extent: values.length ? { min: Math.min(...values), max: Math.max(...values) } : undefined,
    labels: { upper: i.boundLabels?.upper ?? formatText(COMPONENTS_MESSAGES.chartUpperBound, i.lang), lower: i.boundLabels?.lower ?? formatText(COMPONENTS_MESSAGES.chartLowerBound, i.lang), band: i.boundLabels?.band ?? formatText(COMPONENTS_MESSAGES.chartBoundRange, i.lang) },
  };
}

/** No data dimensions: these overlays must neither extend x nor get discarded by Zoom when a step crosses its window. */
export function boundSeries(p: BoundProjection, palette: ChartPalette): CustomSeriesOption[] {
  const color = palette.theme.referenceLine.lineStyle.color;
  return p.parts.map(part => {
    const spans = p.segments.filter(s => part === 'band' ? s.lower !== undefined && s.upper !== undefined : s[part] !== undefined);
    return {
      id: `__bounds-${part}`, name: p.labels[part], type: 'custom', silent: true, animation: false, clip: true, z: part === 'band' ? 0 : 3,
      tooltip: { show: false }, encode: { x: -1, y: -1 }, data: spans.map((_, n) => n),
      renderItem: (params, api) => {
        const s = spans[params.dataIndex];
        const lower = part === 'band' ? s.lower! : s[part]!;
        const upper = part === 'band' ? s.upper! : lower;
        const a = api.coord([s.start, lower]); const b = api.coord([s.end, upper]);
        if (part === 'band') return { type: 'rect', shape: { x: a[0], y: Math.min(a[1], b[1]), width: b[0] - a[0], height: Math.abs(b[1] - a[1]) }, style: { fill: color, opacity: BOUND_OPACITY } };
        return { type: 'line', shape: { x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, style: { stroke: color, lineWidth: 1, lineDash: BOUND_DASH[part] } };
      },
    };
  });
}

export function boundText(p: BoundProjection, x: string, format: (v: number) => string) {
  const bound = p.at(x);
  return (['lower', 'upper'] as const).map(part => `${p.labels[part]}: ${bound[part] === undefined ? '' : format(bound[part]!)}`).join(' · ');
}
