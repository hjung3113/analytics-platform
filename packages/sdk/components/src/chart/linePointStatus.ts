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
const HIGHLIGHT_SIZE = HALO_SIZE + 4;
const STATUS_OPACITY = 0.8; // ECharts scatter's normal opacity, also inherited by its label.
/** Scatter overlays render even when the underlying line has showSymbol:false. */
export function lineStatusSeries(i: ChartOptionInput, statuses: ReadonlyMap<string, ChartStatus>, highlightedValues: ReadonlySet<string>): ScatterSeriesOption[] {
  if (i.horizontal || (!statuses.size && !highlightedValues.size)) return [];
  const surface = token('surface-card');
  const positive: number[] = [], negative: number[] = [], latest: number[] = [];
  return i.displayed.flatMap((s, n) => {
    if (s.kind === 'bar') return [];
    const highlights: [string | number, number][] = [];
    const data = s.points.flatMap(([x, y], index) => {
      if (y === null || !Number.isFinite(y)) return [];
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
      const highlighted = highlightedValues.has(x);
      if (!status && !highlighted) return [];
      const value: [string | number, number] = [i.xType === 'time' ? toMs(x) : x, stackedY];
      if (highlighted) highlights.push(value);
      if (!status) return [];
      return [{ value, itemStyle: { color: i.palette.series[n].fill, borderColor: statusBorderColor(status, surface), borderWidth: 2 }, label: { ...statusMarker(status), position: 'top' as const } }];
    });
    const base = { type: 'scatter' as const, silent: true, animation: false, symbol: 'circle', tooltip: { show: false }, ...(i.rightAxis && s.axis === 'right' ? { yAxisIndex: 1 } : {}) };
    const overlays: ScatterSeriesOption[] = [];
    if (data.length) overlays.push(
      { ...base, z: 4, symbolSize: HALO_SIZE, itemStyle: { color: surface, opacity: 1 }, blur: { itemStyle: { opacity: 1 } }, data: data.map(d => d.value) },
      { ...base, z: 5, symbolSize: STATUS_SIZE, blur: { itemStyle: { opacity: STATUS_OPACITY }, label: { opacity: STATUS_OPACITY } }, data },
    );
    if (highlights.length) overlays.push({
      ...base, z: 6, symbolSize: HIGHLIGHT_SIZE, data: highlights,
      itemStyle: { color: 'none', borderColor: i.palette.selection, borderWidth: 2, borderType: 'dashed', opacity: 1 },
      blur: { itemStyle: { opacity: 1 } },
    });
    return overlays;
  });
}
