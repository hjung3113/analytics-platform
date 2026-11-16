import { useMemo, useState, type ReactNode } from 'react';
import { formatText, useI18n, useMenuQuery, useMessages, usePlatform, useQueryContext, type MenuQueryState, type Text } from '@ap/kernel';
import {
  AnalysisChart, AnalysisChartFrame, LegendTree, PageKeyWarning, PanelAddMenu, PanelOptionChips, PanelOptions, PanelWorkspace, QueryView,
  usePanelOptions, usePinnedPanels, type ChartPoint, type LegendTreeNode, type PanelOption, type PanelOptionValues, type PanelWorkspacePanel,
} from '@ap/components';
import { HW_TIME_MODULE_TYPES, HW_TIME_UNIT, hwTimeOverview, type HwTimeMatrix, type HwTimeMatrixParams } from '../../endpoints';
import { HW_TIME_MESSAGES, HW_TIME_OVERVIEW_MESSAGES, HW_TIME_STEPPED_MESSAGES as S, HW_TIME_WORKSPACE_MESSAGES } from '../../messages';
import { formatSeconds } from '../../shared/format';
import { htmEmphasisStatus, htmStatusView } from '../../shared/htm';
import type { HwTimeFilter } from '../../shared/useHwTimeFilter';
import { useHwTimeDrillRules } from '../../shared/useHwTimeDrillRules';
import RawTablePanel from '../table/RawTablePanel';
import { MotionTablePanel, RunQueryPanel } from './AdditionalPanels';
import { DistributionPanel } from './DistributionPanel';
import { CATALOG_IDS, chartRows, checkedSum, panelCatalog, rowLabel, stepOf, stepPreset, validTrend, workspaceOptions, type CatalogId, type Step } from './stepped';
import { panelDeclarations, panelRunTarget, projectDisplayInputs, projectQueryInputs, workspacePanelContext } from './panelDeclaration';

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
  options: readonly PanelOption[]; values: PanelOptionValues; onChange: (id: string, value: string | boolean) => void; onReset: (id: string) => void;
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
function Bars({ depth, queries, typeId, motionId, moduleId, filter, options, values, onChange, onReset, previous = false, allMotions = false }: BarsProps) {
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
    if (module && validTrend(`${module}/${point.seriesId}`)) setPage({ trend: `${module}/${point.seriesId}`, row: point.x });
  };
  const statusOf = (point: ChartPoint) => {
    if (!statuses || depth === 1) return undefined;
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
  const body = <div className="flex h-full min-h-0 flex-col">
    {!previous && !allMotions && <div className="flex items-center justify-between gap-2 px-2 py-1">
      <div className="min-w-0 flex-1"><PanelOptionChips options={chartOptions} values={values} onReset={onReset} /></div>
      <PanelOptions options={chartOptions} values={values} onChange={onChange} />
    </div>}
    <AnalysisChartFrame chartId={chartId} title={title[lang]}
      series={shaped.series} unit={HW_TIME_UNIT[lang]} valueFormat={value => formatSeconds(value, lang)} description={overview('synthetic')}
      legend={depth < 3 || allMotions} visibleSeriesIds={depth >= 3 && !allMotions ? shaped.series.map(series => series.id) : undefined} legendPlacement="bottom" toolsReveal="always" xType="category" orientation="horizontal" stacked
      startAlign={values.align === true} minMax={values.minMax === true} emphasisFocus="none" size="fill" fillMin={CHART_FILL_MIN} rowPitch={BAR_ROW_PITCH} rowLabelWidth="auto"
      rowGroups={shaped.rowGroups} activeCategory={activeCategory} onActiveCategoryChange={row => setPage({ row }, { replace: true })} revealActive
      canApplyRange={false} reaggregation="sum" valueLabels="both" pointStatus={statusOf}
      pointActivation={depth < 4 ? { on: 'dblclick', onActivate: openTrend } : undefined} pointActions={pointActions} />
    {!previous && <p className="t-caption px-2 text-text-secondary">{depth === 1 ? m('scaleTypes', { equipment: String(shaped.equipmentCount), types: String(HW_TIME_MODULE_TYPES.length) })
      : m('scale', { equipment: String(shaped.equipmentCount), modules: String(shaped.moduleCount) })}</p>}
  </div>;
  return matricesView(queries, required, body);
}
function Heatmap({ query, filter, typeId }: { query: MatrixQuery; filter: HwTimeFilter; typeId: string }) {
  const m = useMessages(S);
  const { lang } = useI18n();
  const { setPage } = usePlatform();
  const checks = filter.selectionFor(typeId);
  return <QueryView fill query={query}>{data => {
    const statuses = chartStatuses(data, lang);
    const cells = data.cells.filter(cell => checks.modules.includes(cell.moduleId)).map(cell => ({
      x: cell.moduleId, y: cell.equipmentId, value: checkedSum(cell, checks.motions),
      status: statuses.cellStatusOf(rowLabel(cell.equipmentId, cell.moduleId), checks.motions),
    }));
    return <AnalysisChart chartId="hw-overview-matrix" title={m('heatmap')} unit={HW_TIME_UNIT[lang]} size="fill" legendPlacement="top" toolsReveal="always"
      spec={{ kind: 'heatmap', xLabels: data.modules.filter(id => checks.modules.includes(id)), yLabels: data.equipment, cells,
        scale: { type: 'sequential', domain: [0, Math.max(0, ...cells.flatMap(cell => cell.value === null ? [] : [cell.value]))] },
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
  return <MatrixSources required={required}>{queries => <WorkspacePanels key={population} {...{ step, queries, filter, typeId, motionId, moduleId, options, trend, pins }} values={state.values} onChange={state.setValue} onReset={state.reset}
    onDrill={id => {
      const [type, motion, module] = id.split('/');
      setPage({ moduleType: type!, drillMotion: motion ?? null, drillModule: module ?? null, row: null, trend: null, focus: null });
    }} />}</MatrixSources>;
}
function WorkspacePanels(props: Omit<BarsProps, 'depth' | 'previous' | 'allMotions'> & {
  step: Step; trend: string | null; pins: ReturnType<typeof usePinnedPanels>; onDrill: (id: string) => void;
}) {
  const { step, queries, filter, typeId, motionId, moduleId, trend, pins, onDrill } = props;
  const common = useMessages(HW_TIME_MESSAGES);
  const [added, setAdded] = useState<readonly string[]>([]);
  const catalog = panelCatalog({ step, typeId, moduleId, trend });
  const available = catalog.filter(item => !item.disabledReason);
  const extraIds = [...new Set([...added, ...pins.pinned, ...(trend || step === 4 ? ['trend'] : [])])].filter(id => available.some(item => item.id === id));
  const currentId = [typeId, motionId, moduleId].filter(Boolean).join('/') || null;
  const panelContext = workspacePanelContext({ step, typeId, motionId, moduleId, trend });
  const panels: PanelWorkspacePanel[] = [
    { id: 'tree', title: S.tree, minWidth: 200, preferredHeight: 640, render: () => <Hierarchy filter={filter} currentId={currentId} onDrill={onDrill} /> },
    ...(step > 1 ? [{ id: 'previous', title: barsTitle({ ...props, depth: (step - 1) as Step, previous: true }), minWidth: 200, preferredHeight: 640, render: () => <Bars {...props} depth={(step - 1) as Step} previous /> }] : []),
    { id: 'current', title: barsTitle({ ...props, depth: step }), primary: true, minWidth: 320, preferredHeight: 640, render: () => <Bars {...props} depth={step} /> },
    ...extraIds.map(id => {
      const item = catalog.find(item => item.id === id)!;
      const renderPanel = (panel: CatalogId) => {
        switch (panel) {
          case 'distribution': return <DistributionPanel input={panelContext} filter={filter} />;
          case 'heatmap': {
            const input = projectQueryInputs(panelDeclarations.heatmap, panelContext);
            return input.moduleType ? <Heatmap query={queries[input.moduleType]!} filter={filter} typeId={input.moduleType} /> : null;
          }
          case 'trend': {
            const input = projectQueryInputs(panelDeclarations.trend, panelContext);
            const target = panelRunTarget(panel, input);
            return target ? <RunQueryPanel kind={panel} target={target} filter={filter} /> : null;
          }
          case 'scatter': {
            const input = projectQueryInputs(panelDeclarations.scatter, panelContext);
            const target = panelRunTarget(panel, input);
            return target ? <RunQueryPanel kind={panel} target={target} filter={filter} /> : null;
          }
          case 'motionTable': {
            const input = projectQueryInputs(panelDeclarations.motionTable, panelContext);
            return input.drillModule ? <MotionTablePanel moduleId={input.drillModule} filter={filter} /> : null;
          }
          case 'moduleMotions': {
            const input = projectQueryInputs(panelDeclarations.moduleMotions, panelContext);
            const display = projectDisplayInputs(panelDeclarations.moduleMotions, panelContext);
            return <Bars {...props} typeId={input.moduleType} moduleId={display.drillModule} depth={4} allMotions />;
          }
          case 'table': return <RawTablePanel params={{}} linked />;
        }
      };
      return { id, title: item.title, placement: 'below' as const, preferredHeight: 360, minWidth: 200,
        pin: { pinned: pins.isPinned(id), onToggle: () => { setAdded(current => [...new Set([...current, id])]); pins.toggle(id); } },
        render: () => renderPanel(id as CatalogId) };
    }),
  ];
  return <div className="flex min-h-0 flex-1 flex-col gap-2">
    {filter.empty && <p role="status" className="text-sm text-text-secondary">{common('filterNoneSelected')}</p>}
    <PanelWorkspace panels={panels} presets={[stepPreset(step)]} initialPreset="step" compactBelow={0} initialMode="fit"
      toolbarActions={<PanelAddMenu items={catalog} shown={panels.map(panel => panel.id)} onAdd={(id, pin) => {
        setAdded(current => [...new Set([...current, id])]); if (pin) pins.pin(id);
      }} />}
      persistKey={`hw-time-s${step}-v1`} label={HW_TIME_WORKSPACE_MESSAGES.workspace} />
  </div>;
}
