import { BrushIcon, Download, GitCompare, MessageSquarePlus, MoreHorizontal, RotateCcw, Table2, ZoomIn } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ECharts, EChartsCoreOption } from 'echarts/core';
import { useI18n, usePlatform } from '@ap/kernel';
import { formatDateTime, formatMetricVersion, parseDateTime } from '@ap/contracts';
import { Button, cn, Popover, PopoverContent, PopoverTrigger } from '@ap/ui';
import { EChart, token } from './EChart';

export type ChartSeries = {
  id: string;
  name: string;
  /** CSS custom property name from tokens.css, e.g. 'chart-blue'. */
  color: string;
  /** [x, y]: x is a naive wall-clock datetime (time axis) or a category label. null = unknown, never 0. */
  points: [string, number | null][];
  kind?: 'line' | 'bar';
  dashed?: boolean;
};

export type Annotation = { id: number; chartId: string; from: string; to: string; text: string; at: string };

/** Persistent Annotation stand-in (§6 layer 4): owned outside chart state; survives Reset/remount, not reload. */
const annotationRows: Annotation[] = [];
const annotationListeners = new Set<() => void>();
let annotationVersion = 0;
export const annotationStore = {
  list: (chartId: string) => annotationRows.filter(a => a.chartId === chartId),
  add(a: Omit<Annotation, 'id' | 'at'>) { annotationRows.push({ ...a, id: annotationRows.length + 1, at: new Date().toISOString().slice(0, 16) }); annotationVersion++; annotationListeners.forEach(l => l()); },
  subscribe(l: () => void) { annotationListeners.add(l); return () => { annotationListeners.delete(l); }; },
  version: () => annotationVersion,
};

type Selection = { from: string; to: string };
const toMs = (v: string) => parseDateTime(v, 'x').getTime();
const fmt = (v: string) => v.replace('T', ' ').slice(0, 16);

export type AnalysisChartFrameProps = {
  chartId: string;
  title: ReactNode;
  description?: ReactNode;
  metricVersion?: string;
  series: ChartSeries[];
  /** Shown only while Compare is on (e.g. previous period, other group). */
  compareSeries?: ChartSeries[];
  xType?: 'time' | 'category';
  unit: string;
  valueFormat?: (v: number) => string;
  height?: number;
  trust?: { source: string; updated: string; coverage: string };
  /** Time axis only: allow promoting a brushed range to the global period (explicit Apply). */
  canApplyRange?: boolean;
  /** Page-owned actions for the current brushed selection (e.g. filter a table). */
  selectionActions?: (selection: Selection) => ReactNode;
  /** Explicit drill-down on a data point; charts never silently mutate global Context on click. */
  onPointClick?: (x: string, seriesId: string) => void;
  pointClickHint?: string;
  markLines?: { y: number; label: string }[];
  extraActions?: ReactNode;
  stacked?: boolean;
};

/**
 * §16 Chart Frame: Title/Actions → Description/Metric Version → Legend → Plot → Selection Summary → Source·Updated·Coverage.
 * State layers stay separate: Global Context (URL) · Page Filter (page) · Chart Local State (here) · Persistent Annotation (store).
 */
export function AnalysisChartFrame(p: AnalysisChartFrameProps) {
  const { t, lang } = useI18n();
  const { setGlobal, toast, global } = usePlatform();
  const titleId = useId();
  const xType = p.xType ?? 'time';
  const chart = useRef<ECharts | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [compare, setCompare] = useState(false);
  const [brushMode, setBrushMode] = useState(false);
  const [zoom, setZoom] = useState<[number, number]>([0, 100]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<Selection | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  useSyncExternalStore(annotationStore.subscribe, annotationStore.version);
  const annotations = annotationStore.list(p.chartId);

  const allSeries = useMemo(() => [...p.series, ...(compare ? p.compareSeries ?? [] : [])], [p.series, p.compareSeries, compare]);
  const visible = allSeries.filter(s => !hidden.has(s.id));
  const categories = useMemo(() => (xType === 'category' ? p.series[0]?.points.map(([x]) => x) ?? [] : []), [xType, p.series]);
  const format = p.valueFormat ?? ((v: number) => v.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { maximumFractionDigits: 1 }));

  const resetLocal = useCallback(() => {
    setHidden(new Set()); setCompare(false); setBrushMode(false); setZoom([0, 100]); setSelection(null); setPreview(null); setNote(null);
  }, []);
  // Global Context changes invalidate local selection (it described the previous result).
  const contextKey = JSON.stringify(global);
  useEffect(() => { setSelection(null); setPreview(null); setZoom([0, 100]); }, [contextKey]);

  const xValue = (x: string) => (xType === 'time' ? toMs(x) : x);
  const option = useMemo<EChartsCoreOption>(() => {
    const areas = [
      ...(selection ? [[{ name: lang === 'ko' ? '선택' : 'Selection', xAxis: xValue(selection.from), itemStyle: { color: token('chart-blue'), opacity: 0.12 } }, { xAxis: xValue(selection.to) }]] : []),
      ...annotations.map(a => [{ name: a.text, xAxis: xValue(a.from), itemStyle: { color: token('chart-purple'), opacity: 0.14 }, label: { color: token('cat-purple'), fontSize: 10 } }, { xAxis: xValue(a.to) }]),
    ];
    return {
      grid: { left: 52, right: 20, top: 16, bottom: 44 },
      tooltip: {
        trigger: 'axis', confine: true, textStyle: { fontSize: 12 },
        valueFormatter: (v: number | null) => (v === null || v === undefined ? (lang === 'ko' ? '미확인' : 'unknown') : `${format(v)} ${p.unit}`),
      },
      xAxis: xType === 'time'
        ? { type: 'time', axisLine: { lineStyle: { color: token('border-strong') } }, axisLabel: { hideOverlap: true }, splitLine: { show: false } }
        : { type: 'category', data: categories, axisLine: { lineStyle: { color: token('border-strong') } }, axisTick: { alignWithLabel: true } },
      yAxis: { type: 'value', min: 0, name: p.unit, nameTextStyle: { align: 'right' }, splitLine: { lineStyle: { color: token('chart-grid') } } },
      dataZoom: [{ type: 'inside', xAxisIndex: 0, start: zoom[0], end: zoom[1], zoomOnMouseWheel: 'shift', moveOnMouseMove: !brushMode }],
      brush: { xAxisIndex: 0, brushType: 'lineX', brushMode: 'single', throttleType: 'debounce', throttleDelay: 120, brushStyle: { color: 'rgba(59,156,255,0.12)', borderColor: token('chart-blue') } },
      toolbox: { show: false, feature: { brush: { type: ['lineX', 'clear'] } } },
      series: [
        ...visible.map(s => ({
          id: s.id, name: s.name, type: s.kind ?? 'line', stack: p.stacked && s.kind === 'bar' ? 'total' : undefined,
          showSymbol: false, symbolSize: 5, connectNulls: false, barMaxWidth: 18,
          lineStyle: { width: 2, type: s.dashed ? 'dashed' : 'solid' }, itemStyle: { color: token(s.color) },
          emphasis: { focus: 'series' },
          data: s.points.map(([x, y]) => (xType === 'time' ? [toMs(x), y] : y)),
        })),
        {
          id: '__overlay', type: 'line', data: [], silent: true, symbol: 'none',
          markArea: { silent: true, data: areas },
          markLine: p.markLines?.length ? { silent: true, symbol: 'none', lineStyle: { color: token('accent-warn'), type: 'dashed' }, label: { formatter: '{b}', fontSize: 10 }, data: p.markLines.map(m => ({ name: m.label, yAxis: m.y })) } : undefined,
        },
      ],
    };
    // Deps intentionally restricted to the chart inputs below (would trip react-hooks/exhaustive-deps if that rule is enabled).
  }, [visible, xType, categories, zoom, brushMode, selection, annotations.length, p.markLines, p.unit, lang, p.stacked]);

  // Re-arm the brush cursor after each option replacement.
  useEffect(() => {
    chart.current?.dispatchAction({ type: 'takeGlobalCursor', key: 'brush', brushOption: brushMode ? { brushType: 'lineX', brushMode: 'single' } : { brushType: false } });
  }, [option, brushMode]);

  const onEvents = useMemo(() => ({
    brushEnd: (params: { areas?: { coordRange?: [number, number] }[] }, instance: ECharts) => {
      const range = params.areas?.[0]?.coordRange;
      instance.dispatchAction({ type: 'brush', areas: [] });
      if (!range) return;
      if (xType === 'time') {
        const from = formatDateTime(new Date(Math.floor(range[0] / 1000) * 1000));
        const to = formatDateTime(new Date(Math.ceil(range[1] / 1000) * 1000));
        if (from < to) setSelection({ from, to });
      } else {
        const a = categories[Math.max(0, Math.round(range[0]))]; const b = categories[Math.min(categories.length - 1, Math.round(range[1]))];
        if (a && b) setSelection({ from: a, to: b });
      }
      setPreview(null);
    },
    datazoom: (_: unknown, instance: ECharts) => {
      const dz = (instance.getOption() as { dataZoom?: { start: number; end: number }[] }).dataZoom?.[0];
      if (dz) setZoom([dz.start, dz.end]);
    },
    click: (params: { seriesId?: string; value?: unknown; name?: string }) => {
      if (brushMode || !p.onPointClick || !params.seriesId || params.seriesId === '__overlay') return;
      const x = xType === 'time' && Array.isArray(params.value) ? formatDateTime(new Date(params.value[0] as number)) : params.name ?? '';
      p.onPointClick(x, params.seriesId);
    },
  }), [xType, categories, brushMode, p.onPointClick]);

  const selectionCounts = selection ? visible.map(s => {
    const inRange = s.points.filter(([x, y]) => y !== null && (xType === 'time' ? x >= selection.from && x < selection.to : categories.indexOf(x) >= categories.indexOf(selection.from) && categories.indexOf(x) <= categories.indexOf(selection.to)));
    const values = inRange.map(([, y]) => y as number);
    return { s, n: values.length, avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null, max: values.length ? Math.max(...values) : null };
  }) : [];

  function exportCsv() {
    const xs = [...new Set(visible.flatMap(s => s.points.map(([x]) => x)))];
    const rows = [['x', ...visible.map(s => s.name)], ...xs.map(x => [x, ...visible.map(s => { const pt = s.points.find(([px]) => px === x); return pt?.[1] === null || pt === undefined ? '' : String(pt[1]); })])];
    const meta = `# ${String(typeof p.title === 'string' ? p.title : p.chartId)} · scopeId=${global.scopeId ?? ''} · from=${global.from ?? ''} · to=${global.to ?? ''}${p.metricVersion ? ` · metricVersion=${p.metricVersion}` : ''}`;
    const blob = new Blob([meta + '\n' + rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${p.chartId}.csv`; a.click(); URL.revokeObjectURL(a.href);
    toast(lang === 'ko' ? `${p.chartId}.csv 내보냄 (보이는 시리즈, 현재 적용 Context 기준)` : `Exported ${p.chartId}.csv (visible series, applied context)`);
  }

  const tb = 'h-7 gap-1 px-2 text-[12px]';
  return <section role="region" aria-labelledby={titleId} className="flex flex-col rounded-lg border border-border-subtle bg-surface-card">
    <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-3">
      <div className="min-w-0">
        <h2 id={titleId} className="t-card-title">{p.title}</h2>
        {(p.description || p.metricVersion) && <p className="text-[12px] text-text-muted">{p.description}{p.metricVersion && <> · <span className="tabular">{t('metricVersion')} {formatMetricVersion(p.metricVersion)}</span></>}</p>}
      </div>
      <div role="toolbar" aria-label={lang === 'ko' ? '차트 동작' : 'Chart actions'} className="flex flex-wrap items-center gap-1">
        {p.extraActions}
        <Button variant="ghost" size="sm" className={tb} onClick={() => setZoom(([a, b]) => { const q = (b - a) / 4; return [a + q, b - q]; })} title={lang === 'ko' ? '확대 (Shift+휠도 가능)' : 'Zoom in (Shift+wheel)'}><ZoomIn className="size-3.5" aria-hidden />Zoom</Button>
        <Button variant="ghost" size="sm" className={cn(tb, brushMode && 'bg-accent-primary-soft text-accent-primary')} aria-pressed={brushMode} onClick={() => setBrushMode(b => !b)}><BrushIcon className="size-3.5" aria-hidden />Brush</Button>
        <Button variant="ghost" size="sm" className={tb} onClick={resetLocal}><RotateCcw className="size-3.5" aria-hidden />Reset</Button>
        {p.compareSeries && <Button variant="ghost" size="sm" className={cn(tb, compare && 'bg-accent-primary-soft text-accent-primary')} aria-pressed={compare} onClick={() => setCompare(c => !c)}><GitCompare className="size-3.5" aria-hidden />Compare</Button>}
        <Button variant="ghost" size="sm" className={tb} disabled={!selection} title={selection ? undefined : (lang === 'ko' ? 'Brush로 구간을 먼저 선택하세요' : 'Brush a range first')} onClick={() => setNote('')}><MessageSquarePlus className="size-3.5" aria-hidden />Annotate</Button>
        <Button variant="ghost" size="sm" className={tb} onClick={exportCsv}><Download className="size-3.5" aria-hidden />Export</Button>
        <Popover>
          <PopoverTrigger asChild><Button variant="ghost" size="sm" className={tb} aria-label="More"><MoreHorizontal className="size-3.5" aria-hidden /></Button></PopoverTrigger>
          <PopoverContent align="end" className="w-72 rounded-md border border-border-strong bg-surface-card p-3 text-[12px] shadow-md">
            <button type="button" className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 hover:bg-surface-sunken" onClick={() => setShowTable(s => !s)}><Table2 className="size-3.5" aria-hidden />{showTable ? (lang === 'ko' ? '데이터 표 숨기기' : 'Hide data table') : (lang === 'ko' ? '같은 데이터를 표로 보기' : 'Show same data as table')}</button>
            <p className="mt-2 border-t border-border-subtle pt-2 text-text-muted">{lang === 'ko'
              ? 'Zoom·Brush·시리즈 표시·Compare는 이 차트의 로컬 상태로 URL에 저장되지 않습니다. 구간을 전역 기간으로 올리려면 선택 요약의 “분석 구간 적용”을 명시적으로 눌러야 합니다. 주석은 별도 저장소에 보관되어 Reset 후에도 유지됩니다.'
              : 'Zoom, brush, series visibility and compare are local chart state, never written to the URL. Promoting a range to the global period requires the explicit “Apply analysis range”. Annotations live in a separate store and survive Reset.'}</p>
          </PopoverContent>
        </Popover>
      </div>
    </header>

    <div role="group" aria-label={lang === 'ko' ? '범례' : 'Legend'} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-2">
      {allSeries.map(s => <label key={s.id} className="inline-flex cursor-pointer items-center gap-1.5 text-[12px] text-text-secondary">
        <input type="checkbox" className="size-3.5 accent-[rgb(var(--accent-primary))]" checked={!hidden.has(s.id)} onChange={() => setHidden(h => { const n = new Set(h); if (n.has(s.id)) n.delete(s.id); else n.add(s.id); return n; })} />
        <span aria-hidden className={cn('inline-block h-0.5 w-4', s.dashed && 'border-t-2 border-dashed bg-transparent')} style={{ backgroundColor: s.dashed ? undefined : token(s.color), borderColor: token(s.color) }} />
        {s.name}
      </label>)}
      {brushMode && <span className="text-[11px] text-accent-primary">{lang === 'ko' ? '차트를 드래그해 구간을 선택하세요' : 'Drag across the chart to select a range'}</span>}
      {p.onPointClick && !brushMode && p.pointClickHint && <span className="text-[11px] text-text-muted">{p.pointClickHint}</span>}
    </div>

    <div className="px-2"><EChart option={option} height={p.height ?? 260} onEvents={onEvents} onReady={c => { chart.current = c; }}
      ariaLabel={`${typeof p.title === 'string' ? p.title : p.chartId}: ${visible.map(s => s.name).join(', ')}`} /></div>

    {showTable && <div className="mx-4 mb-2 max-h-56 overflow-auto rounded-md border border-border-subtle">
      <table className="w-full text-[12px] tabular">
        <thead className="sticky top-0 bg-surface-sunken"><tr><th className="t-table-header px-3 py-1.5 text-left text-text-muted">x</th>{visible.map(s => <th key={s.id} className="t-table-header px-3 py-1.5 text-right text-text-muted">{s.name}</th>)}</tr></thead>
        <tbody>{(visible[0]?.points ?? []).map(([x], i) => <tr key={x} className="border-t border-border-subtle">
          <td className="px-3 py-1">{xType === 'time' ? fmt(x) : x}</td>
          {visible.map(s => <td key={s.id} className="px-3 py-1 text-right">{s.points[i]?.[1] === null || s.points[i] === undefined ? '—' : format(s.points[i][1] as number)}</td>)}
        </tr>)}</tbody>
      </table>
    </div>}

    <section aria-label={lang === 'ko' ? '선택 요약' : 'Selection summary'} aria-live="polite" className="mx-4 mb-3 min-h-9 rounded-md bg-surface-sunken px-3 py-2 text-[12px]">
      {!selection ? <span className="text-text-muted">{lang === 'ko' ? '선택 구간 없음 — Brush로 구간을 선택하면 요약·주석·구간 적용을 할 수 있습니다.' : 'No selection — brush a range to summarize, annotate or apply it.'}</span>
        : <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="font-semibold tabular">{t('selectedRange')}: {xType === 'time' ? `${fmt(selection.from)} – ${fmt(selection.to)}` : `${selection.from} – ${selection.to}`}</span>
          {selectionCounts.map(c => <span key={c.s.id} className="tabular text-text-secondary">{c.s.name}: n={c.n}{c.avg !== null && ` · avg ${format(c.avg)} · max ${format(c.max!)}`} {p.unit}</span>)}
          <span className="ml-auto flex flex-wrap gap-2">
            {p.selectionActions?.(selection)}
            {xType === 'time' && p.canApplyRange !== false && <Button size="sm" className="h-7 px-2 text-[12px]" onClick={() => setPreview(selection)}>{lang === 'ko' ? '분석 구간 적용…' : 'Apply analysis range…'}</Button>}
            <Button size="sm" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setSelection(null)}>{t('clear')}</Button>
          </span>
        </div>}
      {preview && <div role="alertdialog" aria-label={lang === 'ko' ? '구간 적용 확인' : 'Confirm range'} className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-accent-primary bg-surface-card p-2">
        <span className="tabular">{lang === 'ko' ? '전역 기간을 다음으로 변경합니다 (초 정렬, [from, to)):' : 'Change the global period to (second-aligned, [from, to)):'} <b>{preview.from.replace('T', ' ')} → {preview.to.replace('T', ' ')}</b></span>
        <Button size="sm" className="h-7 px-2 text-[12px]" onClick={() => { setGlobal({ from: preview.from, to: preview.to }); toast(lang === 'ko' ? '선택 구간을 전역 기간으로 적용했습니다. 다른 메뉴로 이동해도 유지됩니다.' : 'Applied the selection as the global period; it carries across menus.'); }}>{t('apply')}</Button>
        <Button size="sm" variant="secondary" className="h-7 px-2 text-[12px]" onClick={() => setPreview(null)}>{t('cancel')}</Button>
      </div>}
      {note !== null && selection && <form className="mt-2 flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); if (!note.trim()) return; annotationStore.add({ chartId: p.chartId, from: selection.from, to: selection.to, text: note.trim() }); setNote(null); toast(lang === 'ko' ? '주석을 저장했습니다 (프로토타입 저장소: 새로고침 시 소멸).' : 'Annotation saved (prototype store: lost on reload).'); }}>
        <input autoFocus aria-label={lang === 'ko' ? '주석 내용' : 'Annotation text'} value={note} onChange={e => setNote(e.target.value)} placeholder={lang === 'ko' ? '예: PM 작업으로 인한 대기 증가' : 'e.g. queue spike due to PM'} className="h-7 min-w-64 flex-1 rounded-md border border-border-control bg-surface-card px-2" />
        <Button size="sm" type="submit" className="h-7 px-2 text-[12px]">{lang === 'ko' ? '저장' : 'Save'}</Button>
        <Button size="sm" type="button" variant="ghost" className="h-7 px-2 text-[12px]" onClick={() => setNote(null)}>{t('cancel')}</Button>
      </form>}
      {annotations.length > 0 && <ul className="mt-2 space-y-0.5 border-t border-border-subtle pt-1.5 text-[11px] text-text-secondary">
        {annotations.map(a => <li key={a.id} className="tabular"><span className="mr-1 inline-block size-2 rounded-xs bg-chart-purple/60 align-middle" aria-hidden />{xType === 'time' ? `${fmt(a.from)}–${fmt(a.to)}` : `${a.from}–${a.to}`}: {a.text}</li>)}
      </ul>}
    </section>

    {p.trust && <footer className="border-t border-border-subtle px-4 py-2 text-[11px] text-text-muted tabular">
      {t('source')}: <span className="t-mono text-[11px]">{p.trust.source}</span> · {t('updated')}: {p.trust.updated} · {t('coverage')}: {p.trust.coverage}
    </footer>}
  </section>;
}
