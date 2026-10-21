import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n, usePlatform } from '@ap/kernel';
import { AnalysisChart, AnalysisChartFrame, LaneTimeline, type ChartSeries, type ChartSpec } from '@ap/components';
import type { CatalogData, CatalogKind } from '../../endpoints';
import { kindLabels } from './support';

// Match the analytics pages' wall-clock display convention without parsing in the viewer timezone.
// Keep seconds so distinct heatmap coordinates cannot collapse after formatting.
const displayTime = (value: string | null) => (value ?? '').replace('T', ' ');

export function CatalogChart({ kind, data, height }: { kind: CatalogKind; data: CatalogData; height: number }) {
  const { tx } = useI18n();
  const { global } = usePlatform();
  const identity = JSON.stringify(global);
  const [detail, setDetail] = useState<{ identity: string; target: string } | null>(null);
  const [previousIdentity, setPreviousIdentity] = useState(identity);
  const result = useRef<HTMLParagraphElement>(null);
  if (previousIdentity !== identity) { setPreviousIdentity(identity); setDetail(null); }
  useEffect(() => {
    if (detail?.identity === identity) result.current?.scrollIntoView({ block: 'nearest' });
  }, [detail, identity]);
  const title = `${tx(kindLabels[kind])} ${tx({ ko: '차트', en: 'chart' })}`;
  const description = tx({ ko: '합성 데이터', en: 'Synthetic data' }) + ` · ${displayTime(global.from)} – ${displayTime(global.to)}`;
  const previousLabel = tx({ ko: '이전 동일 기간', en: 'Previous equal period' }) + ` · ${displayTime(data.previousFrom)} – ${displayTime(data.previousTo)}`;
  const currentLabel = tx({ ko: '현재 기간', en: 'Current period' });
  const spec = useMemo<ChartSpec | null>(() => {
    const show = (target: string) => setDetail({ identity, target });
    switch (kind) {
      case 'line': case 'bar': case 'lane': return null;
      case 'topNBar': return { kind, items: data.topNBar ?? [], defaultExpanded: true, onItemClick: show, legend: [{ label: tx({ ko: '그룹 A', en: 'Group A' }), colorToken: 'chart-series-1' }, { label: tx({ ko: '그룹 B', en: 'Group B' }), colorToken: 'chart-series-2' }] };
      case 'heatmap': return { kind, ...data.heatmap,
        xLabels: data.heatmap.xLabels.map(displayTime),
        cells: data.heatmap.cells.map(cell => ({ ...cell, x: displayTime(cell.x) })),
        onCellClick: (x, y) => show(`${y} · ${x}`) };
      case 'donut': return { kind, slices: data.donut, onSliceClick: show };
      case 'scatter': return { kind, points: data.scatter, xUnit: tx({ ko: '건', en: 'jobs' }), xLabel: tx({ ko: '완료 Job', en: 'Completed jobs' }), yLabel: tx({ ko: '사이클타임', en: 'Cycle time' }), onPointClick: show };
      case 'boxPlot': return { kind, groups: data.boxPlot, whisker: 'minMax', onGroupClick: show };
      case 'pareto': return { kind, items: data.pareto, maxItems: 4, onItemClick: show };
    }
  }, [kind, data, identity, tx]);
  const series = useMemo(() => {
    const make = (previous: boolean): ChartSeries[] => [{
      id: previous ? 'previous' : 'current', name: previous ? previousLabel : currentLabel,
      color: previous ? 'chart-series-2' : 'chart-series-1', kind: kind === 'bar' ? 'bar' : 'line',
      points: (previous ? data.previous : data.current).map(bucket => [bucket.at, bucket.value]),
    }];
    return { current: make(false), previous: make(true) };
  }, [data, kind, currentLabel, previousLabel]);
  const densityInstants = useMemo(() => data.lane?.flatMap(lane => lane.segments.map(segment => segment.start)), [data.lane]);
  const unit = kind === 'bar' || kind === 'donut' || kind === 'pareto' || kind === 'topNBar' ? tx({ ko: '건', en: 'jobs' }) : tx({ ko: '분', en: 'min' });
  const common = { chartId: `chart-catalog-${kind}`, title, description, metricVersion: 'synthetic v1', unit, size: 'hero' as const, height,
    trust: { source: tx({ ko: '합성 데이터', en: 'Synthetic data' }), updated: displayTime(global.to), coverage: tx({ ko: '견본 데이터', en: 'Sample data' }) } };
  return <>
    {kind === 'lane' ? <LaneTimeline key={identity} lanes={data.lane ?? []} ariaLabel={title} description={description} trust={common.trust} height={height} densityInstants={densityInstants} outlineWidthsByRank={{ high: 3, mid: 2, low: 1.5 }} /> : spec ? <AnalysisChart {...common} spec={spec} /> : <AnalysisChartFrame {...common} series={series.current} compareSeries={series.previous} />}
    {detail?.identity === identity && <p ref={result} role="status" aria-label={tx({ ko: '상세 결과', en: 'Details result' })} className="t-caption px-4 py-2 text-text-secondary">
      {tx({ ko: '상세 대상', en: 'Details target' })}: {detail.target}
    </p>}
  </>;
}
