import { formatText, type Lang } from '@ap/kernel';
import { COMPONENTS_MESSAGES } from '../messages';
import type { HistogramBin, HistogramSpec } from './AnalysisChart';
import { chartDiagnostic, type ChartRow } from './analysisChartData';
import type { KindProjection } from './analysisChartKinds';
import { percent } from './analysisChartShared';
import { buildHistogramOption } from './buildChartOption';
import { distinctStatuses, statusGlyph, statusText } from './chartStatus';

/** Allocation limit, including explicit counts. Width requests exceeding it are rejected, never widened. */
const MAX_BINS = 512;
const COUNT_TOLERANCE = 1e-9;
/** Division can put an exact decimal boundary a few ULPs below/above its integer bin index. */
const BOUNDARY_ULPS = 4;
const snapInteger = (value: number) => Math.abs(value - Math.round(value)) <= Number.EPSILON * Math.max(1, Math.abs(value)) * BOUNDARY_ULPS ? Math.round(value) : value;
/** Edge cleanup may move an edge by at most this share of the bin width, so it removes float noise but never reshapes bins. */
const EDGE_TOLERANCE = 1e-9;
/** Interior edges drop accumulated float noise (0.1 * 3 → 0.3) only when that moves them by a negligible share of the bin
 * width; otherwise the raw edge stays. Membership is then decided only against these emitted edges. */
const edge = (value: number, step: number) => {
  const rounded = Number(value.toPrecision(15));
  return Math.abs(rounded - value) <= step * EDGE_TOLERANCE ? rounded : value;
};
const invalid = (message: string): HistogramBin[] => { chartDiagnostic(`histogram: ${message}`); return []; };

export function histogramBins(spec: HistogramSpec): HistogramBin[] {
  if ((spec.bins !== undefined) === (spec.values !== undefined)) return invalid('provide exactly one of bins or values');
  if (spec.bins !== undefined) {
    if (spec.binning !== undefined) return invalid('binning only applies to values');
    let previousEnd = -Infinity;
    return spec.bins.flatMap(bin => {
      const count = Math.round(bin.count);
      if (![bin.start, bin.end, bin.count].every(Number.isFinite) || bin.start >= bin.end || bin.start < previousEnd
        || bin.count < 0 || !Number.isSafeInteger(count) || Math.abs(bin.count - count) > COUNT_TOLERANCE) {
        chartDiagnostic('histogram: invalid or overlapping/out-of-order bin dropped'); return [];
      }
      previousEnd = bin.end;
      return [{ ...bin, count }];
    });
  }
  const { width, count, domain } = spec.binning ?? {};
  if (width !== undefined && count !== undefined) return invalid('provide width or count, not both');
  if (width !== undefined && (!Number.isFinite(width) || width <= 0)) return invalid('width must be finite and positive');
  if (count !== undefined && (!Number.isSafeInteger(count) || count <= 0)) return invalid('count must be a positive safe integer');
  if (domain && (!domain.every(Number.isFinite) || domain[0] >= domain[1])) return invalid('domain must be finite and increasing');
  const values = spec.values!.filter(value => Number.isFinite(value) && (!domain || (value >= domain[0] && value <= domain[1])));
  if (values.length !== spec.values!.length) chartDiagnostic('histogram: non-finite or out-of-domain values dropped');
  if (!values.length) return [];
  let min = domain?.[0] ?? Infinity; let max = domain?.[1] ?? -Infinity;
  if (!domain) for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  const single = min === max;
  if (single) {
    const span = width ?? Math.max(1, Math.abs(min) * Number.EPSILON * 2);
    min -= span / 2; max += span / 2;
  }
  const span = max - min;
  if (!Number.isFinite(span) || span <= 0) return invalid('domain span is not representable');
  const defaultCount = single ? 1 : Math.ceil(Math.log2(values.length) + 1);
  let requested = count ?? defaultCount;
  if (width !== undefined) requested = single ? 1 : Math.ceil(snapInteger(span / width));
  if (width !== undefined && requested > MAX_BINS) return invalid('width requires more than 512 bins');
  const size = Math.max(1, Math.min(MAX_BINS, requested));
  if (count !== undefined && count > MAX_BINS) chartDiagnostic('histogram: count clamped to 512');
  const step = width ?? span / size;
  const edges = Array.from({ length: size + 1 }, (_, i) => i === 0 ? min : edge(min + i * step, step));
  // Count mode and the centred single-value bin end exactly at max; width mode adds one bin when float rounding left max
  // outside the last edge.
  if (width === undefined || single) edges[size] = max;
  else if (edges[size] < max) {
    if (size + 1 > MAX_BINS) return invalid('width requires more than 512 bins');
    edges.push(edge(min + (size + 1) * step, step));
  }
  const bins = edges.slice(1).map((end, i) => ({ start: edges[i], end, count: 0 }));
  if (bins.some(bin => !Number.isFinite(bin.end) || bin.start >= bin.end)) return invalid('bin boundaries are not representable');
  const last = bins.length - 1;
  for (const value of values) {
    // Arithmetic estimate, then corrected so every counted value lies in its advertised [start, end) (last bin closed).
    let i = Math.max(0, Math.min(last, Math.floor(snapInteger((value - min) / step))));
    while (i > 0 && value < bins[i].start) i--;
    while (i < last && value >= bins[i].end) i++;
    bins[i].count++;
  }
  return bins;
}

/** The same validated bins and once-evaluated consumer statuses feed every output. */
export function histogramData(spec: HistogramSpec, lang: Lang): KindProjection {
  const bins = histogramBins(spec);
  const total = bins.reduce((sum, bin) => sum + bin.count, 0);
  const rows: ChartRow[] = bins.map(bin => ({ key: JSON.stringify(['histogram', bin.start, bin.end]),
    label: `${bin.start}–${bin.end}`, value: bin.count, share: total ? bin.count / total * 100 : 0,
    status: spec.binStatus?.(bin), color: 'chart-series-1' }));
  const statuses = distinctStatuses(rows.map(row => row.status));
  const hasStatuses = statuses.length > 0;
  const text = (key: keyof typeof COMPONENTS_MESSAGES) => formatText(COMPONENTS_MESSAGES[key], lang);
  const count = text('chartHistogramCount');
  const headers = [`${text('chartHistogramStart')} (${spec.xUnit})`, `${text('chartHistogramEnd')} (${spec.xUnit})`, count, text('chartHistogramShare')];
  return {
    rows, total, empty: !bins.length,
    summary: formatText(COMPONENTS_MESSAGES.chartHistogramSummary, lang, { bins: bins.length, total, xLabel: spec.xLabel, xUnit: spec.xUnit }),
    headers: [...headers, ...(hasStatuses ? [text('chartHeaderStatus')] : [])],
    tableValues: bins.map((bin, i) => [`${bin.start} ${spec.xUnit}`, `${bin.end} ${spec.xUnit}`, String(bin.count), percent(rows[i].share!), ...(hasStatuses ? [statusText(rows[i].status)] : [])]),
    csvHeaders: [...headers, ...(hasStatuses ? [text('chartHeaderStatus'), text('chartHeaderReason')] : [])],
    csvValues: bins.map((bin, i) => { const status = rows[i].status; return [bin.start, bin.end, bin.count, rows[i].share!, ...(hasStatuses ? [status ? `${statusGlyph(status)} ${status.label}` : '', status?.reason ?? ''] : [])]; }),
    legend: [{ label: count, color: 'chart-series-1', symbol: 'rect' }, ...statuses.map(status => ({ label: status.label, color: 'chart-series-1' as const, symbol: 'rect', status }))],
    seriesKeys: [[], []],
    option: () => buildHistogramOption({ spec, bins, rows, countLabel: count }),
  };
}
