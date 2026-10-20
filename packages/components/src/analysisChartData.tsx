import type { ThemeColorToken } from '@ap/ui/theme';
import type { ChartSpec, HeatmapCell } from './AnalysisChart';

export type ChartRow = { key: string; label: string; value: number | null; x?: string; y?: string; share?: number; color?: ThemeColorToken; drill?: () => void };
export const cellKey = (x: string, y: string) => JSON.stringify([x, y]);
export function chartDiagnostic(message: string) { if (process.env.NODE_ENV !== 'production') console.error(`AnalysisChart: ${message}`); }

export const chartColors = {
  seq0: 'chart-heat-seq-0', seq1: 'chart-heat-seq-1', seq2: 'chart-heat-seq-2', seq3: 'chart-heat-seq-3', seq4: 'chart-heat-seq-4',
  div0: 'chart-heat-div-0', div1: 'chart-heat-div-1', div2: 'chart-heat-div-2', div3: 'chart-heat-div-3', div4: 'chart-heat-div-4',
  good: 'chart-status-good', warn: 'chart-status-warn', critical: 'chart-status-critical',
  unknown: 'chart-no-data', pattern: 'chart-no-data-pattern', selection: 'chart-selection-outline',
  series1: 'chart-series-1', series2: 'chart-series-2', series3: 'chart-series-3', series4: 'chart-series-4', remainder: 'chart-remainder',
} as const satisfies Record<string, ThemeColorToken>;
const seriesColors = [chartColors.series1, chartColors.series2, chartColors.series3, chartColors.series4];

/** One projection for plot, table, selection and CSV. Synthetic aggregate rows never invent drill IDs. */
export function chartData(spec: ChartSpec, ko: boolean): { cells: HeatmapCell[]; rows: ChartRow[]; total: number } {
  if (spec.kind === 'heatmap') {
    const seen = new Set<string>();
    const cells = spec.cells.filter(cell => {
      const key = cellKey(cell.x, cell.y);
      if (!spec.xLabels.includes(cell.x) || !spec.yLabels.includes(cell.y) || seen.has(key) || (cell.value !== null && !Number.isFinite(cell.value))) {
        chartDiagnostic('invalid, duplicate or out-of-axis cell ignored'); return false;
      }
      seen.add(key); return true;
    });
    return { cells, total: 0, rows: cells.map(c => ({ key: cellKey(c.x, c.y), label: `${c.y} · ${c.x}`, x: c.x, y: c.y, value: c.value, drill: spec.onCellClick ? () => spec.onCellClick?.(c.x, c.y) : undefined })) };
  }
  let colorIndex = 0;
  const seen = new Set<string>();
  const slices = spec.slices.filter(slice => {
    if (slice.value < 0 || !Number.isFinite(slice.value) || seen.has(slice.id)) { chartDiagnostic('negative, non-finite or duplicate slice dropped'); return false; }
    seen.add(slice.id); return true;
  }).map(slice => ({ ...slice, color: slice.color ?? seriesColors[colorIndex++ % seriesColors.length] }));
  const sum = slices.reduce((n, slice) => n + slice.value, 0);
  if (spec.total !== undefined && (!Number.isFinite(spec.total) || spec.total < sum)) chartDiagnostic('total is below sum or non-finite; using sum');
  const total = spec.total !== undefined && Number.isFinite(spec.total) ? Math.max(sum, spec.total) : sum;
  const max = Math.max(2, Math.min(5, Number.isFinite(spec.maxSlices) ? Math.floor(spec.maxSlices!) : 5));
  // Stable descending order only when grouping is needed; otherwise retain caller order.
  const ordered = slices.length > max ? [...slices].sort((a, b) => b.value - a.value) : slices;
  const keep = ordered.length > max ? ordered.slice(0, max - 1) : ordered;
  const rows: ChartRow[] = keep.map(slice => ({ key: JSON.stringify(['slice', slice.id]), label: slice.label, value: slice.value, color: slice.color, share: total ? slice.value / total * 100 : 0, drill: spec.onSliceClick ? () => spec.onSliceClick?.(slice.id) : undefined }));
  if (ordered.length > max) {
    const value = ordered.slice(max - 1).reduce((n, slice) => n + slice.value, 0);
    rows.push({ key: 'other', label: ko ? '기타' : 'Other', value, share: total ? value / total * 100 : 0, color: chartColors.remainder });
  }
  if (total > sum) rows.push({ key: 'unclassified', label: ko ? '미분류' : 'Unclassified', value: total - sum, share: (total - sum) / total * 100, color: chartColors.unknown });
  return { cells: [], rows, total };
}
