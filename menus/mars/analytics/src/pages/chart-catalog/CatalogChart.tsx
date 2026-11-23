import { useMessages } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../../messages';
import { formatWallClock } from '@ap/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSummaryTime, useI18n, usePlatform } from '@ap/kernel';
import { AnalysisChart, AnalysisChartFrame, LaneTimeline, SegmentedRadio, type ChartSeries, type ChartSpec } from '@ap/components';
import { Checkbox } from '@ap/ui';
import type { CatalogData, CatalogKind } from '../../endpoints';
import { BreakdownBars } from './BreakdownBars';
import { kindLabels } from './support';
const COMPANION_VALUES = [8, 14, 11, 17];

export function CatalogChart({ kind, data, height, updatedAt }: { kind: Exclude<CatalogKind, 'histogram' | 'sequence'>; data: CatalogData; height: number; updatedAt: string | null }) {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { tx, lang } = useI18n();
  const { global } = usePlatform();
  const identity = JSON.stringify(global);
  const [detail, setDetail] = useState<{ identity: string; target: string } | null>(null);
  const [stackMode, setStackMode] = useState<'none' | 'stack'>();
  const [areaFill, setAreaFill] = useState(false);
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  const result = useRef<HTMLParagraphElement>(null);
  if (previousIdentity !== identity) { setPreviousIdentity(identity); setDetail(null); }
  useEffect(() => {
    if (detail?.identity === identity) result.current?.scrollIntoView({ block: 'nearest' });
  }, [detail, identity]);
  const title = `${tx(kindLabels[kind])} ${m('catalogChartChart')}`;
  const description = m('catalogChartSyntheticData') + ` · ${formatWallClock(global.from)} – ${formatWallClock(global.to)}`;
  const updated = formatSummaryTime(updatedAt, lang);
  const previousLabel = m('catalogChartPreviousEqualPeriod') + ` · ${formatWallClock(data.previousFrom)} – ${formatWallClock(data.previousTo)}`;
  const currentLabel = m('catalogChartCurrentPeriod');
  const companionLabel = m('catalogChartCompanionSeries');
  const spec = useMemo<ChartSpec | null>(() => {
    const show = (target: string) => setDetail({ identity, target });
    switch (kind) {
      case 'line': case 'bar': case 'lane': case 'breakdown': return null;
      case 'topNBar': return { kind, items: data.topNBar ?? [], defaultExpanded: true, onItemClick: show, legend: [{ label: m('catalogChartGroupA'), colorToken: 'chart-series-1' }, { label: m('catalogChartGroupB'), colorToken: 'chart-series-2' }] };
      case 'heatmap': return { kind, ...data.heatmap,
        xLabels: data.heatmap.xLabels.map(value => formatWallClock(value)),
        cells: data.heatmap.cells.map(cell => ({ ...cell, x: formatWallClock(cell.x) })),
        onCellClick: (x, y) => show(`${y} · ${x}`) };
      case 'donut': return { kind, slices: data.donut, onSliceClick: show };
      case 'scatter': return { kind, points: data.scatter, xUnit: m('catalogChartJobs'), xLabel: m('catalogChartCompletedJobs'), yLabel: m('catalogChartCycleTime'), onPointClick: show };
      case 'boxPlot': return { kind, groups: data.boxPlot, whisker: 'minMax', onGroupClick: show };
      case 'pareto': return { kind, items: data.pareto, maxItems: 4, onItemClick: show };
    }
  }, [m, kind, data, identity]);
  const series = useMemo(() => {
    const make = (previous: boolean): ChartSeries[] => [{
      id: previous ? 'previous' : 'current', name: previous ? previousLabel : currentLabel,
      color: previous ? 'chart-series-2' : 'chart-series-1', kind: kind === 'bar' ? 'bar' : 'line',
      points: (previous ? data.previous : data.current).map(bucket => [bucket.at, bucket.value]),
    }];
    const current = make(false);
    if (kind === 'bar' || kind === 'line') current.push({
      ...current[0], id: 'companion', name: companionLabel, color: 'chart-series-3',
      points: data.current.map(({ at }, index) => [at, COMPANION_VALUES[index % COMPANION_VALUES.length]]),
    });
    return { current, previous: make(true) };
  }, [data, kind, currentLabel, previousLabel, companionLabel]);
  const densityInstants = useMemo(() => data.lane?.flatMap(lane => lane.segments.map(segment => segment.start)), [data.lane]);
  const lanes = data.lane ?? [];
  const unit = kind === 'bar' || kind === 'donut' || kind === 'pareto' || kind === 'topNBar' ? m('catalogChartJobs2') : m('catalogChartMin');
  const common = { chartId: `chart-catalog-${kind}`, title, description, metricVersion: 'synthetic v1', unit, size: 'hero' as const, height,
    trust: { source: m('catalogChartSyntheticData2'), updated, coverage: m('catalogChartSampleData') } };
  const defaultStackMode = kind === 'breakdown' ? 'stack' : 'none';
  const stackControl = <SegmentedRadio label={m('catalogChartStack')} value={stackMode ?? defaultStackMode}
    onChange={setStackMode} options={[{ value: 'none', label: m('catalogChartNoStack') }, { value: 'stack', label: m('catalogChartStack') }]} />;
  if (kind === 'breakdown') return <BreakdownBars height={height} trust={common.trust} stackMode={stackMode} stackControl={stackControl} />;
  if (kind === 'lane') return <LaneTimeline key={identity} lanes={lanes} ariaLabel={title} description={description} trust={common.trust} height={height} densityInstants={densityInstants} outlineWidthsByRank={{ 높음: 3, 보통: 2, 낮음: 1.5 }} formatTooltip={() => m('catalogChartWorkInterval')} rangeBrush={{}} />;
  if (!spec) return <AnalysisChartFrame {...common}
    series={series.current} compareSeries={series.previous} reaggregation="sum" stackMode={stackMode ?? defaultStackMode} areaFill={areaFill}
    toolbarStart={<div className="flex flex-wrap items-center gap-2">{stackControl}{kind === 'line' && <label className="inline-flex items-center gap-2 t-caption">
      <Checkbox checked={areaFill} onCheckedChange={checked => setAreaFill(checked === true)} />{m('catalogChartAreaFill')}
    </label>}</div>} />;
  return <>
    <AnalysisChart {...common} spec={spec} />
    {detail?.identity === identity && <p ref={result} role="status" aria-label={m('catalogChartDetailsResult')} className="t-caption px-4 py-2 text-text-secondary">
      {m('catalogChartDetailsTarget')}: {detail.target}
    </p>}
  </>;
}
