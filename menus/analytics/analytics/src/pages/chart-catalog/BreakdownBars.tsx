import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useI18n, usePlatform } from '@ap/kernel';
import { AnalysisChartFrame, LegendTree, StateMessage, type ChartSeries } from '@ap/components';
import { Button, Checkbox } from '@ap/ui';
import { breakdownRows, breakdownTree, isPlaceId, placeIdPath, ROOT_PLACE, SHIFTS, STATES, type BreakdownRow, type ShiftId, type StateId } from './breakdownData';

const STATE_IDS: readonly string[] = STATES.map(state => state.id);
const SHIFT_IDS: readonly string[] = SHIFTS.map(shift => shift.id);
type Trust = { source: string; updated: string; coverage: string };

/** #580 domain-neutrality fixtures: an additive stack with labels, a ratio drawn grouped, and an uneven-depth drill tree. */
export function BreakdownBars({ height, trust }: { height: number; trust: Trust }) {
  const { tx, lang } = useI18n();
  const { pageParam, setPage } = usePlatform();
  const rawNode = pageParam('node');
  // Absent = the root. A present value that names no place is rejected, never replaced by the root (06 §6.4; the ProductivityOverview "not in this context" message).
  const invalidNode = rawNode !== null && !isPlaceId(rawNode) ? rawNode : null;
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
  const none = tx({ ko: '없음', en: 'none' });
  const caption = `${tx({ ko: '서버 합계', en: 'Server total' })} — ${rows.map(row => `${row.label} ${row.serverUtilizationTotal === null ? none : `${row.serverUtilizationTotal}%`}`).join(' · ')}`;
  return <div className="flex min-w-0 gap-3">
    <div className="min-w-0 flex-1 space-y-3">
      {invalidNode !== null ? <StateMessage tone="warning" icon={<AlertTriangle className="size-4" aria-hidden />}
        title={tx({ ko: `이 조건에서 없는 값: ${invalidNode}`, en: `No value in this context: ${invalidNode}` })}
        body={tx({ ko: '다른 값으로 바꾸지 않습니다.', en: 'Nothing was substituted.' })}
        action={<Button type="button" size="sm" variant="secondary" onClick={() => setPage({ node: null })}>{tx({ ko: '전체로 돌아가기', en: 'Back to all' })}</Button>} /> : <>
        <div className="space-y-1">
          <label className="flex w-fit cursor-pointer items-center gap-2 t-caption">
            <Checkbox checked={minMax} onCheckedChange={checked => setMinMax(checked === true)} />
            {tx({ ko: '최소·최대 표시', en: 'Show min·max' })}
          </label>
          <AnalysisChartFrame {...common} {...frameVisibility(STATE_IDS)} chartId="chart-catalog-breakdown-stacked" title={tx({ ko: '상태별 시간 (쌓은 막대)', en: 'Time by state (stacked)' })}
            description={tx({ ko: '더할 수 있는 측정 — 분', en: 'Additive measure — minutes' })}
            series={minutes} unit={tx({ ko: '분', en: 'min' })} stacked valueLabels="both" reaggregation="sum" minMax={minMax} />
        </div>
        <div className="space-y-1">
          <AnalysisChartFrame {...common} {...frameVisibility(SHIFT_IDS)} chartId="chart-catalog-breakdown-ratio" title={tx({ ko: '교대별 가동률 (묶음 막대)', en: 'Utilization by shift (grouped)' })}
            description={tx({ ko: '더하지 않는 측정 — 비율, 교대마다 분모가 다름', en: 'Non-additive measure — ratio, a different denominator per shift' })}
            series={utilization} unit="%" reaggregation="ratioOfSums" serverTotals={serverTotals} />
          {/* The Frame draws totals for stacked bars only, so the server totals of the grouped chart are listed here (gap reported in #580h). */}
          <p data-breakdown-server-total="" className="t-caption px-1 text-text-secondary">{caption}</p>
        </div>
      </>}
    </div>
    {/* Inner padding keeps the focus ring of the rows inside the clipping chart workspace. */}
    <div className="w-56 shrink-0 p-1.5"><LegendTree label={tx({ ko: '분해 트리', en: 'Breakdown tree' })} nodes={nodes} visible={visible} onVisibleChange={setVisible}
      currentId={invalidNode === null ? node : null} defaultExpanded={initiallyOpen} canDrill={isPlace} onDrill={id => { if (isPlaceId(id)) setPage({ node: id }); }} /></div>
  </div>;
}
