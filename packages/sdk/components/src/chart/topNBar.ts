import { formatText, type Lang } from '@ap/kernel';
import { isThemeColorToken } from '@ap/ui/theme';
import { COMPONENTS_MESSAGES } from '../messages';
import type { TopNBarSpec } from './AnalysisChart';
import { chartDiagnostic } from './analysisChartData';
import type { KindProjection } from './analysisChartKinds';
import { chartTheme, token } from './EChart';

/** Caller aggregates; this projection alone owns ordering, limiting, table and export. */
export function topNData(spec: TopNBarSpec, lang: Lang | boolean, unit: string): KindProjection {
  const resolved: Lang = typeof lang === 'string' ? lang : lang ? 'ko' : 'en';
  const seen = new Set<string>();
  const validN = spec.topN === undefined || (Number.isInteger(spec.topN) && spec.topN >= 1);
  if (!validN) chartDiagnostic('invalid TopN limit; using 8');
  const valid = spec.items.filter(item => {
    if (seen.has(item.id) || !Number.isFinite(item.value) || item.value < 0 || !isThemeColorToken(item.colorToken)) {
      chartDiagnostic('invalid or duplicate TopN item dropped'); return false;
    }
    seen.add(item.id); return true;
  });
  const labels = new Map(valid.map(item => [item.id, item.label]));
  const items = [...valid].sort((a, b) => b.value - a.value).slice(0, validN ? spec.topN ?? 8 : 8);
  const rows = items.map(item => ({ key: JSON.stringify(['topNBar', item.id]), label: item.label, value: item.value, color: item.colorToken, drill: spec.onItemClick ? () => spec.onItemClick?.(item.id) : undefined }));
  const legendSeen = new Set<string>();
  const legend = (spec.legend ?? []).filter(entry => {
    if (!isThemeColorToken(entry.colorToken) || !items.some(item => item.colorToken === entry.colorToken) || legendSeen.has(entry.colorToken)) return false;
    legendSeen.add(entry.colorToken); return true;
  }).map(entry => ({ label: entry.label, color: entry.colorToken, symbol: 'rect' }));
  const tableValues = rows.map(row => [row.label, `${row.value} ${unit}`]);
  return {
    rows, total: rows.reduce((n, row) => n + row.value, 0), empty: !rows.length,
    summary: formatText(COMPONENTS_MESSAGES.chartTopNSummary, resolved, { count: rows.length, unit }),
    headers: [formatText(COMPONENTS_MESSAGES.chartHeaderName, resolved), formatText(COMPONENTS_MESSAGES.chartHeaderValue, resolved)],
    tableValues,
    csvHeaders: [formatText(COMPONENTS_MESSAGES.chartHeaderName, resolved), `${formatText(COMPONENTS_MESSAGES.chartHeaderValue, resolved)} (${unit})`], csvValues: rows.map(row => [row.label, row.value]),
    legend, seriesKeys: [rows.map(row => row.key)], labels,
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
