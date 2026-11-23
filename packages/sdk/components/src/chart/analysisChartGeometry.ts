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
