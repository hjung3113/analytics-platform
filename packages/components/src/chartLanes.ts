/** Pure maths of the horizontal stacked bar's StartAlign lanes and of Show Min/Max. No ECharts, no React. */

type LaneSeries = { id: string; name: string; points: readonly (readonly [string, number | null])[] };

/**
 * The gap between two lanes, as a fraction of the summed lane widths. 2% keeps the lanes visibly apart without
 * stealing width from the bars: at a 600 px plot and five lanes the four gaps take about 8% of it.
 */
export const LANE_GAP_RATIO = 0.02;

export type LaneLayout = {
  /** One entry per visible series, in series order. */
  lanes: { id: string; name: string; start: number; width: number }[];
  /** `spacers[k - 1][row]` is the transparent width inserted before series k (k >= 1) in the same stack. */
  spacers: number[][];
  gap: number;
  /** Where the last lane ends: the value axis maximum. */
  span: number;
};

/** A missing value (`null`) and a non-positive one count as 0 width: they never move a later lane. */
const width = (value: number | null) => (value !== null && Number.isFinite(value) && value > 0 ? value : 0);

/** Lane k is as wide as the largest value of series k over the drawn rows; every row's piece k starts at that lane's left edge. */
export function laneLayout(series: readonly LaneSeries[], categories: readonly string[]): LaneLayout {
  const valueAt = (s: LaneSeries, x: string) => width(s.points.find(([label]) => label === x)?.[1] ?? null);
  const widths = series.map(s => Math.max(0, ...categories.map(x => valueAt(s, x))));
  const gap = widths.reduce((sum, w) => sum + w, 0) * LANE_GAP_RATIO;
  const starts: number[] = [];
  let at = 0;
  widths.forEach((w, k) => { starts[k] = at; at += w + gap; });
  const spacers = series.slice(1).map((_, i) => categories.map(x => widths[i] + gap - valueAt(series[i], x)));
  return { lanes: series.map((s, k) => ({ id: s.id, name: s.name, start: starts[k], width: widths[k] })), spacers, gap, span: series.length ? at - gap : 0 };
}

export type Extreme = { x: string; value: number };
export type SeriesExtremes = { min: Extreme; max: Extreme };

/**
 * Per series (category): the row with its smallest and the row with its largest value.
 * Excluded: `null` and non-finite values and points `selectable` rejects. A series with fewer than 2 measured rows,
 * or whose measured values are all equal (nothing to tell apart), has no entry. Ties keep the first row.
 */
export function seriesExtremes(series: readonly LaneSeries[], selectable?: (point: { x: string; seriesId: string; value: number | null }) => boolean): Map<string, SeriesExtremes> {
  const result = new Map<string, SeriesExtremes>();
  for (const s of series) {
    const seen = new Set<string>();
    const measured: Extreme[] = [];
    for (const [x, value] of s.points) {
      if (seen.has(x)) continue;
      seen.add(x);
      if (value === null || !Number.isFinite(value) || (selectable && !selectable({ x, seriesId: s.id, value }))) continue;
      measured.push({ x, value });
    }
    if (measured.length < 2) continue;
    const min = measured.reduce((a, b) => (b.value < a.value ? b : a));
    const max = measured.reduce((a, b) => (b.value > a.value ? b : a));
    if (min.value !== max.value) result.set(s.id, { min, max });
  }
  return result;
}
