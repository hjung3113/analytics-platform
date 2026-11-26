import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChartNoAxesCombined, History, ListTree, TriangleAlert } from 'lucide-react';
import { isAnswered, panelOutputRef, readChartPanel, PANEL_INSTANCE_INPUTS_MAX, PANEL_INSTANCES_MAX, type MenuViewPanels, type PanelDeclaration, type PanelInstance, type PanelInstanceInput } from '@ap/contracts';
import { ANALYSIS_SELECTION_MAX_VALUES, holdsSelection, namesInstance, AnalysisSelectionInstances, formatText, HeldAnalysisSelections, parseAnalysisSelection, useAnalysisSelectionInputs, useAnalysisSelectionOutput, useAnalysisSelectionReader, useI18n, useMenuQuery, useMessages, usePlatform, useQueryContext, useSavedViewPanels, type AnalysisSelectionChip, type MenuQueryState, type Text } from '@ap/kernel';
import {
  AnalysisChart, AnalysisChartFrame, DrillLayout, LegendTree, LoadingBlock, PageKeyWarning, PanelAddMenu, PanelOptions, PanelSettingsDrawer, PanelWorkspace, QueryView, StateMessage,
  getAnalysisSelectionFilterBadge, resolveAnalysisSelectionFilter, usePanelOptions, usePinnedPanels, type ChartPoint, type ChartPointAction, type LegendTreeNode, type NextAnalysisRows, type PanelOption, type PanelOptionValues, type PanelWorkspacePanel,
} from '@ap/components';
import { HW_TIME_EQUIPMENT_ID_PATTERN, HW_TIME_MAX_ROWS, HW_TIME_MODULE_TYPES, HW_TIME_UNIT, MOTION_EQUIPMENT_KEY, hwTime, hwTimeOverview, validPanelDate, verdictCodec, type HtmStatus, type HwTimeMatrix, type HwTimeMatrixParams, type HwTimePanelParams, type HwTimeTableParams, type HwTimeTableRow } from '../../endpoints';
import { HW_TIME_MESSAGES, HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_OVERVIEW_MESSAGES, HW_TIME_STEPPED_MESSAGES as S, HW_TIME_WORKSPACE_MESSAGES } from '../../messages';
import { TREND_RANGE_OUTPUT } from '../../panels';
import { formatSeconds } from '../../shared/format';
import { useHwTimeLevel } from '../../shared/data';
import { htmEmphasisStatus, htmStatusView } from '../../shared/htm';
import { DAY_BASIS_ID, HW_TIME_DRILL, MOTION_BASIS_KEY } from '../../shared/historySummary';
import { equipmentDaysAvailable, type HwTimeFilter } from '../../shared/useHwTimeFilter';
import { useHwTimeDrillRules } from '../../shared/useHwTimeDrillRules';
import RawTablePanel, { useRawTableColumns } from '../table/RawTablePanel';
import { drillParams, levelOf } from '../table/tableData';
import { MotionTablePanel, RunQueryPanel } from './AdditionalPanels';
import { DistributionPanel } from './DistributionPanel';
import { BoundHistoryPanel, EquipmentDaysPanel, ParetoPanel, VerdictDonut } from './NewPanels';
import { heatmapValues, VERDICT_CATEGORIES, verdictEmphasis } from './newPanelData';
import { buildSavedPanels, defaultPanels, defaultTableInput, exceedsPanelLimit, fillsTablePin, followPanel, heldOf, heldOutput, heldSourceFor, heldTableInput, isEquipmentOutput, isHeldSource, keepHeld, newPanelInstance, newFollowingTable, instanceSlot, keepPinned, noPanels, planAdd, planTableHold, preserveFollowingTable, SAME_PANEL_MAX, withFollowingTable, withFollowingTableAt, type AddedPanel, type AddIntent, type CustomPanels, type PanelConfiguration } from './heldPanels';
import { CATALOG_IDS, chartRows, panelCatalog, projectBarData, rowLabel, stepOf, stepPreset, validTrend, workspaceOptions, type CatalogId, type Step } from './stepped';
import { panelDeclarations, panelRunTarget, projectDisplayInputs, projectQueryInputs, workspacePanelContext } from './panelDeclaration';

import { RecipePanel } from './RecipeFace';
import { ChartPanel } from './ChartPanel';
import { HW_TIME_CHART_FIELDS } from '../../chartFields';

/** Lowest plot height before its panel body scrolls (px). */
const CHART_FILL_MIN = 200;
const BAR_ROW_PITCH = 28;
const sourceRowId = (row: HwTimeTableRow) => row.id;
export function chartStatuses(data: HwTimeMatrix, lang: 'ko' | 'en') {
  const byLabel = new Map(data.cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), cell]));
  const pointStatusOf = (point: Pick<ChartPoint, 'x' | 'seriesId'>) => htmStatusView(byLabel.get(point.x)?.motions[point.seriesId], lang);
  const barStatusOf = (point: ChartPoint) => htmEmphasisStatus(pointStatusOf(point));
  const cellStatus = new Map(data.cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), htmEmphasisStatus(htmStatusView(cell.module, lang))]));
  /** The heatmap cell's mark: the worst server status among the checked Motions' bar pieces (over before under), so with every Motion
   * checked it is the server's Module roll-up and with fewer it matches what the bar row shows. Picks among server statuses, judges nothing. */
  const cellStatusOf = (label: string, motions: readonly string[]) => motions.map(seriesId => barStatusOf({ x: label, seriesId } as ChartPoint))
    .reduce<ReturnType<typeof barStatusOf>>((worst, status) => !worst || status?.tone === 'danger' ? status ?? worst : worst, undefined);
  const rowGroups = { header: HW_TIME_OVERVIEW_MESSAGES.equipment[lang], byCategory: new Map(data.cells.map(cell => [rowLabel(cell.equipmentId, cell.moduleId), { group: cell.equipmentId, label: cell.moduleId }])) };
  return { pointStatusOf, barStatusOf, cellStatus, cellStatusOf, rowGroups };
}


type MatrixQuery = MenuQueryState<HwTimeMatrixParams, HwTimeMatrix>;
type MatrixQueries = Readonly<Record<string, MatrixQuery>>;
/** Stable query owners for every catalog type mount in one render; only required types read. */
function MatrixSources({ index = 0, queries = {}, required, children }: {
  index?: number; queries?: MatrixQueries; required: readonly string[]; children: (queries: MatrixQueries) => ReactNode;
}) {
  const type = HW_TIME_MODULE_TYPES[index]!;
  const query = useMenuQuery(hwTimeOverview.matrix, { moduleType: type.id }, { enabled: required.includes(type.id) });
  const next = { ...queries, [type.id]: query };
  if (index + 1 < HW_TIME_MODULE_TYPES.length) return <MatrixSources index={index + 1} queries={next} required={required}>{children}</MatrixSources>;
  return children(next);
}
function matricesView(queries: MatrixQueries, required: readonly string[], body: ReactNode): ReactNode {
  return required.reduceRight<ReactNode>((content, id) => <QueryView key={id} fill query={queries[id]!}>{() => content}</QueryView>, body);
}

function Hierarchy({ filter, currentId, onDrill }: { filter: HwTimeFilter; currentId: string | null; onDrill: (id: string) => void }) {
  const m = useMessages(S);
  const shared = useMessages(HW_TIME_MESSAGES);
  const { setPage } = usePlatform();
  const path = currentId?.split('/') ?? [];
  const defaultExpanded = new Set(path.map((_, index) => path.slice(0, index + 1).join('/')));
  const nodes: LegendTreeNode[] = HW_TIME_MODULE_TYPES.map(type => ({ id: type.id, label: type.id,
    children: type.motions.map(motion => ({ id: `${type.id}/${motion}`, label: motion,
      children: type.modules.map(module => ({ id: `${type.id}/${motion}/${module}`, label: module })),
    })),
  }));
  // Leaf visibility only controls the SDK's show-all recovery; node checks use the two independent axes below.
  const visible = new Set(HW_TIME_MODULE_TYPES.flatMap(type => {
    const checks = filter.selectionFor(type.id);
    return checks.motions.flatMap(motion => checks.modules.map(module => `${type.id}/${motion}/${module}`));
  }));
  const checkedOf = (id: string): boolean | 'mixed' => {
    const [typeId, motion, module] = id.split('/');
    const type = HW_TIME_MODULE_TYPES.find(type => type.id === typeId)!;
    const checks = filter.selectionFor(type.id);
    if (module) return checks.modules.includes(module);
    if (motion) return checks.motions.includes(motion);
    if (checks.motions.length === type.motions.length) return true;
    return checks.motions.length === 0 ? false : 'mixed';
  };
  const onCheck = (id: string, checked: boolean) => {
    const [typeId, motion, module] = id.split('/');
    const type = HW_TIME_MODULE_TYPES.find(type => type.id === typeId)!;
    const checks = filter.selectionFor(type.id);
    if (!motion) {
      filter.setTypeChecked(type.id, { motions: checked ? [...type.motions] : [] });
      return;
    }
    const list = module ? 'modules' : 'motions';
    const value = module ?? motion;
    const selected = new Set(checks[list]);
    if (checked) selected.add(value); else selected.delete(value);
    filter.setTypeChecked(type.id, { [list]: [...selected] });
  };
  return <div className="flex h-full min-h-0 flex-col gap-2 p-2">
    <div className="min-h-0 flex-1 overflow-auto"><LegendTree label={m('tree')} nodes={nodes} visible={visible} checkedOf={checkedOf} onCheck={onCheck}
      onVisibleChange={() => setPage({ module: null, motion: null }, { replace: true })}
      drillOnName canDrill={() => true} defaultExpanded={defaultExpanded} currentId={currentId} currentLabel={m('current')} hint={m('treeHint')} onDrill={onDrill} /></div>
    {filter.unusable.length > 0 && <p className="t-caption text-text-secondary">{shared('filterUnusable')}: {filter.unusable.join(', ')}</p>}
    <p className="t-caption text-text-secondary">{m('recipe')}</p>
  </div>;
}

type BarsProps = {
  depth: Step; queries: MatrixQueries; typeId: string | null; motionId: string | null; moduleId: string | null; filter: HwTimeFilter;
  options: readonly PanelOption[]; values: PanelOptionValues; onChange: (id: string, value: string | boolean) => void;
  onOpenTrend: (target: string, row: string) => void;
  previous?: boolean; allMotions?: boolean;
  analysisSelectionOutput?: { panelId: string; key: string; instanceId?: string } | null;
  highlightedValues?: readonly string[];
};
const noHighlightedEquipment: readonly string[] = [];
/** The localized drill title of a slot; `dayBasis` names the step-3 «일별» heatmap (its catalogue name) instead of the Motion bars (#3046). */
function barsTitle({ depth, typeId, motionId, moduleId, previous = false, allMotions = false, dayBasis = false }: Pick<BarsProps, 'depth' | 'typeId' | 'motionId' | 'moduleId' | 'previous' | 'allMotions'> & { dayBasis?: boolean }) {
  let message: Text = S.overview;
  if (depth === 2) message = S.typeBars;
  if (depth === 3) message = dayBasis ? S.motionDays : S.motionBars;
  if (depth === 4) message = allMotions ? S.moduleMotions : S.moduleBars;
  const params = (lang: 'ko' | 'en') => ({ type: typeId ?? '', motion: motionId ?? '', module: moduleId ?? '', panel: N.equipmentDays[lang] });
  const title = { ko: formatText(message, 'ko', params('ko')), en: formatText(message, 'en', params('en')) };
  return previous ? { ko: `${title.ko} · ${S.previous.ko}`, en: `${title.en} · ${S.previous.en}` } : title;
}
function Bars({ depth, queries, typeId, motionId, moduleId, filter, options, values, onChange, onOpenTrend, previous = false, allMotions = false, analysisSelectionOutput, highlightedValues }: BarsProps) {
  const m = useMessages(S);
  const overview = useMessages(HW_TIME_OVERVIEW_MESSAGES);
  const { lang } = useI18n();
  const { pageParam, setPage } = usePlatform();
  const matrices = Object.fromEntries(Object.entries(queries).map(([id, query]) => [id, query.response?.data ?? undefined]));
  const data = typeId ? matrices[typeId] : undefined;
  const shaped = chartRows({ depth, matrices, typeId, motionId, moduleId, selection: filter.selectionFor, values, lang, allMotions });
  const required = depth === 1 ? HW_TIME_MODULE_TYPES.map(type => type.id) : [typeId!];
  const statuses = useMemo(() => data ? chartStatuses(data, lang) : null, [data, lang]);
  const title = barsTitle({ depth, typeId, motionId, moduleId, previous, allMotions });
  const drillLevel = HW_TIME_DRILL.levels[depth - 1]?.key;
  const drillValue = (point: ChartPoint) => depth === 3 ? point.x.split(' · ')[1]! : point.seriesId;
  const drill = (point: ChartPoint) => {
    if (!drillLevel) return;
    const later = Object.fromEntries(HW_TIME_DRILL.levels.slice(depth).map(level => [level.key, null]));
    setPage({ ...later, ...(depth === 1 && { [MOTION_BASIS_KEY]: null }), [drillLevel]: drillValue(point), row: point.x, trend: null, focus: null });
  };
  const openTrend = (point: ChartPoint) => {
    if (depth === 1) { drill(point); return; }
    const module = depth === 4 ? moduleId : point.x.split(' · ')[1];
    if (module && validTrend(`${module}/${point.seriesId}`)) onOpenTrend(`${module}/${point.seriesId}`, point.x);
  };
  const statusOf = (point: ChartPoint) => {
    const verdict = verdictCodec.decode(pageParam('verdict') ?? '');
    if (depth === 1 && verdict) {
      const checks = filter.selectionFor(point.seriesId);
      const match = matrices[point.seriesId]?.cells.filter(cell => cell.equipmentId === point.x && checks.modules.includes(cell.moduleId))
        .flatMap(cell => checks.motions.map(id => cell.motions[id])).find(judgement => judgement?.status === verdict);
      return verdictEmphasis(match, verdict, lang);
    }
    if (!statuses || depth === 1) return undefined;
    if (verdict) {
      const label = depth === 4 ? rowLabel(point.x, moduleId!) : point.x;
      const cell = data?.cells.find(cell => rowLabel(cell.equipmentId, cell.moduleId) === label);
      return verdictEmphasis(cell?.motions[point.seriesId], verdict, lang);
    }
    return statuses.barStatusOf(depth === 4 ? { ...point, x: rowLabel(point.x, moduleId!) } : point);
  };
  const selected = pageParam('row');
  const activeCategory = shaped.series.some(series => series.points.some(([x]) => x === selected)) ? selected : null;
  const chartOptions = options.map(option => option.id === 'group' ? { ...option, hidden: depth === 1 || depth === 4 } : option);
  const pointActions = (point: ChartPoint) => {
    const actions: ChartPointAction[] = [];
    if (depth > 1) actions.push({ id: 'trend', label: m('openTrend'), onSelect: openTrend });
    if (drillLevel) actions.push({ id: 'drill', label: m('drillTo', { value: drillValue(point) }), onSelect: drill });
    return actions;
  };
  let chartId = previous ? 'hw-previous' : 'hw-current';
  if (allMotions) chartId = 'hw-module-motions';
  const scaleText = depth === 1 ? m('scaleTypes', { equipment: String(shaped.equipmentCount), types: String(HW_TIME_MODULE_TYPES.length) })
    : m('scale', { equipment: String(shaped.equipmentCount), modules: String(shaped.moduleCount) });
  // The panel options open the chart's tool row (#2459, owner-confirmed variant B): the inline values say the state, so no chip row.
  const toolbarStart = !previous && !allMotions ? <PanelOptions options={chartOptions} values={values} onChange={onChange} /> : undefined;
  const nextAnalysisPointDrill = !previous && drillLevel ? { level: drillLevel, value: drillValue } : undefined;
  const sourceMotion = allMotions ? null : motionId;
  const sourceColumns = useRawTableColumns(levelOf(moduleId, sourceMotion), sourceMotion, filter.motions);
  const sourceRows: NextAnalysisRows<HwTimeTableParams, HwTimeTableRow> | undefined = analysisSelectionOutput && moduleId ? {
    endpoint: hwTime.tableRows,
    params: selection => ({
      ...drillParams(moduleId, sourceMotion), moduleType: filter.moduleType.id,
      [MOTION_EQUIPMENT_KEY]: selection.shape === 'set' ? selection.values : [],
      page: 0, pageSize: HW_TIME_MAX_ROWS.level, sorting: [],
    }),
    columns: sourceColumns, getRowId: sourceRowId, maxRows: HW_TIME_MAX_ROWS.level, closeOnSuperseded: true,
  } : undefined;
  const body = <div className="flex h-full min-h-0 flex-col">
    <AnalysisChartFrame chartId={chartId} title={title[lang]} summary="quiet" toolbarStart={toolbarStart}
      highlightedValues={highlightedValues} analysisSelectionOutput={analysisSelectionOutput}
      nextAnalysis={analysisSelectionOutput !== undefined || !!nextAnalysisPointDrill} nextAnalysisPointDrill={nextAnalysisPointDrill} nextAnalysisRows={sourceRows}
      series={shaped.series} unit={HW_TIME_UNIT[lang]} valueFormat={value => formatSeconds(value, lang)} description={<>{overview('synthetic')}<br />{scaleText}</>}
      legend={depth < 3 || allMotions} visibleSeriesIds={depth >= 3 && !allMotions ? shaped.series.map(series => series.id) : undefined} legendPlacement="bottom" toolsReveal="always" xType="category" orientation="horizontal" stacked
      startAlign={values.align === true} minMax={values.minMax === true} emphasisFocus="none" size="fill" fillMin={CHART_FILL_MIN} rowPitch={BAR_ROW_PITCH} rowLabelWidth="auto"
      rowGroups={shaped.rowGroups} activeCategory={activeCategory} revealActive
      onActiveCategoryChange={(row, via) => setPage({ row }, { replace: true, preserveSelectionUndo: !!analysisSelectionOutput && via === 'pointer' })}
      canApplyRange={false} reaggregation="sum" valueLabels="both" pointStatus={statusOf}
      pointActivation={depth < 4 ? { on: 'dblclick', onActivate: openTrend } : undefined} pointActions={pointActions} />
  </div>;
  return matricesView(queries, required, body);
}
function Heatmap({ query, filter, typeId, motionId, verdict }: { query: MatrixQuery; filter: HwTimeFilter; typeId: string; motionId: string | null; verdict: HtmStatus | null }) {
  const m = useMessages(S);
  const { lang } = useI18n();
  const { setPage } = usePlatform();
  const checks = filter.selectionFor(typeId);
  return <QueryView fill query={query}>{data => {
    const cells = heatmapValues(data, checks, motionId, verdict, lang);
    return <AnalysisChart chartId="hw-overview-matrix" title={m('heatmap')} unit={HW_TIME_UNIT[lang]} size="fill" legendPlacement="top" toolsReveal="always"
      spec={{ kind: 'heatmap', categories: VERDICT_CATEGORIES, minRowHeight: 24, statusDisplay: 'border', xLabels: data.modules.filter(id => checks.modules.includes(id)), yLabels: data.equipment, cells,
        valueFormat: value => formatSeconds(value, lang), onCellClick: (module, equipment) => setPage({ row: rowLabel(equipment, module) }, { replace: true }),
      }} />;
  }}</QueryView>;
}

function declaredPanelId(instance: PanelInstance): string | undefined {
  return instance.source.kind === 'declared' ? instance.source.panel : undefined;
}

/**
 * The configuration for this render. Another user or Scope clears local additions. Opening a view can change the step and query Context in the
 * same navigation, so an open carries across that change. Connection edits stay within their owner.
 * Ordinary additions reset on a query change, and a drill in the same query keeps held tables.
 */
function resetConfig(state: { owner: string; query: string; config: PanelConfiguration; opening: boolean }, owner: string, query: string, samePopulation: boolean): PanelConfiguration | undefined {
  if (state.owner !== owner) return defaultPanels;
  if (samePopulation || state.opening) return;
  if (state.config.kind === 'custom' && state.config.connectionsEdited) return;
  if (state.query === query) return keepHeld(state.config);
  return keepPinned(state.config);
}

function useWorkspacePanels(owner: string, query: string, step: Step, {
  pinned, publisherFor, unpin,
}: { pinned: readonly string[]; publisherFor: (config: PanelConfiguration, at?: Step) => ReturnType<typeof selectionPublisher>; unpin: (id: string) => void }) {
  const population = JSON.stringify([step, query]);
  const [state, setState] = useState(() => ({ owner, query, population, config: defaultPanels, opening: false, clearTablePin: false, lifetime: {} }));
  const samePopulation = state.population === population;
  const reset = resetConfig(state, owner, query, samePopulation);
  const next = reset ?? state.config;
  const config = withFollowingTable(next, pinned.includes('table'));
  const lifetime = reset ? {} : state.lifetime;
  if (state.owner !== owner || !samePopulation || state.opening || config !== next) {
    // A following-table allocation alone keeps a pending address-pin clear.
    const clearTablePin = state.owner === owner && samePopulation && !state.opening && state.clearTablePin;
    setState({ owner, query, population, config, opening: false, clearTablePin, lifetime });
  }
  useLayoutEffect(() => {
    if (!state.clearTablePin) return;
    // Clear the address pin only after the hold plan commits successfully.
    unpin('table');
    setState(current => ({ ...current, clearTablePin: false }));
  }, [state.clearTablePin, unpin]);
  const projectCandidates = (candidate: CustomPanels, { acrossSteps = false } = {}): [MenuViewPanels, ...MenuViewPanels[]] => {
    candidate = preserveFollowingTable(candidate);
    const atStep = (at: Step) => {
      const { source, reserved } = publisherFor(candidate, at);
      return buildSavedPanels(candidate, acrossSteps ? undefined : at, reserved ?? source);
    };
    const current = atStep(step);
    if (!acrossSteps || step === 4) return [current];
    // The module step can need a separate saved chart in place of a shared output-only reference.
    return [current, atStep(4)];
  };
  const project = (candidate: CustomPanels, options?: { acrossSteps?: boolean }) => {
    const [current, module] = projectCandidates(candidate, options);
    return module && exceedsPanelLimit(module) ? module : current;
  };
  const overflows = (plan: ReturnType<typeof planAdd>) => plan.overflows
    || (plan.config !== null && exceedsPanelLimit(project(plan.config, { acrossSteps: plan.config.connectionsEdited })));
  // A rejected mapping draft in the settings drawer (#2762 ③); the drawer clears it when accepted, discarded or closed.
  const [saveBlocked, setSaveBlocked] = useState<Text>();
  useSavedViewPanels({
    lifetime,
    saveBlocked,
    value: config.kind === 'custom' ? project(config) : null,
    onOpen: (outcome, viewId) => {
      let next: PanelConfiguration;
      switch (outcome) {
        case null: next = defaultPanels; break;
        case 'unreadable': next = { kind: 'unreadable' }; break;
        default: {
          const added: AddedPanel[] = [];
          const sources: PanelInstance[] = [];
          for (const instance of outcome.instances) {
            if (isHeldSource(instance)) sources.push(instance);
            else added.push({ slot: instanceSlot(instance), instance });
          }
          next = { kind: 'custom', added, sources };
        }
      }
      setState(current => ({ ...current, config: { ...next, viewId }, opening: true, lifetime: {} }));
    },
    onViewIdChange: viewId => setState(current => current.config.viewId === (viewId ?? undefined) ? current
      : { ...current, config: { ...current.config, viewId: viewId ?? undefined } }),
  });
  /** Every add path: refused as a whole when the saved panels would pass the v1 limit (R C2); `slot` is what it opened or reveals. */
  const add = (id: string, intent?: AddIntent, options?: { materialize?: boolean; pin?: boolean; targetSlot?: string }): { ok: boolean; slot: string } => {
    const plan = planAdd(config, id, step, intent, options?.materialize, options?.targetSlot);
    if (overflows(plan)) return { ok: false, slot: plan.slot };
    const pinAlias = options?.pin && id !== 'table' && plan.slot !== id;
    if (plan.config || pinAlias) setState(current => {
      const { viewId, followingTable, pinSlots } = current.config;
      return { ...current, config: {
        ...(plan.config ?? current.config),
        viewId, followingTable,
        pinSlots: pinAlias ? new Map(pinSlots).set(id, plan.slot) : pinSlots,
      } };
    });
    return { ok: true, slot: plan.slot };
  };
  /** A chart made from settings (#2761) joins the added panels in its own slot; refused like any add past the v1 limit. */
  const addChart = (instance: PanelInstance, { pin }: { pin: boolean }): { ok: boolean; slot: string } => {
    const slot = instanceSlot(instance);
    const custom = config.kind === 'custom' ? config : { ...noPanels, viewId: config.viewId, followingTable: config.followingTable, pinSlots: config.pinSlots };
    const next: CustomPanels = { ...custom, added: [...custom.added, { slot, instance, ...(pin && { pinned: true as const }) }] };
    if (exceedsPanelLimit(project(next, { acrossSteps: next.connectionsEdited }))) return { ok: false, slot };
    setState(current => ({ ...current, config: { ...next, viewId: current.config.viewId } }));
    return { ok: true, slot };
  };
  const forgetPin = (id: string) => setState(current => {
    if (!current.config.pinSlots?.has(id)) return current;
    const pinSlots = new Map(current.config.pinSlots);
    pinSlots.delete(id);
    return { ...current, config: { ...current.config, pinSlots } };
  });
  /** «따라가기로 바꾸기»: the panel drops its held values and reads the URL again. */
  const follow = (slot: string) => setState(current => current.config.kind !== 'custom' ? current : { ...current, config: { ...current.config,
    added: current.config.added.map(panel => panel.slot === slot ? followPanel(panel) : panel) } });
  const remove = (instanceId: string) => setState(current => {
    if (current.config.kind !== 'custom') return current;
    const disconnect = (instance: PanelInstance) => {
      const inputs = instance.inputs.filter(input => !input.from.startsWith(`${instanceId}.`));
      return inputs.length === instance.inputs.length ? instance : { ...instance, inputs };
    };
    const added = current.config.added.filter(panel => panel.instance.id !== instanceId)
      .map(panel => ({ ...panel, instance: disconnect(panel.instance) }));
    return { ...current, config: { ...current.config, added, sources: current.config.sources.map(disconnect) } };
  });
  /** A connection edit keeps the configuration across drills and queries; a mapping-only edit keeps the reset rules as they were (#2762). */
  const editConnections = (config: CustomPanels, { connections }: { connections: boolean }) => setState(current => ({ ...current,
    config: { ...config, ...(connections && { connectionsEdited: true as const }), viewId: current.config.viewId } }));
  const planHold = (candidate: PanelConfiguration, slot: string, chip: AnalysisSelectionChip, from?: string) =>
    planTableHold(withFollowingTableAt(candidate, slot), slot, chip, next => projectCandidates(next, { acrossSteps: next.connectionsEdited }), from);
  const holdTable = (slot: string, chip: AnalysisSelectionChip, options: { from?: string; clearPin: boolean }) => setState(current => {
    if (current.owner !== owner || current.population !== population) return current;
    const plan = planHold(current.config, slot, chip, options.from);
    if (plan.kind === 'refused') return current;
    // A hold is a local edit: the configuration keeps its view and pin slots, and its following table unless the hold took it over (#3080).
    const { viewId, followingTable, pinSlots } = current.config;
    const kept = followingTable && instanceSlot(followingTable) !== slot ? followingTable : undefined;
    return { ...current, config: { ...plan.config, viewId, followingTable: kept, pinSlots }, clearTablePin: current.clearTablePin || options.clearPin };
  });
  return { config, add, addChart, setSaveBlocked, remove, follow, forgetPin, editConnections, project, holdTable,
    planHold: (slot: string, chip: AnalysisSelectionChip, from?: string) => planHold(config, slot, chip, from),
    additionOverflows: (id: string) => overflows(planAdd(config, id, step)) };
}

export function AnalysisWorkspace({ filter }: { filter: HwTimeFilter }) {
  const m = useMessages(S);
  const { pageParam, pageParams, setPage, session, revision } = usePlatform();
  const context = useQueryContext();
  const typeId = pageParam('moduleType'), motionId = pageParam('drillMotion'), moduleId = pageParam('drillModule');
  const step = stepOf(typeId, motionId, moduleId);
  const dayPanel = step === 3 && pageParam(MOTION_BASIS_KEY) === DAY_BASIS_ID ? panelDeclarations.equipmentDays : null;
  const owner = JSON.stringify([session.user.id, revision, context.scopeId]);
  const population = JSON.stringify([step, owner, context]);
  const options = useMemo(() => workspaceOptions(step), [step]);
  const state = usePanelOptions(options);
  const pins = usePinnedPanels('pins', CATALOG_IDS);
  const trend = pageParam('trend');
  const catalog = useMemo(() => panelCatalog({ step, typeId, moduleId, trend }), [step, typeId, moduleId, trend]);
  const { pinned } = pins;
  const publisherFor = useCallback((config: PanelConfiguration, at = step) => {
    const available = at === step ? catalog : panelCatalog({ step: at, typeId, moduleId, trend });
    return selectionPublisher(config, available, at, trend, pinned, at === step ? dayPanel : null);
  }, [catalog, step, typeId, moduleId, trend, pinned, dayPanel]);
  const savedPanels = useWorkspacePanels(owner, JSON.stringify(context), step, { pinned, publisherFor, unpin: pins.unpin });
  const publisher = useMemo(() => publisherFor(savedPanels.config), [publisherFor, savedPanels.config]);
  // A saved view can pin a panel the catalog no longer has. Its reason slot shows the panel, so the opened address drops that pin
  // (one replace) instead of warning; until then the rule accepts it. A plain address with an unknown pin still warns.
  const missingPins = savedPanels.config.kind === 'custom' ? savedPanels.config.added.flatMap(({ instance }) => {
    const panel = declaredPanelId(instance);
    return panel !== undefined && !CATALOG_IDS.some(id => id === panel) ? [panel] : [];
  }) : [];
  const pinRules = pins.rules.map(rule => ({ ...rule, valid: (raw: string) => rule.valid(raw) || missingPins.includes(raw) }));
  const rawPins = pageParams('pins');
  const stalePins = rawPins.filter(id => missingPins.includes(id));
  const stalePinsKey = JSON.stringify([rawPins, stalePins]);
  useEffect(() => {
    if (stalePins.length === 0) return;
    const rest = rawPins.filter(id => !stalePins.includes(id));
    setPage({ pins: rest.length > 0 ? rest : null }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `stalePinsKey` is the value identity of `rawPins`/`stalePins`
  }, [stalePinsKey, setPage]);
  const selectionInputs = useAnalysisSelectionInputs(panelDeclarations.table.id);
  const selectionRejected = selectionInputs.rejected.includes(MOTION_EQUIPMENT_KEY);
  const keys = useHwTimeDrillRules([...state.rules, ...pinRules,
    { key: 'verdict', label: N.verdict, valid: raw => verdictCodec.decode(raw) !== null },
    { key: 'date', label: N.date, valid: raw => validPanelDate(raw, context.from, context.to) },
    { key: 'trend', label: S.trend, valid: validTrend },
    { key: MOTION_EQUIPMENT_KEY, label: S.selectionEquipment, repeated: true, valid: raw => !selectionRejected && HW_TIME_EQUIPMENT_ID_PATTERN.test(raw) },
    { key: 'row', label: HW_TIME_WORKSPACE_MESSAGES.activeRow, valid: raw => {
      if (HW_TIME_EQUIPMENT_ID_PATTERN.test(raw)) return true;
      const [equipment, module, extra] = raw.split(' · ');
      const type = HW_TIME_MODULE_TYPES.find(type => type.id === typeId);
      return extra === undefined && HW_TIME_EQUIPMENT_ID_PATTERN.test(equipment ?? '') && !!type && (type.modules as readonly string[]).includes(module ?? '');
    } },
  ]);
  if (filter.invalid) return <PageKeyWarning sentences={filter.invalid} onRecover={filter.recover} />;
  if (keys.invalid) {
    const sentences = keys.sentences.map((sentence, index) => selectionRejected && keys.badKeys[index] === MOTION_EQUIPMENT_KEY
      ? m('selectionInvalid', { limit: ANALYSIS_SELECTION_MAX_VALUES }) : sentence);
    return <PageKeyWarning sentences={sentences} onRecover={keys.recover} />;
  }
  const required = step <= 2 ? HW_TIME_MODULE_TYPES.map(type => type.id) : [typeId!];
  return <AnalysisSelectionInstances instances={publisher.instances} publishers={publisher.owners}>
    <DrillLayout fill>
      <MatrixSources required={required}>{queries => <WorkspacePanels key={population} {...{ step, queries, filter, typeId, motionId, moduleId, options, trend, pins, savedPanels, catalog, publisher }} values={state.values} onChange={state.setValue}
        onDrill={id => {
          const [type, motion, module] = id.split('/');
          const sameMotion = !!motion && type === typeId && motion === motionId;
          setPage({ moduleType: type!, drillMotion: motion ?? null, drillModule: module ?? null,
            [MOTION_BASIS_KEY]: sameMotion ? pageParam(MOTION_BASIS_KEY) : null, row: null, trend: null, focus: null });
        }} />}</MatrixSources>
    </DrillLayout>
  </AnalysisSelectionInstances>;
}
/** Keep the hover subscription inside the chart assigned to the selection source. */
function SelectionSourceBars({ instanceId, ...props }: Omit<BarsProps, 'highlightedValues'> & { instanceId?: string }) {
  const panelId = panelDeclarations.moduleMotions.id;
  const { highlighted, selection } = useAnalysisSelectionOutput(panelId, MOTION_EQUIPMENT_KEY, { instanceId, subscribeHighlight: instanceId !== undefined });
  const showingPrevious = props.typeId ? props.queries[props.typeId]?.showingPrevious : false;
  const output = showingPrevious ? null : { panelId, key: MOTION_EQUIPMENT_KEY, instanceId };
  const highlightedValues = highlighted && selection?.shape === 'set' ? selection.values : noHighlightedEquipment;
  return <Bars {...props} highlightedValues={instanceId ? highlightedValues : undefined} analysisSelectionOutput={instanceId ? output : undefined} />;
}

type TableSelectionSource = Parameters<typeof resolveAnalysisSelectionFilter>[0]['source'];

function tableSelection(read: ReturnType<ReturnType<typeof useAnalysisSelectionReader>>, source: TableSelectionSource, {
  unread = false, inputs = [], urlUse,
}: { unread?: boolean; inputs?: readonly PanelInstanceInput[]; urlUse?: PanelInstanceInput['use'] } = {}) {
  const { applied, rejectedHeld, requestedFilters, unavailableSources } = read;
  const input = inputs.find(input => input.key === MOTION_EQUIPMENT_KEY);
  const failedHold = unread || rejectedHeld.includes(MOTION_EQUIPMENT_KEY);
  const failedSource = unavailableSources.includes(MOTION_EQUIPMENT_KEY)
    || inputs.some(input => input.mode === 'follow' && input.key !== MOTION_EQUIPMENT_KEY);
  const holdProblem = failedHold ? 'heldRejected' : undefined;
  const problem = failedSource ? 'followUnavailable' : holdProblem;
  const blocked = failedSource || (failedHold && input?.use !== 'highlight');
  const received = applied.filter(input => input.key === MOTION_EQUIPMENT_KEY);
  const appliedFilter = received.find(input => (urlUse ?? input.use) === 'filter');
  const filter = resolveAnalysisSelectionFilter({
    requested: urlUse !== 'highlight' && requestedFilters.includes(MOTION_EQUIPMENT_KEY),
    applied: appliedFilter?.selection,
    source,
  });
  const highlighted = received.find(input => (urlUse ?? input.use) === 'highlight')?.selection;
  return { problem, blocked, filter, highlightedRowIds: highlighted?.shape === 'set' ? highlighted.values : undefined } as const;
}

const filteredEquipment = ({ filter, blocked }: ReturnType<typeof tableSelection>) =>
  !blocked && filter.kind === 'filtered' && filter.selection.shape === 'set' ? filter.selection.values : undefined;

function WorkspaceTable({ selection, local }: { selection: ReturnType<typeof tableSelection>; local: boolean }) {
  const workspace = useMessages(HW_TIME_WORKSPACE_MESSAGES);
  const { problem, blocked, filter, highlightedRowIds } = selection;
  return <>
    {problem && <div role="alert"><StateMessage compact tone="warning" icon={<TriangleAlert className="size-4" aria-hidden />} title={workspace(problem)} /></div>}
    {!blocked && (filter.kind === 'waiting' ? <LoadingBlock /> :
      <RawTablePanel params={{}} linked equipment={filteredEquipment(selection)} highlightedRowIds={highlightedRowIds} local={local} />)}
  </>;
}

function HeldWorkspaceTable({ inputs, unread, source, local }: {
  inputs: readonly PanelInstanceInput[];
  unread: boolean;
  source: TableSelectionSource;
  local: boolean;
}) {
  const read = useAnalysisSelectionReader(panelDeclarations.table.id)(inputs);
  return <WorkspaceTable selection={tableSelection(read, source, { unread, inputs })} local={local} />;
}

function HeldTablePanel({ instance, instances, ...table }: {
  instance: PanelInstance;
  instances: readonly PanelInstance[];
  source: TableSelectionSource;
  local: boolean;
}) {
  const { held, unread } = useMemo(() => heldOf(instance, instances), [instance, instances]);
  return <HeldAnalysisSelections held={held}><HeldWorkspaceTable {...table} inputs={instance.inputs} unread={unread} /></HeldAnalysisSelections>;
}

const declarationOf = (id: string): PanelDeclaration | undefined => Object.hasOwn(panelDeclarations, id) ? panelDeclarations[id as CatalogId] : undefined;

function settingsInstance(slot: string, declaration: PanelDeclaration | undefined, stored: PanelInstance | undefined, instances: readonly PanelInstance[]): PanelInstance {
  const instance = stored ?? newPanelInstance(slot, declaration?.id ?? slot, instances.map(instance => instance.id));
  const outputs = declaration?.outputs.flatMap(({ key, selection }) =>
    selection && !instance.outputs.some(output => output.key === key) ? [{ key, dimension: selection.dimension, shape: selection.shape }] : []);
  return outputs?.length ? { ...instance, outputs: [...instance.outputs, ...outputs] } : instance;
}

/**
 * The raw table slots in order (#2862 ②): the first two open, a saved view may hold more (R C13); two share a row of their own. Titles,
 * layout, «새 패널» and the address ownership all read this one state (R C14).
 */
function rawTables(slots: readonly { id: string; instance?: PanelInstance; item?: { id: string; disabledReason?: Text } }[]) {
  const all = slots.filter(({ item }) => item?.id === 'table' && !item.disabledReason);
  const open = all.slice(0, SAME_PANEL_MAX);
  const held = open.map(({ instance }) => instance !== undefined && holdsSelection(instance));
  const pair = open.length === SAME_PANEL_MAX ? open.map(({ id }) => id) : [];
  const sameMode = pair.length > 0 && held[0] === held[1];
  const otherMode: AddIntent['mode'] = held[0] ? 'follow' : 'hold';
  return {
    open, pair,
    // The declared slot owns the linked pin when open, regardless of the saved order.
    pinSlot: open.find(({ id }) => id === 'table')?.id ?? open[0]?.id,
    overflow: new Set(all.slice(SAME_PANEL_MAX).map(({ id }) => id)),
    /** The address's row, page and sort belong to the first; the second keeps its own (R C7). */
    local: (id: string) => pair[1] === id,
    /** Two of one mode: the second is numbered (R C5). */
    numbered: (id: string) => sameMode && pair[1] === id,
    /** One open, or two of one mode: «새 패널» still offers the other mode, which changes the later one (R C3, C5). */
    again: open.length === 1 || sameMode ? otherMode : undefined,
  };
}

type DayPanel = typeof panelDeclarations.equipmentDays | null;

const catalogPinSlot = (config: PanelConfiguration, id: string) => config.pinSlots?.get(id) ?? id;

function workspaceExtraPanels(config: PanelConfiguration, catalog: ReturnType<typeof panelCatalog>, step: Step, trend: string | null,
  pinned: readonly string[], dayPanel: DayPanel) {
  const available = catalog.filter(item => !item.disabledReason);
  const added = config.kind === 'custom' ? config.added : [];
  const extras = added.filter(panel => panel.slot !== 'current' && (step !== 4 || panel.slot !== 'trend')).map(({ slot, instance, heldFrom }) => ({
    id: slot, instance, heldFrom, item: catalog.find(item => item.id === declaredPanelId(instance)),
  }));
  const autoIds = new Set([...pinned, ...(trend || step === 4 ? ['trend'] : [])]);
  // A pinned raw table uses its future instance slot even before an edit materializes it.
  const followingTable = config.followingTable ?? newFollowingTable(config);
  const taken = new Set(extras.map(extra => extra.id));
  const automatic = [...autoIds].flatMap(id => {
    const item = available.find(item => item.id === id);
    // The pinned raw table is the following one: it is not drawn again while a following instance is open, or when two tables already are
    // (#2862 ②). A held table alone (kept across a drill) leaves it drawn. Other panels keep their own slot rule (R C11).
    const tableInstances = extras.filter(extra => extra.item?.id === 'table');
    const tableTaken = id === 'table' && fillsTablePin(tableInstances);
    const slot = id === 'table' ? instanceSlot(followingTable) : catalogPinSlot(config, id);
    return item && !tableTaken && !taken.has(slot) ? [{ id: slot, item, instance: undefined, heldFrom: undefined }] : [];
  });
  // When the heatmap is the primary panel, keep its saved pin or slot for the default basis.
  const extraPanels = [...extras, ...automatic].filter(({ item }) => !dayPanel || item?.id !== dayPanel.id);
  return { added, extras, automatic, extraPanels, dayPanel, followingTable };
}

const sourcePanelId = panelDeclarations.moduleMotions.id;

function selectionPublisher(config: PanelConfiguration, catalog: ReturnType<typeof panelCatalog>, step: Step, trend: string | null,
  pinned: readonly string[], dayPanel: DayPanel) {
  const work = workspaceExtraPanels(config, catalog, step, trend, pinned, dayPanel);
  const { added, extraPanels } = work;
  const sources = config.kind === 'custom' ? config.sources : [];
  const saved = [...added.map(entry => entry.instance), ...sources];
  const motionSlots = extraPanels.filter(({ item }) => item?.id === sourcePanelId && !item.disabledReason);
  const slot = motionSlots[0]?.id ?? (step === 4 ? 'current' : undefined);
  const stored = added.find(entry => entry.slot === slot)?.instance;
  const source = slot ? settingsInstance(slot, panelDeclarations.moduleMotions, stored, saved) : undefined;
  const staleOutput = source && !source.outputs.some(isEquipmentOutput);
  // Use an output-only reference without a chart, or when saving the chart would hide it or rewrite a stale output.
  const reserved = !source || isHeldSource(source) || staleOutput ? heldSourceFor({ kind: 'custom', added, sources }, { reservedOnly: true }) : undefined;
  const reservedSource = reserved?.sources.find(instance => instance.id === reserved.id);
  const instances = saved.map(instance => source?.id === instance.id ? source : instance);
  // A drawn chart still publishes its declared channel when its saved output metadata is stale.
  const live = source && staleOutput
    ? { ...newPanelInstance(source.id, sourcePanelId, instances.map(instance => instance.id)), outputs: [heldOutput] } : source;
  if (live && !instances.some(instance => instance.id === live.id)) instances.push(live);
  // A converted #2862 hold names the old output-only equipment channel. Resolve that reference for live reads only.
  const aliases = new Set(sources.filter(isHeldSource).flatMap(instance =>
    instance.outputs.filter(isEquipmentOutput).map(output => panelOutputRef(instance.id, output.key))));
  const runtime = live && aliases.size ? instances.map(instance => ({
    ...instance, inputs: instance.inputs.map(input => input.mode === 'follow' && aliases.has(input.from)
      ? { ...input, from: defaultTableInput(live).from } : input),
  })) : instances;
  const byId = new Map(runtime.map(instance => [instance.id, instance]));
  return { work, slot, source, live, reserved: reservedSource, sources: reserved?.sources ?? sources, instances: runtime, byId, aliases,
    owners: new Map([[MOTION_EQUIPMENT_KEY, live?.id ?? null]]),
    selectionHost: motionSlots.length <= 1 ? slot : undefined,
  };
}

function WorkspacePanels(props: Omit<BarsProps, 'depth' | 'previous' | 'allMotions' | 'onOpenTrend' | 'analysisSelectionOutput' | 'highlightedValues'> & {
  step: Step; trend: string | null; pins: ReturnType<typeof usePinnedPanels>; onDrill: (id: string) => void;
  catalog: ReturnType<typeof panelCatalog>; publisher: ReturnType<typeof selectionPublisher>;
  savedPanels: ReturnType<typeof useWorkspacePanels>;
}) {
  const { step, queries, filter, typeId, motionId, moduleId, trend, pins, onDrill, savedPanels, catalog, publisher } = props;
  const common = useMessages(HW_TIME_MESSAGES);
  const workspace = useMessages(HW_TIME_WORKSPACE_MESSAGES);
  const { lang } = useI18n();
  const [settings, setSettings] = useState<{ id: string; trigger: HTMLButtonElement; query: string } | null>(null);
  const [explained, setExplained] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ panelId: string; seq: number; restoreHidden?: boolean } | null>(null);
  // A reveal that follows the one just requested: the first table of a new pair, with the same options (R C1, R2 C1).
  const followUp = useRef<{ restoreHidden?: boolean } | null>(null);
  useEffect(() => {
    if (trend && step !== 4) setReveal(current => ({ panelId: 'trend', seq: (current?.seq ?? 0) + 1 }));
  }, [trend, step]);
  const { page, pageParam, pageParams, setPage, toast, can } = usePlatform();
  const { scopeId } = useQueryContext();
  const { added, extras, automatic, extraPanels, dayPanel, followingTable } = publisher.work;
  // «붙잡기» (#2862): each held table reads its own values (R C4); a chart a held value came from stays while it holds (R C7).
  const savedInstances = useMemo(() => savedPanels.config.kind === 'custom'
    ? [...savedPanels.config.added.map(panel => panel.instance), ...savedPanels.config.sources] : [], [savedPanels.config]);
  const sources = savedPanels.config.kind === 'custom' ? savedPanels.config.sources : [];
  // Two raw tables share a row of their own, out of the step preset group, so both read at once whatever the order or «기본 배치» (R C1).
  const tables = rawTables(extraPanels);
  useEffect(() => {
    const pending = followUp.current;
    if (pending === null) return;
    followUp.current = null;
    // Found in the new configuration: making the pinned table an instance can move it to a free slot (R2 C1).
    const first = tables.open.find(({ id }) => id !== reveal?.panelId)?.id;
    if (first !== undefined) setReveal(current => ({ panelId: first, seq: (current?.seq ?? 0) + 1, ...pending }));
  }, [reveal, tables.open]);
  const heldSlots = extras.filter(({ id, instance, item }) => item?.id === 'table' && holdsSelection(instance) && !tables.overflow.has(id));
  const keptSources = new Set(heldSlots.flatMap(({ heldFrom }) => heldFrom ? [heldFrom] : []));
  const extraIds = extraPanels.map(({ id }) => id).filter(id => !tables.pair.includes(id));
  const currentId = [typeId, motionId, moduleId].filter(Boolean).join('/') || null;
  const selectedEquipment = pageParams(MOTION_EQUIPMENT_KEY);
  const sourceQuery = typeId && step === 4 ? queries[typeId] : undefined;
  const sourceResponse = sourceQuery?.showingPrevious ? null : sourceQuery?.response;
  const source = typeId && sourceResponse && isAnswered(sourceResponse.outcome)
    ? projectBarData(sourceResponse.data ?? undefined, filter.selectionFor(typeId), { depth: 4, moduleId, motionId, allMotions: true })
    : undefined;
  const sourceEquipment = source && (source.motions.length ? source.cells.map(cell => cell.equipmentId) : []);
  const { slot: sourceSlot, source: chartSource, live, reserved, sources: draftSources, selectionHost } = publisher;
  const sourceId = live?.id;
  const currentHostsSelection = sourceSlot === 'current';
  const selectionOutput = useAnalysisSelectionOutput(sourcePanelId, MOTION_EQUIPMENT_KEY,
    { available: sourceEquipment, instanceId: sourceId, subscribeHighlight: false });
  const tableSource = { availabilityCurrent: sourceId === undefined || selectionOutput.availabilityCurrent, query: sourceQuery };
  const verdict = verdictCodec.decode(pageParam('verdict') ?? '');
  const date = pageParam('date');
  const panelContext = { ...workspacePanelContext({ step, typeId, motionId, moduleId, trend }), verdict, date, [MOTION_EQUIPMENT_KEY]: selectedEquipment };
  const settingsQuery = JSON.stringify([panelContext, dayPanel?.id, pageParams('module'), pageParams('motion'), pageParam('sort'), pageParam('page')]);
  const trendTarget = panelRunTarget('trend', projectQueryInputs(panelDeclarations.trend, panelContext));
  const onOpenTrend = (target: string, row: string) => {
    const patch: Record<string, string | null> = { trend: target, row };
    if (target !== trendTarget) patch[TREND_RANGE_OUTPUT.key] = null;
    setPage(patch);
    setReveal(current => ({ panelId: 'trend', seq: (current?.seq ?? 0) + 1 }));
  };
  const readTableSelection = useAnalysisSelectionReader(panelDeclarations.table.id);
  const followingTables = tables.open.map(({ id, instance }) => {
    if (instance && holdsSelection(instance)) return { id };
    const implicit = added.some(entry => entry.slot === id && entry.implicitFollow);
    const inputs = !implicit && instance ? publisher.byId.get(instance.id)?.inputs : undefined;
    // Without a chart, an output-only reference reads the declaration's URL channel.
    const urlInput = live ? undefined : inputs?.find(input => input.mode === 'follow'
      && input.key === MOTION_EQUIPMENT_KEY && publisher.aliases.has(input.from));
    const read = readTableSelection(urlInput ? undefined : inputs);
    return { id, selection: tableSelection(read, tableSource, { inputs, urlUse: urlInput?.use }) };
  });
  const first = followingTables[0]?.selection;
  const second = followingTables[1]?.selection;
  const firstEquipment = first && filteredEquipment(first);
  const secondEquipment = second && filteredEquipment(second);
  const firstLevel = useHwTimeLevel({ [MOTION_EQUIPMENT_KEY]: firstEquipment }, firstEquipment !== undefined);
  const secondLevel = useHwTimeLevel({ [MOTION_EQUIPMENT_KEY]: secondEquipment }, secondEquipment !== undefined);
  const badges = [first && getAnalysisSelectionFilterBadge(first.filter, firstLevel, data => data.rows.length),
    second && getAnalysisSelectionFilterBadge(second.filter, secondLevel, data => data.rows.length)];
  const heldBadge = (instance: PanelInstance) => {
    const { unread, count } = heldOf(instance, savedInstances);
    const text = unread ? HW_TIME_WORKSPACE_MESSAGES.heldRejected : HW_TIME_WORKSPACE_MESSAGES.heldPanel;
    return { tone: unread ? 'warning' as const : 'neutral' as const, description: { ko: formatText(text, 'ko', { count }), en: formatText(text, 'en', { count }) } };
  };
  const matrixData = (input: { moduleType?: string | null }) => {
    const required = input.moduleType ? [input.moduleType] : Object.keys(queries);
    return { required, matrices: required.flatMap(id => queries[id]?.response?.data ? [queries[id]!.response!.data!] : []) };
  };
  const endpointInput = (panel: 'equipmentDays' | 'boundHistory'): HwTimePanelParams => {
    const input = projectQueryInputs(panelDeclarations[panel], panelContext);
    return { ...(input.moduleType ? { moduleType: input.moduleType } : {}), ...(input.drillModule ? { drillModule: input.drillModule } : {}), ...(input.drillMotion ? { drillMotion: input.drillMotion } : {}) };
  };
  const limitParams = { max: PANEL_INSTANCES_MAX };
  const limitMessage = HW_TIME_WORKSPACE_MESSAGES.panelsFull;
  const limitReason = { ko: formatText(limitMessage, 'ko', limitParams), en: formatText(limitMessage, 'en', limitParams) };
  const currentTitle = barsTitle({ ...props, depth: step, dayBasis: dayPanel !== null });
  const renderEquipmentDays = (title?: Text) => {
    const input = endpointInput('equipmentDays');
    if (equipmentDaysAvailable(input, page)) return <EquipmentDaysPanel input={input} verdict={verdict} date={date} title={title} />;
    return <p role="status" className="text-sm text-text-secondary">{filter.empty ? common('filterNoneSelected') : N.equipmentDaysUnavailable[lang]}</p>;
  };
  const withRecipe = (slot: string, panel: string, front: ReactNode, { primary = false, canPin = false } = {}) =>
    <RecipePanel id={panel} open={explained === slot} context={panelContext} primary={primary} canPin={canPin} onClose={() => setExplained(null)}>{front}</RecipePanel>;
  const restoredPrimary = added.find(panel => panel.slot === 'current')?.instance;
  const currentDeclaration = step === 4 && restoredPrimary ? declaredPanelId(restoredPrimary) : undefined;
  const panels: PanelWorkspacePanel[] = [
    { id: 'tree', icon: ListTree, title: S.tree, minWidth: 200, preferredHeight: 640, render: () => <Hierarchy filter={filter} currentId={currentId} onDrill={onDrill} /> },
    ...(step > 1 ? [{ id: 'previous', icon: History, title: barsTitle({ ...props, depth: (step - 1) as Step, previous: true }), minWidth: 200, preferredHeight: 640, render: () => <Bars {...props} onOpenTrend={onOpenTrend} depth={(step - 1) as Step} previous /> }] : []),
    { id: 'current', title: currentTitle, primary: true, minWidth: 320, preferredHeight: 640,
      declarationId: currentDeclaration,
      analysisSelectionSourceId: currentHostsSelection ? sourcePanelId : undefined,
      render: () => {
        const front = dayPanel
          ? renderEquipmentDays(currentTitle)
          : <SelectionSourceBars {...props} onOpenTrend={onOpenTrend} depth={step} instanceId={currentHostsSelection ? sourceId : undefined} />;
        return currentDeclaration ? withRecipe('current', currentDeclaration, front, { primary: true }) : front;
      } },
    ...extraPanels.map(({ id, instance, item }): PanelWorkspacePanel => {
      const keep = keptSources.has(id) ? { reason: HW_TIME_WORKSPACE_MESSAGES.heldSource } : undefined;
      const onRemove = instance && (() => {
        savedPanels.remove(instance.id);
        if (item?.id === 'table') {
          const remaining = extraPanels.filter(extra => extra.item?.id === 'table' && extra.id !== id);
          // Keep the pin when a remaining table satisfies it. Otherwise the pin would open a replacement.
          if (!fillsTablePin(remaining)) pins.unpin('table');
        } else if (id === 'trend' && trend) {
          const remainingPins = pins.pinned.filter(pin => pin !== id);
          setPage({ trend: null, [TREND_RANGE_OUTPUT.key]: null, pins: remainingPins.length > 0 ? remainingPins : null });
        } else if (item && catalogPinSlot(savedPanels.config, item.id) === id) {
          savedPanels.forgetPin(item.id);
          pins.unpin(item.id);
        }
      });
      if (instance?.source.kind === 'chart') {
        const { config } = instance.source;
        const read = readChartPanel(HW_TIME_CHART_FIELDS, instance, can);
        return { id, icon: ChartNoAxesCombined, title: read.status === 'ok' ? read.title : { ko: instance.id, en: instance.id }, preferredHeight: 360, minWidth: 200,
          onRemove, keep, render: () => <ChartPanel instance={instance} config={config} read={read} matrix={typeId ? queries[typeId] : undefined} drill={{ moduleType: typeId, drillModule: moduleId, drillMotion: motionId }} /> };
      }
      if (instance && (!item || item.disabledReason || tables.overflow.has(id))) {
        const panel = declaredPanelId(instance) ?? instance.id;
        const reason = tables.overflow.has(id) ? workspace('samePanelMax', { max: SAME_PANEL_MAX })
          : item?.disabledReason?.[lang] ?? workspace(instance.source.kind === 'declared' ? 'missingPanel' : 'unsupportedPanel', { id: panel });
        const recipeId = tables.overflow.has(id) ? undefined : item?.id;
        return { id, declarationId: recipeId, title: item?.title ?? { ko: panel, en: panel }, float: false, collapse: false,
          onRemove, keep,
          render: () => {
            const message = <StateMessage compact tone="warning" icon={<TriangleAlert className="size-4" aria-hidden />} title={reason} />;
            return recipeId ? withRecipe(id, recipeId, message) : message;
          } };
      }
      const panel = item!.id as CatalogId;
      // One table mode per slot: held tables read their own values (R C4), the rest follow the URL.
      const heldTable = panel === 'table' && instance && holdsSelection(instance) ? instance : undefined;
      const secondTable = tables.local(id);
      const tableIndex = followingTables.findIndex(table => table.id === id);
      const renderPanel = (panel: CatalogId) => {
        switch (panel) {
          case 'distribution': return <DistributionPanel input={panelContext} filter={filter} />;
          case 'heatmap': {
            const input = projectQueryInputs(panelDeclarations.heatmap, panelContext);
            const display = projectDisplayInputs(panelDeclarations.heatmap, panelContext);
            return input.moduleType ? <Heatmap query={queries[input.moduleType]!} filter={filter} typeId={input.moduleType} motionId={display.drillMotion} verdict={display.verdict} /> : null;
          }
          case 'trend': {
            const display = projectDisplayInputs(panelDeclarations.trend, panelContext);
            return trendTarget ? <RunQueryPanel kind={panel} target={trendTarget} filter={filter} date={display.date}
              equipmentSelectionInstanceId={step === 4 ? id : undefined} /> : null;
          }
          case 'scatter': {
            const input = projectQueryInputs(panelDeclarations.scatter, panelContext);
            const target = panelRunTarget(panel, input);
            return target ? <RunQueryPanel kind={panel} target={target} filter={filter} verdict={input.verdict} date={input.date} /> : null;
          }
          case 'motionTable': {
            const input = projectQueryInputs(panelDeclarations.motionTable, panelContext);
            return input.drillModule ? <MotionTablePanel moduleId={input.drillModule} filter={filter} /> : null;
          }
          case 'moduleMotions': {
            const input = projectQueryInputs(panelDeclarations.moduleMotions, panelContext);
            const display = projectDisplayInputs(panelDeclarations.moduleMotions, panelContext);
            return <SelectionSourceBars {...props} onOpenTrend={onOpenTrend} typeId={input.moduleType} moduleId={display.drillModule} depth={4} allMotions instanceId={sourceSlot === id ? sourceId : undefined} />;
          }
          case 'table': {
            if (heldTable) return <HeldTablePanel instance={heldTable} instances={savedInstances} local={secondTable} source={tableSource} />;
            const selection = followingTables[tableIndex]?.selection;
            return selection && <WorkspaceTable selection={selection} local={secondTable} />;
          }
          case 'donut': {
            const data = matrixData(projectQueryInputs(panelDeclarations.donut, panelContext));
            return matricesView(queries, data.required, <VerdictDonut matrices={data.matrices} filter={filter} verdict={verdict} />);
          }
          case 'pareto': {
            const data = matrixData(projectQueryInputs(panelDeclarations.pareto, panelContext));
            return matricesView(queries, data.required, <ParetoPanel matrices={data.matrices} filter={filter} />);
          }
          case 'equipmentDays': return renderEquipmentDays();
          case 'boundHistory': return <BoundHistoryPanel input={endpointInput(panel)} />;
        }
      };
      // A held table is named apart from the following one; two of one mode are numbered (R C5).
      const both = (message: Text, text: Text): Text => ({ ko: formatText(message, 'ko', { panel: text.ko }), en: formatText(message, 'en', { panel: text.en }) });
      const base = heldTable ? both(HW_TIME_WORKSPACE_MESSAGES.heldTitle, item!.title) : item!.title;
      const title = tables.numbered(id) ? both(HW_TIME_WORKSPACE_MESSAGES.secondTitle, base) : base;
      const placement = tables.pair.includes(id) ? { placement: { row: 'table-pair' } }
        : step === 4 && panel === 'trend' ? { placement: 'below' as const } : {};
      const badge = heldTable ? heldBadge(heldTable) : badges[tableIndex];
      const canPin = panel === 'table' ? tables.pinSlot === id : catalogPinSlot(savedPanels.config, panel) === id;
      return { id, declarationId: panel, icon: ChartNoAxesCombined, title, ...placement, preferredHeight: 360, minWidth: 200,
        onRemove,
        badge,
        keep,
        pin: canPin ? { pinned: pins.isPinned(panel), onToggle: () => {
          const unpinning = pins.isPinned(panel);
          // A panel shown only by its pin is the following one: it stays as a following instance, beside a held table too (R2 C11).
          const automaticPin = automatic.find(extra => extra.item.id === panel);
          const result = savedPanels.add(panel, automaticPin ? { mode: 'follow' } : undefined, {
            pin: !unpinning,
            targetSlot: panel === 'table' ? undefined : automaticPin?.id ?? id,
          });
          if (!result.ok) toast(limitReason[lang], 'warning');
          // Unpinning still takes effect when there is no room to keep the instance (R C2, C11).
          if (result.ok || unpinning) pins.toggle(panel);
        } } : undefined,
        render: () => withRecipe(id, panel, renderPanel(panel), { canPin }) };
    }),
  ];
  const settingsPanel = panels.find(panel => panel.id === settings?.id);
  if (settings && (!settingsPanel || settings.query !== settingsQuery)) setSettings(null);
  const storedPanel = added.find(panel => panel.slot === settingsPanel?.id)?.instance;
  const declarationId = (storedPanel && declaredPanelId(storedPanel))
    ?? extraPanels.find(panel => panel.id === settingsPanel?.id)?.item?.id ?? (currentHostsSelection && settingsPanel?.id === 'current' ? sourcePanelId : '');
  const declaration = declarationOf(declarationId);
  const instanceAt = (slot: string, declaration: PanelDeclaration | undefined) =>
    settingsInstance(slot, declaration, added.find(panel => panel.slot === slot)?.instance
      ?? (declaration?.id === 'table' && slot === instanceSlot(followingTable) ? followingTable : undefined), savedInstances);
  const selectionSource = reserved ?? chartSource;
  const isReservedPublisher = (panel: PanelInstance) => draftSources.includes(panel) && isHeldSource(panel);
  const selected = settingsPanel && instanceAt(settingsPanel.id, declaration);
  const implicit = selected && added.find(panel => panel.instance.id === selected.id)?.implicitFollow;
  const drawerPanel = selected && implicit && selectionSource ? { ...selected, inputs: [defaultTableInput(selectionSource)] } : selected;
  const instance = selected && isHeldSource(selected) ? storedPanel : drawerPanel;
  const drawerInstances = new Map(settingsPanel ? savedInstances.map(panel => [panel.id, panel]) : []);
  if (selectionSource) drawerInstances.set(selectionSource.id, selectionSource);
  if (instance) drawerInstances.set(instance.id, instance);
  const renderedPanel = (instance: PanelInstance) => {
    const slot = instance.id === selectionSource?.id ? sourceSlot : added.find(entry => entry.instance.id === instance.id)?.slot;
    return panels.find(panel => panel.id === slot);
  };
  const outputDeclaration = (panel: PanelInstance, key: string) => {
    const declarationId = declaredPanelId(panel);
    return declarationId === undefined ? undefined : declarationOf(declarationId)?.outputs.find(output => output.key === key)?.selection;
  };
  const settingsConfig = (slot: string, updated: PanelInstance): CustomPanels => {
    const entries = new Map(added.map(panel => [panel.instance.id, panel]));
    const editedInstances = [updated, ...added.filter(panel => panel.instance.id !== updated.id).map(panel => panel.instance)];
    if (!reserved && chartSource && sourceSlot && namesInstance(editedInstances, chartSource.id)) {
      entries.set(chartSource.id, { ...entries.get(chartSource.id), slot: sourceSlot, instance: chartSource });
    }
    const previous = entries.get(updated.id);
    const before = instance?.inputs.find(input => input.key === MOTION_EQUIPMENT_KEY);
    const after = updated.inputs.find(input => input.key === MOTION_EQUIPMENT_KEY);
    let entry: AddedPanel = { slot, instance: updated, heldFrom: previous?.heldFrom, ...(previous?.pinned && { pinned: previous.pinned }) };
    if (declaration?.id === panelDeclarations.table.id && after?.mode !== 'hold') entry = { slot, instance: updated };
    if (declaration?.id === panelDeclarations.table.id && before?.mode !== 'hold' && after?.mode === 'hold') {
      const held = heldTableInput(after);
      const writer = [...drawerInstances.values()].find(panel => panel.outputs.some(output => panelOutputRef(panel.id, output.key) === after.from));
      const heldFrom = writer && (renderedPanel(writer)?.id ?? (isReservedPublisher(writer) ? selectionHost : undefined));
      entry = { slot, heldFrom, instance: { ...updated, inputs: updated.inputs.map(input => input === after ? held : input) } };
    }
    entries.set(updated.id, entry);
    return { ...savedPanels.config, kind: 'custom', added: [...entries.values()], sources: draftSources };
  };
  const editSettings = (next: MenuViewPanels) => {
    const updated = next.instances.find(panel => panel.id === instance?.id);
    if (!updated || !settingsPanel) return;
    const config = settingsConfig(settingsPanel.id, updated);
    const retained = new Set(next.instances.map(panel => panel.id));
    // «매핑» replaces only a chart's source; every other drawer edit changes connections.
    const mappingOnly = updated.source.kind === 'chart' && JSON.stringify(updated.inputs) === JSON.stringify(instance?.inputs);
    savedPanels.editConnections({ ...config, sources: config.sources.filter(source => retained.has(source.id)) }, { connections: !mappingOnly });
  };

  /** Adds and reveals; returns the slot it opened (for the «새 패널» focus hand-off) or nothing when the saved panels would be too many. */
  const addPanel = (id: string, pin: boolean, options?: { restoreHidden: boolean }, intent?: AddIntent): string | undefined => {
    // A pinned panel shows without an instance; a hold or explicit follow makes it one first, so a second instance can sit beside it (#2862 ②).
    const pinnedOnly = intent !== undefined && automatic.some(panel => panel.item.id === id);
    const result = savedPanels.add(id, intent, { materialize: pinnedOnly, pin });
    if (!result.ok) {
      toast(limitReason[lang], 'warning');
      return undefined;
    }
    if (pin) pins.pin(id);
    // The slot added or changed is shown first (it leaves a maximized panel or comes back from hidden); when it makes a new pair, the first
    // table is brought forward next, so both read at once (R C1).
    followUp.current = id === 'table' && tables.open.length === 1 && tables.open[0]!.id !== result.slot ? { ...options } : null;
    setReveal(current => ({ panelId: result.slot, seq: (current?.seq ?? 0) + 1, ...options }));
    return result.slot;
  };
  /** A chart made from settings keeps «추가하면 고정» on its own entry: it is not a catalog panel, so the `pins` key does not hold it. */
  const addChart = (chart: PanelInstance, pin: boolean) => {
    const result = savedPanels.addChart(chart, { pin });
    if (!result.ok) toast(limitReason[lang], 'warning');
    else setReveal(current => ({ panelId: result.slot, seq: (current?.seq ?? 0) + 1 }));
  };
  const toolbarCatalog = catalog.map(item => item.disabledReason || !savedPanels.additionOverflows(item.id)
    ? item : { ...item, disabledReason: limitReason });
  // «새 패널» for the raw table is judged on its real slots (#2862 ②, R C3).
  const additionItems = catalog.map(item => item.id !== 'table' || !tables.open.length ? item
    : { ...item, slots: tables.open.map(({ id }) => id), ...(tables.again ? { again: tables.again } : {}) });
  const workspacePanels = panels.map((panel): PanelWorkspacePanel => {
    if (tables.overflow.has(panel.id)) return panel;
    const isOpenTable = tables.open.some(({ id }) => id === panel.id);
    return { ...panel,
      analysisSelectionDrop: isOpenTable ? {
        reason: chip => {
          const plan = savedPanels.planHold(panel.id, chip, selectionHost);
          if (plan.kind === 'held') return;
          if (plan.reason === 'panelsFull') return limitReason;
          const message = HW_TIME_WORKSPACE_MESSAGES[plan.reason];
          const params = { max: PANEL_INSTANCE_INPUTS_MAX };
          return { ko: formatText(message, 'ko', params), en: formatText(message, 'en', params) };
        },
        onDrop: chip => {
          // Clear the pin when holding the only table so it does not open a replacement following table.
          savedPanels.holdTable(panel.id, chip, { from: selectionHost, clearPin: tables.open.length === 1 && pins.isPinned('table') });
        },
      } : undefined,
      onOpenSettings: trigger => {
        if (pageParam('focus') !== null) setPage({ focus: null });
        setSettings({ id: panel.id, trigger, query: settingsQuery });
      },
    };
  });
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    {filter.empty && <p role="status" className="text-sm text-text-secondary">{common('filterNoneSelected')}</p>}
    {savedPanels.config.kind === 'unreadable' && <StateMessage compact tone="warning" icon={<TriangleAlert className="size-4" aria-hidden />} title={workspace('unreadablePanels')} />}
    {settings && settingsPanel && instance && <PanelSettingsDrawer key={settings.id} title={settingsPanel.title} panel={instance}
      value={{ version: 1, instances: [...drawerInstances.values()] }} trigger={settings.trigger} onClose={() => setSettings(null)}
      projectCandidate={updated => savedPanels.project(settingsConfig(settingsPanel.id, updated), { acrossSteps: true })}
      validateCandidate={candidate => exceedsPanelLimit(candidate) ? limitReason : undefined}
      mapping={instance.source.kind === 'chart' ? { fields: HW_TIME_CHART_FIELDS, granted: can } : undefined} onValidationChange={savedPanels.setSaveBlocked}
      declaredInputs={[...declaration?.queryInputs.page ?? [], ...declaration?.displayInputs.page ?? []]}
      sourceReference={key => {
        if (declaration?.id !== panelDeclarations.table.id || key !== MOTION_EQUIPMENT_KEY || !selectionSource) return;
        const expected = outputDeclaration(selectionSource, key);
        const output = selectionSource.outputs.find(output => output.key === key);
        if (output && output.shape === expected?.shape && output.dimension === expected.dimension) return panelOutputRef(selectionSource.id, key);
      }}
      sourceTitle={panel => renderedPanel(panel)?.title} outputLabel={({ panel, output }) => outputDeclaration(panel, output.key)?.label}
      selectionOf={({ panel, output }) => {
        // The output-only source records the equipment channel for «새 패널» holds.
        // Once following, it reads the same live channel as the active publisher.
        if (isReservedPublisher(panel)) {
          if (selectionSource && isEquipmentOutput(output)) {
            return parseAnalysisSelection(output.shape, pageParams(output.key));
          }
          return null;
        }
        const writer = renderedPanel(panel);
        const selection = outputDeclaration(panel, output.key);
        if (!writer || writer.id !== sourceSlot || selection?.shape !== output.shape || selection.dimension !== output.dimension) return null;
        return parseAnalysisSelection(output.shape, pageParams(output.key));
      }}
      onChange={editSettings} />}
    <PanelWorkspace panels={workspacePanels} presets={[stepPreset(step, extraIds)]} initialPreset="step" compactBelow={0} initialMode="fit"
      panelMenuItems={id => [
        ...(heldSlots.some(slot => slot.id === id) ? [{ id: 'follow', label: HW_TIME_WORKSPACE_MESSAGES.followInstead, onSelect: () => savedPanels.follow(id) }] : []),
      ]}
      panelRecipe={(panel, slot) => declarationOf(panel) ? () => setExplained(slot) : undefined}
      revealRequest={reveal}
      toolbarActions={<PanelAddMenu items={toolbarCatalog} shown={[...panels.map(panel => panel.id === 'current' && dayPanel ? dayPanel.id : panel.id), ...(tables.open.length ? ['table'] : [])]}
        chartFields={HW_TIME_CHART_FIELDS} existingIds={[...savedInstances.map(panel => panel.id), followingTable.id]}
        onAdd={(id, pin, chart) => { if (chart) addChart(chart, pin); else addPanel(id, pin); }} />}
      analysisPanelAddition={{ items: additionItems, hold: true, returnsOpened: true, onAdd: draft => {
        // Follow reads the URL selection so later picks also apply; hold keeps the draft's inputs (#2862).
        const panelId = draft.source.split('/')[1]!;
        return addPanel(panelId, pins.isPinned(panelId), { restoreHidden: true }, draft.mode === 'hold' ? { mode: 'hold', held: draft.inputs, from: selectionHost } : { mode: 'follow' });
      } }}
      persistenceScope={JSON.stringify([scopeId, savedPanels.config.viewId])}
      persistKey={`hw-time-s${step}-v1`} label={HW_TIME_WORKSPACE_MESSAGES.workspace} />
  </div>;
}
