/** Each mark stays inside its category slot, including at very dense/empty grids. */
export function heatmapSymbolSize(plotWidth: number, plotHeight: number, xCount: number, yCount: number): [number, number] {
  return [xCount ? Math.max(0, plotWidth / xCount - 2) : 0, yCount ? Math.max(0, plotHeight / yCount - 2) : 0];
}
