import { useCallback, useMemo, useState } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import { AnalysisChartFrame, LegendTree, type ChartSeries, type LegendTreeNode } from '@ap/components';
import { Button } from '@ap/ui';
import { breakdownRows, breakdownTree, isPlaceId, ROOT_PLACE, STATES, type BreakdownRow, type StateId } from './breakdownData';

const OPEN: ReadonlySet<string> = new Set(['states', ROOT_PLACE, 'B']);
type Trust = { source: string; updated: string; coverage: string };

/** #580 domain-neutrality fixtures: an additive stack with labels, a ratio drawn grouped, and an uneven-depth drill tree. */
export function BreakdownBars({ height, trust }: { height: number; trust: Trust }) {
  const { tx, lang } = useI18n();
  const { pageParam, setPage } = usePlatform();
  const rawNode = pageParam('node');
  const node = isPlaceId(rawNode) ? rawNode : ROOT_PLACE;
  const [visible, setVisible] = useState<ReadonlySet<string>>(() => new Set(STATES.map(state => state.id)));
  const [minMax, setMinMax] = useState(false);
  const rows = useMemo(() => breakdownRows(node, lang), [node, lang]);
  const nodes = useMemo(() => breakdownTree(tx), [tx]);
  const make = useCallback((value: (row: BreakdownRow, id: StateId) => number): ChartSeries[] => STATES.map(state => ({
    id: state.id, name: tx(state.label), color: state.color, kind: 'bar', points: rows.map(row => [row.label, value(row, state.id)]),
  })), [rows, tx]);
  const minutes = useMemo(() => make((row, id) => row.minutes[id]), [make]);
  const shares = useMemo(() => make((row, id) => Math.round(row.minutes[id] / row.total * 1000) / 10), [make]);
  const serverTotals = useMemo(() => new Map(rows.map(row => [row.label, row.serverShareTotal] as const)), [rows]);
  const visibleSeriesIds = [...visible];
  const half = Math.max(200, Math.floor(height / 2));
  const common = { xType: 'category' as const, orientation: 'horizontal' as const, metricVersion: 'synthetic v1', trust, height: half, size: 'hero' as const,
    legend: false, visibleSeriesIds, onVisibleSeriesChange: (ids: string[]) => setVisible(new Set(ids)) };
  return <div className="flex min-w-0 gap-3">
    <div className="min-w-0 flex-1 space-y-3">
      <div className="flex items-center justify-end">
        <Button type="button" size="toolbar" variant="secondary" aria-pressed={minMax} onClick={() => setMinMax(!minMax)}>{tx({ ko: '최소·최대', en: 'Min / Max' })}</Button>
      </div>
      <AnalysisChartFrame {...common} chartId="chart-catalog-breakdown-stacked" title={tx({ ko: '상태별 시간 (쌓은 막대)', en: 'Time by state (stacked)' })}
        description={tx({ ko: '더할 수 있는 측정 — 분', en: 'Additive measure — minutes' })}
        series={minutes} unit={tx({ ko: '분', en: 'min' })} stacked valueLabels="both" reaggregation="sum" minMax={minMax} />
      <AnalysisChartFrame {...common} chartId="chart-catalog-breakdown-ratio" title={tx({ ko: '상태별 비율 (묶음 막대)', en: 'Share by state (grouped)' })}
        description={tx({ ko: '더하지 않는 측정 — 비율', en: 'Non-additive measure — ratio' })}
        series={shares} unit="%" reaggregation="ratioOfSums" serverTotals={serverTotals} />
      {/* The Frame draws totals for stacked bars only, so the server totals of the grouped chart are listed here (gap reported in #580h). */}
      <p aria-label={tx({ ko: '서버 합계', en: 'Server totals' })} className="t-caption text-text-secondary">
        {tx({ ko: '서버 합계', en: 'Server totals' })}: {rows.map(row => `${row.label} ${row.serverShareTotal === null ? tx({ ko: '합계 없음', en: 'no total' }) : `${row.serverShareTotal}%`}`).join(' · ')}
      </p>
    </div>
    <LegendTree className="w-56 shrink-0" label={tx({ ko: '분해 트리', en: 'Breakdown tree' })} nodes={nodes} visible={visible} onVisibleChange={setVisible}
      currentId={node} defaultExpanded={OPEN} onDrill={id => { if (isPlaceId(id)) setPage({ node: id }); }} />
  </div>;
}
