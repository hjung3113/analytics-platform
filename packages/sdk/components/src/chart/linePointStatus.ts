import type { ScatterSeriesOption } from 'echarts/charts';
import type { ChartSeries } from './AnalysisChartFrame';
import { chartPointKey, statusBorderColor, statusMarker, statusText, type ChartStatus } from './chartStatus';
import { token } from './EChart';
import { toMs } from './analysisChartShared';
import type { ChartOptionInput } from './buildChartOption';

/** Bars keep their existing CSV label; line statuses carry the same tone glyph as the other reading aids. Reason has its own CSV column. */
export function frameStatusCsvLabel(series: ChartSeries, horizontal: boolean, status: ChartStatus) {
  if (horizontal || series.kind === 'bar') return status.label;
  return statusText({ tone: status.tone, label: status.label, marker: status.marker });
}
const STATUS_SIZE = 9;
const HALO_SIZE = 13;
const STATUS_OPACITY = 0.8; // ECharts scatter's normal opacity, also inherited by its label.
/** Scatter overlays render even when the underlying line has showSymbol:false. Only status points have symbols. */
export function lineStatusSeries(i: ChartOptionInput, statuses: ReadonlyMap<string, ChartStatus>): ScatterSeriesOption[] {
  if (i.horizontal || !statuses.size) return [];
  const surface = token('surface-card');
  const positive: number[] = [], negative: number[] = [], latest: number[] = [];
  return i.displayed.flatMap((s, n) => {
    if (s.kind === 'bar') return [];
    const data = s.points.flatMap(([x, y], index) => {
      if (y === null || (i.explicitStack && !Number.isFinite(y))) return [];
      let stackedY = y;
      if (i.explicitStack) {
        // Match ECharts' same-sign stacks. A zero follows the most recent nonzero stack at this slot.
        if (y === 0) stackedY = latest[index] ?? 0;
        else {
          const totals = y > 0 ? positive : negative;
          stackedY += totals[index] ?? 0;
          totals[index] = latest[index] = stackedY;
        }
      }
      const status = statuses.get(chartPointKey({ seriesId: s.id, x }));
      if (!status) return [];
      return [{ value: [i.xType === 'time' ? toMs(x) : x, stackedY], itemStyle: { color: i.palette.series[n].fill, borderColor: statusBorderColor(status, surface), borderWidth: 2 }, label: { ...statusMarker(status), position: 'top' as const } }];
    });
    if (!data.length) return [];
    const base = { type: 'scatter' as const, silent: true, animation: false, symbol: 'circle', tooltip: { show: false }, ...(i.rightAxis && s.axis === 'right' ? { yAxisIndex: 1 } : {}) };
    return [
      { ...base, id: `__line-halo-${s.id}`, z: 4, symbolSize: HALO_SIZE, itemStyle: { color: surface, opacity: 1 }, blur: { itemStyle: { opacity: 1 } }, data: data.map(d => d.value) },
      { ...base, id: `__line-status-${s.id}`, z: 5, symbolSize: STATUS_SIZE, blur: { itemStyle: { opacity: STATUS_OPACITY }, label: { opacity: STATUS_OPACITY } }, data },
    ];
  });
}
