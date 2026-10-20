import { useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import { Button, cn } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { chartTheme, EChart, token } from './EChart';
import { toCsvDocument } from './tableExport';
import { chartData, chartColors as colors, cellKey as keyOf, chartDiagnostic as diagnostic } from './analysisChartData';
import { KindLegend } from './analysisChartKinds';
import { heatmapSymbolSize } from './analysisChartGeometry';
import { AnalysisSectionContext } from './AnalysisSectionContext';
import { AnalysisChartPart, ChartHeading, ChartTrustFooter } from './analysisChartFrameParts';

export type HeatmapCell = { x: string; y: string; value: number | null };
export type HeatmapSpec = {
  kind: 'heatmap';
  /** Explicit axis order. Missing coordinates remain empty; null is an unknown cell. */
  xLabels: string[]; yLabels: string[]; cells: HeatmapCell[];
  /** Thresholds are only for approved real judgements, not inferred status. */
  scale?: { type: 'sequential'; domain?: [number, number] }
    | { type: 'diverging'; pivot: number; domain?: [number, number]; lowerIsBetter?: boolean }
    | { type: 'threshold'; breaks: [number, number]; labels: [string, string, string] };
  valueFormat?: (v: number) => string;
  /** Explicit drill from Details only; canvas clicks select. */
  onCellClick?: (x: string, y: string) => void;
};
export type DonutSlice = { id: string; label: string; value: number; color?: ThemeColorToken };
export type DonutSpec = {
  kind: 'donut'; slices: DonutSlice[];
  /** Known denominator; excess is Unclassified. A denominator below the sum falls back to the sum. */
  total?: number;
  /** Defaults to 5, clamps to 2..5 including Other; Unclassified is always separate. */
  maxSlices?: number;
  centerLabel?: string;
  valueFormat?: (v: number) => string;
  /** Explicit drill from Details only; canvas clicks select. */
  onSliceClick?: (id: string) => void;
};
export type ScatterPoint = { id: string; x: number | null; y: number | null; group?: string; label?: string };
export type ScatterSpec = {
  kind: 'scatter'; points: ScatterPoint[]; xUnit: string; xLabel: string; yLabel: string;
  groups?: { id: string; label: string; color?: ThemeColorToken }[];
  referenceLines?: { axis: 'x' | 'y'; value: number; label: string }[];
  onPointClick?: (id: string) => void;
};
export type BoxStats = {
  /** Caller-owned whisker endpoints: extrema for minMax, outermost inliers within Tukey fences for tukey. */
  min: number; q1: number; median: number; q3: number; max: number; outliers?: number[]; n?: number;
};
export type BoxPlotSpec = {
  kind: 'boxPlot'; groups: { id: string; label: string; stats: BoxStats | null }[];
  /** Changes the description and validates endpoints; never infers observations or quartiles. */
  whisker: 'minMax' | 'tukey'; referenceLines?: { value: number; label: string }[];
  onGroupClick?: (id: string) => void;
};
export type ParetoSpec = {
  kind: 'pareto'; items: { id: string; label: string; value: number }[];
  /** Finite fraction in (0,1], default 0.8. */
  cumulativeTarget?: number;
  /** Total displayed cap including Other; floors and clamps to at least 2, default 10. */
  maxItems?: number; onItemClick?: (id: string) => void;
};
export type ChartSpec = HeatmapSpec | DonutSpec | ScatterSpec | BoxPlotSpec | ParetoSpec;
export type AnalysisChartProps = {
  chartId: string; title: ReactNode; description?: ReactNode; metricVersion?: string; unit: string;
  trust?: { source: string; updated: string; coverage: string }; height?: number; emptyText?: string; spec: ChartSpec;
};

const sequential = [colors.seq0, colors.seq1, colors.seq2, colors.seq3, colors.seq4];
const diverging = [colors.div0, colors.div1, colors.div2, colors.div3, colors.div4];
/** Kind-specific charts keep selection local; only Details invokes consumer drill callbacks. */
export function AnalysisChart(p: AnalysisChartProps) {
  const { lang } = useI18n();
  const { global, route, toast } = usePlatform();
  const section = useContext(AnalysisSectionContext);
  const titleId = useId(); const summaryId = useId();
  const [table, setTable] = useState(false);
  const chart = useRef<ECharts | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const brushedKeys = useRef<string[]>([]);
  const [brushMode, setBrushMode] = useState(false);
  const [instanceReady, setInstanceReady] = useState(false);
  const [plotSize, setPlotSize] = useState({ width: 0, height: 0 });
  const spec = p.spec;
  const { cells, rows, total, extended } = useMemo(() => chartData(spec, lang === 'ko', p.unit), [spec, lang, p.unit]);
  const keys = rows.map(row => row.key);
  const contextKey = JSON.stringify(global);
  const [previousContext, setPreviousContext] = useState(contextKey);
  const active = previousContext === contextKey ? selected.filter(key => keys.includes(key)) : [];
  if (previousContext !== contextKey) { setPreviousContext(contextKey); setSelected([]); }
  else if (active.length !== selected.length) setSelected(active);
  useEffect(() => { brushedKeys.current = []; if (spec.kind === 'heatmap' || spec.kind === 'scatter') clearBrush(chart.current); }, [contextKey, spec.kind]);
  useEffect(() => { brushedKeys.current = []; setBrushMode(false); }, [spec.kind]);
  const reset = () => { brushedKeys.current = []; setSelected([]); if (spec.kind === 'heatmap' || spec.kind === 'scatter') clearBrush(chart.current); };
  const toggle = (key: string) => setSelected(old => old.includes(key) ? old.filter(k => k !== key) : (spec.kind === 'donut' || spec.kind === 'boxPlot') ? [key] : [...old, key]);
  const format = (v: number) => ('valueFormat' in spec ? spec.valueFormat?.(v) : undefined) ?? String(v);
  const unknown = lang === 'ko' ? '미확인' : 'Unknown';
  const valueText = (v: number | null) => v === null ? unknown : `${format(v)} ${p.unit}`;
  const theme = chartTheme();
  const values = cells.flatMap(c => c.value === null ? [] : [c.value]);
  const scale = spec.kind === 'heatmap' ? spec.scale : undefined;
  let domain: [number, number] = scale && 'domain' in scale && scale.domain ? scale.domain : [values.length ? Math.min(...values) : 0, values.length ? Math.max(...values) : 0];
  let ramp: ThemeColorToken[] = sequential;
  if (scale?.type === 'diverging') {
    const half = Math.max(Math.abs(domain[0] - scale.pivot), Math.abs(domain[1] - scale.pivot));
    domain = [scale.pivot - half, scale.pivot + half];
    ramp = scale.lowerIsBetter === false ? [...diverging].reverse() : diverging;
  }
  const validThreshold = scale?.type !== 'threshold' || scale.breaks[0] < scale.breaks[1];
  if (!validThreshold) diagnostic('threshold breaks must be increasing; using sequential scale');
  function cellColor(value: number | null) {
    if (value === null) return token(colors.unknown);
    if (scale?.type === 'threshold' && validThreshold) return token(value < scale.breaks[0] ? colors.good : value < scale.breaks[1] ? colors.warn : colors.critical);
    const fraction = domain[1] === domain[0] ? 0.5 : (value - domain[0]) / (domain[1] - domain[0]);
    return token(ramp[Math.max(0, Math.min(4, Math.round(fraction * 4)))]);
  }
  const option: EChartsCoreOption = extended ? extended.option(active) : spec.kind === 'heatmap' ? {
    tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (params: { dataIndex: number }) => { const c = cells[params.dataIndex]; return c ? `${c.x} · ${c.y}: ${valueText(c.value)}` : ''; } },
    grid: { top: 16, bottom: 16, left: 16, right: 16, containLabel: true },
    xAxis: { type: 'category', data: spec.xLabels, axisLine: theme.axisLine, axisLabel: { ...theme.axisLabel, interval: spec.xLabels.length <= 24 ? 0 : 'auto' }, splitLine: theme.splitLine },
    yAxis: { type: 'category', data: spec.yLabels, axisLine: theme.axisLine, axisLabel: { ...theme.axisLabel, interval: spec.yLabels.length <= 24 ? 0 : 'auto' }, splitLine: theme.splitLine },
    brush: { toolbox: [], brushType: 'rect', xAxisIndex: 0, yAxisIndex: 0, inBrush: {}, outOfBrush: {} },
    series: [{ type: 'scatter', symbol: 'rect', symbolSize: heatmapSymbolSize(plotSize.width, plotSize.height, spec.xLabels.length, spec.yLabels.length), emphasis: { focus: 'none' }, data: cells.map(c => ({
      value: [spec.xLabels.indexOf(c.x), spec.yLabels.indexOf(c.y), c.value],
      itemStyle: { color: cellColor(c.value), borderColor: token(active.includes(keyOf(c.x, c.y)) ? colors.selection : colors.pattern), borderWidth: active.includes(keyOf(c.x, c.y)) ? 1.5 : c.value === null ? 1 : 0, borderType: c.value === null ? 'dashed' : 'solid' },
    })) }],
  } : {
    tooltip: { ...theme.tooltip, renderMode: 'richText', formatter: (params: { dataIndex: number }) => { const row = rows[params.dataIndex]; return row ? `${row.label}: ${valueText(row.value)} · ${percent(row.share ?? 0)}` : ''; } },
    series: [{ type: 'pie', radius: ['55%', '80%'], selectedMode: false, emphasis: { focus: 'none', scale: false }, label: { show: false }, data: rows.map(row => ({ name: row.label, value: row.value, itemStyle: { color: token(row.color!), borderColor: token(colors.selection), borderWidth: active.includes(row.key) ? 1.5 : 0 } })) }],
  };
  // notMerge replaces the brush model; restore the toolbox cursor after that replacement.
  useEffect(() => {
    if ((spec.kind === 'heatmap' || spec.kind === 'scatter') && chart.current && !chart.current.isDisposed?.()) {
      chart.current.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: { brushType: brushMode ? 'rect' : false, brushMode: 'single' } }, { silent: true });
    }
    measureGrid(chart.current);
  }, [option, brushMode, instanceReady]);
  function measureGrid(instance: ECharts | null) {
    if (spec.kind !== 'heatmap' || !instance || instance.isDisposed?.()) return;
    // ECharts exposes the laid-out grid through its runtime model (not in its public TS surface).
    const grid = (instance as unknown as { getModel?: () => { getComponent: (name: string) => { coordinateSystem?: { getRect: () => { width: number; height: number } } } | undefined } }).getModel?.().getComponent('grid');
    const rect = grid?.coordinateSystem?.getRect();
    if (rect) setPlotSize(old => old.width === rect.width && old.height === rect.height ? old : { width: rect.width, height: rect.height });
  }
  const summary = extended?.summary ?? (spec.kind === 'heatmap' ? (lang === 'ko' ? `${cells.length}칸 · ${spec.xLabels.length * spec.yLabels.length - cells.length}칸 비어 있음 · ${cells.filter(c => c.value === null).length}칸 미확인 · 단위 ${p.unit}` : `${cells.length} cells · ${spec.xLabels.length * spec.yLabels.length - cells.length} missing · ${cells.filter(c => c.value === null).length} unknown · Unit ${p.unit}`) : `${rows.length}${lang === 'ko' ? '개 항목 · 합계' : ' slices · Total'} ${format(total)} ${p.unit}`);
  const selectedRows = rows.filter(row => active.includes(row.key));
  let selectionSummary = active.length ? `${selectedRows.map(row => row.label).join(', ')} · ${active.length}${lang === 'ko' ? (spec.kind === 'heatmap' ? '칸 선택' : '개 선택') : ' selected'}` : (lang === 'ko' ? '선택 없음' : 'No selection');
  if (spec.kind === 'heatmap' && active.length > 3) {
    const range = (labels: string[], axis: 'x' | 'y') => {
      const selectedLabels = labels.filter(label => selectedRows.some(row => row[axis] === label));
      return selectedLabels.length === 1 ? selectedLabels[0] : `${selectedLabels[0]}–${selectedLabels.at(-1)}`;
    };
    selectionSummary = `${active.length}${lang === 'ko' ? '칸 선택' : ' cells selected'} · ${range(spec.yLabels, 'y')} · ${range(spec.xLabels, 'x')}`;
  }
  const empty = extended ? extended.empty : spec.kind === 'heatmap' ? !cells.length : total === 0;
  const headers = extended?.headers ?? (spec.kind === 'heatmap' ? ['x', 'y', lang === 'ko' ? '값' : 'Value'] : [lang === 'ko' ? '이름' : 'Name', lang === 'ko' ? '값' : 'Value', '%']);
  const tableValues = extended?.tableValues ?? rows.map(row => spec.kind === 'heatmap' ? [row.x!, row.y!, valueText(row.value)] : [row.label, valueText(row.value), percent(row.share ?? 0)]);
  function exportCsv() {
    const blob = new Blob([toCsvDocument(`# ${p.chartId} · ${p.unit}`, headers, tableValues)], { type: 'text/csv' });
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `${p.chartId}.csv`; link.click(); URL.revokeObjectURL(link.href);
    toast(lang === 'ko' ? `${p.chartId}.csv 내보냄` : `Exported ${p.chartId}.csv`);
  }
  return <section role="region" aria-labelledby={titleId} aria-describedby={summaryId} data-analysis-chart={section ? '' : undefined} className="relative flex min-w-0 flex-col rounded-lg border border-border-subtle bg-surface-card">
    <AnalysisChartPart enabled={section !== null}>
      <header className={cn('flex flex-wrap items-start justify-between gap-2 px-4 pt-3', section && 'pr-12')}>
        <ChartHeading titleId={titleId} title={p.title} description={p.description} metricVersion={p.metricVersion} />
        <div role="toolbar" aria-label={lang === 'ko' ? '차트 동작' : 'Chart actions'} className="flex flex-wrap gap-1">
          <Button size="toolbar" variant="ghost" onClick={reset}>{lang === 'ko' ? '초기화' : 'Reset'}</Button>
          {(spec.kind === 'heatmap' || spec.kind === 'scatter') && <Button size="toolbar" variant="ghost" aria-pressed={brushMode} onClick={() => setBrushMode(!brushMode)}>{lang === 'ko' ? '끌어서 선택' : 'Drag to select'}</Button>}
          <Button size="toolbar" variant="ghost" aria-pressed={table} onClick={() => setTable(!table)}>{lang === 'ko' ? '표로 보기' : 'Show as table'}</Button>
          {route?.menu.features?.export && <Button size="toolbar" variant="ghost" onClick={exportCsv}>{lang === 'ko' ? '내보내기' : 'Export'}</Button>}
        </div>
      </header>
      {spec.kind === 'heatmap' && <div className="px-4 py-2 text-xs text-text-secondary">
        {scale?.type === 'threshold' && validThreshold ? <div className="flex gap-3">{scale.labels.map((label, i) => <span key={i} className="flex items-center gap-1"><Swatch color={token([colors.good, colors.warn, colors.critical][i])} />{label}</span>)}</div> : <>
          {/* eslint-disable-next-line shadcn/no-inline-styles -- continuous scale legend resolves the five public ramp tokens at runtime */}
          <div className="h-2 w-full rounded" style={{ background: `linear-gradient(to right, ${ramp.map(c => token(c)).join(', ')})` }} />
          <div className="relative flex justify-between">
            <span>{format(domain[0])}</span>
            {scale?.type === 'diverging' && <span className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center">
              <span aria-hidden className="absolute bottom-full h-2 border-l border-border-strong" />
              <span>{format(scale.pivot)} {lang === 'ko' ? '목표' : 'target'}</span>
            </span>}
            <span>{format(domain[1])}</span>
          </div>
        </>}
        <span className="flex items-center gap-1"><Swatch color={token(colors.unknown)} unknown />{unknown}</span>
      </div>}
    </AnalysisChartPart>
    <AnalysisChartPart enabled={section !== null} body>
      <p id={summaryId} className="px-4 py-2 text-xs text-text-secondary">{summary}</p>
      {empty ? <p className="px-4 py-3 text-text-secondary">{p.emptyText ?? (lang === 'ko' ? '데이터 없음' : 'No data')}</p> : <div className="relative">
        <EChart key={spec.kind} onReady={instance => { chart.current = instance; setInstanceReady(true); }} onResize={() => measureGrid(chart.current)} option={option} height={p.height} ariaLabel={typeof p.title === 'string' ? p.title : p.chartId} onEvents={{
          click: params => { if (params.componentType !== 'series') return; const key = extended ? extended.seriesKeys[params.seriesIndex]?.[params.dataIndex] : rows[params.dataIndex]?.key; if (key) toggle(key); },
          finished: (_, instance) => measureGrid(instance),
          takeglobalcursor: params => { if (spec.kind === 'heatmap' || spec.kind === 'scatter') setBrushMode(params.key === 'brush' && params.brushOption?.brushType === 'rect'); },
          brushselected: params => { if (spec.kind !== 'heatmap' && spec.kind !== 'scatter') return; const selections: { seriesIndex: number; dataIndex: number[] }[] = params.batch?.[0]?.selected ?? []; brushedKeys.current = [...new Set(selections.flatMap(s => s.dataIndex.flatMap(i => { const key = extended ? extended.seriesKeys[s.seriesIndex]?.[i] : s.seriesIndex === 0 ? rows[i]?.key : undefined; return key ? [key] : []; })))]; },
          brushEnd: () => { if (spec.kind !== 'heatmap' && spec.kind !== 'scatter') return; const next = brushedKeys.current.filter(key => keys.includes(key)); setSelected(old => old.length === next.length && old.every(key => next.includes(key)) ? old : next); },
        }} />
        {spec.kind === 'donut' && <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center text-xs text-text-secondary">
          <p>{selectedRows[0]?.label ?? spec.centerLabel ?? (lang === 'ko' ? '합계' : 'Total')}</p>
          <p className="t-card-title">{valueText(selectedRows[0]?.value ?? total)}</p>
          {selectedRows[0] && <p>{percent(selectedRows[0].share ?? 0)}</p>}
        </div>}
      </div>}
      {extended && <KindLegend items={extended.legend} label={lang === 'ko' ? '범례' : 'Legend'} />}
      {spec.kind === 'donut' && <ul aria-label={lang === 'ko' ? '범례' : 'Legend'} className="flex flex-wrap gap-3 px-4 py-2 text-xs text-text-secondary">{rows.map(row => <li key={row.key} className="flex items-center gap-1"><Swatch color={token(row.color!)} />{row.label} · {valueText(row.value)} · {percent(row.share ?? 0)}</li>)}</ul>}
      <section aria-label={lang === 'ko' ? '선택 요약' : 'Selection summary'} className="bg-surface-sunken px-4 py-2 text-xs text-text-secondary">
        {selectionSummary}
        {selectedRows.length === 1 && selectedRows[0].drill && <Button size="toolbar" variant="ghost" onClick={selectedRows[0].drill}>{lang === 'ko' ? '상세' : 'Details'}</Button>}
      </section>
      {table && <div className="overflow-auto px-4 py-2"><table className="w-full text-xs"><caption>{p.title} · {p.unit}</caption>
        <thead className="bg-surface-sunken"><tr>{[...headers, lang === 'ko' ? '선택' : 'Select'].map(h => <th key={h} scope="col" className="text-text-secondary">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={row.key}>{tableValues[i].map((value, j) => <td key={j}>{value}</td>)}<td>
          <input type="checkbox" aria-label={`${lang === 'ko' ? '선택' : 'Select'} ${row.label}`} checked={active.includes(row.key)} onChange={() => toggle(row.key)} />
          {row.drill && <Button size="toolbar" variant="ghost" onClick={row.drill}>{lang === 'ko' ? '상세' : 'Details'}</Button>}
        </td></tr>)}</tbody>
      </table></div>}
      <ChartTrustFooter trust={p.trust} />
    </AnalysisChartPart>
  </section>;
}

function clearBrush(chart: ECharts | null) {
  if (chart && !chart.isDisposed?.()) chart.dispatchAction({ type: 'brush', areas: [] });
}

function percent(value: number) { return `${Number(value.toFixed(1))}%`; }

function Swatch({ color, unknown = false }: { color: string; unknown?: boolean }) {
  // eslint-disable-next-line shadcn/no-inline-styles -- swatch reflects runtime chart tokens; unknown matches the canvas dashed border
  return <span aria-hidden className="inline-block size-3" style={{ backgroundColor: color, border: unknown ? `1px dashed ${token(colors.pattern)}` : undefined }} />;
}
