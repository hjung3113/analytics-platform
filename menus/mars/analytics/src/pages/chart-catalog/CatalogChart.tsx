import { useMessages } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../../messages';
import { formatWallClock } from '@ap/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatSummaryTime, useI18n, usePlatform } from '@ap/kernel';
import { AnalysisChart, AnalysisChartFrame, LaneTimeline, type ChartSeries, type ChartSpec } from '@ap/components';
import type { CatalogData, CatalogKind } from '../../endpoints';
import { BreakdownBars } from './BreakdownBars';
import { kindLabels } from './support';


export function CatalogChart({ kind, data, height, updatedAt }: { kind: CatalogKind; data: CatalogData; height: number; updatedAt: string | null }) {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { tx, lang } = useI18n();
  const { global } = usePlatform();
  const identity = JSON.stringify(global);
  const [detail, setDetail] = useState<{ identity: string; target: string } | null>(null);
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
  const spec = useMemo<ChartSpec | null>(() => {
    const show = (target: string) => setDetail({ identity, target });
    switch (kind) {
      case 'line': case 'bar': case 'lane': case 'breakdown': case 'sequence': return null;
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
    return { current: make(false), previous: make(true) };
  }, [data, kind, currentLabel, previousLabel]);
  const densityInstants = useMemo(() => data.lane?.flatMap(lane => lane.segments.map(segment => segment.start)), [data.lane]);
  const lanes = data.lane ?? [];
  const unit = kind === 'bar' || kind === 'donut' || kind === 'pareto' || kind === 'topNBar' ? m('catalogChartJobs2') : m('catalogChartMin');
  const common = { chartId: `chart-catalog-${kind}`, title, description, metricVersion: 'synthetic v1', unit, size: 'hero' as const, height,
    trust: { source: m('catalogChartSyntheticData2'), updated, coverage: m('catalogChartSampleData') } };
  return <>
    {kind === 'breakdown' ? <BreakdownBars height={height} trust={common.trust} /> : kind === 'lane' ? <LaneTimeline key={identity} lanes={lanes} ariaLabel={title} description={description} trust={common.trust} height={height} densityInstants={densityInstants} outlineWidthsByRank={{ 높음: 3, 보통: 2, 낮음: 1.5 }} formatTooltip={() => m('catalogChartWorkInterval')} rangeBrush={{}} /> : spec ? <AnalysisChart {...common} spec={spec} /> : <AnalysisChartFrame {...common} series={series.current} compareSeries={series.previous} />}
    {detail?.identity === identity && <p ref={result} role="status" aria-label={m('catalogChartDetailsResult')} className="t-caption px-4 py-2 text-text-secondary">
      {m('catalogChartDetailsTarget')}: {detail.target}
    </p>}
  </>;
}
