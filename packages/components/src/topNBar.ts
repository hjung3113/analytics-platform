import { isThemeColorToken } from '@ap/ui/theme';
import type { TopNBarSpec } from './AnalysisChart';
import { chartDiagnostic } from './analysisChartData';
import type { KindProjection } from './analysisChartKinds';
import { chartTheme, token } from './EChart';

/** Caller aggregates; this projection alone owns ordering, limiting, table and export. */
export function topNData(spec: TopNBarSpec, ko: boolean, unit: string): KindProjection {
  const seen = new Set<string>();
  const validN = spec.topN === undefined || (Number.isInteger(spec.topN) && spec.topN >= 1);
  if (!validN) chartDiagnostic('invalid TopN limit; using 8');
  const items = spec.items.filter(item => {
    if (seen.has(item.id) || !Number.isFinite(item.value) || item.value < 0 || !isThemeColorToken(item.colorToken)) {
      chartDiagnostic('invalid or duplicate TopN item dropped'); return false;
    }
    seen.add(item.id); return true;
  }).sort((a, b) => b.value - a.value).slice(0, validN ? spec.topN ?? 8 : 8);
  const rows = items.map(item => ({ key: JSON.stringify(['topNBar', item.id]), label: item.label, value: item.value, color: item.colorToken, drill: spec.onItemClick ? () => spec.onItemClick?.(item.id) : undefined }));
  const legendSeen = new Set<string>();
  const legend = (spec.legend ?? []).filter(entry => {
    if (!isThemeColorToken(entry.colorToken) || !items.some(item => item.colorToken === entry.colorToken) || legendSeen.has(entry.colorToken)) return false;
    legendSeen.add(entry.colorToken); return true;
  }).map(entry => ({ label: entry.label, color: entry.colorToken, symbol: 'rect' }));
  const tableValues = rows.map(row => [row.label, `${row.value} ${unit}`]);
  return {
    rows, total: rows.reduce((n, row) => n + row.value, 0), empty: !rows.length,
    summary: `${rows.length}${ko ? '개 항목' : ' items'} · ${unit}`, headers: [ko ? '이름' : 'Name', ko ? '값' : 'Value'], tableValues,
    legend, seriesKeys: [rows.map(row => row.key)],
    option: active => {
      const theme = chartTheme();
      return {
        grid: { top: 12, bottom: 12, left: 16, right: 24, containLabel: true },
        tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (p: { dataIndex: number }) => tableValues[p.dataIndex]?.join(' · ') ?? '' },
        xAxis: { type: 'value', min: 0, axisLine: theme.axisLine, axisLabel: theme.axisLabel, splitLine: theme.splitLine },
        yAxis: { type: 'category', inverse: true, data: rows.map(row => row.label), axisLine: theme.axisLine, axisLabel: { ...theme.axisLabel, width: 112, overflow: 'truncate', interval: 0 } },
        series: [{ type: 'bar', barMaxWidth: 24, data: rows.map(row => ({ value: row.value, itemStyle: { color: token(row.color), borderColor: token('chart-selection-outline'), borderWidth: active.includes(row.key) ? 2 : 0 } })) }],
      };
    },
  };
}
