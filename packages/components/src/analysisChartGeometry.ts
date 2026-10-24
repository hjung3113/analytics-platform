/** Each mark stays inside its category slot, including at very dense/empty grids. */
export function heatmapSymbolSize(plotWidth: number, plotHeight: number, xCount: number, yCount: number): [number, number] {
  return [xCount ? Math.max(0, plotWidth / xCount - 2) : 0, yCount ? Math.max(0, plotHeight / yCount - 2) : 0];
}

/** Plot grid margins (px) above and below the category rows; shared by the option and the row-pitch height/reveal maths. */
export const GRID_TOP = 16;
export const GRID_BOTTOM = 44;
/** WCAG 2.2 2.5.8 target size: the smallest row pitch (px) a horizontal chart may ask for. */
export const ROW_PITCH_MIN = 24;

/** The pitch actually used: below the minimum (or not a finite number) it is clamped. */
export function clampRowPitch(pitch: number): number {
  return Number.isFinite(pitch) ? Math.max(ROW_PITCH_MIN, pitch) : ROW_PITCH_MIN;
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
