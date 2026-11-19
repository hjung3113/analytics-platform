import { parseDateTime } from '@ap/contracts';
import { formatText, type Lang } from '@ap/kernel';
import type { ThemeColorToken } from '@ap/ui/theme';
import { COMPONENTS_MESSAGES } from '../messages';
import type { ChartSpec } from './AnalysisChart';

export const seriesColors: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'];
export const rowKey = (kind: string, id: string) => JSON.stringify([kind, 'row', id]);
export const percent = (value: number) => `${Number(value.toFixed(1))}%`;
export const unknownLabel = (lang: Lang) => formatText(COMPONENTS_MESSAGES.chartUnknown, lang);
export const isBrushableKind = (kind: ChartSpec['kind']) => kind === 'heatmap' || kind === 'scatter';
export const isSingleSelectKind = (kind: ChartSpec['kind']) => kind === 'donut' || kind === 'boxPlot';
export function brushOptions() {
  return {
    toolbox: { show: false },
    brush: { toolbox: [], brushType: 'rect', xAxisIndex: 0, yAxisIndex: 0, inBrush: {}, outOfBrush: {} },
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
