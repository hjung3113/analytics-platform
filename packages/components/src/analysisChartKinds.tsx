import type { EChartsCoreOption } from 'echarts/core';
import type { ThemeColorToken } from '@ap/ui/theme';
import type { BoxPlotSpec, BoxStats, ParetoSpec, ScatterSpec } from './AnalysisChart';
import type { ChartRow } from './analysisChartData';
import { chartDiagnostic } from './analysisChartData';
import { chartTheme, strokeToken, token } from './EChart';

const fills: ThemeColorToken[] = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'];
const shapes = ['circle', 'rect', 'triangle', 'diamond'] as const;
export type KindProjection = {
  rows: ChartRow[]; total: number; empty: boolean; summary: string; headers: string[]; tableValues: string[][];
  legend: { label: string; color: ThemeColorToken; symbol: string; stroke?: ThemeColorToken; unknown?: boolean }[];
  seriesKeys: (string | undefined)[][];
  option: (active: string[]) => EChartsCoreOption;
};
const rowKey = (kind: string, id: string) => JSON.stringify([kind, 'row', id]);
const pct = (n: number) => `${Number(n.toFixed(1))}%`;
function unique<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.id)) { chartDiagnostic('duplicate ID dropped'); return false; }
    seen.add(item.id); return true;
  });
}

export function scatterData(spec: ScatterSpec, ko: boolean, unit: string): KindProjection {
  const unknown = ko ? '미확인' : 'Unknown';
  const defaultLabel = ko ? '기본 그룹' : 'Default group';
  // JSON tags keep an ungrouped point separate from every caller-supplied string ID.
  const groupKey = (id?: string) => JSON.stringify(id === undefined ? ['default'] : ['group', id]);
  const groups = unique(spec.groups ?? []).map(g => ({ ...g, key: groupKey(g.id) }));
  const points = unique(spec.points).filter(p => {
    const valid = (p.x === null || Number.isFinite(p.x)) && (p.y === null || Number.isFinite(p.y));
    if (!valid) chartDiagnostic('non-finite scatter coordinates dropped');
    return valid;
  });
  for (const point of points) {
    if (!groups.some(g => g.key === groupKey(point.group))) {
      if (spec.groups) chartDiagnostic('undeclared scatter group appended');
      groups.push({ id: point.group ?? '', key: groupKey(point.group), label: point.group ?? defaultLabel });
    }
  }
  if (groups.length > 4) chartDiagnostic('more than four scatter groups; overflow uses remainder and repeated symbols');
  const legend = groups.map((g, i) => ({ label: g.label, color: i > 3 ? 'chart-remainder' as const : g.color ?? fills[i], symbol: shapes[i % 4] }));
  const text = (v: number | null, u: string) => v === null ? unknown : `${v} ${u}`;
  const rows: ChartRow[] = points.map(p => ({ key: rowKey('scatter', p.id), label: p.label ?? p.id, value: p.y, drill: spec.onPointClick ? () => spec.onPointClick?.(p.id) : undefined }));
  const tableValues = points.map(p => [p.id, p.label ?? p.id, groups.find(g => g.key === groupKey(p.group))!.label, text(p.x, spec.xUnit), text(p.y, unit)]);
  const plotted = groups.map(g => points.filter(p => groupKey(p.group) === g.key && p.x !== null && p.y !== null));
  const bounds = (axis: 'x' | 'y', extent: { min: number; max: number }) => {
    const references = (spec.referenceLines ?? []).filter(r => r.axis === axis && Number.isFinite(r.value)).map(r => r.value);
    const min = Math.min(extent.min, ...references); const max = Math.max(extent.max, ...references);
    const padding = (max - min || Math.abs(min) || 1) * 0.05;
    return { min: min - padding, max: max + padding };
  };
  const axisRange = (axis: 'x' | 'y') => ({ scale: true, min: (extent: { min: number; max: number }) => bounds(axis, extent).min, max: (extent: { min: number; max: number }) => bounds(axis, extent).max });
  return {
    rows, total: 0, empty: !plotted.some(g => g.length),
    summary: ko ? `${points.length}개 점 · ${points.filter(p => p.x === null || p.y === null).length}개 미확인 · ${legend.map(g => g.label).join(', ')} · ${spec.xLabel} (${spec.xUnit}) · ${spec.yLabel} (${unit})` : `${points.length} points · ${points.filter(p => p.x === null || p.y === null).length} unknown · ${legend.map(g => g.label).join(', ')} · ${spec.xLabel} (${spec.xUnit}) · ${spec.yLabel} (${unit})`,
    headers: ['ID', ko ? '이름' : 'Name', ko ? '그룹' : 'Group', `${spec.xLabel} (${spec.xUnit})`, `${spec.yLabel} (${unit})`], tableValues, legend,
    seriesKeys: plotted.map(g => g.map(p => rowKey('scatter', p.id))),
    option: active => {
      const theme = chartTheme();
      return {
        tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (p: { seriesIndex: number; dataIndex: number }) => { const point = plotted[p.seriesIndex]?.[p.dataIndex]; return point ? `${point.label ?? point.id} · ${groups[p.seriesIndex].label}: ${spec.xLabel} ${text(point.x, spec.xUnit)} · ${spec.yLabel} ${text(point.y, unit)}` : ''; } },
        grid: { top: 32, bottom: 56, left: 48, right: 40, containLabel: true },
        xAxis: { type: 'value', ...axisRange('x'), name: `${spec.xLabel} (${spec.xUnit})`, nameLocation: 'middle', nameGap: 32, axisLine: theme.axisLine, axisLabel: theme.axisLabel, splitLine: theme.splitLine },
        yAxis: { type: 'value', ...axisRange('y'), name: `${spec.yLabel} (${unit})`, axisLine: theme.axisLine, axisLabel: theme.axisLabel, splitLine: theme.splitLine },
        toolbox: { show: false },
        brush: { toolbox: [], brushType: 'rect', xAxisIndex: 0, yAxisIndex: 0, inBrush: {}, outOfBrush: {} },
        series: plotted.map((group, i) => ({ type: 'scatter', symbol: legend[i].symbol, emphasis: { focus: 'none' },
          markLine: i === 0 ? { ...theme.referenceLine, data: spec.referenceLines?.filter(r => Number.isFinite(r.value)).map(r => ({ name: r.label, ...(r.axis === 'x' ? { xAxis: r.value, label: { position: 'end', rotate: 0, offset: [0, 8], verticalAlign: 'top' } } : { yAxis: r.value }) })) } : undefined,
          data: group.map(p => ({ value: [p.x, p.y], itemStyle: { color: token(legend[i].color), borderColor: token('chart-selection-outline'), borderWidth: active.includes(rowKey('scatter', p.id)) ? 2 : 0 } })),
        })),
      };
    },
  };
}

/** Accessible legends use the same geometry and token as the canvas marks. */
export function KindLegend({ items, label }: { items: KindProjection['legend']; label: string }) {
  return <ul aria-label={label} className="flex flex-wrap gap-3 px-4 py-2 text-xs text-text-secondary">{items.map((item, i) => <li key={i} className="flex items-center gap-1">
    <svg aria-hidden width="14" height="14" viewBox="0 0 14 14">
      {item.symbol === 'circle' ? <circle cx="7" cy="7" r="5" fill={token(item.color)} /> : item.symbol === 'rect' ? <rect x="2" y="2" width="10" height="10" fill={token(item.color)} stroke={item.stroke ? token(item.stroke) : undefined} strokeDasharray={item.unknown ? '2 2' : undefined} /> : item.symbol === 'triangle' ? <path d="M7 1 L13 13 L1 13 Z" fill={token(item.color)} /> : item.symbol === 'line' ? <path d="M1 7 H13" stroke={token(item.color)} strokeWidth="2" /> : <path d="M7 1 L13 7 L7 13 L1 7 Z" fill={token(item.color)} />}
    </svg>{item.label}
  </li>)}</ul>;
}

function validStats(stats: BoxStats, mode: BoxPlotSpec['whisker']) {
  const { min, q1, median, q3, max, outliers = [], n } = stats;
  const iqr = q3 - q1;
  return [min, q1, median, q3, max, ...outliers].every(Number.isFinite)
    && min <= q1 && q1 <= median && median <= q3 && q3 <= max
    && (n === undefined || (Number.isInteger(n) && n >= 0))
    && (mode !== 'tukey' || (q1 - 1.5 * iqr <= min && max <= q3 + 1.5 * iqr));
}

export function boxPlotData(spec: BoxPlotSpec, ko: boolean, unit: string): KindProjection {
  const unknown = ko ? '미확인' : 'Unknown';
  const groups = unique(spec.groups).map(g => {
    if (g.stats && !validStats(g.stats, spec.whisker)) { chartDiagnostic('invalid box statistics; using Unknown'); return { ...g, stats: null }; }
    return g;
  });
  const rows = groups.map(g => ({ key: rowKey('boxPlot', g.id), label: g.label, value: g.stats?.median ?? null, drill: spec.onGroupClick ? () => spec.onGroupClick?.(g.id) : undefined }));
  const text = (v?: number) => v === undefined ? unknown : `${v} ${unit}`;
  const tableValues = groups.map(g => [g.label, ...[g.stats?.min, g.stats?.q1, g.stats?.median, g.stats?.q3, g.stats?.max].map(text), g.stats?.n === undefined ? unknown : String(g.stats.n), g.stats ? (g.stats.outliers ?? []).map(text).join('; ') || (ko ? '없음' : 'None') : unknown]);
  const headers = [ko ? '그룹' : 'Group', 'Min', 'Q1', ko ? '중앙값' : 'Median', 'Q3', 'Max', 'n', ko ? '이상치' : 'Outliers'];
  const outliers = groups.flatMap((g, i) => (g.stats?.outliers ?? []).map(value => ({ group: i, value })));
  const medianGroups = groups.flatMap((g, i) => g.stats ? [i] : []);
  const unknownGroups = groups.flatMap((g, i) => g.stats ? [] : [i]);
  return {
    rows, total: 0, empty: !groups.some(g => g.stats),
    headers, tableValues,
    summary: `${groups.length}${ko ? '개 그룹' : ' groups'} · ${groups.filter(g => !g.stats).length}${ko ? '개 미확인' : ' unknown'} · ${ko ? '수염: ' : 'Whiskers: '}${spec.whisker === 'tukey' ? '1.5×IQR' : ko ? '최소–최대' : 'min–max'} · ${unit}`,
    legend: groups.map((g, i) => ({ label: g.label, color: g.stats ? fills[i % 4] : 'chart-no-data', stroke: g.stats ? strokeToken(fills[i % 4]) : 'chart-no-data-pattern', unknown: !g.stats, symbol: 'rect' })),
    seriesKeys: [rows.map(r => r.key), outliers.map(o => rows[o.group].key), medianGroups.map(i => rows[i].key)],
    option: active => {
      const theme = chartTheme();
      return {
        grid: { top: 24, bottom: 24, left: 24, right: 24, containLabel: true },
        tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (p: { seriesIndex: number; dataIndex: number }) => { const index = p.seriesIndex === 1 ? outliers[p.dataIndex]?.group : p.seriesIndex === 2 ? medianGroups[p.dataIndex] : p.dataIndex; return index === undefined ? '' : tableValues[index].map((value, i) => `${headers[i]}: ${value}`).join(' · '); } },
        xAxis: { type: 'category', data: groups.map(g => g.label), axisLine: theme.axisLine, axisLabel: theme.axisLabel },
        yAxis: [{ type: 'value', name: unit, axisLine: theme.axisLine, axisLabel: theme.axisLabel, splitLine: theme.splitLine }, { type: 'value', show: false, min: 0, max: 1 }],
        series: [
          { type: 'boxplot', boxWidth: [24, 24], itemStyle: { borderColor: token(strokeToken(fills[0])) },
            markLine: { ...theme.referenceLine, data: spec.referenceLines?.filter(r => Number.isFinite(r.value)).map(r => ({ name: r.label, yAxis: r.value })) },
            data: groups.map((g, i) => ({ value: g.stats ? [g.stats.min, g.stats.q1, g.stats.median, g.stats.q3, g.stats.max] : ['-', '-', '-', '-', '-'], itemStyle: { color: token(fills[i % 4]), borderColor: token(strokeToken(fills[i % 4])), borderWidth: active.includes(rows[i].key) ? 3 : 1.5 } })),
          },
          { type: 'scatter', symbolSize: 5, data: outliers.map(o => ({ value: [o.group, o.value], itemStyle: { color: token(strokeToken(fills[o.group % 4])) } })) },
          // ECharts boxplot draws its median and outline in one path. Overlay an exact-width median in the on-fill token.
          { type: 'scatter', symbol: 'rect', symbolSize: [24, 2], z: 3, itemStyle: { color: token('chart-median-on-fill') }, data: medianGroups.map(i => ({ value: [i, groups[i].stats!.median] })) },
          // A separate hidden 0..1 axis centres text without inventing a box statistic or altering its value axis.
          { type: 'scatter', yAxisIndex: 1, symbolSize: 0, silent: true, tooltip: { show: false },
            label: { show: true, position: 'inside', formatter: unknown, color: theme.axisLabel.color }, data: unknownGroups.map(i => [i, 0.5]) },
        ],
      };
    },
  };
}

export function paretoData(spec: ParetoSpec, ko: boolean, unit: string): KindProjection {
  const items = unique(spec.items).filter(item => {
    if (!Number.isFinite(item.value) || item.value < 0) { chartDiagnostic('negative or non-finite Pareto value dropped'); return false; }
    return true;
  }).sort((a, b) => b.value - a.value);
  const total = items.reduce((sum, item) => sum + item.value, 0);
  if (spec.maxItems !== undefined && !Number.isFinite(spec.maxItems)) chartDiagnostic('non-finite Pareto cap; using 10');
  const cap = Math.max(2, Math.floor(Number.isFinite(spec.maxItems) ? spec.maxItems! : 10));
  const validTarget = spec.cumulativeTarget === undefined || (Number.isFinite(spec.cumulativeTarget) && spec.cumulativeTarget > 0 && spec.cumulativeTarget <= 1);
  if (!validTarget) chartDiagnostic('invalid Pareto target; using 0.8');
  const target = validTarget ? spec.cumulativeTarget ?? 0.8 : 0.8;
  const kept = items.length > cap ? items.slice(0, cap - 1) : items;
  const rows: ChartRow[] = kept.map(item => ({ key: rowKey('pareto', item.id), label: item.label, value: item.value, color: 'chart-series-1', drill: spec.onItemClick ? () => spec.onItemClick?.(item.id) : undefined }));
  if (items.length > cap) rows.push({ key: JSON.stringify(['pareto', 'other', null]), label: ko ? '기타' : 'Other', value: items.slice(cap - 1).reduce((sum, item) => sum + item.value, 0), color: 'chart-remainder' });
  let sum = 0;
  const cumulative = rows.map(row => { sum += row.value!; return total ? sum / total * 100 : 0; });
  let originalSum = 0;
  const reached = total ? items.findIndex(item => { originalSum += item.value; return originalSum >= total * target; }) + 1 : 0;
  const tableValues = rows.map((row, i) => [row.label, `${row.value} ${unit}`, pct(cumulative[i])]);
  return {
    rows, total, empty: total === 0,
    summary: `${rows.length}${ko ? '개 항목 · 합계' : ' items · Total'} ${total} ${unit}${total ? ko ? ` · 상위 ${reached}개 원본 항목이 ${pct(target * 100)} 도달` : ` · Top ${reached} original items reach ${pct(target * 100)}` : ''}`,
    headers: [ko ? '이름' : 'Name', ko ? '값' : 'Value', ko ? '누적 %' : 'Cumulative %'], tableValues,
    legend: [{ label: ko ? '값' : 'Value', color: 'chart-series-1', symbol: 'rect' }, ...(items.length > cap ? [{ label: ko ? '기타' : 'Other', color: 'chart-remainder' as const, symbol: 'rect' }] : []), { label: ko ? '누적 %' : 'Cumulative %', color: 'chart-series-2-stroke', symbol: 'line' }],
    seriesKeys: [rows.map(row => row.key), []],
    option: active => {
      const theme = chartTheme();
      return {
        grid: { top: 24, bottom: 24, left: 24, right: 48, containLabel: true },
        tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (p: { dataIndex: number }) => tableValues[p.dataIndex]?.join(' · ') ?? '' },
        xAxis: { type: 'category', data: rows.map(row => row.label), axisLine: theme.axisLine, axisLabel: theme.axisLabel },
        yAxis: [{ type: 'value', min: 0, name: unit, axisLine: theme.axisLine, axisLabel: theme.axisLabel, splitLine: theme.splitLine }, { type: 'value', min: 0, max: 100, name: '%', position: 'right', axisLine: theme.axisLine, axisLabel: { ...theme.axisLabel, formatter: '{value}%' }, splitLine: { show: false } }],
        series: [
          { type: 'bar', data: rows.map(row => ({ value: row.value, itemStyle: { color: token(row.color!), borderColor: token('chart-selection-outline'), borderWidth: active.includes(row.key) ? 2 : 0 } })) },
          { type: 'line', yAxisIndex: 1, data: cumulative, lineStyle: { color: token('chart-series-2-stroke') }, itemStyle: { color: token('chart-series-2-stroke') }, markLine: { ...theme.referenceLine, data: [{ name: pct(target * 100), yAxis: target * 100 }] } },
        ],
      };
    },
  };
}
