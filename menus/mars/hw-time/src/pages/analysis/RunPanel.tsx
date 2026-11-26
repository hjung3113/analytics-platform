import { SlidersHorizontal } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnalysisChart, AnalysisChartFrame, FilterLine, SegmentedRadio, SmallMultiplesGrid, type AnalysisChartFrameProps, type ScatterSpec, type SmallMultiplesGridProps } from '@ap/components';
import type { ColumnFilter } from '@ap/contracts';
import { useAnalysisSelectionOutput, useI18n, useMessages } from '@ap/kernel';
import { Button, Popover, PopoverContent, PopoverTrigger, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge } from '@ap/ui';
import { HW_TIME_UNIT, type HtmJudgement, type HwTimeRunObservation, type HwTimeRuns } from '../../endpoints';
import { HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { htmEmphasisStatus, htmStatusText, htmStatusView } from '../../shared/htm';
import { applyRunPanelFilters, changeRunPanelFilters, runPanelFilterFields, validatePanelFilters } from './runPanelFilters';
import { runValue, shapeRunScatter, type RunScatterSettings } from './runScatterData';
import { DEFAULT_RUN_TREND_SETTINGS, shapeRunTrend } from './runTrendData';
import { RunTrendChart } from './RunTrendChart';

// The scatter starts in one colour (24 equipment colours and a 24-entry legend were the noise); the trend keeps one line per equipment.
const DEFAULT_SETTINGS = { scatter: { axis: 'equipment-module', color: 'single', value: 'motion' }, trend: DEFAULT_RUN_TREND_SETTINGS } satisfies Record<'scatter' | 'trend', RunScatterSettings>;
/** Short lower plot; Frame owns chart geometry and chrome. */
const VERDICT_HEIGHT = 160;
type TrendView = 'overlay' | 'split';

function TrendRangeCandidates({ output, categories }: {
  output: NonNullable<AnalysisChartFrameProps['analysisSelectionOutput']>; categories: readonly string[];
}) {
  const available = useMemo(() => categories.length ? {
    from: categories[0]!, to: categories[categories.length - 1]!, candidates: categories.map(value => ({ value, label: value })),
  } : undefined, [categories]);
  useAnalysisSelectionOutput(output.panelId, output.key, { available, instanceId: output.instanceId, subscribeHighlight: false });
  return null;
}

function Setting<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (next: T) => void }) {
  return <label className="flex items-center gap-2 text-sm"><span className="whitespace-nowrap">{label}</span>
    <Select value={value} onValueChange={next => { const option = options.find(option => option.id === next); if (option) onChange(option.id); }}>
      <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </label>;
}

/** Keyed by query generation at the caller so display settings and filters stay local to one authorised population. */
export function RunPanel({ kind, data, moduleId, motionId, motions, judgement, date, analysisSelectionOutput, equipmentSelectionOutput, selectionDisabled }: {
  kind: 'scatter' | 'trend'; data: HwTimeRuns; moduleId: string; motionId: string; motions: readonly string[]; judgement?: HtmJudgement; date?: string | null;
  analysisSelectionOutput?: AnalysisChartFrameProps['analysisSelectionOutput'];
  equipmentSelectionOutput?: NonNullable<SmallMultiplesGridProps['analysisSelectionOutput']>;
  selectionDisabled?: boolean;
}) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const n = useMessages(N);
  const { lang } = useI18n();
  const [settings, setSettings] = useState<RunScatterSettings>(DEFAULT_SETTINGS[kind]);
  // Module time sums the checked Motions under the server's Module judgement, so the trend title must not name one Motion (#3096).
  const moduleTrend = kind === 'trend' && settings.value === 'module';
  const subtitle = kind !== 'trend' ? m('runs', { module: moduleId, motion: motionId })
    : moduleTrend ? n('dailyModuleRuns', { module: moduleId }) : n('dailyRuns', { module: moduleId, motion: motionId });
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
  const [nextAnalysisTarget, setNextAnalysisTarget] = useState<HTMLDivElement | null>(null);
  const [trendView, setTrendView] = useState<TrendView>('split');
  const viewControl = useRef<HTMLDivElement>(null);
  const restoreViewFocus = useRef(false);
  // Each chart owns its toolbar, so switching views mounts the toggle in a different slot.
  useLayoutEffect(() => {
    if (!restoreViewFocus.current) return;
    restoreViewFocus.current = false;
    viewControl.current?.querySelector<HTMLButtonElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
  }, [trendView]);
  const equipment = useMemo(() => [...new Set([...data.points, ...data.daily].map(point => point.equipmentId))], [data]);
  const fields = useMemo(() => runPanelFilterFields(equipment, lang), [equipment, lang]);
  const filterLine = {
    fields, filters,
    onChange: (next: ColumnFilter[]) => setFilters(current => changeRunPanelFilters(current, next, fields).filters),
    validate: (next: ColumnFilter) => validatePanelFilters([next], fields).ok ? null : HW_TIME_OVERVIEW_MESSAGES.invalidPanelFilters,
    scopeLabel: HW_TIME_OVERVIEW_MESSAGES.panelOnly, 'aria-label': m('panelOnly'),
  };
  const projected = useMemo(() => {
    const narrow = (points: readonly HwTimeRunObservation[]) => {
      const rows = points.map(point => { const selected = runValue(point, settings.value, motions); return { ...point, value: selected.value, judgement: selected.judgement }; });
      return applyRunPanelFilters(rows, filters, fields);
    };
    const sampled = narrow(data.points);
    const daily = narrow(data.daily);
    return { sampled, daily,
      scatter: shapeRunScatter({ points: sampled.rows, bounds: data.bounds }, settings, motions, lang),
      trend: shapeRunTrend(daily.rows, settings, motions, lang) };
  }, [data, fields, filters, lang, motions, settings]);
  const observations = kind === 'scatter' ? projected.sampled.rows : projected.daily.rows;
  const activeDay = date && projected.trend.categories.find(category => category === date || category === date.slice(5));
  const partial = observations.some(point => point.value === null);
  const contextNote = [m('synthetic'), judgement && htmStatusText(judgement, lang), partial && m('partial')].filter(Boolean).join(' · ');
  const axis = projected.scatter.axis;
  const axisLabel = axis === 'equipment-module' ? m('equipmentModule') : axis === 'equipment' ? m('equipment') : m('modules');
  // Out-of-bound points only carry a status (same rule as the bar pieces): a neutral `판정 불가` on every point would drown the emphasis.
  const scatter: ScatterSpec = {
    kind: 'scatter', density: 'quiet', xUnit: '', xLabel: axisLabel, yLabel: settings.value === 'motion' ? m('motionTime') : m('moduleTime'),
    groups: projected.scatter.groups,
    points: projected.scatter.points.map(point => ({ id: point.id, x: null, y: point.y, group: point.group, category: point.category,
      status: htmEmphasisStatus(point.status) })),
    xCategories: projected.scatter.xCategories,
  };
  const change = <K extends keyof RunScatterSettings>(key: K, value: RunScatterSettings[K]) => setSettings(current => ({ ...current, [key]: value }));
  const hasTrendDates = kind === 'trend' && projected.trend.categories.length >= 2;
  const canSplit = kind === 'trend' && equipmentSelectionOutput !== undefined;
  const splitTrend = canSplit && trendView === 'split';
  const multiples = useMemo(() => splitTrend ? projected.trend.smallMultiples() : null, [projected.trend, splitTrend]);
  const joinTrendHeader = hasTrendDates && !splitTrend;
  const viewToggle = canSplit && <div ref={viewControl} className="shrink-0">
    <SegmentedRadio<TrendView> label={n('trendView')} value={trendView} options={[
      { value: 'overlay', label: n('trendOverlay') }, { value: 'split', label: n('trendSplit') },
    ]} onChange={next => { restoreViewFocus.current = true; setTrendView(next); }} />
  </div>;
  const settingsContent = <>
    {judgement && <StatusBadge tone={htmStatusView(judgement, lang)?.tone ?? 'success'}>{htmStatusText(judgement, lang)}</StatusBadge>}
      <div className="flex flex-wrap items-center gap-3">
        {kind === 'scatter' && <Setting label={m('axis')} value={settings.axis} onChange={next => change('axis', next)} options={[
          { id: 'equipment-module', label: m('equipmentModule') }, { id: 'equipment', label: m('equipment') }, { id: 'module', label: m('modules') },
        ]} />}
        {!splitTrend && <Setting label={m('color')} value={settings.color} onChange={next => change('color', next)} options={[
          ...(kind === 'scatter' ? [{ id: 'single' as const, label: m('singleColor') }] : []), { id: 'equipment', label: m('equipment') }, { id: 'module', label: m('modules') }, { id: 'status', label: m('status') },
        ]} />}
        <Setting label={m('value')} value={settings.value} onChange={next => change('value', next)} options={[
          { id: 'motion', label: m('motionTime') }, { id: 'module', label: m('moduleTime') },
        ]} />
      </div>
      <FilterLine {...filterLine} />
      {!projected.sampled.validation.ok && <p role="alert">{m('invalidPanelFilters')}</p>}
      <p className="t-caption text-text-secondary">{m('runReady', { points: String(projected.scatter.points.length), daily: String(projected.daily.rows.length) })}</p>
      {settings.value === 'module' && <p className="t-caption text-text-secondary">{m('moduleStatusNote')}</p>}
      {kind === 'scatter' && <>
        <p className="t-caption text-text-secondary">{m('sample', { shown: String(data.shown), total: String(data.total) })}</p>
        {projected.scatter.boundConflicts.length > 0 && <p className="t-caption text-text-secondary">{m('boundConflict')}</p>}
      </>}
      {kind === 'trend' && !splitTrend && <p className="t-caption text-text-secondary">{m('trendBandPolicy')}</p>}
  </>;
  const settingsIcon = <><SlidersHorizontal className="size-3.5" aria-hidden /><span className="sr-only">{m('panelSettings')}</span>
    {filters.length > 0 && <span className="text-tiny tabular">{filters.length}</span>}
  </>;
  const settingsPopover = <Popover>
    <PopoverTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={m('panelSettings')} title={m('panelSettings')}>{settingsIcon}</Button></PopoverTrigger>
    <PopoverContent align="start" aria-label={m('panelSettings')}><div className="flex max-h-96 flex-col gap-2 overflow-auto break-keep">{settingsContent}</div></PopoverContent>
  </Popover>;
  const panelHeader = <div className={joinTrendHeader ? 'flex min-w-0 flex-1 items-center gap-2 break-keep' : 'relative flex shrink-0 items-center gap-2 px-2 py-0.5'}>
    <h3 className="t-caption min-w-0 flex-1 truncate" title={subtitle}>{subtitle}</h3>
    {viewToggle}
    {joinTrendHeader ? settingsPopover : <details>
      <summary aria-label={m('panelSettings')} title={m('panelSettings')} className="flex size-7 cursor-pointer list-none items-center justify-center rounded-md text-text-secondary hover:bg-surface-row-hover focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-focus-ring">{settingsIcon}</summary>
      <div className="absolute inset-x-0 top-full z-10 flex max-h-96 flex-col gap-2 overflow-auto rounded-md border border-border-subtle bg-surface-popover p-3 shadow-md">{settingsContent}</div>
    </details>}
  </div>;
  return <section aria-label={m('runs', { module: moduleId, motion: motionId })} data-testid={`hw-overview-${kind}`} className="flex h-full min-h-0 flex-col">
    <p className="sr-only">{contextNote}</p>
    {!joinTrendHeader && !splitTrend && panelHeader}
    {kind === 'scatter' && <div className="flex min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col"><AnalysisChart legendPlacement="bottom" toolsReveal="always" legendCaption={contextNote} description={contextNote} chartId="hw-overview-runs-scatter" title={m('distribution')} spec={scatter} unit={HW_TIME_UNIT[lang]} size="fill" /></div>
      </div>}
      {kind === 'trend' && (hasTrendDates || multiples) && <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {multiples && <div className="flex min-h-48 flex-1 flex-col">
          {analysisSelectionOutput && !selectionDisabled && <TrendRangeCandidates output={analysisSelectionOutput} categories={projected.trend.categories} />}
          <SmallMultiplesGrid series={multiples.series} sortOptions={multiples.sortOptions} title={subtitle} unit={HW_TIME_UNIT[lang]}
          boundLabels={projected.trend.boundLabels} showAxisControl showDensityControl analysisSelectionOutput={equipmentSelectionOutput}
          selectionDisabled={selectionDisabled} table={multiples.table} actions={<>{viewToggle}{settingsPopover}</>} /></div>}
        {joinTrendHeader && <div className="flex min-h-min flex-1 flex-col"><RunTrendChart chartId="hw-overview-runs-trend" trend={projected.trend} description={contextNote} activeCategory={activeDay || null} toolbarStart={panelHeader}
          analysisSelectionOutput={analysisSelectionOutput} nextAnalysisTarget={nextAnalysisTarget} /></div>}
        {/* Prototype A (#2740): the split view is the grid alone; the daily verdict counts belong to the overlay. */}
        {joinTrendHeader && <div className="flex h-48 shrink-0 flex-col"><AnalysisChartFrame summary="quiet" chartId="hw-overview-runs-trend-verdicts" title={m('trendVerdicts')}
          series={projected.trend.verdictSeries} xType="category" stacked unit={m('equipmentCount')} size="fill" fillMin={VERDICT_HEIGHT}
          legendPlacement="side" toolsReveal="hover" canApplyRange={false} emphasisFocus="none" /></div>}
      </div>}
    {kind === 'trend' && !hasTrendDates && !splitTrend && <p className="t-caption px-2 text-text-secondary">{m('trendNeedsDays')}</p>}
    {analysisSelectionOutput !== undefined && joinTrendHeader && <div ref={setNextAnalysisTarget} className="shrink-0" />}
  </section>;
}
