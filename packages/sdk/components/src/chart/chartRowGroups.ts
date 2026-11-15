import type { CustomSeriesOption } from 'echarts/charts';
import { ROW_LABEL_GUTTER } from './analysisChartGeometry';
type RenderItem = Exclude<CustomSeriesOption['renderItem'], undefined | string>;
type RenderParams = Parameters<RenderItem>[0];
type RenderApi = Parameters<RenderItem>[1];

/** A reading aid only: the category remains the identity; no hierarchy, collapse or group values. */
export type ChartRowGroups = {
  /** Header in the keyboard table, selection summary and CSV. */
  header: string;
  /** Missing categories have an empty group; label replaces only the displayed row name. */
  byCategory: ReadonlyMap<string, { group: string; label?: string }>;
};
const LABEL_GAP = 12;
const LABEL_FONT = 11;
const GLYPH_WIDTH = 7;
const WIDE_GLYPH_WIDTH = 12;
const textWidth = (text: string) => [...text].reduce((width, ch) => width + (ch.codePointAt(0)! > 255 ? WIDE_GLYPH_WIDTH : GLYPH_WIDTH), 0);
export const rowLabel = (groups: ChartRowGroups | undefined, category: string) => groups?.byCategory.get(category)?.label ?? category;
export const rowGroup = (groups: ChartRowGroups, category: string) => groups.byCategory.get(category)?.group ?? '';
export const groupedRowText = (groups: ChartRowGroups | undefined, category: string) => groups ? `${groups.header}: ${rowGroup(groups, category)} · ${rowLabel(groups, category)}` : category;

/** Explicit gutter with no containLabel: vertical band/reveal geometry is unchanged, even with a fixed row pitch. */
export function rowGroupLayout(groups: ChartRowGroups, categories: readonly string[]) {
  const groupWidth = Math.max(0, ...categories.map(c => textWidth(rowGroup(groups, c)))) + LABEL_GAP;
  const rowWidth = Math.max(0, ...categories.map(c => textWidth(rowLabel(groups, c)))) + LABEL_GAP;
  const gutter = Math.max(ROW_LABEL_GUTTER, rowWidth) + groupWidth + LABEL_GAP;
  const runs: { group: string; start: number; end: number }[] = [];
  categories.forEach((category, index) => {
    const group = rowGroup(groups, category);
    const previous = runs.at(-1);
    if (previous?.group === group) previous.end = index;
    else runs.push({ group, start: index, end: index });
  });
  return { gutter, groupWidth, rowWidth: gutter - groupWidth - LABEL_GAP, runs };
}

/** One custom item per run. Coordinates come from the live category axis, so resize and Zoom keep labels and separators aligned. */
export function rowGroupSeries(layout: ReturnType<typeof rowGroupLayout>, color: string, separator: string) {
  return {
    id: '__rowGroups', type: 'custom', silent: true, animation: false, clip: false, tooltip: { show: false },
    encode: { y: [0, 1], x: -1 }, data: layout.runs.map(run => [run.start, run.end]),
    renderItem: (params: RenderParams, api: RenderApi) => {
      const run = layout.runs[params.dataIndex];
      const grid = params.coordSys as unknown as { x: number; y: number; width: number; height: number };
      const pitch = Math.abs((api.size!([0, 1]) as number[])[1]);
      const start = api.coord([0, run.start])[1] - pitch / 2;
      const end = api.coord([0, run.end])[1] + pitch / 2;
      const top = Math.max(grid.y, start); const bottom = Math.min(grid.y + grid.height, end);
      if (bottom <= top) return;
      const x = grid.x - layout.gutter + LABEL_GAP;
      return { type: 'group' as const, children: [
        { type: 'text' as const, style: { x, y: (top + bottom) / 2, text: run.group, fill: color, fontSize: LABEL_FONT, verticalAlign: 'middle' as const } },
        ...(run.start > 0 && start >= grid.y ? [{ type: 'line' as const, shape: { x1: x, x2: grid.x + grid.width, y1: start, y2: start }, style: { stroke: separator, lineWidth: 1 } }] : []),
      ] };
    },
  };
}
