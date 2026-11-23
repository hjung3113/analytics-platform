import type { ChartSeries } from './AnalysisChartFrame';

/** ECharts stacks time marks by index, so each kind needs a common ordered timeline. */
export function projectTimeStack(series: ChartSeries[]) {
  const reference = new Map<string, ChartSeries['points']>();
  let duplicate = false;
  let mismatched = false;
  const displayed = series.map(s => {
    const first = new Map<string, number | null>();
    for (const [x, value] of s.points) {
      if (first.has(x)) duplicate = true;
      else first.set(x, value);
    }
    const points = [...first].sort(([a], [b]) => a.localeCompare(b));
    const kind = s.kind ?? 'line';
    const timeline = reference.get(kind);
    if (!timeline) reference.set(kind, points);
    else if (timeline.length !== points.length || points.some(([x], n) => x !== timeline[n][0])) mismatched = true;
    return { ...s, points };
  });
  return { displayed, duplicate, mismatched };
}

export const SHARE_UNIT = '%';
export const SHARE_MAX = 100;

/** Normalize the measured values at each x. Scaling by the largest value keeps the total finite. */
export function projectStackShares(series: ChartSeries[]) {
  const largest = new Map<string, number>();
  const totals = new Map<string, number>();
  for (const item of series) {
    for (const [x, y] of item.points) {
      if (y === null) continue;
      if (y < 0) return { kind: 'negative' } as const;
      if (Number.isFinite(y)) largest.set(x, Math.max(largest.get(x) ?? 0, y));
    }
  }
  const normalized = (x: string, y: number | null) => {
    const scale = largest.get(x);
    return scale && y !== null && Number.isFinite(y) ? y / scale : null;
  };
  for (const item of series) {
    for (const [x, y] of item.points) totals.set(x, (totals.get(x) ?? 0) + (normalized(x, y) ?? 0));
  }
  const displayed = series.map(item => ({
    ...item, unit: SHARE_UNIT, points: item.points.map(([x, y]): ChartSeries['points'][number] => {
      const value = normalized(x, y);
      return [x, value === null ? null : (value / totals.get(x)!) * SHARE_MAX];
    }),
  }));
  return { kind: 'shares', displayed } as const;
}

/** Each mark stays inside its category slot, including at very dense/empty grids. */
export function heatmapSymbolSize(plotWidth: number, plotHeight: number, xCount: number, yCount: number): [number, number] {
  return [xCount ? Math.max(0, plotWidth / xCount - 2) : 0, yCount ? Math.max(0, plotHeight / yCount - 2) : 0];
}

/** Plot grid margins (px) above and below the category rows; shared by the option and the row-pitch height/reveal maths. */
export const GRID_TOP = 16;
export const GRID_BOTTOM = 44;
/** Row-pitch mode reserves this left gutter (px) for the category labels instead of containLabel, so the row band stays exactly rows × pitch. */
export const ROW_LABEL_GUTTER = 140;
const LABEL_GLYPH = 7;
const LABEL_WIDE_GLYPH = 12;
/** Axis label margin, the bold active row and the truncation room (the label is cut at gutter − 12). */
const LABEL_ROOM = 20;
const ROW_LABEL_MIN = 32;

/**
 * The plain-row gutter for `rowLabelWidth`: absent = `ROW_LABEL_GUTTER` (every existing chart), a number = that width (at least 32),
 * 'auto' = the longest label's estimated width, never wider than `ROW_LABEL_GUTTER`, so a label 'auto' cuts is one the default cuts too.
 */
export function rowLabelGutter(width: 'auto' | number | undefined, labels: readonly string[]): number {
  if (width === undefined) return ROW_LABEL_GUTTER;
  if (width !== 'auto') return Number.isFinite(width) ? Math.max(ROW_LABEL_MIN, width) : ROW_LABEL_GUTTER;
  const longest = Math.max(0, ...labels.map(text => [...text].reduce((w, ch) => w + (ch.codePointAt(0)! > 255 ? LABEL_WIDE_GLYPH : LABEL_GLYPH), 0)));
  return Math.min(ROW_LABEL_GUTTER, Math.max(ROW_LABEL_MIN, longest + LABEL_ROOM));
}
/** WCAG 2.2 2.5.8 target size: the smallest row pitch (px) a horizontal chart may ask for. */
export const ROW_PITCH_MIN = 24;

/** The pitch actually used: below the minimum (or not a finite number) it is clamped. */
export function clampRowPitch(pitch: number): number {
  return Number.isFinite(pitch) ? Math.max(ROW_PITCH_MIN, pitch) : ROW_PITCH_MIN;
}

/** Heatmap `minRowHeight` room (px) above and below the rows: both grid margins and the category-axis label gutter. */
const HEATMAP_AXIS_HEIGHT = 64;

/** Least canvas height of a heatmap with `minRowHeight`: every row at that floor plus the axis room. A `fill` plot shorter than this scrolls. */
export function heatmapMinCanvasHeight(rows: number, minRowHeight: number): number {
  return rows * minRowHeight + HEATMAP_AXIS_HEIGHT;
}

/** Full chart height in `rowPitch` mode: every row at its pitch plus the axis chrome. The frame scrolls this inside its viewport. */
export function rowPitchChartHeight(rows: number, pitch: number): number {
  return rows * clampRowPitch(pitch) + GRID_TOP + GRID_BOTTOM;
}

/**
 * The scrollTop that brings a row into view, or null when it already lies inside the window. Row `index` starts at
 * `GRID_TOP + index × pitch`, the same geometry the option uses; a hidden row is scrolled to the top edge.
 */
export function revealScrollTop(index: number, pitch: number, scrollTop: number, viewportHeight: number): number | null {
  const rowTop = GRID_TOP + index * pitch;
  return rowTop >= scrollTop && rowTop + pitch <= scrollTop + viewportHeight ? null : rowTop;
}

/** Dev-only misuse diagnostic of the frame's row-focus props. */
export function rowFocusDiagnostic(message: string) { if (process.env.NODE_ENV !== 'production') console.warn(`AnalysisChartFrame: ${message}`); }
