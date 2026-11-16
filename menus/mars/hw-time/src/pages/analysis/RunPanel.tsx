import { useMemo, useState } from 'react';
import { AnalysisChart, AnalysisChartFrame, FilterLine, type ChartPoint, type ScatterSpec } from '@ap/components';
import type { ColumnFilter } from '@ap/contracts';
import { useI18n, useMessages } from '@ap/kernel';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, StatusBadge } from '@ap/ui';
import { HW_TIME_UNIT, type HtmJudgement, type HwTimeRunObservation, type HwTimeRuns } from '../../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { formatSeconds } from '../../shared/format';
import { htmStatusText, htmStatusView } from '../../shared/htm';
import { applyRunPanelFilters, changeRunPanelFilters, runPanelFilterFields, validatePanelFilters } from './runPanelFilters';
import { runValue, shapeRunScatter, type RunScatterSettings } from './runScatterData';
import { shapeRunTrend } from './runTrendData';

const DEFAULT_SETTINGS: RunScatterSettings = { axis: 'equipment-module', color: 'equipment', value: 'motion' };
/** Lowest plot height before the panel body scrolls (px). */
const RUN_FILL_MIN = 200;
function Setting<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly { id: T; label: string }[]; onChange: (next: T) => void }) {
  return <label className="flex items-center gap-2 text-sm"><span className="whitespace-nowrap">{label}</span>
    <Select value={value} onValueChange={next => { const option = options.find(option => option.id === next); if (option) onChange(option.id); }}>
      <SelectTrigger aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.label}</SelectItem>)}</SelectContent>
    </Select>
  </label>;
}

/** Keyed by query generation at the caller: state is local to one authorised population, never persisted or written to the URL. */
export function RunPanel({ kind, data, moduleId, motionId, motions, judgement }: { kind: 'scatter' | 'trend'; data: HwTimeRuns; moduleId: string; motionId: string; motions: readonly string[]; judgement?: HtmJudgement }) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { lang } = useI18n();
  const [settings, setSettings] = useState<RunScatterSettings>(DEFAULT_SETTINGS);
  const [filters, setFilters] = useState<ColumnFilter[]>([]);
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
  const axisLabel = settings.axis === 'equipment-module' ? m('equipmentModule') : settings.axis === 'equipment' ? m('equipment') : m('modules');
  // Out-of-bound points only carry a status (same rule as the bar pieces): a neutral `판정 불가` on every point would drown the emphasis.
  const scatter: ScatterSpec = {
    kind: 'scatter', density: 'quiet', xUnit: '', xLabel: axisLabel, yLabel: settings.value === 'motion' ? m('motionTime') : m('moduleTime'),
    groups: projected.scatter.groups,
    points: projected.scatter.points.map(point => ({ id: point.id, x: null, y: point.y, group: point.group, category: point.category,
      ...(point.status && point.status.tone !== 'neutral' ? { status: point.status } : {}) })),
    xCategories: projected.scatter.xCategories,
  };
  const trendStatusOf = useMemo(() => {
    const of = projected.trend.pointStatusOf;
    return (point: ChartPoint) => { const status = of(point); return status?.tone === 'neutral' ? undefined : status; };
  }, [projected.trend.pointStatusOf]);
  const change = <K extends keyof RunScatterSettings>(key: K, value: RunScatterSettings[K]) => setSettings(current => ({ ...current, [key]: value }));
  return <section aria-label={m('runs', { module: moduleId, motion: motionId })} data-testid={`hw-overview-${kind}`} className="flex h-full min-h-0 flex-col gap-2">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="t-card-title">{m('runs', { module: moduleId, motion: motionId })}</h3>
      {judgement && <StatusBadge tone={htmStatusView(judgement, lang)?.tone ?? 'success'}>{htmStatusText(judgement, lang)}</StatusBadge>}
    </div>
      <div className="flex flex-wrap items-center gap-3">
        {kind === 'scatter' && <Setting label={m('axis')} value={settings.axis} onChange={next => change('axis', next)} options={[
          { id: 'equipment-module', label: m('equipmentModule') }, { id: 'equipment', label: m('equipment') }, { id: 'module', label: m('modules') },
        ]} />}
        <Setting label={m('color')} value={settings.color} onChange={next => change('color', next)} options={[
          { id: 'equipment', label: m('equipment') }, { id: 'module', label: m('modules') }, { id: 'status', label: m('status') },
        ]} />
        <Setting label={m('value')} value={settings.value} onChange={next => change('value', next)} options={[
          { id: 'motion', label: m('motionTime') }, { id: 'module', label: m('moduleTime') },
        ]} />
      </div>
      <FilterLine {...filterLine} />
      {!projected.sampled.validation.ok && <p role="alert">{m('invalidPanelFilters')}</p>}
      <p className="t-caption text-text-secondary">{m('runReady', { points: String(projected.scatter.points.length), daily: String(projected.trend.series.reduce((count, series) => count + series.points.length, 0)) })}</p>
      {settings.value === 'module' && <p className="t-caption text-text-secondary">{m('moduleStatusNote')}</p>}
      {kind === 'scatter' && <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="t-caption text-text-secondary">{m('sample', { shown: String(data.shown), total: String(data.total) })}</p>
        {projected.scatter.boundConflicts.length > 0 && <p className="t-caption text-text-secondary">{m('boundConflict')}</p>}
        <div className="flex min-h-0 flex-1 flex-col"><AnalysisChart chartId="hw-overview-runs-scatter" title={m('distribution')} spec={scatter} unit={HW_TIME_UNIT[lang]} size="fill" /></div>
      </div>}
      {kind === 'trend' && <div className="flex min-h-0 flex-1 flex-col gap-2">
        <p className="t-caption text-text-secondary">{m('trendBandPolicy')}</p>
        <div className="flex min-h-0 flex-1 flex-col"><AnalysisChartFrame chartId="hw-overview-runs-trend" title={m('trend')} series={projected.trend.series} xType="time"
          unit={HW_TIME_UNIT[lang]} valueFormat={value => formatSeconds(value, lang)} size="fill" fillMin={RUN_FILL_MIN} emphasisFocus="none"
          canApplyRange={false} pointStatus={trendStatusOf} bounds={projected.trend.bounds} boundLabels={projected.trend.boundLabels} /></div>
      </div>}
  </section>;
}
