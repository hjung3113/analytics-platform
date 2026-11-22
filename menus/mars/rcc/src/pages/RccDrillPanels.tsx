import { formatNumber, type Text } from '@ap/contracts';
import {
  AnalysisChart, AnalysisChartFrame, LegendTree, PageFilterBar, PanelWorkspace,
  type ChartPoint, type ChartSeries, type HeatmapCell, type LegendTreeNode, type PanelWorkspaceLayout,
  type PanelWorkspacePanel,
} from '@ap/components';
import { useI18n, useMessages, usePlatform } from '@ap/kernel';
import { StatusBadge } from '@ap/ui';
import { RCC_MESSAGES as M } from '../messages';
import { layerLabel, usageLabel, type ComparisonUnit } from '../prototype/comparisonUnits';
import {
  STRUCTURE_TYPES, STRUCTURES, comparisonFor, layerTimes, totalTimes,
  type Cohort, type EQUIPMENT, type Step, type Structure,
} from '../prototype/timeCompareFixture';
import { StepEvidence } from './StepEvidence';

const BAR_ROW_PITCH = 24;
const BAR_PANEL_HEIGHT = 400;
const MATRIX_ROW_PITCH = 17;
const MATRIX_PANEL_HEIGHT = 440;
const MATRIX_COLOR_LIMIT = 1.6;
const TREE_SHARE = 18;
const COLORS = ['chart-series-1', 'chart-series-2', 'chart-series-3', 'chart-series-4'] as const;
const treeVisibility = new Set<string>();
const keepTreeVisibility = () => {};
const group = (id: string): PanelWorkspaceLayout => ({ type: 'group', panels: [id] });
const STACK_LAYOUT: PanelWorkspaceLayout = { type: 'branch', dir: 'row', sizes: [38, 62], children: [group('steps'), group('matrix')] };

type Props = {
  units: ComparisonUnit[];
  unit: ComparisonUnit;
  usage: Cohort | undefined;
  step: Step | undefined;
  targets: readonly typeof EQUIPMENT[number][];
  days: readonly string[];
  structure: Structure;
  counts: Record<Structure, number>;
  baseline: string | null;
  equipment: string | null;
  depth: number;
  resetDrill: Record<string, null>;
  targetCount: number;
};

export function RccDrillPanels({ units, unit, usage, step, targets, days, structure, counts, baseline, equipment, depth, resetDrill, targetCount }: Props) {
  const m = useMessages(M);
  const { lang } = useI18n();
  const { setPage } = usePlatform();
  const held = targets.filter(item => item.structure !== structure);
  const eligible = targets.filter(item => item.structure === structure);
  const focus = eligible.find(item => item.id === equipment)?.id ?? null;
  const unitText = m('seconds');
  const baselineLabel = baseline ?? m('median');
  const numberText = (value: number) => formatNumber(value, lang, { maximumFractionDigits: 2 });
  const metric = days.length === 1 ? m('dailyMetric') : `${m('dailyMetric')} · ${m('periodMetric', { count: days.length })}`;
  const drillTo = (patch: Record<string, string | null>) => setPage(patch, { focus: 'drill' });

  const commonBars = {
    unit: unitText, xType: 'category', orientation: 'horizontal', canApplyRange: false, summary: 'quiet',
    size: 'fill', rowPitch: BAR_ROW_PITCH, rowLabelWidth: 'auto', valueFormat: numberText, activeCategory: equipment,
  } as const;

  const totalPanel = (id: string, title: Text, usages: readonly Cohort[], previous = false): PanelWorkspacePanel => ({
    id, title, primary: !previous, preferredHeight: BAR_PANEL_HEIGHT,
    render: () => {
      const { rows, baseline: numericBaseline } = totalTimes(days, usages, structure, baseline, targets);
      const bars: ChartSeries[] = [
        { id: 'l1-total', name: m('comparable'), color: COLORS[0], points: rows.map(item => [item.id, item.held ? null : item.total]) },
        { id: 'l1-held', name: m('held'), color: 'chart-remainder', points: rows.filter(item => item.held).map(item => [item.id, item.total]) },
      ];
      return <AnalysisChartFrame {...commonBars} chartId={`rcc-${id}`} title={m('l1')} series={bars}
        legendPlacement="top" markLines={numericBaseline === null ? undefined : [{ y: numericBaseline, label: '' }]}
        toolbarStart={numericBaseline === null ? undefined : <span className="t-caption text-text-secondary">{baselineLabel} · {numberText(numericBaseline)} {unitText}</span>}
        pointActivation={previous ? undefined : { on: 'dblclick', onActivate: point => drillTo({ unit: unit.id, equipment: point.x }) }}
        isPointSelectable={point => previous || point.seriesId === 'l1-total'} />;
    },
  });

  const layerPanel = (previous = false): PanelWorkspacePanel => ({
    id: 'layers', title: previous ? previousTitle(M.layerTimes) : M.layerTimes, primary: !previous, preferredHeight: BAR_PANEL_HEIGHT,
    render: () => {
      const layers = layerTimes(days, unit.usages, targets);
      const series: ChartSeries[] = layers.map((layer, i) => ({
        id: layer.id, name: `${layerLabel(layer)} · ${layer.recipe}`, color: COLORS[i % COLORS.length]!,
        points: layer.points.map(([id, value]) => [id, held.some(item => item.id === id) ? null : value]),
      }));
      if (held.length) series.push({
        id: 'held-layer', name: m('held'), color: 'chart-remainder',
        points: held.map(item => [item.id, null]),
      });
      const rowGroups = {
        header: m('structure'),
        byCategory: new Map(targets.map(item => [item.id, { group: item.structure === structure ? structure : `${item.structure} · ${m('held')}` }])),
      };
      return <AnalysisChartFrame {...commonBars} chartId="rcc-layers" title={m('layerTimes')} series={series}
        emphasisFocus="none" legendPlacement="top" stacked startAlign rowGroups={rowGroups} valueLabels="segment"
        toolbarStart={<span className="t-caption text-text-secondary">{m('startAlign')}</span>}
        pointActivation={previous ? undefined : { on: 'dblclick', onActivate: point => drillTo({ layer: point.seriesId, equipment: point.x }) }}
        isPointSelectable={point => point.value !== null} />;
    },
  });

  const defaultTotals = totalPanel('totals', M.l1, unit.usages);
  let chartLayout = group('totals');
  let previousChart: string | undefined;
  let panels = [defaultTotals];
  let tree: { key: string; title: Text; nodes: LegendTreeNode[] } = {
    key: 'unit', title: M.cohort, nodes: units.map(item => ({ id: item.id, label: item.label, drillOnly: true })),
  };
  let evidence;
  if (depth > 0) {
    tree = { key: 'layer', title: M.layer, nodes: unit.usages.map(item => ({
      id: item.id, label: `${layerLabel(item)} · ${item.recipe}`, drillOnly: true,
    })) };
    panels = [layerPanel(), totalPanel('totals', previousTitle(M.l1), unit.usages, true)];
    chartLayout = group('layers');
    previousChart = 'totals';
  }

  if (usage) {
    const comparison = comparisonFor(days, structure, baseline, usage, targets);
    const stepRows = STRUCTURES[structure].map(item => ({ ...item, label: m('stepLabel', { no: item.no, seq: item.seq }) }));
    const columns = comparison.equipment.map(item => ({ ...item, label: item.id.slice('EQ-'.length) }));
    const series: ChartSeries[] = stepRows.map((item, i) => ({
      id: item.id, name: item.label, color: COLORS[i % COLORS.length]!,
      points: comparison.equipment.map(equipmentRow => [equipmentRow.id, equipmentRow.steps[item.id] ?? null]),
    }));
    const cells: HeatmapCell[] = stepRows.flatMap(item => columns.map(column => ({
      x: column.label, y: item.label, value: column.held ? null : column.steps[item.id]! - comparison.stepBaseline[item.id]!,
    })));
    const selectedRow = stepRows.find(item => item.id === step?.id);
    const selectedColumn = columns.find(item => item.id === focus);
    const selectedCell = selectedRow && selectedColumn ? {
      x: selectedColumn.label, y: selectedRow.label, label: `${selectedRow.label} · ${selectedColumn.id}`,
    } : null;
    const categoryValueMarks = {
      label: m('actualL1'),
      // Held rows have no Step bars, so they get no actual-L1 mark either.
      byCategory: new Map(comparison.equipment.map(item => [item.id, item.held ? null : item.total])),
    };
    const toStep = (point: ChartPoint) => drillTo({ step: point.seriesId, equipment: point.x });
    const stack: PanelWorkspacePanel = {
      id: 'steps', title: step ? previousTitle(M.stepTimes) : M.stepTimes, primary: true, preferredHeight: MATRIX_PANEL_HEIGHT,
      render: () => <AnalysisChartFrame {...commonBars} chartId="rcc-steps" title={m('stepTimes')} series={series} stacked
        legend={false} visibleSeriesIds={series.map(item => item.id)} emphasisFocus="none"
        categoryValueMarks={categoryValueMarks}
        toolbarStart={<span className="t-caption text-text-secondary"><span aria-hidden>◆ </span>{categoryValueMarks.label}</span>}
        pointActivation={{ on: 'dblclick', onActivate: toStep }} isPointSelectable={point => point.value !== null} />,
    };
    const matrix: PanelWorkspacePanel = {
      id: 'matrix', title: M.matrix, preferredHeight: MATRIX_PANEL_HEIGHT,
      render: () => <AnalysisChart chartId="rcc-step-matrix" title={m('matrix')} size="fill" unit={unitText} legendPlacement="top"
        legendCaption={m('delta')} spec={{
          kind: 'heatmap', minRowHeight: MATRIX_ROW_PITCH, valueFormat: value => `${value > 0 ? '+' : ''}${numberText(value)}`,
          // The heatmap y-axis starts at the bottom. Keep cells in reading order for the table.
          xLabels: columns.map(item => item.label), yLabels: stepRows.map(item => item.label).reverse(), cells,
          nullLabel: m('held'), selectedCell,
          scale: { type: 'diverging', pivot: 0, pivotLabel: m('sameAsBaseline'), domain: [-MATRIX_COLOR_LIMIT, MATRIX_COLOR_LIMIT] },
          cellActivation: { on: 'click', onActivate: (x, y) => {
            const column = columns.find(item => item.label === x);
            const selectedStep = stepRows.find(item => item.label === y);
            if (column && selectedStep && !column.held) drillTo({ step: selectedStep.id, equipment: column.id });
          } },
        }} />,
    };
    tree = { key: 'step', title: M.step, nodes: stepRows.map(item => ({ id: item.id, label: item.label, drillOnly: true })) };
    panels = [stack, matrix];
    chartLayout = STACK_LAYOUT;
    previousChart = undefined;
    if (step) {
      evidence = <StepEvidence cohort={usage} {...{ days, structure, step, baseline, baselineLabel, targets }}
        equipment={focus} baselineValue={comparison.stepBaseline[step.id]!} onClearFocus={() => setPage({ equipment: null })} />;
    } else {
      panels.push(layerPanel(true));
      previousChart = 'layers';
    }
  }

  const structureText = (type: Structure) => m('structureOption', { type, count: counts[type] });
  panels.push({
    id: 'tree', title: tree.title,
    render: () => <div className="h-full min-h-0 overflow-auto">
      <LegendTree key={tree.key} label={tree.title[lang]} nodes={tree.nodes}
        currentId={tree.key === 'step' ? step?.id : undefined}
        visible={treeVisibility} onVisibleChange={keepTreeVisibility} drillOnName onDrill={id => drillTo({ [tree.key]: id, equipment: focus })} />
    </div>,
  });
  const comparisonRow: PanelWorkspaceLayout = {
    type: 'branch', dir: 'row', sizes: [TREE_SHARE, 100 - TREE_SHARE], children: [group('tree'), chartLayout],
  };
  const layout: PanelWorkspaceLayout = previousChart
    ? { type: 'branch', dir: 'column', sizes: [55, 45], children: [comparisonRow, group(previousChart)] }
    : comparisonRow;
  const preset = { id: 'comparison', label: M.title, layout };
  return <div className="grid min-w-0 gap-2">
    <PageFilterBar label={m('cohort')} collapsible defaultCollapsed preferenceKey="rcc-comparison-options" summaryItems={[
      { key: 'structure', label: m('structure'), value: structureText(structure) },
      { key: 'baseline', label: m('baseline'), value: baselineLabel },
    ]} fields={[
      { kind: 'select', key: 'structure', testId: 'rcc-structure', label: m('structure'), value: structure,
        options: STRUCTURE_TYPES.filter(type => counts[type] > 0).map(type => ({ value: type, label: structureText(type) })),
        onValueChange: value => setPage({ ...resetDrill, structure: value, baseline: null }) },
      { kind: 'select', key: 'baseline', testId: 'rcc-baseline', label: m('baseline'), value: baseline ?? '', emptyOptionLabel: m('median'),
        options: eligible.map(item => ({ value: item.id, label: item.id })), onValueChange: value => setPage({ baseline: value || null }) },
    ]} />
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <StatusBadge tone="neutral">{m('synthetic')}</StatusBadge>
      <strong className="t-caption font-medium text-text-primary">{usage ? usageLabel(usage) : unit.label}</strong>
      <span className="t-caption text-text-secondary">{metric}</span>
      {targetCount > targets.length && <span className="t-caption text-text-secondary">{m('targetPartial', { shown: targets.length, total: targetCount })}</span>}
      {held.length > 0 && <span data-testid="rcc-held" className="inline-flex items-center gap-1.5 t-caption text-text-secondary">
        <StatusBadge tone="neutral">{m('held')}</StatusBadge> {held.map(item => item.id).join(', ')}
      </span>}
    </div>
    {evidence}
    <PanelWorkspace key={depth} label={M.title} panels={panels} presets={[preset]} initialMode="stack"
      initialPreset={preset.id} persistKey={`rcc-comparison-side-${depth}`} compactBelow={0} />
  </div>;
}

function previousTitle(title: Text) {
  return { ko: `${M.previous.ko} · ${title.ko}`, en: `${M.previous.en} · ${title.en}` };
}
