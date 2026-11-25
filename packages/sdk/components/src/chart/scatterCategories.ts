import { formatText, type Lang } from '@ap/kernel';
import { formatNumber } from '@ap/contracts';
import type { CustomSeriesOption, ScatterSeriesOption } from 'echarts/charts';
import type { XAXisComponentOption, YAXisComponentOption } from 'echarts';
import type { ScatterPoint, ScatterSpec } from './AnalysisChart';
import { legendColor, type KindProjection } from './analysisChartKinds';
import { rowKey } from './analysisChartShared';
import { escapeHtml } from './chartText';
import { BOUND_DASH, boundLabelsOf, normalizeBound, type Bound } from './chartBounds';
import { referenceValues, scatterReferenceMarks } from './referenceMarks';
import { chartDiagnostic } from './analysisChartData';
import { groupedRowText, rowGroup, rowGroupLayout, rowLabel, type ChartRowGroups } from './chartRowGroups';
import { distinctStatuses, statusBacking, statusBorderColor, statusFill, statusGlyph, statusKey, statusMarker, statusText } from './chartStatus';
import { CHART_BAND_OPACITY, chartSegmentedBoundsTheme, chartTheme, token } from './EChart';
import { QUIET_SCATTER } from './scatterDensity';
import { helperSeriesId } from './helperSeriesId';
import { COMPONENTS_MESSAGES } from '../messages';

const DEFAULT_JITTER = 0.6;
const MAX_JITTER = 0.9;
const HALF_CELL = 0.5;
const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;
const UINT32_MAX = 0xffffffff;
const RANGE_PADDING = 0.05;
const SCATTER_FILL_OPACITY = 0.8;
const GROUP_LABEL_OFFSET = 34;
const GROUP_FONT_SIZE = 11;
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
  const bounds = order.map(category => normalizeBound(categories.bounds?.get(category) ?? {}));
  const boundsByCategory = new Map(order.map((category, index) => [category, bounds[index]]));
  return { order, points, bounds, boundsByCategory };
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
function categoryGroups(groups: ChartRowGroups, order: readonly string[], takenSeriesIds: Set<string>): CustomSeriesOption {
  const { runs } = rowGroupLayout(groups, order);
  const theme = chartTheme();
  return {
    id: helperSeriesId('__scatterGroups', takenSeriesIds), type: 'custom', silent: true, animation: false, clip: false, tooltip: { show: false },
    encode: { x: [0, 1], y: -1 }, data: runs.map(run => [run.start, run.end]),
    renderItem: (params, api) => {
      const run = runs[params.dataIndex];
      const grid = params.coordSys as unknown as { x: number; y: number; width: number; height: number };
      const left = api.coord([run.start - HALF_CELL, 0])[0];
      const right = api.coord([run.end + HALF_CELL, 0])[0];
      const bottom = grid.y + grid.height;
      // A group narrower than its own label drops the label instead of overprinting its neighbours; the divider stays.
      const fits = right - left >= run.group.length * GROUP_FONT_SIZE * 0.62 + 4;
      return { type: 'group', children: [
        ...(fits ? [{ type: 'text' as const, style: { x: (left + right) / 2, y: bottom + GROUP_LABEL_OFFSET, text: run.group, fill: theme.axisLabel.color, fontSize: GROUP_FONT_SIZE, align: 'center' as const, verticalAlign: 'middle' as const } }] : []),
        ...(run.start > 0 ? [{ type: 'line' as const, shape: { x1: left, x2: left, y1: grid.y, y2: bottom + GROUP_LABEL_OFFSET }, style: { stroke: theme.splitLine.lineStyle.color, lineWidth: 1 } }] : []),
      ] };
    },
  };
}

/** Opt-in decorator: reuse legacy validation, group colours, symbols, selection keys and reference lines. */
export function scatterExtras(spec: ScatterSpec, lang: Lang, unit: string, project: (plain: ScatterSpec) => KindProjection): KindProjection {
  const quiet = spec.density === 'quiet';
  const cells = categoryCells(spec);
  const categories = spec.xCategories;
  const groups = categories?.groups;
  const input = cells?.points ?? spec.points;
  const plain = { ...spec, xCategories: undefined, points: input.map(point => ({ ...point, status: undefined })) };
  const base = project(plain);
  const originals = new Map<string, ScatterPoint>();
  for (const point of input) if (!originals.has(rowKey('scatter', point.id))) originals.set(rowKey('scatter', point.id), point);
  const pointByRowKey = new Map(base.rows.map((row, rowIndex) => {
    const point = originals.get(row.key);
    if (!point) throw new Error('Scatter projection row has no accepted point');
    const category = point.category ?? '';
    const bound = cells?.boundsByCategory.get(category) ?? {};
    return [row.key, { point, rowIndex, bound, categoryLabel: rowLabel(groups, category), categoryGroup: groups ? rowGroup(groups, category) : '', categoryText: groupedRowText(groups, category) }];
  }));
  const accepted = [...pointByRowKey.values()];
  const points = accepted.map(record => record.point);
  // Synthetic group/status series have no point and always resolve to undefined.
  const pointForDatum = (seriesIndex: number, dataIndex: number) => {
    const key = base.seriesKeys[seriesIndex]?.[dataIndex];
    return key === undefined ? undefined : pointByRowKey.get(key);
  };
  const statuses = distinctStatuses(points.map(point => point.status));
  const m = (key: keyof typeof COMPONENTS_MESSAGES) => formatText(COMPONENTS_MESSAGES[key], lang);
  const labels = boundLabelsOf(categories?.boundLabels, lang);
  const color = chartSegmentedBoundsTheme().lineStyle.color;
  const formatBound = (value: number) => formatNumber(value, lang, { maximumFractionDigits: 1 });
  const upper = spans(cells?.bounds ?? [], 'upper');
  const lower = spans(cells?.bounds ?? [], 'lower');
  const bands = spans(cells?.bounds ?? [], 'band');
  const referenceMarks = scatterReferenceMarks(spec);
  const separateBoundLines = base.seriesKeys.length > 0 && (upper.length > 0 || lower.length > 0)
    && (referenceMarks?.some(mark => mark.type === 'line') ?? false);
  const legend: KindProjection['legend'] = [...base.legend,
    ...(upper.length ? [{ label: labels.upper, color: { resolved: color }, symbol: 'line', dash: BOUND_DASH.upper.join(' ') }] : []),
    ...(lower.length ? [{ label: labels.lower, color: { resolved: color }, symbol: 'line', dash: BOUND_DASH.lower.join(' ') }] : []),
    ...(bands.length ? [{ label: labels.band, color: { resolved: color }, symbol: 'rect', opacity: CHART_BAND_OPACITY }] : []),
    ...statuses.map(status => ({ label: status.label, color: 'chart-no-data-pattern' as const, symbol: 'status', status })),
  ];
  const headers = [...base.headers];
  const csvHeaders = [...base.csvHeaders];
  if (categories) { headers[3] = spec.xLabel; csvHeaders[3] = spec.xLabel; }
  if (groups) { headers.splice(3, 0, groups.header); csvHeaders.splice(3, 0, groups.header); }
  if (categories?.bounds) { headers.push(labels.lower, labels.upper); csvHeaders.push(labels.lower, labels.upper); }
  if (statuses.length) { headers.push(m('chartHeaderStatus')); csvHeaders.push(m('chartHeaderStatus')); }
  const tableValues = base.tableValues.map((values, i) => {
    const { point, bound, categoryLabel, categoryGroup } = accepted[i]; const row = [...values];
    if (categories) row[3] = categoryLabel;
    if (groups) row.splice(3, 0, categoryGroup);
    if (categories?.bounds) row.push(...[bound.lower, bound.upper].map(value => value === undefined ? '' : formatBound(value)));
    if (statuses.length) row.push(statusText(point.status));
    return row;
  });
  const csvValues = base.csvValues.map((values, i) => {
    const { point, bound, categoryLabel, categoryGroup } = accepted[i]; const row = [...values];
    if (categories) row[3] = categoryLabel;
    if (groups) row.splice(3, 0, categoryGroup);
    if (categories?.bounds) row.push(bound.lower ?? '', bound.upper ?? '');
    if (statuses.length) row.push(statusText(point.status));
    return row;
  });
  const pointDetails = ({ point, bound, categoryText }: typeof accepted[number]) => {
    const detail = categories ? [categoryText] : [];
    if (categories?.bounds) {
      detail.push(`${labels.lower}: ${bound.lower === undefined ? '' : `${bound.lower} ${unit}`}`, `${labels.upper}: ${bound.upper === undefined ? '' : `${bound.upper} ${unit}`}`);
    }
    if (point.status) detail.push(statusText(point.status));
    return detail.join(' · ');
  };
  const rows = base.rows.map((row, i) => ({ ...row, label: [row.label, pointDetails(accepted[i])].filter(Boolean).join(' · ') }));
  const summary = cells ? formatText(COMPONENTS_MESSAGES.chartScatterCategorySummary, lang, {
    total: points.length, unknown: points.filter(point => point.y === null).length,
    legend: quiet ? formatText(COMPONENTS_MESSAGES.chartScatterGroupCount, lang, { count: base.legend.length }) : base.legend.map(item => item.label).join(', '), xLabel: spec.xLabel, yLabel: spec.yLabel, unit,
  }) : base.summary;
  const statusOutlines = base.seriesKeys.flatMap((keys, groupIndex) => {
    const data = keys.flatMap(key => {
      const point = key === undefined ? undefined : pointByRowKey.get(key)?.point;
      return point?.status ? [{ value: [point.x, point.y], status: point.status }] : [];
    });
    if (!data.length) return [];
    const group = base.legend[groupIndex];
    const effectiveFill = statusFill(legendColor(group.color), quiet ? QUIET_SCATTER.statusOpacity : SCATTER_FILL_OPACITY);
    const outline = { type: 'scatter' as const, symbol: group.symbol, ...(quiet ? { symbolSize: QUIET_SCATTER.statusSize } : {}), silent: true, animation: false, tooltip: { show: false }, emphasis: { disabled: true }, itemStyle: { color: 'transparent', opacity: quiet ? QUIET_SCATTER.ringOpacity : 1 } };
    const backings = quiet ? [] : data.flatMap(datum => {
      const backing = statusBacking(datum.status, effectiveFill);
      return backing ? [{ value: datum.value, itemStyle: { borderColor: backing, borderWidth: 6 } }] : [];
    });
    return [
      ...(backings.length ? [{ ...outline, id: `__scatterStatusBacking-${groupIndex}`, z: 3, data: backings }] : []),
      { ...outline, id: `__scatterStatusOutline-${groupIndex}`, z: 4, data: data.map(datum => ({ value: datum.value, itemStyle: { borderColor: statusBorderColor(datum.status, effectiveFill), borderWidth: quiet ? QUIET_SCATTER.ringWidth : 2 } })) },
    ];
  });
  return {
    ...base, rows, headers, csvHeaders, tableValues, csvValues, legend,
    // Per-point detail lives in rows (keyboard table, point selector, selection summary); the visible summary stays an aggregate.
    summary: [summary, ...statuses.map(status => `${statusGlyph(status)} ${status.label}: ${points.filter(point => point.status && statusKey(point.status) === statusKey(status)).length}`)].join(' · '),
    seriesKeys: [...base.seriesKeys, ...statusOutlines.map(() => []), ...(groups ? [[]] : []), ...(separateBoundLines ? [[]] : [])],
    option: active => {
      const original = base.option(active);
      const chosen = new Set(active);
      const theme = chartTheme();
      const series = (original.series as ScatterSeriesOption[]).map((series, s) => ({ ...series,
        data: (series.data as { value: number[]; itemStyle: { color: string; borderColor: string; borderWidth: number } }[]).map((datum, d) => {
          const key = base.seriesKeys[s][d]; const point = pointForDatum(s, d)?.point;
          if (!point?.status) return datum;
          const selected = key !== undefined && chosen.has(key);
          if (quiet) return { ...datum, symbolSize: QUIET_SCATTER.statusSize,
            itemStyle: { ...datum.itemStyle, opacity: QUIET_SCATTER.statusOpacity,
              ...(selected ? { shadowBlur: 6, shadowColor: token('chart-selection-outline') } : {}) },
            label: { ...statusMarker(point.status), show: selected, position: 'top' as const },
            emphasis: { label: { ...statusMarker(point.status), position: 'top' as const } },
          };
          return { ...datum, itemStyle: { ...datum.itemStyle, borderColor: statusBorderColor(point.status, datum.itemStyle.color), borderWidth: 2,
            ...(key !== undefined && chosen.has(key) ? { shadowBlur: 6, shadowColor: token('chart-selection-outline') } : {}) }, label: { ...statusMarker(point.status), position: 'top' as const } };
        }),
      }));
      let boundMarker: ScatterSeriesOption['markLine'];
      if (categories?.bounds && series.length) {
        const boundTheme = chartSegmentedBoundsTheme();
        const lines = (segments: Span[], part: 'upper' | 'lower', dash: number[]): NonNullable<NonNullable<ScatterSeriesOption['markLine']>['data']> => segments.map(span => [
          { name: labels[part], coord: [span.start - HALF_CELL, span[part]!], lineStyle: { ...boundTheme.lineStyle, type: dash }, label: { show: false } },
          { coord: [span.end + HALF_CELL, span[part]!] },
        ]);
        const marker = { ...boundTheme, data: [...lines(upper, 'upper', BOUND_DASH.upper), ...lines(lower, 'lower', BOUND_DASH.lower)] };
        // A markLine shares its parent style with every item. Use a separate carrier for the bounds.
        if (separateBoundLines) boundMarker = marker;
        else if (!series[0].markLine?.data?.length) series[0].markLine = marker;
        series[0].markArea = { silent: true, itemStyle: { color: boundTheme.lineStyle.color, opacity: CHART_BAND_OPACITY }, label: { show: false }, data: [
          ...bands.map((span): [{ coord: number[] }, { coord: number[] }] => [
            { coord: [span.start - HALF_CELL, span.lower!] }, { coord: [span.end + HALF_CELL, span.upper!] },
          ]),
          ...(series[0].markArea?.data ?? []),
        ] };
      }
      const takenSeriesIds = new Set(series.flatMap(({ id }) => id === undefined ? [] : [String(id)]));
      const yAxis = original.yAxis as YAXisComponentOption;
      const boundValues = (cells?.bounds ?? []).flatMap(bound => [bound.lower, bound.upper].filter((value): value is number => value !== undefined));
      const yRange = (extent: { min: number; max: number }) => {
        const references = referenceValues(referenceMarks, 'y');
        const min = Math.min(extent.min, ...boundValues, ...references); const max = Math.max(extent.max, ...boundValues, ...references);
        const padding = (max - min || Math.abs(min) || 1) * RANGE_PADDING;
        return { min: min - padding, max: max + padding };
      };
      const xAxis: XAXisComponentOption = cells ? { ...(original.xAxis as Extract<XAXisComponentOption, { type?: 'value' }>),
        // Explicit intervals start at the fixed minimum in ECharts 6.1. Half-cell ticks include integer centres.
        min: -HALF_CELL, max: Math.max(0, cells.order.length - 1) + HALF_CELL, interval: HALF_CELL,
        axisTick: { show: false }, splitLine: { show: false },
        name: spec.xLabel, nameGap: groups ? 64 : 32,
        axisLabel: { ...theme.axisLabel, hideOverlap: true, showMinLabel: false, showMaxLabel: false, formatter: (value: number) => Number.isInteger(value) && cells.order[value] !== undefined ? rowLabel(groups, cells.order[value]) : '' },
      } : original.xAxis as XAXisComponentOption;
      return {
        ...original, xAxis,
        ...(groups ? { grid: { top: 32, bottom: 90, left: 48, right: 40, containLabel: true } } : {}),
        yAxis: boundValues.length ? { ...yAxis, min: (extent: { min: number; max: number }) => yRange(extent).min, max: (extent: { min: number; max: number }) => yRange(extent).max } : yAxis,
        // HTML mode escapes every consumer string; rich-text braces remain literal text, never style instructions.
        tooltip: { ...theme.tooltip, renderMode: 'html', formatter: (p: { seriesIndex: number; dataIndex: number }) => {
          const record = pointForDatum(p.seriesIndex, p.dataIndex);
          return record === undefined ? '' : tableValues[record.rowIndex].map((value, column) => escapeHtml(`${headers[column]}: ${value}`)).join(' · ');
        } },
        series: [
          ...series,
          ...statusOutlines.map(outline => ({ ...outline, id: helperSeriesId(outline.id, takenSeriesIds) })),
          ...(groups && cells ? [categoryGroups(groups, cells.order, takenSeriesIds)] : []),
          ...(boundMarker ? [{ id: helperSeriesId('__scatterBounds', takenSeriesIds), type: 'scatter', silent: true,
            tooltip: { show: false }, data: [], markLine: boundMarker } satisfies ScatterSeriesOption] : []),
        ],
      };
    },
  };
}
