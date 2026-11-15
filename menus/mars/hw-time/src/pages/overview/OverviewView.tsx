import { useMemo, useState } from 'react';
import { useI18n, useMenuQuery, useMessages, usePlatform } from '@ap/kernel';
import {
  AnalysisChart, AnalysisChartFrame, PageKeyWarning, PlatformDataTable, QueryView,
  type ChartPoint, type HeatmapSpec, type PlatformColumn,
} from '@ap/components';
import { Button, RadioGroup, RadioGroupItem, StatusBadge } from '@ap/ui';
import {
  HW_TIME_UNIT, hwTimeOverview,
  type HwTimeMatrix, type HwTimeMatrixCell, type HwTimeMotionStats,
} from '../../endpoints';
import { HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { formatSeconds, missingText } from '../../shared/format';
import { htmStatusText, htmStatusView } from '../../shared/htm';
import type { HwTimeFilter } from '../../shared/useHwTimeFilter';
import { HwTimeViewFrame } from '../../shared/HwTimeViewFrame';
import { useHwTimeDrillRules } from '../../shared/useHwTimeDrillRules';
import { RunPanel } from './RunPanel';

const CHART_HEIGHT = 420;
const BAR_ROW_PITCH = 28;
const rowLabel = (equipmentId: string, moduleId: string) => `${equipmentId} · ${moduleId}`;

/** Preserve unknowns: a partial or wholly unmeasured selection cannot be shown as a complete sum. */
function checkedSum(cell: HwTimeMatrixCell, motions: readonly string[]): number | null {
  const values = motions.map(id => cell.motions[id]?.value ?? null);
  if (values.length === 0 || values.some(value => value === null)) return null;
  return values.reduce<number>((sum, value) => sum + value!, 0);
}

/**
 * Server judgements as SDK chart payloads (#2326). No local per-piece styling or inferred judgements.
 * Bar pieces and heatmap cells carry only out-of-bound statuses (owner spec: only what is outside its HTM is emphasised). `판정 불가`
 * stays in the caption above the charts and in the Motion table: today almost every cell is unjudgeable, and a mark on each would
 * drown the out-of-bound ones (advisor, owner may reverse). Both read the same matrix cell, so a marked cell is a row with a marked piece.
 */
export function chartStatuses(data: HwTimeMatrix, lang: 'ko' | 'en') {
  const byLabel = new Map(data.cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), cell]));
  const pointStatusOf = (point: Pick<ChartPoint, 'x' | 'seriesId'>) => htmStatusView(byLabel.get(point.x)?.motions[point.seriesId], lang);
  const outOfBound = (status: ReturnType<typeof htmStatusView>) => status?.tone === 'neutral' ? undefined : status;
  const barStatusOf = (point: ChartPoint) => outOfBound(pointStatusOf(point));
  const cellStatus = new Map(data.cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), outOfBound(htmStatusView(cell.module, lang))]));
  /** The heatmap cell's mark: the worst server status among the checked Motions' bar pieces (over before under), so with every Motion
   * checked it is the server's Module roll-up and with fewer it matches what the bar row shows. Picks among server statuses, judges nothing. */
  const cellStatusOf = (label: string, motions: readonly string[]) => motions.map(seriesId => barStatusOf({ x: label, seriesId } as ChartPoint))
    .reduce<ReturnType<typeof barStatusOf>>((worst, status) => !worst || status?.tone === 'danger' ? status ?? worst : worst, undefined);
  const rowGroups = { header: HW_TIME_OVERVIEW_MESSAGES.equipment[lang], byCategory: new Map(data.cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), { group: cell.equipmentId, label: cell.moduleId }])) };
  return { pointStatusOf, barStatusOf, cellStatus, cellStatusOf, rowGroups };
}

function OverviewCharts({ data, filter, onModule }: { data: HwTimeMatrix; filter: HwTimeFilter; onModule: (moduleId: string) => void }) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { lang } = useI18n();
  const [focus, setFocus] = useState<string | null>(null);
  const [barMode, setBarMode] = useState<'stacked' | 'motion-aligned'>('stacked');
  const cells = data.cells.filter(cell => filter.modules.includes(cell.moduleId));
  const selectedMotions = data.motions.filter(motion => filter.motions.includes(motion.id));
  const statuses = useMemo(() => chartStatuses(data, lang), [data, lang]);
  const pointStatusOf = statuses.pointStatusOf;
  const focusCell = cells.find(cell => rowLabel(cell.equipmentId, cell.moduleId) === focus);
  const activeCategory = focusCell ? focus : null;
  const byLabel = new Map(cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), cell]));
  const heatCells = cells.map(cell => ({ x: cell.moduleId, y: cell.equipmentId, value: checkedSum(cell, filter.motions), status: statuses.cellStatusOf(rowLabel(cell.equipmentId, cell.moduleId), filter.motions) }));
  const heatMax = Math.max(0, ...heatCells.flatMap(cell => cell.value === null ? [] : [cell.value]));
  const heatmap: HeatmapSpec = {
    kind: 'heatmap', xLabels: data.modules.filter(id => filter.modules.includes(id)), yLabels: data.equipment, cells: heatCells,
    // Colour from 0: the cells are time totals, so every cell is filled by its size. A min–max ramp made the common value white and
    // left the few large rows as dark stripes between blank ones.
    scale: { type: 'sequential', domain: [0, heatMax] }, valueFormat: value => formatSeconds(value, lang),
    // The current SDK invokes this through Details; direct canvas-cell activation is an SDK gap reported with this change.
    onCellClick: (moduleId, equipmentId) => setFocus(rowLabel(equipmentId, moduleId)),
  };
  const series = selectedMotions.map(motion => ({
    id: motion.id, name: motion.id, color: motion.color, kind: 'bar' as const,
    points: cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), cell.motions[motion.id]?.value ?? null] as [string, number | null]),
  }));
  const cellStatus = focusCell ? statuses.cellStatus.get(activeCategory!) : undefined;
  const statusLabels = [...new Set(cells.map(cell => htmStatusText(cell.module, lang)))];
  const partial = cells.some(cell => filter.motions.some(motion => cell.motions[motion]?.value == null));
  if (!filter.modules.length || !filter.motions.length) return <p className="text-sm text-text-secondary">{m('noChecks')}</p>;
  return <div className="flex flex-col gap-2">
    <p className="t-caption text-text-secondary">{m('synthetic')} · {statusLabels.join(' · ')}</p>
    <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3">
      <AnalysisChart chartId="hw-overview-matrix" title={m('heatmap')} description={m('heatmapNote')} spec={heatmap} unit={HW_TIME_UNIT[lang]} height={CHART_HEIGHT} />
      <div className="flex min-w-0 flex-col gap-2">
      <RadioGroup appearance="segmented" orientation="horizontal" aria-label={m('barMode')} value={barMode}
        onValueChange={next => { if (next === 'stacked' || next === 'motion-aligned') setBarMode(next); }}>
        <RadioGroupItem appearance="segmented" value="stacked">{m('stacked')}</RadioGroupItem>
        <RadioGroupItem appearance="segmented" value="motion-aligned">{m('motionAligned')}</RadioGroupItem>
      </RadioGroup>
      <AnalysisChartFrame chartId="hw-overview-bars" title={m('bars')} description={m('barsNote')}
        series={series} unit={HW_TIME_UNIT[lang]} valueFormat={value => formatSeconds(value, lang)}
        xType="category" orientation="horizontal" stacked startAlign={barMode === 'motion-aligned'} emphasisFocus="none"
        height={CHART_HEIGHT} rowPitch={BAR_ROW_PITCH} rowGroups={statuses.rowGroups} pointStatus={statuses.barStatusOf} activeCategory={activeCategory} revealActive
        onActiveCategoryChange={setFocus} legend={false} visibleSeriesIds={selectedMotions.map(motion => motion.id)}
        canApplyRange={false} reaggregation="sum" valueLabels="both"
        pointActivation={{ on: 'click', onActivate: point => { const cell = byLabel.get(point.x); if (cell) onModule(cell.moduleId); } }} />
      </div>
    </div>
    {partial && <p className="t-caption text-text-secondary">{m('partial')}</p>}
    {focusCell && <p className="t-caption text-text-secondary" role="status">{activeCategory} · {cellStatus?.label ?? htmStatusText(focusCell.module, lang)} · {selectedMotions.map(motion => {
      const status = pointStatusOf({ x: activeCategory!, seriesId: motion.id });
      const judgement = focusCell.motions[motion.id];
      const label = judgement ? htmStatusText(judgement, lang) : missingText(lang);
      return `${motion.id}: ${status?.label ?? label}`;
    }).join(' · ')}</p>}
  </div>;
}

type MotionRow = HwTimeMotionStats['rows'][number];
function MotionTable({ data, filter, moduleId, motionId, onMotion }: { data: HwTimeMotionStats; filter: HwTimeFilter; moduleId: string; motionId: string | null; onMotion: (motionId: string) => void }) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { lang } = useI18n();
  const rows = useMemo(() => data.rows.filter(row => filter.motions.includes(row.motion)), [data.rows, filter.motions]);
  const valueText = (value: number | null) => value === null ? missingText(lang) : `${formatSeconds(value, lang)} ${HW_TIME_UNIT[lang]}`;
  const columns: PlatformColumn<MotionRow>[] = [
    { id: 'motion', header: m('motions'), value: row => row.motion, hideable: false },
    { id: 'average', header: m('average'), value: row => row.judgement.value, cell: row => valueText(row.judgement.value), align: 'right' },
    { id: 'bounds', header: m('bounds'), cell: row => `${valueText(row.judgement.lower)} ~ ${valueText(row.judgement.upper)}` },
    { id: 'status', header: m('status'), cell: row => {
      const status = htmStatusView(row.judgement, lang);
      return <StatusBadge tone={status?.tone ?? 'success'}>{htmStatusText(row.judgement, lang)}</StatusBadge>;
    } },
  ];
  const title = m('table', { module: moduleId });
  return <PlatformDataTable title={title} ariaLabel={title} columns={columns} rows={rows} getRowId={row => row.motion}
      activeRowId={motionId} preferenceKey="hw-time-overview:motions:v1" pageSize={10}
      rowAction={row => <Button variant="ghost" size="sm" onClick={() => onMotion(row.motion)}>{m('viewRuns', { motion: row.motion })}</Button>} />;
}

/** Query owner above the shared frame: empty projections keep observers and settings mounted; the matrix supplies panel Motion colours. */
export function OverviewView({ filter }: { filter: HwTimeFilter }) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { pageParam, setPage } = usePlatform();
  const moduleId = pageParam('drillModule');
  const motionId = pageParam('drillMotion');
  const drillKeys = useHwTimeDrillRules();
  const enabled = filter.invalid === null && !drillKeys.invalid;
  // Check lists are client-side projections, deliberately absent from every query's params and enabled gate.
  const matrix = useMenuQuery(hwTimeOverview.matrix, { moduleType: filter.moduleType.id }, { enabled });
  const stats = useMenuQuery(hwTimeOverview.motionStats, { moduleType: filter.moduleType.id, drillModule: moduleId ?? '' }, { enabled: enabled && moduleId !== null });
  const runs = useMenuQuery(hwTimeOverview.runs, { moduleType: filter.moduleType.id, drillModule: moduleId ?? '', drillMotion: motionId ?? '' }, { enabled: enabled && moduleId !== null && motionId !== null });
  if (filter.invalid) return <HwTimeViewFrame><PageKeyWarning sentences={filter.invalid} onRecover={filter.recover} /></HwTimeViewFrame>;
  if (drillKeys.invalid) return <HwTimeViewFrame><PageKeyWarning sentences={drillKeys.sentences} onRecover={drillKeys.recover} /></HwTimeViewFrame>;
  const moduleVisible = moduleId !== null && filter.modules.includes(moduleId);
  const motionVisible = motionId !== null && filter.motions.includes(motionId);
  const motionColors = matrix.response?.data ? Object.fromEntries(matrix.response.data.motions.map(motion => [motion.id, motion.color])) : undefined;
  return <HwTimeViewFrame motionColors={motionColors}><div className="flex flex-col gap-4">
    <QueryView query={matrix}>{data => <OverviewCharts data={data} filter={filter} onModule={id => setPage({ drillModule: id, drillMotion: null, row: null })} />}</QueryView>
    {moduleId !== null && <div className="flex flex-col gap-3">
      <div><Button variant="ghost" size="sm" onClick={() => setPage({ drillModule: null, drillMotion: null, row: null })}>{m('back')}</Button></div>
      {!moduleVisible && <p className="text-sm text-text-secondary">{m('hiddenDrill')}</p>}
      <div hidden={!moduleVisible}><QueryView query={stats}>{data => <MotionTable data={data} filter={filter} moduleId={moduleId} motionId={motionId} onMotion={id => setPage({ drillMotion: id, row: null })} />}</QueryView></div>
      {moduleVisible && motionId !== null && !motionVisible && <p className="text-sm text-text-secondary">{m('hiddenDrill')}</p>}
      {motionId !== null && <div hidden={!moduleVisible || !motionVisible}><QueryView query={runs}>{data => <RunPanel key={`${moduleId}/${motionId}/${runs.completedAt}`} data={data} motions={filter.motions} moduleId={moduleId} motionId={motionId} judgement={stats.response?.data?.rows.find(row => row.motion === motionId)?.judgement} />}</QueryView></div>}
    </div>}
  </div></HwTimeViewFrame>;
}
