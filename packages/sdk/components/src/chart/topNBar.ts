import { formatText, type Lang } from '@ap/kernel';
import { isThemeColorToken, type ThemeColorToken } from '@ap/ui/theme';
import { COMPONENTS_MESSAGES } from '../messages';
import type { TopNBarSpec } from './AnalysisChart';
import { chartDiagnostic, readCategoryTopN, type ChartRow } from './analysisChartData';
import { otherGroupLabel, otherLabel, rankCategories, REMAINDER_COLOR, sumCategoryValues } from './categoryTopN';
import type { KindProjection } from './analysisChartKinds';
import { chartTheme, token } from './EChart';
import { barRadius, selectionRing } from './chartMarks';
import { insideLabelStyle, segmentLabelStyle } from './chartValueLabels';
import { referenceMarkOptions } from './referenceMarks';

/** Caller aggregates; this projection alone owns ordering, limiting, table and export. */
export function topNData(spec: TopNBarSpec, lang: Lang | boolean, unit: string): KindProjection {
  const resolved: Lang = typeof lang === 'string' ? lang : lang ? 'ko' : 'en';
  const seen = new Set<string>();
  const options = readCategoryTopN(spec.categoryTopN, spec.reaggregation);
  const validN = spec.topN === undefined || (Number.isInteger(spec.topN) && spec.topN >= 1);
  if (!options && !validN) chartDiagnostic('invalid TopN limit; using 8');
  const valid = spec.items.filter(item => {
    if (seen.has(item.id) || !Number.isFinite(item.value) || item.value < 0 || !isThemeColorToken(item.colorToken)) {
      chartDiagnostic('invalid or duplicate TopN item dropped'); return false;
    }
    seen.add(item.id); return true;
  });
  const labels = new Map(valid.map(item => [item.id, item.label]));
  const limit = validN ? spec.topN ?? 8 : 8;
  const { kept: items, remainder } = options ? rankCategories(valid, options, item => item.value)
    : { kept: [...valid].sort((a, b) => b.value - a.value).filter((item, index, ranked) => index < limit || item.value === ranked[0]?.value), remainder: [] };
  const rows: (ChartRow & { value: number; color: ThemeColorToken })[] = items.map(item => ({ key: JSON.stringify(['topNBar', item.id]), label: item.label, value: item.value, color: item.colorToken, drill: spec.onItemClick ? () => spec.onItemClick?.(item.id) : undefined }));
  const remainderValue = sumCategoryValues(remainder, item => item.value);
  if (remainderValue !== null) rows.push({
    key: JSON.stringify(['topNBar', 'other', null]), label: otherLabel(resolved), value: remainderValue,
    color: REMAINDER_COLOR, groupLabel: otherGroupLabel(resolved, remainder.length),
  });
  const legendSeen = new Set<string>();
  const legend = (spec.legend ?? []).filter(entry => {
    if (!isThemeColorToken(entry.colorToken) || !items.some(item => item.colorToken === entry.colorToken) || legendSeen.has(entry.colorToken)) return false;
    legendSeen.add(entry.colorToken); return true;
  }).map(entry => ({ label: unit ? `${entry.label} (${unit})` : entry.label, color: entry.colorToken, symbol: 'rect' }));
  const tableValues = rows.map(row => [row.groupLabel ?? row.label, `${row.value} ${unit}`.trim()]);
  return {
    rows, total: rows.reduce((n, row) => n + row.value, 0), empty: !rows.length,
    summary: formatText(COMPONENTS_MESSAGES.chartTopNSummary, resolved, { count: rows.length, unit }),
    headers: [formatText(COMPONENTS_MESSAGES.chartHeaderName, resolved), formatText(COMPONENTS_MESSAGES.chartHeaderValue, resolved)],
    tableValues,
    csvHeaders: [formatText(COMPONENTS_MESSAGES.chartHeaderName, resolved), `${formatText(COMPONENTS_MESSAGES.chartHeaderValue, resolved)} (${unit})`], csvValues: rows.map(row => [row.groupLabel ?? row.label, row.value]),
    legend, seriesKeys: [rows.map(row => row.key)], labels,
    option: active => {
      const theme = chartTheme();
      const insideLabel = (fill: ThemeColorToken) => {
        const style = segmentLabelStyle(fill);
        return insideLabelStyle({ color: token(style.text), chip: style.chip }, token('surface-card'));
      };
      return {
        grid: { top: 12, bottom: 12, left: 16, right: 24, containLabel: true },
        tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (p: { dataIndex: number }) => tableValues[p.dataIndex]?.join(' · ') ?? '' },
        xAxis: { type: 'value', min: 0, axisLine: theme.axisLine, axisLabel: theme.axisLabel, splitLine: theme.splitLine },
        yAxis: { type: 'category', inverse: true, data: rows.map(row => row.label), axisLine: theme.axisLine, axisLabel: { ...theme.axisLabel, width: 112, overflow: 'truncate', interval: 0 } },
        series: [{ type: 'bar', itemStyle: { borderRadius: barRadius(true) }, ...referenceMarkOptions(theme, spec.referenceMarks),
          label: { show: true, position: 'insideRight', formatter: (p: { dataIndex: number }) => tableValues[p.dataIndex]?.[1] ?? '' },
          data: rows.map(row => ({ value: row.value, label: insideLabel(row.color), itemStyle: { color: token(row.color), borderColor: token('chart-selection-outline'), borderWidth: selectionRing(active.includes(row.key)) } })) }],
      };
    },
  };
}
