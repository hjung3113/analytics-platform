import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChartNoAxesCombined, History, ListTree } from 'lucide-react';
import { formatText, useI18n, useMenuQuery, useMessages, usePlatform, useQueryContext, type MenuQueryState, type Text } from '@ap/kernel';
import {
  AnalysisChart, AnalysisChartFrame, LegendTree, PageKeyWarning, PanelAddMenu, PanelOptions, PanelWorkspace, QueryView,
  usePanelOptions, usePinnedPanels, type ChartPoint, type LegendTreeNode, type PanelOption, type PanelOptionValues, type PanelWorkspacePanel,
} from '@ap/components';
import { HW_TIME_MODULE_TYPES, HW_TIME_UNIT, hwTimeOverview, validPanelDate, verdictCodec, type HtmStatus, type HwTimeMatrix, type HwTimeMatrixParams, type HwTimePanelParams } from '../../endpoints';
import { HW_TIME_MESSAGES, HW_TIME_NEW_PANEL_MESSAGES as N, HW_TIME_OVERVIEW_MESSAGES, HW_TIME_STEPPED_MESSAGES as S, HW_TIME_WORKSPACE_MESSAGES } from '../../messages';
import { formatSeconds } from '../../shared/format';
import { htmEmphasisStatus, htmStatusView } from '../../shared/htm';
import type { HwTimeFilter } from '../../shared/useHwTimeFilter';
import { useHwTimeDrillRules } from '../../shared/useHwTimeDrillRules';
import RawTablePanel from '../table/RawTablePanel';
import { MotionTablePanel, RunQueryPanel } from './AdditionalPanels';
import { DistributionPanel } from './DistributionPanel';
import { BoundHistoryPanel, EquipmentDaysPanel, ParetoPanel, VerdictDonut } from './NewPanels';
import { heatmapValues, VERDICT_CATEGORIES, verdictEmphasis } from './newPanelData';
import { CATALOG_IDS, chartRows, panelCatalog, rowLabel, stepOf, stepPreset, validTrend, workspaceOptions, type CatalogId, type Step } from './stepped';
import { panelDeclarations, panelRunTarget, projectDisplayInputs, projectQueryInputs, workspacePanelContext } from './panelDeclaration';

import { panelRecipe } from './recipeModel';
import { RECIPE_ITEM, RecipeBack } from './PanelRecipe';

/** Lowest plot height before its panel body scrolls (px). */
const CHART_FILL_MIN = 200;
const BAR_ROW_PITCH = 28;
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
};
/** Workspace tabs stay visible when the Frame's own title is hidden by panel chrome. */
function barsTitle({ depth, typeId, motionId, moduleId, previous = false, allMotions = false }: Pick<BarsProps, 'depth' | 'typeId' | 'motionId' | 'moduleId' | 'previous' | 'allMotions'>) {
  let message: Text = S.overview;
  if (depth === 2) message = S.typeBars;
  if (depth === 3) message = S.motionBars;
  if (depth === 4) message = allMotions ? S.moduleMotions : S.moduleBars;
  const params = { type: typeId ?? '', motion: motionId ?? '', module: moduleId ?? '' };
  const title = { ko: formatText(message, 'ko', params), en: formatText(message, 'en', params) };
  return previous ? { ko: `${title.ko} · ${S.previous.ko}`, en: `${title.en} · ${S.previous.en}` } : title;
}
function Bars({ depth, queries, typeId, motionId, moduleId, filter, options, values, onChange, onOpenTrend, previous = false, allMotions = false }: BarsProps) {
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
  const drill = (point: ChartPoint) => {
    if (depth === 1) setPage({ moduleType: point.seriesId, drillMotion: null, drillModule: null, row: point.x, trend: null, focus: null });
    if (depth === 2) setPage({ drillMotion: point.seriesId, drillModule: null, row: point.x, trend: null, focus: null });
    if (depth === 3) setPage({ drillModule: point.x.split(' · ')[1]!, row: point.x, trend: null, focus: null });
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
    const actions = [];
    if (depth > 1) actions.push({ id: 'trend', label: m('openTrend'), onSelect: openTrend });
    if (depth < 4) actions.push({ id: 'drill', label: m('drillTo', { value: depth === 3 ? point.x.split(' · ')[1]! : point.seriesId }), onSelect: drill });
    return actions;
  };
  let chartId = previous ? 'hw-previous' : 'hw-current';
  if (allMotions) chartId = 'hw-module-motions';
  const scaleText = depth === 1 ? m('scaleTypes', { equipment: String(shaped.equipmentCount), types: String(HW_TIME_MODULE_TYPES.length) })
    : m('scale', { equipment: String(shaped.equipmentCount), modules: String(shaped.moduleCount) });
  // The panel options open the chart's tool row (#2459, owner-confirmed variant B): the inline values say the state, so no chip row.
  const toolbarStart = !previous && !allMotions ? <PanelOptions options={chartOptions} values={values} onChange={onChange} /> : undefined;
  const body = <div className="flex h-full min-h-0 flex-col">
    <AnalysisChartFrame chartId={chartId} title={title[lang]} summary="quiet" toolbarStart={toolbarStart}
      series={shaped.series} unit={HW_TIME_UNIT[lang]} valueFormat={value => formatSeconds(value, lang)} description={<>{overview('synthetic')}<br />{scaleText}</>}
      legend={depth < 3 || allMotions} visibleSeriesIds={depth >= 3 && !allMotions ? shaped.series.map(series => series.id) : undefined} legendPlacement="bottom" toolsReveal="always" xType="category" orientation="horizontal" stacked
      startAlign={values.align === true} minMax={values.minMax === true} emphasisFocus="none" size="fill" fillMin={CHART_FILL_MIN} rowPitch={BAR_ROW_PITCH} rowLabelWidth="auto"
      rowGroups={shaped.rowGroups} activeCategory={activeCategory} onActiveCategoryChange={row => setPage({ row }, { replace: true })} revealActive
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

export function AnalysisWorkspace({ filter }: { filter: HwTimeFilter }) {
  const { pageParam, setPage, session } = usePlatform();
  const context = useQueryContext();
  const typeId = pageParam('moduleType'), motionId = pageParam('drillMotion'), moduleId = pageParam('drillModule');
  const step = stepOf(typeId, motionId, moduleId);
  const options = useMemo(() => workspaceOptions(step), [step]);
  const state = usePanelOptions(options);
  const pins = usePinnedPanels('pins', CATALOG_IDS);
  const trend = pageParam('trend');
  const keys = useHwTimeDrillRules([...state.rules, ...pins.rules,
    { key: 'verdict', label: N.verdict, valid: raw => verdictCodec.decode(raw) !== null },
    { key: 'date', label: N.date, valid: raw => validPanelDate(raw, context.from, context.to) },
    { key: 'trend', label: S.trend, valid: validTrend },
    { key: 'row', label: HW_TIME_WORKSPACE_MESSAGES.activeRow, valid: raw => {
      if (/^EQ-\d{3}$/.test(raw)) return true;
      const [equipment, module, extra] = raw.split(' · ');
      const type = HW_TIME_MODULE_TYPES.find(type => type.id === typeId);
      return extra === undefined && /^EQ-\d{3}$/.test(equipment ?? '') && !!type && (type.modules as readonly string[]).includes(module ?? '');
    } },
  ]);
  if (filter.invalid) return <PageKeyWarning sentences={filter.invalid} onRecover={filter.recover} />;
  if (keys.invalid) return <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} />;
  const required = step <= 2 ? HW_TIME_MODULE_TYPES.map(type => type.id) : [typeId!];
  const population = JSON.stringify([step, session.user.id, context]);
  return <MatrixSources required={required}>{queries => <WorkspacePanels key={population} {...{ step, queries, filter, typeId, motionId, moduleId, options, trend, pins }} values={state.values} onChange={state.setValue}
    onDrill={id => {
      const [type, motion, module] = id.split('/');
      setPage({ moduleType: type!, drillMotion: motion ?? null, drillModule: module ?? null, row: null, trend: null, focus: null });
    }} />}</MatrixSources>;
}
function WorkspacePanels(props: Omit<BarsProps, 'depth' | 'previous' | 'allMotions' | 'onOpenTrend'> & {
  step: Step; trend: string | null; pins: ReturnType<typeof usePinnedPanels>; onDrill: (id: string) => void;
}) {
  const { step, queries, filter, typeId, motionId, moduleId, trend, pins, onDrill } = props;
  const common = useMessages(HW_TIME_MESSAGES);
  const [explained, setExplained] = useState<string | null>(null);
  const [added, setAdded] = useState<readonly string[]>([]);
  const [reveal, setReveal] = useState<{ panelId: string; seq: number } | null>(null);
  useEffect(() => {
    if (trend && step !== 4) setReveal(current => ({ panelId: 'trend', seq: (current?.seq ?? 0) + 1 }));
  }, [trend, step]);
  const catalog = panelCatalog({ step, typeId, moduleId, trend });
  const available = catalog.filter(item => !item.disabledReason);
  const extraIds = [...new Set([...added, ...pins.pinned, ...(trend || step === 4 ? ['trend'] : [])])].filter(id => available.some(item => item.id === id));
  const currentId = [typeId, motionId, moduleId].filter(Boolean).join('/') || null;
  const { pageParam, setPage } = usePlatform();
  const onOpenTrend = (target: string, row: string) => {
    setPage({ trend: target, row });
    setReveal(current => ({ panelId: 'trend', seq: (current?.seq ?? 0) + 1 }));
  };
  const verdict = verdictCodec.decode(pageParam('verdict') ?? '');
  const date = pageParam('date');
  const panelContext = { ...workspacePanelContext({ step, typeId, motionId, moduleId, trend }), verdict, date };
  const matrixData = (input: { moduleType?: string | null }) => {
    const required = input.moduleType ? [input.moduleType] : Object.keys(queries);
    return { required, matrices: required.flatMap(id => queries[id]?.response?.data ? [queries[id]!.response!.data!] : []) };
  };
  const endpointInput = (panel: 'equipmentDays' | 'boundHistory'): HwTimePanelParams => {
    const input = projectQueryInputs(panelDeclarations[panel], panelContext);
    return { ...(input.moduleType ? { moduleType: input.moduleType } : {}), ...(input.drillModule ? { drillModule: input.drillModule } : {}), ...(input.drillMotion ? { drillMotion: input.drillMotion } : {}) };
  };
  const panels: PanelWorkspacePanel[] = [
    { id: 'tree', icon: ListTree, title: S.tree, minWidth: 200, preferredHeight: 640, render: () => <Hierarchy filter={filter} currentId={currentId} onDrill={onDrill} /> },
    ...(step > 1 ? [{ id: 'previous', icon: History, title: barsTitle({ ...props, depth: (step - 1) as Step, previous: true }), minWidth: 200, preferredHeight: 640, render: () => <Bars {...props} onOpenTrend={onOpenTrend} depth={(step - 1) as Step} previous /> }] : []),
    { id: 'current', title: barsTitle({ ...props, depth: step }), primary: true, minWidth: 320, preferredHeight: 640, render: () => <Bars {...props} onOpenTrend={onOpenTrend} depth={step} /> },
    ...extraIds.map(id => {
      const item = catalog.find(item => item.id === id)!;
      const renderPanel = (panel: CatalogId) => {
        switch (panel) {
          case 'distribution': return <DistributionPanel input={panelContext} filter={filter} />;
          case 'heatmap': {
            const input = projectQueryInputs(panelDeclarations.heatmap, panelContext);
            const display = projectDisplayInputs(panelDeclarations.heatmap, panelContext);
            return input.moduleType ? <Heatmap query={queries[input.moduleType]!} filter={filter} typeId={input.moduleType} motionId={display.drillMotion} verdict={display.verdict} /> : null;
          }
          case 'trend': {
            const input = projectQueryInputs(panelDeclarations.trend, panelContext);
            const target = panelRunTarget(panel, input);
            const display = projectDisplayInputs(panelDeclarations.trend, panelContext);
            return target ? <RunQueryPanel kind={panel} target={target} filter={filter} date={display.date} /> : null;
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
            return <Bars {...props} onOpenTrend={onOpenTrend} typeId={input.moduleType} moduleId={display.drillModule} depth={4} allMotions />;
          }
          case 'table': return <RawTablePanel params={{}} linked />;
          case 'donut': {
            const data = matrixData(projectQueryInputs(panelDeclarations.donut, panelContext));
            return matricesView(queries, data.required, <VerdictDonut matrices={data.matrices} filter={filter} verdict={verdict} />);
          }
          case 'pareto': {
            const data = matrixData(projectQueryInputs(panelDeclarations.pareto, panelContext));
            return matricesView(queries, data.required, <ParetoPanel matrices={data.matrices} filter={filter} />);
          }
          case 'equipmentDays': return <EquipmentDaysPanel input={endpointInput(panel)} verdict={verdict} date={date} />;
          case 'boundHistory': return <BoundHistoryPanel input={endpointInput(panel)} />;
        }
      };
      return { id, icon: ChartNoAxesCombined, title: item.title, ...(step === 4 && id === 'trend' ? { placement: 'below' as const } : {}), preferredHeight: 360, minWidth: 200,
        pin: { pinned: pins.isPinned(id), onToggle: () => { setAdded(current => [...new Set([...current, id])]); pins.toggle(id); } },
        render: () => {
          const recipe = explained === id ? panelRecipe(id, panelContext, { primary: false }) : null;
          return recipe ? <RecipeBack recipe={recipe} onClose={() => setExplained(null)} /> : renderPanel(id as CatalogId);
        } };
    }),
  ];
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    {filter.empty && <p role="status" className="text-sm text-text-secondary">{common('filterNoneSelected')}</p>}
    <PanelWorkspace panels={panels} presets={[stepPreset(step, extraIds)]} initialPreset="step" compactBelow={0} initialMode="fit"
      panelMenuItems={id => Object.hasOwn(panelDeclarations, id) ? [{ id: 'recipe', label: RECIPE_ITEM, onSelect: () => setExplained(id) }] : []}
      revealRequest={reveal}
      toolbarActions={<PanelAddMenu items={catalog} shown={panels.map(panel => panel.id)} onAdd={(id, pin) => {
        setAdded(current => [...new Set([...current, id])]); if (pin) pins.pin(id);
        setReveal(current => ({ panelId: id, seq: (current?.seq ?? 0) + 1 }));
      }} />}
      persistKey={`hw-time-s${step}-v1`} label={HW_TIME_WORKSPACE_MESSAGES.workspace} />
  </div>;
}
