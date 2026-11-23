import { useMessages } from '@ap/kernel';

import { ANALYTICS_MESSAGES } from '../../messages';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { AnalysisChartFrame, LegendTree, StateMessage, type AnalysisChartFrameProps, type ChartSeries } from '@ap/components';
import { Button, Checkbox } from '@ap/ui';
import { breakdownRows, breakdownTree, isPlaceId, placeIdPath, ROOT_PLACE, SHIFTS, STATES, type BreakdownRow, type ShiftId, type StateId } from './breakdownData';

const STATE_IDS: readonly string[] = STATES.map(state => state.id);
const SHIFT_IDS: readonly string[] = SHIFTS.map(shift => shift.id);
type Trust = { source: string; updated: string; coverage: string };

/** A present `node` that names no place; absent is the root. Checked before any catalogue query (06 §6.4). */
export function invalidBreakdownNode(rawNode: string | null): string | null {
  return rawNode !== null && !isPlaceId(rawNode) ? rawNode : null;
}

/** Rejects an unknown node instead of replacing it with the root (the ProductivityOverview "not in this context" message). */
export function BreakdownNodeRejection({ node }: { node: string }) {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { tx } = useI18n();
  const { setPage } = usePlatform();
  return <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />}
    title={m('breakdownBarsNoValueInThisContext', { node: String(node) })}
    body={m('breakdownBarsNothingWasSubstituted')}
    action={<Button type="button" size="sm" variant="secondary" onClick={() => setPage({ node: null })}>{m('breakdownBarsBackToAll')}</Button>} />;
}

/** #580 domain-neutrality fixtures: an additive stack with labels, a ratio drawn grouped, and an uneven-depth drill tree. */
export function BreakdownBars({ height, trust, stackMode, stackControl }: { height: number; trust: Trust; stackMode?: AnalysisChartFrameProps['stackMode']; stackControl: ReactNode }) {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { tx, lang } = useI18n();
  const { pageParam, setPage } = usePlatform();
  const rawNode = pageParam('node');
  // ChartCatalog rejects an invalid node before this renders (invalidBreakdownNode); absent = the root.
  const node = rawNode !== null && isPlaceId(rawNode) ? rawNode : ROOT_PLACE;
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set([...STATES.map(state => state.id), ...SHIFTS.map(shift => shift.id)]));
  const [minMax, setMinMax] = useState(false);
  // Read once: the root, the state branch and the ancestors of a deep-linked node are open; later drills reveal their own ancestors in the tree.
  const [initiallyOpen] = useState<ReadonlySet<string>>(() => new Set(['states', 'shifts', ROOT_PLACE, ...placeIdPath(node).slice(0, -1)]));
  const rows = useMemo(() => breakdownRows(node, lang), [node, lang]);
  const nodes = useMemo(() => breakdownTree(tx), [tx]);
  const minutes = useMemo<ChartSeries[]>(() => STATES.map(state => ({
    id: state.id, name: tx(state.label), color: state.color, kind: 'bar',
    points: rows.map(row => [row.label, row.minutes[state.id as StateId]]),
  })), [rows, tx]);
  const utilization = useMemo<ChartSeries[]>(() => SHIFTS.map(shift => ({
    id: shift.id, name: tx(shift.label), color: shift.color, kind: 'bar',
    points: rows.map(row => [row.label, row.utilization[shift.id as ShiftId]]),
  })), [rows, tx]);
  const serverTotals = useMemo(() => new Map(rows.map((row: BreakdownRow) => [row.label, row.serverUtilizationTotal] as const)), [rows]);
  const isPlace = useCallback((id: string) => isPlaceId(id), []);
  // Each Frame gets only its own series ids; its change keeps the other Frame's choices in the shared set.
  const frameVisibility = (own: readonly string[]) => ({
    visibleSeriesIds: own.filter(id => visible.has(id)),
    onVisibleSeriesChange: (ids: string[]) => setVisible(new Set([...[...visible].filter(id => !own.includes(id)), ...ids])),
  });
  const half = Math.max(200, Math.floor(height / 2));
  const common = { xType: 'category' as const, orientation: 'horizontal' as const, metricVersion: 'synthetic v1', trust, height: half, size: 'hero' as const,
    legend: false };
  const none = m('breakdownBarsNone');
  const caption = `${m('breakdownBarsServerTotal')} · ${rows.map(row => `${row.label} ${row.serverUtilizationTotal === null ? none : `${row.serverUtilizationTotal}%`}`).join(' · ')}`;
  return <div className="flex min-w-0 gap-3">
    <div className="min-w-0 flex-1 space-y-3">
      <div className="space-y-1">
        <label className="flex w-fit cursor-pointer items-center gap-2 t-caption">
          <Checkbox checked={minMax} onCheckedChange={checked => setMinMax(checked === true)} />
          {m('breakdownBarsShowMinMax')}
        </label>
        <AnalysisChartFrame {...common} {...frameVisibility(STATE_IDS)} chartId="chart-catalog-breakdown-stacked" title={m('breakdownBarsTimeByState')}
          description={m('breakdownBarsAdditiveMeasureMinutes')} toolbarStart={stackControl}
          series={minutes} unit={m('breakdownBarsMin')} stacked stackMode={stackMode} valueLabels={stackMode === 'none' ? undefined : 'both'} reaggregation="sum" minMax={minMax} />
      </div>
      <div className="space-y-1">
        <AnalysisChartFrame {...common} {...frameVisibility(SHIFT_IDS)} chartId="chart-catalog-breakdown-ratio" title={m('breakdownBarsUtilizationByShiftGrouped')}
          description={m('breakdownBarsNonAdditiveMeasureRatioADifferentDenominator')}
          series={utilization} unit="%" reaggregation="ratioOfSums" serverTotals={serverTotals} />
        {/* The Frame draws totals for stacked bars only, so the server totals of the grouped chart are listed here (gap reported in #580h). */}
        <p data-breakdown-server-total="" className="t-caption px-1 text-text-secondary">{caption}</p>
      </div>
    </div>
    {/* Inner padding keeps the focus ring of the rows inside the clipping chart workspace. */}
    <div className="w-56 shrink-0 p-1.5"><LegendTree label={m('breakdownBarsBreakdownTree')} nodes={nodes} visible={visible} onVisibleChange={setVisible}
      currentId={node} defaultExpanded={initiallyOpen} canDrill={isPlace} onDrill={id => { if (isPlaceId(id)) setPage({ node: id }); }} /></div>
  </div>;
}
