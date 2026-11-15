import { formatText, type Lang } from '@ap/kernel';
import type { CustomSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { XAXisComponentOption, YAXisComponentOption } from 'echarts';
import type { ScatterPoint, ScatterSpec } from './AnalysisChart';
import type { KindProjection } from './analysisChartKinds';
import { chartDiagnostic } from './analysisChartData';
import { groupedRowText, rowGroup, rowGroupLayout, rowLabel, type ChartRowGroups } from './chartRowGroups';
import { distinctStatuses, statusBorderColor, statusMarker, statusText } from './chartStatus';
import { chartTheme, token } from './EChart';
import { COMPONENTS_MESSAGES } from '../messages';

const DEFAULT_JITTER = 0.6;
const MAX_JITTER = 0.9;
const HALF_CELL = 0.5;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const UINT32_MAX = 0xffffffff;
const RANGE_PADDING = 0.05;
const BAND_OPACITY = 0.12;
const UPPER_DASH = [8, 4];
const LOWER_DASH = [2, 4];
const GROUP_LABEL_OFFSET = 34;
const GROUP_FONT_SIZE = 11;
const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, ch => ESCAPES[ch]);
const pointKey = (id: string) => JSON.stringify(['scatter', 'row', id]);
type Bound = { lower?: number; upper?: number };
type Span = { start: number; end: number; lower?: number; upper?: number };

/** FNV-1a over UTF-16 code units: stable across calls, ordering, locale and runtime. */
function jitterOffset(id: string, width: number) {
  let hash = FNV_OFFSET;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), FNV_PRIME);
  return ((hash >>> 0) / UINT32_MAX - HALF_CELL) * width;
}
function categoryCells(spec: ScatterSpec) {
  const categories = spec.xCategories;
  if (!categories) return undefined;
  const order = [...new Set(categories.order)];
  if (order.length !== categories.order.length) chartDiagnostic('duplicate scatter category dropped');
  const index = new Map(order.map((category, i) => [category, i]));
  const width = Number.isFinite(categories.jitter) ? Math.max(0, Math.min(MAX_JITTER, categories.jitter!)) : DEFAULT_JITTER;
  if (categories.jitter !== undefined && !Number.isFinite(categories.jitter)) chartDiagnostic('non-finite scatter jitter; using default');
  const points = spec.points.flatMap(point => {
    const cell = point.category === undefined ? undefined : index.get(point.category);
    if (cell === undefined) { chartDiagnostic('missing or undeclared scatter category dropped'); return []; }
    return [{ ...point, x: cell + jitterOffset(point.id, width) }];
  });
  const bounds: Bound[] = order.map(category => {
    const bound = categories.bounds?.get(category) ?? {};
    if ((bound.lower !== undefined && !Number.isFinite(bound.lower)) || (bound.upper !== undefined && !Number.isFinite(bound.upper))) chartDiagnostic('non-finite scatter bound ignored');
    const finite = { lower: Number.isFinite(bound.lower) ? bound.lower : undefined, upper: Number.isFinite(bound.upper) ? bound.upper : undefined };
    if (finite.lower !== undefined && finite.upper !== undefined && finite.lower > finite.upper) {
      chartDiagnostic('reversed scatter bounds ignored'); return {};
    }
    return finite;
  });
  return { order, index, points, bounds };
}
/** Merge consecutive equal segments, retaining holes and category boundaries. */
function spans(bounds: Bound[], part: 'upper' | 'lower' | 'band'): Span[] {
  const result: Span[] = [];
  bounds.forEach((bound, cell) => {
    const included = part === 'band' ? bound.lower !== undefined && bound.upper !== undefined : bound[part] !== undefined;
    if (!included) return;
    const upper = part === 'lower' ? undefined : bound.upper;
    const lower = part === 'upper' ? undefined : bound.lower;
    const previous = result.at(-1);
    if (previous && previous.end === cell - 1 && previous.upper === upper && previous.lower === lower) previous.end = cell;
    else result.push({ start: cell, end: cell, upper, lower });
  });
  return result;
}
function categoryGroups(groups: ChartRowGroups, order: readonly string[]): CustomSeriesOption {
  const { runs } = rowGroupLayout(groups, order);
  const theme = chartTheme();
  return {
    id: '__scatterGroups', type: 'custom', silent: true, animation: false, clip: false, tooltip: { show: false },
    encode: { x: [0, 1], y: -1 }, data: runs.map(run => [run.start, run.end]),
    renderItem: (params, api) => {
      const run = runs[params.dataIndex];
      const grid = params.coordSys as unknown as { x: number; y: number; width: number; height: number };
      const left = api.coord([run.start - HALF_CELL, 0])[0];
      const right = api.coord([run.end + HALF_CELL, 0])[0];
      const bottom = grid.y + grid.height;
      return { type: 'group', children: [
        { type: 'text', style: { x: (left + right) / 2, y: bottom + GROUP_LABEL_OFFSET, text: run.group, fill: theme.axisLabel.color, fontSize: GROUP_FONT_SIZE, align: 'center', verticalAlign: 'middle' } },
        ...(run.start > 0 ? [{ type: 'line' as const, shape: { x1: left, x2: left, y1: grid.y, y2: bottom + GROUP_LABEL_OFFSET }, style: { stroke: theme.splitLine.lineStyle.color, lineWidth: 1 } }] : []),
      ] };
    },
  };
}

/** Opt-in decorator: reuse legacy validation, group colours, symbols, selection keys and reference lines. */
export function scatterExtras(spec: ScatterSpec, lang: Lang, unit: string, project: (plain: ScatterSpec) => KindProjection): KindProjection {
  const cells = categoryCells(spec);
  const categories = spec.xCategories;
  const groups = categories?.groups;
  const input = cells?.points ?? spec.points;
  const plain = { ...spec, xCategories: undefined, points: input.map(point => ({ ...point, status: undefined })) };
  const base = project(plain);
  const originals = new Map<string, ScatterPoint>();
  for (const point of input) if (!originals.has(pointKey(point.id))) originals.set(pointKey(point.id), point);
  const points = base.rows.map(row => originals.get(row.key)!);
  const byKey = new Map(base.rows.map((row, i) => [row.key, i]));
  const statuses = distinctStatuses(points.map(point => point.status));
  const m = (key: keyof typeof COMPONENTS_MESSAGES) => formatText(COMPONENTS_MESSAGES[key], lang);
  const labels = {
    upper: categories?.boundLabels?.upper ?? m('chartUpperBound'),
    lower: categories?.boundLabels?.lower ?? m('chartLowerBound'),
    band: categories?.boundLabels?.band ?? m('chartBoundRange'),
  };
  const upper = spans(cells?.bounds ?? [], 'upper');
  const lower = spans(cells?.bounds ?? [], 'lower');
  const bands = spans(cells?.bounds ?? [], 'band');
  const legend: KindProjection['legend'] = [...base.legend,
    ...(upper.length ? [{ label: labels.upper, color: 'chart-no-data-pattern' as const, symbol: 'line', dash: UPPER_DASH.join(' ') }] : []),
    ...(lower.length ? [{ label: labels.lower, color: 'chart-no-data-pattern' as const, symbol: 'line', dash: LOWER_DASH.join(' ') }] : []),
    ...(bands.length ? [{ label: labels.band, color: 'chart-no-data-pattern' as const, symbol: 'rect', opacity: BAND_OPACITY }] : []),
    ...statuses.map(status => ({ label: status.label, color: 'chart-no-data-pattern' as const, symbol: 'status', status })),
  ];
  const headers = [...base.headers];
  const csvHeaders = [...base.csvHeaders];
  if (categories) { headers[3] = spec.xLabel; csvHeaders[3] = spec.xLabel; }
  if (groups) { headers.splice(3, 0, groups.header); csvHeaders.splice(3, 0, groups.header); }
  if (categories?.bounds) { headers.push(labels.lower, labels.upper); csvHeaders.push(labels.lower, labels.upper); }
  if (statuses.length) { headers.push(m('chartHeaderStatus')); csvHeaders.push(m('chartHeaderStatus')); }
  const boundFor = (point: ScatterPoint): Bound => cells?.bounds[cells.index.get(point.category!)!] ?? {};
  const tableValues = base.tableValues.map((values, i) => {
    const point = points[i]; const row = [...values];
    if (categories) row[3] = rowLabel(groups, point.category!);
    if (groups) row.splice(3, 0, rowGroup(groups, point.category!));
    if (categories?.bounds) row.push(...[boundFor(point).lower, boundFor(point).upper].map(value => value === undefined ? '' : `${value} ${unit}`));
    if (statuses.length) row.push(statusText(point.status));
    return row;
  });
  const csvValues = base.csvValues.map((values, i) => {
    const point = points[i]; const row = [...values];
    if (categories) row[3] = rowLabel(groups, point.category!);
    if (groups) row.splice(3, 0, rowGroup(groups, point.category!));
    if (categories?.bounds) row.push(boundFor(point).lower ?? '', boundFor(point).upper ?? '');
    if (statuses.length) row.push(statusText(point.status));
    return row;
  });
  const pointDetails = (point: ScatterPoint) => {
    const detail = categories ? [groupedRowText(groups, point.category!)] : [];
    if (categories?.bounds) {
      const bound = boundFor(point);
      detail.push(`${labels.lower}: ${bound.lower === undefined ? '' : `${bound.lower} ${unit}`}`, `${labels.upper}: ${bound.upper === undefined ? '' : `${bound.upper} ${unit}`}`);
    }
    if (point.status) detail.push(statusText(point.status));
    return detail.join(' · ');
  };
  const rows = base.rows.map((row, i) => ({ ...row, label: [row.label, pointDetails(points[i])].filter(Boolean).join(' · ') }));
  const summary = cells ? formatText(COMPONENTS_MESSAGES.chartScatterCategorySummary, lang, {
    total: points.length, unknown: points.filter(point => point.y === null).length,
    legend: base.legend.map(item => item.label).join(', '), xLabel: spec.xLabel, yLabel: spec.yLabel, unit,
  }) : base.summary;
  return {
    ...base, rows, headers, csvHeaders, tableValues, csvValues, legend,
    summary: [summary, ...points.map(pointDetails).filter(Boolean)].join(' · '),
    seriesKeys: [...base.seriesKeys, ...(groups ? [[]] : [])],
    option: active => {
      const original = base.option(active);
      const theme = chartTheme();
      const series = (original.series as ScatterSeriesOption[]).map((series, s) => ({ ...series,
        data: (series.data as { value: number[]; itemStyle: { color: string; borderColor: string; borderWidth: number } }[]).map((datum, d) => {
          const key = base.seriesKeys[s][d]; const point = points[byKey.get(key!)!];
          if (!point?.status) return datum;
          return { ...datum, itemStyle: { ...datum.itemStyle, borderColor: statusBorderColor(point.status, datum.itemStyle.color), borderWidth: 2,
            ...(active.includes(key!) ? { shadowBlur: 6, shadowColor: token('chart-selection-outline') } : {}) }, label: { ...statusMarker(point.status), position: 'top' as const } };
        }),
      }));
      if (categories?.bounds && series.length) {
        const lines = (segments: Span[], part: 'upper' | 'lower', dash: number[]): NonNullable<NonNullable<ScatterSeriesOption['markLine']>['data']> => segments.map(span => [
          { name: labels[part], coord: [span.start - HALF_CELL, span[part]!], lineStyle: { ...theme.referenceLine.lineStyle, color: token('chart-no-data-pattern'), type: dash }, label: { show: false } },
          { coord: [span.end + HALF_CELL, span[part]!] },
        ]);
        series[0].markLine = { ...theme.referenceLine, ...series[0].markLine, data: [...(series[0].markLine?.data ?? []), ...lines(upper, 'upper', UPPER_DASH), ...lines(lower, 'lower', LOWER_DASH)] };
        series[0].markArea = { silent: true, itemStyle: { color: token('chart-no-data-pattern'), opacity: BAND_OPACITY }, label: { show: false }, data: bands.map(span => [
          { coord: [span.start - HALF_CELL, span.lower!] }, { coord: [span.end + HALF_CELL, span.upper!] },
        ]) };
      }
      const yAxis = original.yAxis as YAXisComponentOption;
      const boundValues = (cells?.bounds ?? []).flatMap(bound => [bound.lower, bound.upper].filter((value): value is number => value !== undefined));
      const yRange = (extent: { min: number; max: number }) => {
        const references = (spec.referenceLines ?? []).filter(line => line.axis === 'y' && Number.isFinite(line.value)).map(line => line.value);
        const min = Math.min(extent.min, ...boundValues, ...references); const max = Math.max(extent.max, ...boundValues, ...references);
        const padding = (max - min || Math.abs(min) || 1) * RANGE_PADDING;
        return { min: min - padding, max: max + padding };
      };
      const xAxis: XAXisComponentOption = cells ? { ...(original.xAxis as Extract<XAXisComponentOption, { type?: 'value' }>),
        // Explicit intervals start at the fixed minimum in ECharts 6.1. Half-cell ticks include integer centres.
        min: -HALF_CELL, max: Math.max(0, cells.order.length - 1) + HALF_CELL, interval: HALF_CELL,
        axisTick: { show: false }, splitLine: { show: false },
        name: spec.xLabel, nameGap: groups ? 64 : 32,
        axisLabel: { ...theme.axisLabel, showMinLabel: false, showMaxLabel: false, formatter: (value: number) => Number.isInteger(value) && cells.order[value] !== undefined ? rowLabel(groups, cells.order[value]) : '' },
      } : original.xAxis as XAXisComponentOption;
      return {
        ...original, xAxis,
        ...(groups ? { grid: { top: 32, bottom: 90, left: 48, right: 40, containLabel: true } } : {}),
        yAxis: boundValues.length ? { ...yAxis, min: (extent: { min: number; max: number }) => yRange(extent).min, max: (extent: { min: number; max: number }) => yRange(extent).max } : yAxis,
        // HTML mode escapes every consumer string; rich-text braces remain literal text, never style instructions.
        tooltip: { ...theme.tooltip, renderMode: 'html', formatter: (p: { seriesIndex: number; dataIndex: number }) => {
          const key = base.seriesKeys[p.seriesIndex]?.[p.dataIndex]; const index = key === undefined ? undefined : byKey.get(key);
          return index === undefined ? '' : tableValues[index].map((value, column) => escapeHtml(`${headers[column]}: ${value}`)).join(' · ');
        } },
        series: [...series, ...(groups && cells ? [categoryGroups(groups, cells.order)] : [])],
      };
    },
  };
}
