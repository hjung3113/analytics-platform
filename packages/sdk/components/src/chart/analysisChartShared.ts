import { parseDateTime } from '@ap/contracts';
import { formatText, type Lang } from '@ap/kernel';
import type { ThemeColorToken } from '@ap/ui/theme';
import { COMPONENTS_MESSAGES } from '../messages';
import type { ChartSpec, HistogramBin } from './AnalysisChart';
import { rangeBandFill } from './chartMarks';
import { token } from './EChart';

export const seriesColors: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'];
export const rowKey = (kind: string, id: string) => JSON.stringify([kind, 'row', id]);
const histogramBoundKey = (value: number) => Number.isFinite(value) ? value : String(value);
export const histogramBinKey = ({ start, end }: Pick<HistogramBin, 'start' | 'end'>) =>
  JSON.stringify(['histogram', histogramBoundKey(start), histogramBoundKey(end)]);
export function followedChartKey(spec: ChartSpec): string | null | undefined {
  switch (spec.kind) {
    case 'heatmap': return undefined;
    case 'histogram': return spec.selectedBin ? histogramBinKey(spec.selectedBin) : spec.selectedBin;
    case 'donut': return spec.selectedId == null ? spec.selectedId : JSON.stringify(['slice', spec.selectedId]);
    case 'topNBar': return spec.selectedId == null ? spec.selectedId : JSON.stringify(['topNBar', spec.selectedId]);
    default: return spec.selectedId == null ? spec.selectedId : rowKey(spec.kind, spec.selectedId);
  }
}
export const percent = (value: number) => `${Number(value.toFixed(1))}%`;
export const unknownLabel = (lang: Lang) => formatText(COMPONENTS_MESSAGES.chartUnknown, lang);
export const isBrushableKind = (kind: ChartSpec['kind']) => kind === 'heatmap' || kind === 'scatter';
export const isSingleSelectKind = (kind: ChartSpec['kind']) => kind === 'donut' || kind === 'boxPlot' || kind === 'histogram';
export function brushOptions() {
  return {
    toolbox: { show: false },
    // The dragged band uses the selection colour at the shared band opacity, like the Frame's Brush (#2736).
    brush: { toolbox: [], brushType: 'rect', xAxisIndex: 0, yAxisIndex: 0, inBrush: {}, outOfBrush: {},
      brushStyle: { color: rangeBandFill(token('chart-selection-outline')), borderColor: token('chart-selection-outline'), borderWidth: 1 } },
  };
}
export const toMs = (v: string) => parseDateTime(v, 'x').getTime();
/** Missing display units fall back to the axis unit. Keep the diagnostic out of deployed apps and tests. */
export function warnMissingChartUnit(seriesId: string) {
  const env = (import.meta as { env?: { MODE?: string; DEV?: boolean; PROD?: boolean } }).env;
  const isDevelopment = env
    ? env.DEV && !env.PROD && env.MODE !== 'test' && env.MODE !== 'production'
    : process.env.NODE_ENV === 'development';
  if (isDevelopment) console.warn(`Chart: series "${seriesId}" has no unit`);
}
