import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n, useMenuQuery, useMessages, usePlatform } from '@ap/kernel';
import {
  AnalysisChart, AnalysisChartFrame, Inspector, PageKeyWarning, PanelWorkspace, PlatformDataTable, QueryView, RowAction,
  type PanelWorkspacePanel, type PanelWorkspacePreset,
  type ChartPoint, type HeatmapSpec, type PlatformColumn,
} from '@ap/components';
import { Button, Checkbox, StatusBadge } from '@ap/ui';
import { ChartScatter, SlidersHorizontal } from 'lucide-react';
import {
  HW_TIME_MOTION_COLOR_BY_ID, HW_TIME_UNIT, hwTimeOverview,
  type HwTimeMatrix, type HwTimeMatrixCell, type HwTimeMotionStats,
} from '../../endpoints';
import { HW_TIME_MESSAGES, HW_TIME_WORKSPACE_MESSAGES, HW_TIME_OVERVIEW_MESSAGES } from '../../messages';
import { formatSeconds, missingText } from '../../shared/format';
import { htmStatusText, htmStatusView } from '../../shared/htm';
import type { HwTimeFilter } from '../../shared/useHwTimeFilter';
import { FilterPanel } from '../../shared/panels/FilterPanel';
import RawTablePanel from '../table/RawTablePanel';
import { useHwTimeDrillRules } from '../../shared/useHwTimeDrillRules';
import { RunPanel } from './RunPanel';

/** Lowest plot height a panel chart keeps before its panel body scrolls (px). */
const CHART_FILL_MIN = 200;
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

// Every panel has its own group: no analysis tabs at either supported desktop size. Rows follow the drill: heatmap → bars, then
// Module → Motion table → runs. Scatter and trend are wide (many categories or days, 24-equipment legends), so trend takes a full row.
const PRESETS: PanelWorkspacePreset[] = [{ id: 'linked', label: HW_TIME_WORKSPACE_MESSAGES.defaultLayout,
  layout: { type: 'branch', dir: 'column', sizes: [24, 28, 26, 22], children: [
    { type: 'branch', dir: 'row', sizes: [27, 27, 46], children: [
      { type: 'group', panels: ['filter'] }, { type: 'group', panels: ['heatmap'] }, { type: 'group', panels: ['bars'] },
    ] },
    { type: 'branch', dir: 'row', sizes: [50, 50], children: [{ type: 'group', panels: ['motions'] }, { type: 'group', panels: ['scatter'] }] },
    { type: 'group', panels: ['trend'] },
    { type: 'group', panels: ['table'] },
  ] },
}];

function MatrixPanel({ panel, data, filter, onModule, onRow }: { panel: 'heatmap' | 'bars'; data: HwTimeMatrix; filter: HwTimeFilter; onModule: (moduleId: string, row: string) => void; onRow: (row: string | null) => void }) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { lang } = useI18n();
  const { pageParam } = usePlatform();
  const focus = pageParam('row');
  const setFocus = onRow;
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
    cellActivation: { on: 'click', onActivate: (moduleId: string, equipmentId: string) => setFocus(rowLabel(equipmentId, moduleId)) },
    onCellClick: (moduleId: string, equipmentId: string) => setFocus(rowLabel(equipmentId, moduleId)),
  };
  const series = selectedMotions.map(motion => ({
    id: motion.id, name: motion.id, color: motion.color, kind: 'bar' as const,
    points: cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), cell.motions[motion.id]?.value ?? null] as [string, number | null]),
  }));
  const cellStatus = focusCell ? statuses.cellStatus.get(activeCategory!) : undefined;
  const statusLabels = [...new Set(cells.map(cell => htmStatusText(cell.module, lang)))];
  const partial = cells.some(cell => filter.motions.some(motion => cell.motions[motion]?.value == null));
  if (!filter.modules.length || !filter.motions.length) return <p className="p-3 text-sm text-text-secondary">{m('noChecks')}</p>;
  return <div className="flex h-full min-h-0 flex-col gap-2">
    <p className="t-caption px-4 pt-2 text-text-secondary">{m('synthetic')} · {statusLabels.join(' · ')}</p>
    <div className="flex min-h-0 flex-1 flex-col">
    {panel === 'heatmap' ? <AnalysisChart chartId="hw-overview-matrix" title={m('heatmap')} description={m('heatmapNote')} spec={heatmap} unit={HW_TIME_UNIT[lang]} size="fill" />
      : <>
      <AnalysisChartFrame chartId="hw-overview-bars" title={m('bars')} description={m('barsNote')}
        series={series} unit={HW_TIME_UNIT[lang]} valueFormat={value => formatSeconds(value, lang)}
        xType="category" orientation="horizontal" stacked startAlign={pageParam('align') === '1'} emphasisFocus="none"
        size="fill" fillMin={CHART_FILL_MIN} rowPitch={BAR_ROW_PITCH} rowGroups={statuses.rowGroups} pointStatus={statuses.barStatusOf} activeCategory={activeCategory} revealActive
        onActiveCategoryChange={setFocus} legend={false} visibleSeriesIds={selectedMotions.map(motion => motion.id)}
        canApplyRange={false} reaggregation="sum" valueLabels="both"
        pointActivation={{ on: 'click', onActivate: point => { const cell = byLabel.get(point.x); if (cell) onModule(cell.moduleId, point.x); } }} />
      </>}
    </div>
    {partial && <p className="t-caption text-text-secondary">{m('partial')}</p>}
    {panel === 'bars' && focusCell && <p className="t-caption text-text-secondary" role="status">{activeCategory} · {cellStatus?.label ?? htmStatusText(focusCell.module, lang)} · {selectedMotions.map(motion => {
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
  // Stable columns keep the focused Motion link mounted across the drill write (a new cell function remounts it).
  const drill = useRef(onMotion); drill.current = onMotion;
  const columns = useMemo<PlatformColumn<MotionRow>[]>(() => {
    const valueText = (value: number | null) => value === null ? missingText(lang) : `${formatSeconds(value, lang)} ${HW_TIME_UNIT[lang]}`;
    return [
    // The Motion name is the drill link (no separate action column), so the four columns fit the half-width panel at 1280 wide.
    { id: 'motion', header: m('motions'), value: row => row.motion, hideable: false, size: 100,
      cell: row => <RowAction compact={false} textLink="primary" icon={ChartScatter} label={m('viewRuns', { motion: row.motion })} text={row.motion} onClick={() => drill.current(row.motion)} /> },
    { id: 'average', header: m('average'), value: row => row.judgement.value, cell: row => valueText(row.judgement.value), align: 'right', size: 72 },
    { id: 'bounds', header: m('bounds'), size: 124, cell: row => row.judgement.lower === null && row.judgement.upper === null ? missingText(lang)
      : `${row.judgement.lower === null ? '' : formatSeconds(row.judgement.lower, lang)} ~ ${row.judgement.upper === null ? '' : formatSeconds(row.judgement.upper, lang)} ${HW_TIME_UNIT[lang]}` },
    { id: 'status', header: m('status'), size: 116, cell: row => {
      const status = htmStatusView(row.judgement, lang);
      return <StatusBadge tone={status?.tone ?? 'success'}>{htmStatusText(row.judgement, lang)}</StatusBadge>;
    } },
  ]; }, [m, lang]);
  const title = m('table', { module: moduleId });
  return <PlatformDataTable title={title} ariaLabel={title} columns={columns} rows={rows} getRowId={row => row.motion}
      activeRowId={motionId} preferenceKey="hw-time-overview:motions:v1" pageSize={10} />;
}

/** Stable query owners survive check projections and workspace hide/reopen commands. */
/** Both languages of a message filled with the same values: a panel option takes `Text`, not the current-language string. */
const fill = (template: string, values: Record<string, string>) => template.replace(/\{(\w+)\}/g, (whole, key: string) => values[key] ?? whole);

export function AnalysisWorkspace({ filter }: { filter: HwTimeFilter }) {
  const m = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const w = useMessages(HW_TIME_WORKSPACE_MESSAGES);
  const common = useMessages(HW_TIME_MESSAGES);
  const { pageParam, setPage } = usePlatform();
  const moduleId = pageParam('drillModule');
  const motionId = pageParam('drillMotion');
  const keys = useHwTimeDrillRules([
    { key: 'align', label: HW_TIME_MESSAGES.stepsPageAlignStartPositions, valid: raw => raw === '1' },
    { key: 'row', label: HW_TIME_WORKSPACE_MESSAGES.activeRow, valid: raw => /^EQ-\d{3} · [A-Z]+\d+$/.test(raw) && filter.moduleType.modules.some(id => raw.endsWith(` · ${id}`)) },
  ]);
  const enabled = filter.invalid === null && !keys.invalid;
  const matrix = useMenuQuery(hwTimeOverview.matrix, { moduleType: filter.moduleType.id }, { enabled });
  const stats = useMenuQuery(hwTimeOverview.motionStats, { moduleType: filter.moduleType.id, drillModule: moduleId ?? '' }, { enabled: enabled && moduleId !== null });
  const runs = useMenuQuery(hwTimeOverview.runs, { moduleType: filter.moduleType.id, drillModule: moduleId ?? '', drillMotion: motionId ?? '' }, { enabled: enabled && moduleId !== null && motionId !== null });
  const [reveal, setReveal] = useState<{ panelId: string; seq: number } | null>(null);
  const row = pageParam('row');
  // Clearing the Module removes its own button: return focus to the panel's hint instead of dropping it to the body.
  const clearedModule = useRef(false);
  const pickModuleRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (!moduleId && clearedModule.current) { clearedModule.current = false; pickModuleRef.current?.focus(); } }, [moduleId]);
  const previousSelection = useRef<{ moduleId: string | null; motionId: string | null; row: string | null } | null>(null);
  // The SDK only changes a background tab, preserves hidden/maximized panels and never moves focus.
  useEffect(() => {
    const previous = previousSelection.current;
    previousSelection.current = { moduleId, motionId, row };
    let panelId: string | null = null;
    if (motionId && motionId !== previous?.motionId) panelId = 'scatter';
    else if (moduleId && moduleId !== previous?.moduleId) panelId = 'motions';
    else if (row && row !== previous?.row) panelId = 'bars';
    if (panelId) setReveal(current => ({ panelId, seq: (current?.seq ?? 0) + 1 }));
  }, [moduleId, motionId, row]);
  const moduleVisible = moduleId !== null && filter.modules.includes(moduleId);
  const motionVisible = motionId !== null && filter.motions.includes(motionId);
  const colors = matrix.response?.data ? Object.fromEntries(matrix.response.data.motions.map(motion => [motion.id, motion.color])) : HW_TIME_MOTION_COLOR_BY_ID;
  const charts = (panel: 'heatmap' | 'bars') => <div hidden={filter.empty} className={filter.empty ? 'hidden' : 'flex h-full min-h-0 flex-col'}>
    <QueryView fill query={matrix}>{data => <MatrixPanel panel={panel} data={data} filter={filter} onRow={nextRow => {
      previousSelection.current = { moduleId, motionId, row: nextRow };
      setPage({ row: nextRow }, { replace: true });
      setReveal(current => ({ panelId: 'bars', seq: (current?.seq ?? 0) + 1 }));
    }} onModule={(id, row) => {
      previousSelection.current = { moduleId: id, motionId: null, row };
      setReveal(current => ({ panelId: 'motions', seq: (current?.seq ?? 0) + 1 }));
      setPage({ drillModule: id, drillMotion: null, row, focus: null });
    }} />}</QueryView>
  </div>;
  const runPanel = (kind: 'scatter' | 'trend') => {
    if (!moduleId) return <p className="p-3 text-sm text-text-secondary">{w('pickModule')}</p>;
    if (!motionId) return <p className="p-3 text-sm text-text-secondary">{w('pickMotion')}</p>;
    const hidden = !moduleVisible || !motionVisible || filter.empty;
    return <div hidden={hidden} className={hidden ? 'hidden' : 'flex h-full min-h-0 flex-col'}>
      <QueryView fill query={runs}>{data => <RunPanel key={`${moduleId}/${motionId}/${runs.completedAt}`} kind={kind}
        data={data} motions={filter.motions} moduleId={moduleId} motionId={motionId}
        judgement={stats.response?.data?.rows.find(row => row.motion === motionId)?.judgement} />}</QueryView>
    </div>;
  };
  // Shown in the toolbar chip while the 표시 조건 panel is minimized, so the conditions stay visible.
  const summaryValues = { type: filter.moduleType.id, modules: String(filter.modules.length), moduleTotal: String(filter.moduleType.modules.length), motions: String(filter.motions.length), motionTotal: String(filter.moduleType.motions.length) };
  const filterSummary = { ko: fill(HW_TIME_WORKSPACE_MESSAGES.filterSummary.ko, summaryValues), en: fill(HW_TIME_WORKSPACE_MESSAGES.filterSummary.en, summaryValues) };
  const panels: PanelWorkspacePanel[] = [
    { id: 'filter', title: HW_TIME_OVERVIEW_MESSAGES.filters, preferredHeight: 600, minWidth: 256, minimize: { summary: filterSummary }, render: () => <FilterPanel filter={filter} motionColors={colors} /> },
    { id: 'heatmap', title: HW_TIME_OVERVIEW_MESSAGES.heatmap, preferredHeight: 630, minWidth: 120, render: () => charts('heatmap') },
    { id: 'bars', title: HW_TIME_OVERVIEW_MESSAGES.bars, primary: true, preferredHeight: 600, minWidth: 120, render: () => charts('bars') },
    { id: 'motions', title: HW_TIME_WORKSPACE_MESSAGES.motionPanel, preferredHeight: 400, minWidth: 120, render: () => !moduleId
      ? <p ref={pickModuleRef} tabIndex={-1} className="p-3 text-sm text-text-secondary outline-none">{w('pickModule')}</p>
      : <div className="flex flex-col items-start gap-2 p-3"><Button variant="ghost" size="sm" onClick={() => { clearedModule.current = true; setPage({ drillModule: null, drillMotion: null, focus: null }); }}>{m('back')}</Button>
        {!moduleVisible && <p className="text-sm text-text-secondary">{m('hiddenDrill')}</p>}
        <div hidden={!moduleVisible || filter.empty} className="w-full"><QueryView query={stats}>{data => <MotionTable data={data} filter={filter} moduleId={moduleId} motionId={motionId}
          onMotion={id => {
            previousSelection.current = { moduleId, motionId: id, row };
            setReveal(current => ({ panelId: 'scatter', seq: (current?.seq ?? 0) + 1 }));
            // Focus-neutral write: the linked screen keeps focus on the action; reveal scrolls the filled panel into view.
            setPage({ drillMotion: id, focus: null });
          }} />}</QueryView></div></div> },
    { id: 'scatter', title: HW_TIME_OVERVIEW_MESSAGES.distribution, preferredHeight: 640, minWidth: 120, render: () => runPanel('scatter') },
    { id: 'trend', title: HW_TIME_OVERVIEW_MESSAGES.trend, preferredHeight: 600, minWidth: 120, render: () => runPanel('trend') },
    { id: 'table', title: HW_TIME_MESSAGES.tablePageHwTimeTable, preferredHeight: 440, minWidth: 120, render: () => <div hidden={filter.empty} className={filter.empty ? 'hidden' : 'flex h-full min-h-0 flex-col'}><RawTablePanel params={{}} linked /></div> },
  ];
  if (filter.invalid) return <PageKeyWarning sentences={filter.invalid} onRecover={filter.recover} />;
  if (keys.invalid) return <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} />;
  return <div className="flex min-h-0 flex-1 gap-3">
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    {filter.empty && <p role="status" className="text-sm text-text-secondary">{common('filterNoneSelected')}</p>}
    <PanelWorkspace panels={panels} presets={PRESETS} initialPreset="linked" compactBelow={0}
      persistKey="hw-time-linked-v1" label={HW_TIME_WORKSPACE_MESSAGES.workspace} revealRequest={reveal} />
    </div>
    <Inspector form="rail" label={HW_TIME_WORKSPACE_MESSAGES.workspace} sections={[{ id: 'options', title: HW_TIME_MESSAGES.stepsPageOptions, icon: SlidersHorizontal,
    render: () => <label className="flex cursor-pointer items-center gap-2 text-xs">
      <Checkbox checked={pageParam('align') === '1'} onCheckedChange={checked => setPage({ align: checked === true ? '1' : null })} />
      {common('stepsPageAlignStartPositions')}
    </label>,
  }]} />
  </div>;
}
