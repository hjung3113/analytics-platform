import type { ReactNode } from 'react';
import { formatSummaryTime, useMessages } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../messages';
import { ObjectLinks } from '@ap/components';
import { compareBreakdownCells } from './breakdownSort';
import { formatMetricVersion, formatNumber, periodHours } from '@ap/contracts';
/**
 * 생산성 분석 — 개요 (wireframe 11, Overview archetype §12.1).
 * Header → Global Context (kernel) → page-owned granularity → KPI row → main trend →
 * occupancy breakdown → attention list → Data Trust (header slot).
 *
 * Every widget runs its own useMenuQuery so a partial failure stays local (§19).
 * Synthetic values come from the declared endpoints (../endpoints), computed by the
 * mock server half. Definitions are Candidates per wireframe 11 §6.
 */
import { AlertTriangle, ArrowRight, BarChart3, ChevronRight, Hourglass, Percent, RotateCw, Timer } from 'lucide-react';
import { type PageProps, PlatformLink, useDrill, useI18n, usePlatform, useMenuQuery } from '@ap/kernel';
import { AnalysisChartFrame, type ChartSeries, DataTrustIndicator, type Delta, DrillLayout, PageKeyWarning, Panel, PlatformPage, QueryView, SegmentedRadio, StatCard, StateMessage, usePageKeyRules } from '@ap/components';
import { Button, InfoTip, StatusBadge, Table, TableCaption, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import {
  CYCLE_VERSION_NOTE, CYCLE_VERSION_TEXT, METRIC_VERSIONS, attentionEndpoint, breakdownEndpoint, drillEndpoint, kpisEndpoint, trendEndpoint,
  type AttentionRow, type Granularity, type KpiKey, type KpiSet, type TrendBucket, type TrendData,
} from '../endpoints';
import { pctHint, ProductivityDrillBody } from './productivity-drill';

const GRANS: readonly Granularity[] = ['hour', 'day', 'week'];
const KPI_KEYS = ['occupancy', 'dwell', 'cycleTime', 'throughput'] as const;
const AXES = ['room', 'stgroup'] as const;
const SORT_KEYS = ['key', 'occ', 'obs', 'pct', 'jobs'] as const;
/** Page-input changes on the same period and Scope keep the old result as refreshing (#1365, ADR-0114). */
const KEEP_PREVIOUS = { keepPrevious: true } as const;

function resolveChoice<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): { ok: true; value: T } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, value: fallback };
  return (allowed as readonly string[]).includes(raw) ? { ok: true, value: raw as T } : { ok: false };
}

function resolveBreakdownSort(raw: string | null): { ok: true; key: typeof SORT_KEYS[number]; dir: 1 | -1 } | { ok: false } {
  if (raw === null || raw === '') return { ok: true, key: 'key', dir: 1 };
  const match = /^(key|occ|obs|pct|jobs):(asc|desc)$/.exec(raw);
  if (!match) return { ok: false };
  return { ok: true, key: match[1] as typeof SORT_KEYS[number], dir: match[2] === 'asc' ? 1 : -1 };
}

export default function ProductivityOverview(_: PageProps) {
  const m = useMessages(ANALYTICS_MESSAGES);
  // A widget that cannot draw its own card (loading, error, empty) sits in the same named Panel frame as the attention
  // list, so no state leaves a bare line or a lone card on the page; a drawn chart keeps its own card (#2604).
  const unframed = (q: { response: { outcome: string } | null }) => q.response?.outcome === 'ok';
  const framed = (title: string | undefined, q: { response: { outcome: string } | null }, node: ReactNode) =>
    unframed(q) ? node : <Panel title={title}>{node}</Panel>;
  const { global, pageParam, setPage, setGlobal, linkTo } = usePlatform();
  const { lang } = useI18n();

  const hours = periodHours(global);
  const rawKpi = pageParam('kpi');
  const rawAxis = pageParam('axis');
  const rawSort = pageParam('sort');
  const kpiResult = resolveChoice(rawKpi, KPI_KEYS, 'throughput');
  const axisResult = resolveChoice(rawAxis, AXES, 'room');
  const sortResult = resolveBreakdownSort(rawSort);
  // Rejected, never corrected (06 §6): one sentence per bad key (user name + raw value as entered) and a Reset that clears exactly those keys.
  const keys = usePageKeyRules([
    { key: 'kpi', label: ANALYTICS_MESSAGES.productivityOverviewMetric, valid: raw => resolveChoice(raw, KPI_KEYS, 'throughput').ok },
    { key: 'axis', label: ANALYTICS_MESSAGES.productivityOverviewAxis, valid: raw => resolveChoice(raw, AXES, 'room').ok },
    { key: 'sort', label: ANALYTICS_MESSAGES.productivityOverviewSort, valid: raw => resolveBreakdownSort(raw).ok },
  ]);

  const drill = useDrill();
  const room = drill.levels.find(level => level.key === 'drillRoom')?.value ?? null;
  const stgroup = drill.levels.find(level => level.key === 'drillStgroup')?.value ?? null;
  const equipment = drill.levels.find(level => level.key === 'drillEquipment')?.value ?? null;
  const pageInvalid = keys.invalid;
  // A drill URL with a gap is closed by the Kernel query gate (06 §6.4), so only the page keys gate here.
  const canQuery = !pageInvalid;
  const summary = canQuery && drill.depth === 0;
  const selectedKpi = kpiResult.ok ? kpiResult.value : 'throughput';
  const axis = axisResult.ok ? axisResult.value : 'room';
  const sort = sortResult.ok ? { key: sortResult.key, dir: sortResult.dir } : { key: 'key' as const, dir: 1 as const };
  const sortedDirection = sort.dir === 1 ? 'ascending' : 'descending';
  // Page-owned URL key `granularity` (wireframe 11 §3.1). Unset → hour for ≤48h, else day (Candidate).
  const rawGran = pageParam('granularity');
  const granKnown = GRANS.includes(rawGran as Granularity);
  const gran: Granularity = granKnown ? (rawGran as Granularity) : ((hours ?? 24) <= 48 ? 'hour' : 'day');
  const granLabel = gran === 'hour' ? (m('productivityOverviewHourly')) : gran === 'day' ? (m('productivityOverviewDaily')) : (m('productivityOverviewWeekly'));

  const kpiQ = useMenuQuery(kpisEndpoint, {}, summary);
  // keepPrevious ON (#1365, ADR-0114): a KPI card or grain change reads the same period/Scope again, so the old chart stays (refreshing) until the new series arrives.
  const trendQ = useMenuQuery(trendEndpoint, { kpi: selectedKpi, granularity: gran }, summary, KEEP_PREVIOUS);
  // keepPrevious ON: the group-axis tab only regroups the same period; the tab itself already shows the new axis while the old rows refresh.
  const breakdownQ = useMenuQuery(breakdownEndpoint, { axis }, canQuery && (drill.depth === 0 || axis === 'room'), KEEP_PREVIOUS);
  const attentionQ = useMenuQuery(attentionEndpoint, {}, summary);
  const roomsQ = useMenuQuery(breakdownEndpoint, { axis: 'room' }, canQuery && drill.depth > 0 && axis !== 'room');
  const stgroupQ = useMenuQuery(drillEndpoint, { level: 'stgroup', room: room ?? '', stgroup: '' }, canQuery && room !== null);
  const equipmentQ = useMenuQuery(drillEndpoint, { level: 'equipment', room: room ?? '', stgroup: stgroup ?? '' }, canQuery && room !== null && stgroup !== null);

  // While a kept result is shown (#1365), everything that describes or acts on the DATA follows the params it was loaded with, not the current selection.
  const trendShown = trendQ.resultParams ?? { kpi: selectedKpi, granularity: gran };
  const shownKpi = trendShown.kpi;
  const shownGranLabel = trendShown.granularity === 'hour' ? (m('productivityOverviewHourly2')) : trendShown.granularity === 'day' ? (m('productivityOverviewDaily2')) : (m('productivityOverviewWeekly2'));
  const shownAxis = breakdownQ.resultParams?.axis ?? axis;

  const n1 = (v: number) => formatNumber(v, lang, { decimals: 1 });
  const n2 = (v: number) => formatNumber(v, lang, { decimals: 2 });
  const ni = (v: number) => formatNumber(Math.round(v), lang);

  function deltaOf(cur: number | null, prev: number | null | undefined, goodWhenUp: boolean, format: (v: number) => string): Delta | undefined {
    if (cur === null || prev === null || prev === undefined || prev === 0) return undefined;
    const diff = cur - prev;
    const pct = `${diff > 0 ? '+' : ''}${((diff / prev) * 100).toFixed(1)}%`;
    return { value: `${diff > 0 ? '+' : ''}${format(diff)} (${pct})`, direction: diff >= 0 ? 'up' : 'down', good: goodWhenUp ? diff >= 0 : diff <= 0 };
  }

  /** Explicit-empty-selection escape hatch: outcome `empty` is valid, but the user can restore the unconstrained query in one action. */
  const clearEmptySelection = global.selection !== null && global.selection.length === 0
    ? <Button size="sm" variant="secondary" onClick={() => setGlobal({ selection: null })}>{m('productivityOverviewClearEmptySelection')}</Button>
    : undefined;

  // --- KPI cards (the selected trend is a registered page URL key) ---
  function selectKpi(kpi: KpiKey) {
    setPage({ kpi: kpi === 'throughput' ? null : kpi });
  }

  function kpiCard(kpi: KpiKey, data: { current: KpiSet; previous: KpiSet | null }) {
    const c = data.current; const p = data.previous;
    const active = selectedKpi === kpi;
    const ver = (v: string) => `${m('productivityOverviewVersion')} ${formatMetricVersion(v)}`;
    if (kpi === 'occupancy') {
      const o = c.occupancy; const po = p?.occupancy ?? null;
      return <StatCard key={kpi} icon={Percent} chip="blue" label={m('productivityOverviewPhysicalOccupancy')}
        onClick={() => selectKpi(kpi)} active={active}
        value={o ? n1(o.pct) : '—'} unit="%"
        delta={o && po ? deltaOf(o.pct, po.pct, true, v => `${v.toFixed(1)}pp`) : undefined}
        caption={o ? `${n1(o.num)}h / ${n1(o.den)}h · ${ver(METRIC_VERSIONS.occupancy)}` : (m('productivityOverviewDenominator0NotConfirmedNot0'))}
        footnote={o && <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken" role="img"
          aria-label={m('productivityOverviewOccupiedHOfHObservable', { value: String(n1(o.num)), value2: String(n1(o.den)), value3: String(n1(o.pct)) })}>
          {/* eslint-disable-next-line shadcn/no-inline-styles -- bar width is the occupancy percentage computed at runtime */}
          <span className="block h-full rounded-pill bg-chart-blue" style={{ width: `${Math.min(100, Math.max(0, o.pct))}%` }} />
        </span>} />;
    }
    if (kpi === 'dwell') {
      const d = c.dwell; const pd = p?.dwell ?? null;
      return <StatCard key={kpi} icon={Hourglass} chip="teal" label={m('productivityOverviewNonProcessDwell')}
        onClick={() => selectKpi(kpi)} active={active}
        value={d ? n2(d.perJobH) : '—'} unit={m('productivityOverviewHJob')}
        delta={d && pd ? deltaOf(d.perJobH, pd.perJobH, false, v => `${v.toFixed(3)}h`) : undefined}
        caption={d ? `${n1(d.hours)}h ÷ ${ni(d.jobs)} Job · ${ver(METRIC_VERSIONS.dwell)}` : (m('productivityOverviewNoCompletedJobNotConfirmed'))} />;
    }
    if (kpi === 'cycleTime') {
      const cy = c.cycle; const pc = p?.cycle ?? null;
      // The delta compares P50 only while the card shows P50 / P95, so the finished text says so (#398).
      const delta = deltaOf(cy.p50, pc?.p50 ?? null, false, v => `${v.toFixed(1)}${m('productivityOverviewMin')}`);
      return <StatCard key={kpi} icon={Timer} chip="teal" label={m('productivityOverviewCycleTimeP50P95')}
        onClick={() => selectKpi(kpi)} active={active}
        value={<span className="flex items-baseline gap-2">
          <span>{cy.p50 !== null ? n1(cy.p50) : '—'}</span>
          <span className="t-stat-2 text-text-secondary">{cy.p95 !== null ? n1(cy.p95) : '—'}</span>
        </span>} unit={m('productivityOverviewMinP50P95')}
        delta={delta ? { ...delta, value: `P50 ${delta.value}` } : undefined}
        caption={`${m('productivityOverviewPooledJobsN', { value: String(ni(cy.jobs)) })} · ${ver(METRIC_VERSIONS.cycleTime)} (${CYCLE_VERSION_TEXT[METRIC_VERSIONS.cycleTime as keyof typeof CYCLE_VERSION_TEXT][lang]})`} />;
    }
    const t = c.throughput; const pt = p?.throughput ?? null;
    return <StatCard key={kpi} icon={BarChart3} chip="blue" label={m('productivityOverviewJobThroughput')}
      onClick={() => selectKpi(kpi)} active={active}
      value={ni(t.jobs)} unit={m('productivityOverviewJobsCompleted')}
      delta={deltaOf(t.jobs, pt?.jobs ?? null, true, v => ni(v))}
      caption={`${m('productivityOverviewCompleted')} ${ni(t.jobs)} / ${m('productivityOverviewStarted')} ${ni(t.started)} · ${ver(METRIC_VERSIONS.throughput)}`} />;
  }

  // --- Main trend: AnalysisChartFrame for the selected KPI; Compare overlays the previous equal period (bucket-index aligned). ---
  const trendMeta: Record<KpiKey, { title: string; names: string[]; colors: ThemeColorToken[]; dashed?: boolean[]; kind: 'line' | 'bar'; unit: string; decimals: 0 | 1 | 2; description: string }> = {
    occupancy: {
      title: m('productivityOverviewPhysicalOccupancyTrend'), names: [m('productivityOverviewPhysicalOccupancy2')], colors: ['chart-blue'], kind: 'line', unit: '%', decimals: 1,
      description: m('productivityOverviewSumOccupiedSumObservableNumeratorAndDenominator'),
    },
    dwell: {
      title: m('productivityOverviewNonProcessDwellTrend'), names: [m('productivityOverviewNonProcessDwell2')], colors: ['chart-teal'], kind: 'line', unit: m('productivityOverviewHJob2'), decimals: 2,
      description: m('productivityOverviewSumDwellHoursCompletedJobs'),
    },
    cycleTime: {
      title: m('productivityOverviewCycleTimeTrendP50P95'), names: ['P50', 'P95'], colors: ['chart-blue', 'chart-teal'], dashed: [false, true], kind: 'line', unit: m('productivityOverviewMin2'), decimals: 1,
      description: m('productivityOverviewQuantilesOverAllCompletedJobsAsOne'),
    },
    throughput: {
      title: m('productivityOverviewJobThroughputTrend'), names: [m('productivityOverviewCompletedJobs')], colors: ['chart-blue'], kind: 'bar', unit: 'Job', decimals: 0,
      description: m('productivityOverviewCompletedJobs2'),
    },
  };
  const meta = trendMeta[shownKpi];
  const trendValue = (b: TrendBucket, i: number): number | null =>
    shownKpi === 'occupancy' ? b.occupancyPct : shownKpi === 'dwell' ? b.dwellPerJobH : shownKpi === 'throughput' ? b.jobs : i === 0 ? b.p50 : b.p95;
  const fmtTrend = (v: number) => formatNumber(v, lang, { decimals: meta.decimals });

  function trendSeriesFor(data: TrendData): { series: ChartSeries[]; compareSeries: ChartSeries[]; total: number | null; knownBucketCount: number; bucketCount: number } {
    const build = (source: TrendBucket[], previous: boolean): ChartSeries[] => meta.names.map((name, i) => ({
      id: `${shownKpi}-${previous ? 'prev' : 'cur'}-${i}`,
      name: previous ? `${name} (${m('productivityOverviewPreviousPeriod')})` : name,
      color: previous ? 'cat-amber' : meta.colors[i],
      kind: meta.kind,
      unit: meta.unit,
      // Previous-period series mirror their current counterpart; the Chart Frame derives the previous pattern (06 §16, ADR-0014).
      dashed: meta.dashed?.[i] ?? false,
      // Each period keeps its own bucket starts for the plot, table and CSV.
      points: source.map(bucket => [bucket.start, trendValue(bucket, i)] as [string, number | null]),
    }));
    const knownBuckets = shownKpi === 'throughput' ? data.current.filter(bucket => bucket.known) : [];
    return {
      series: build(data.current, false),
      compareSeries: build(data.previous, true),
      total: shownKpi === 'throughput' ? knownBuckets.reduce((sum, bucket) => sum + (bucket.jobs ?? 0), 0) : null,
      knownBucketCount: knownBuckets.length,
      bucketCount: shownKpi === 'throughput' ? data.current.length : 0,
    };
  }

  function trustInstant(value: string | null | undefined): string {
    return formatSummaryTime(value, lang);
  }

  const stgroupData = stgroupQ.response?.outcome === 'ok' ? stgroupQ.response.data : null;
  const equipmentData = equipmentQ.response?.outcome === 'ok' ? equipmentQ.response.data : null;
  const notFound = stgroupData && !stgroupData.roomFound && room
    ? { key: 'drillRoom', value: room }
    : equipmentData && !equipmentData.roomFound && room
      ? { key: 'drillRoom', value: room }
      : drill.depth >= 2 && equipmentData && !equipmentData.stgroupFound && stgroup
        ? { key: 'drillStgroup', value: stgroup }
        : equipmentData?.roomFound && equipmentData.stgroupFound && equipment
          && !equipmentData.equipment.some(row => row.equipmentId === equipment)
          ? { key: 'drillEquipment', value: equipment }
          : undefined;
  const roomSource = axis === 'room' ? breakdownQ : roomsQ;
  const roomRows = roomSource.response?.outcome === 'ok' && (roomSource !== breakdownQ || shownAxis === 'room') ? roomSource.response.data ?? [] : [];
  const drillSiblings = drill.depth === 0 ? undefined : {
    ...(roomRows.length > 0 ? { drillRoom: roomRows.map(row => ({
      value: row.key,
      hint: pctHint((lang === 'ko'), row.observableHours > 0 ? (row.occupiedHours / row.observableHours) * 100 : null, n1),
    })) } : {}),
    ...(stgroupData && stgroupData.stgroups.length > 0 ? { drillStgroup: stgroupData.stgroups.map(row => ({
      value: row.stgroup,
      hint: pctHint((lang === 'ko'), row.occupancyPct, n1),
    })) } : {}),
  };
  const trustResponse = drill.depth === 0
    ? kpiQ.response
    : drill.depth >= 2 && equipmentQ.response?.outcome === 'ok' ? equipmentQ.response : stgroupQ.response;

  return <PlatformPage
    description={m('productivityOverviewPhysicalOccupancyNonProcessDwellCycleTime')}
    primaryAction={<Button size="sm" asChild>
      <PlatformLink href={linkTo('cycle-time')}>{m('productivityOverviewCycleTimeDetail')}<ArrowRight className="size-3.5" aria-hidden /></PlatformLink>
    </Button>}
    secondaryActions={<Button size="sm" variant="secondary" onClick={() => { kpiQ.refetch(); trendQ.refetch(); breakdownQ.refetch(); attentionQ.refetch(); roomsQ.refetch(); stgroupQ.refetch(); equipmentQ.refetch(); }}>
      <RotateCw className="size-3.5" aria-hidden />{m('productivityOverviewRefresh')}
    </Button>}
    dataTrustSummary={trustResponse?.trust
      ? <DataTrustIndicator trust={trustResponse.trust} assessments={trustResponse.assessments} />
      : null}
    contextExtension={<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="inline-flex items-center gap-1">
        <span id="granularity-label" className="text-xs font-medium text-text-secondary">{m('productivityOverviewGranularity')}</span>
        <InfoTip label={m('guidanceLabel')}>{m('productivityOverviewThisPageSGrainItIsChosen')}</InfoTip>
      </div>
      <SegmentedRadio
        labelledBy="granularity-label"
        label={m('productivityOverviewGranularity2')}
        value={gran}
        onChange={g => setPage({ granularity: g })}
        options={GRANS.map(g => ({ value: g, label: g === 'hour' ? (m('productivityOverviewHour')) : g === 'day' ? (m('productivityOverviewDay')) : (m('productivityOverviewWeek')) }))}
      />
      {/* #304 FIX1 (06 §19): the unknown raw value stays visible, and the default-grain fact is stated truthfully. */}
      {rawGran !== null && !granKnown && <StatusBadge tone="warning">{m('productivityOverviewGrainIsNotAValueThisPage', { rawGran: String(rawGran), granLabel: String(granLabel) })}</StatusBadge>}
    </div>}
  >
    {pageInvalid ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} />
      : <DrillLayout siblings={drillSiblings} notFound={notFound}>{drill.depth === 0 ? <div className="@container space-y-4">
      {/* Primary KPI / Summary */}
      <section aria-labelledby="kpi-heading">
        <div className="mb-2 flex items-center gap-1">
          <h2 id="kpi-heading" className="t-section-title">{m('productivityOverviewMetricSummary')}</h2>
          <InfoTip label={m('guidanceLabel')}>
            {m('productivityOverviewSelectACardToShowItsTrend')}
            {' '}{CYCLE_VERSION_NOTE[lang]}
          </InfoTip>
        </div>
        {/* The section heading already names the KPI row, so its frame carries no title. */}
        {framed(undefined, kpiQ, <QueryView widgetName={m('productivityOverviewMetricSummary2')} hideWidgetName query={kpiQ} skeletonRows={4} emptyAction={clearEmptySelection}>
          {data => <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @4xl:grid-cols-4">
            {(['occupancy', 'dwell', 'cycleTime', 'throughput'] as const).map(k => kpiCard(k, data))}
          </div>}
        </QueryView>)}
      </section>

      {/* Main Trend */}
      <section aria-label={m('productivityOverviewMainTrend')}>
        {shownKpi === 'throughput' && trendQ.response?.outcome === 'empty' && trendQ.response.data !== null
          && trendQ.response.data.equipmentCount > 0 && trendQ.response.data.current.length > 0
          && trendQ.response.data.current.every(bucket => !bucket.known)
          && <p role="status" className="t-caption text-text-secondary">{m('productivityOverviewUnconfirmedTrendTotal')}</p>}
        {framed(meta.title, trendQ, <QueryView widgetName={meta.title} hideWidgetName={!unframed(trendQ)} query={trendQ} skeletonRows={5} emptyAction={clearEmptySelection}>
          {data => {
            const { series, compareSeries, total, knownBucketCount, bucketCount } = trendSeriesFor(data);
            const t = trendQ.response?.trust;
            let sourceCoverage = '';
            if (t) sourceCoverage = t.coverage === null ? m('productivityTableUnknown') : `${(t.coverage * 100).toFixed(1)}%`;
            const trendTrust = shownKpi === 'throughput' && t ? {
              source: t.source,
              updated: trustInstant(t.updatedAt),
              coverage: `${sourceCoverage} · ${m('productivityOverviewObservedBucketCoverage', { observed: String(knownBucketCount), total: String(bucketCount) })}`,
            } : t;
            let totalDescription = '';
            if (total !== null && knownBucketCount > 0 && knownBucketCount < bucketCount) {
              totalDescription = ` · ${m('productivityOverviewObservedBucketTotal', { observed: String(knownBucketCount), total: String(bucketCount), value: ni(total) })}`;
            } else if (total !== null && knownBucketCount === bucketCount) {
              totalDescription = ` · ${m('productivityOverviewTotal')} ${ni(total)} Job (${m('productivityOverviewSameSumAsTheKpiCard')})`;
            }
            return <AnalysisChartFrame
              chartId={`productivity-trend-${shownKpi}`}
              title={meta.title}
              description={`${meta.description} · ${shownGranLabel}${totalDescription}`}
              metricVersion={METRIC_VERSIONS[shownKpi]}
              series={series}
              compareSeries={compareSeries}
              imageCopy imagePrint unit={meta.unit}
              valueFormat={fmtTrend}
              height={280}
              trust={trendTrust}
            />;
          }}
        </QueryView>)}
      </section>

      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        {/* Breakdown: occupancy composition per room_name / StGroup */}
        <section aria-label={m('productivityOverviewOccupancyComposition')}>
          {framed(m('productivityOverviewOccupancyComposition2'), breakdownQ, <QueryView widgetName={m('productivityOverviewOccupancyComposition2')} hideWidgetName={!unframed(breakdownQ)} query={breakdownQ} skeletonRows={4} emptyAction={clearEmptySelection}>
            {rows => {
              const t = breakdownQ.response?.trust;
              const pct = (r: typeof rows[number]) => (r.observableHours > 0 ? (r.occupiedHours / r.observableHours) * 100 : null);
              const valueOf = (r: typeof rows[number]): number | string =>
                sort.key === 'key' ? r.key : sort.key === 'occ' ? r.occupiedHours : sort.key === 'obs' ? r.observableHours : sort.key === 'pct' ? (pct(r) ?? -1) : r.jobs;
              const sorted = [...rows].sort((a, b) => {
                const va = valueOf(a); const vb = valueOf(b);
                return compareBreakdownCells(va, vb) * sort.dir;
              });
              const columns: { key: typeof sort.key; label: string; align: 'left' | 'right' }[] = [
                { key: 'key', label: shownAxis === 'room' ? m('productivityTableProcess') : m('productivityTableStgroup'), align: 'left' },
                { key: 'occ', label: m('productivityTableOccupied'), align: 'right' },
                { key: 'obs', label: m('productivityTableObservable'), align: 'right' },
                { key: 'pct', label: m('productivityTableOccupancy'), align: 'right' },
                { key: 'jobs', label: m('productivityTableJobs'), align: 'right' },
              ];
              return <>
                <AnalysisChartFrame
                  chartId="productivity-occupancy-breakdown"
                  title={shownAxis === 'room' ? (m('productivityOverviewOccupancyCompositionByProcess')) : (m('productivityOverviewOccupancyCompositionByStgroup'))}
                  description={m('productivityOverviewOccupiedVsObservableHoursGrayUnoccupiedHours')}
                  metricVersion={METRIC_VERSIONS.occupancy}
                  xType="category" stacked unit="h" height={240} canApplyRange={false}
                  valueFormat={v => n1(v)}
                  toolbarStart={<SegmentedRadio
                    label={m('productivityOverviewGroupBy')}
                    value={axis}
                    onChange={a => setPage({ axis: a === 'room' ? null : a })}
                    options={[{ value: 'room', label: m('productivityOverviewProcess') }, { value: 'stgroup', label: 'StGroup' }]}
                  />}
                  series={[
                    { id: 'occupied', name: m('productivityOverviewOccupiedHours'), color: 'chart-blue', kind: 'bar', unit: 'h', points: rows.map(r => [r.key, r.occupiedHours] as [string, number | null]) },
                    { id: 'remainder', name: m('productivityOverviewNotOccupiedObservable'), color: 'chart-remainder', kind: 'bar', unit: 'h', points: rows.map(r => [r.key, r.observableHours - r.occupiedHours] as [string, number | null]) },
                  ]}
                  trust={t}
                />
                <div className="mt-2 overflow-auto rounded-lg border border-border-subtle bg-surface-card elevation-panel">
                  <Table density="compact">
                    <TableCaption srOnly>{m('productivityTableCaption')}</TableCaption>
                    <TableHeader><TableRow>
                      {columns.map(col => <TableHead key={col.key} scope="col" align={col.align === 'right' ? 'end' : 'start'} sort={{
                        direction: sort.key === col.key ? sortedDirection : 'none',
                        onSort: () => {
                          let dir: 1 | -1 = col.key === 'key' ? 1 : -1;
                          if (sort.key === col.key) dir = sort.dir === 1 ? -1 : 1;
                          const next = { key: col.key, dir };
                          const value = `${next.key}:${next.dir === 1 ? 'asc' : 'desc'}`;
                          setPage({ sort: value === 'key:asc' ? null : value });
                        },
                      }}>{col.label}</TableHead>)}
                      {shownAxis === 'room' && <TableHead scope="col"><span className="sr-only">{m('productivityTableEnter')}</span></TableHead>}
                    </TableRow></TableHeader>
                    <TableBody>
                      {sorted.map(r => <TableRow key={r.key}>
                        <TableCell><span className="t-mono">{r.key}</span></TableCell>
                        <TableCell align="end">{n1(r.occupiedHours)} h</TableCell>
                        <TableCell align="end">{n1(r.observableHours)} h</TableCell>
                        <TableCell align="end">{pct(r) === null ? m('productivityTableUnknown') : `${n1(pct(r)!)}%`}</TableCell>
                        <TableCell align="end">{ni(r.jobs)}</TableCell>
                        {shownAxis === 'room' && <TableCell align="end">
                          <button type="button" aria-label={m('productivityTableEnterRow', { key: r.key })} onClick={() => drill.enter('drillRoom', r.key)}
                            className="inline-flex size-6 items-center justify-center rounded-sm text-text-secondary hover:bg-surface-sunken hover:text-text-primary">
                            <ChevronRight className="size-3.5" aria-hidden />
                          </button>
                        </TableCell>}
                      </TableRow>)}
                    </TableBody>
                  </Table>
                </div>
              </>;
            }}
          </QueryView>)}
        </section>

        {/* Attention List: ranking only, no threshold verdicts (wireframe 11 §1) */}
        <section aria-label={m('productivityOverviewAttentionList')}>
          <Panel title={m('productivityOverviewAttention')}
            subtitle={m('productivityOverviewTopEquipmentByNonProcessDwellAnd')}>
            <QueryView widgetName={m('productivityOverviewAttention2')} hideWidgetName query={attentionQ} skeletonRows={4} emptyAction={clearEmptySelection}>
              {(rows: AttentionRow[]) => <>
                <ul className="divide-y divide-border-subtle">
                  {rows.map(r => <li key={`${r.kind}-${r.equipmentId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                    <StatusBadge tone="neutral">{r.kind === 'dwell' ? (m('productivityOverviewTopDwell')) : (m('productivityOverviewSlowestP95'))}</StatusBadge>
                    <span className="t-mono">{r.equipmentId}</span>
                    <span className="min-w-0 flex-1 truncate text-xs text-text-secondary" title={`${r.room} · ${r.stgroup}`}>{r.room} · {r.stgroup}</span>
                    <span className="tabular text-sm font-medium">
                      {r.kind === 'dwell' ? `${n2(r.dwellPerJobH ?? 0)} ${m('productivityOverviewHJob3')}` : `P95 ${n1(r.p95Min ?? 0)} ${m('productivityOverviewMin3')}`}
                      <span className="ml-1 text-tiny font-normal text-text-muted">n={ni(r.jobs)}</span>
                    </span>
                    <PlatformLink href={linkTo('cycle-time', { global: { selection: [r.equipmentId] } })}
                      title={m('productivityOverviewChangesTheEquipmentSelectionToThisEquipment')}
                      className="text-xs font-medium text-accent-primary hover:underline">{m('productivityOverviewCycleTime')}</PlatformLink>
                    <ObjectLinks kind="equipment" id={r.equipmentId} returnTo />
                  </li>)}
                </ul>
                <p className="t-caption mt-2 text-text-muted">
                  {m('productivityOverviewTheCycleTimeLinkChangesTheEquipment')}
                </p>
              </>}
            </QueryView>
          </Panel>
        </section>
      </div>
    </div> : <ProductivityDrillBody
      ko={(lang === 'ko')} room={room ?? ''} stgroup={stgroup} equipment={equipment}
      stgroupQuery={stgroupQ} equipmentQuery={equipmentQ}
      onEnterStgroup={value => drill.enter('drillStgroup', value)}
      onEnterEquipment={value => drill.enter('drillEquipment', value)}
      onCloseEquipment={() => drill.goTo(2)}
      equipmentHref={equipment ? linkTo('equipment-detail', { params: { equipmentId: equipment }, returnTo: true }) : ''}
      n1={n1} ni={ni}
    />}
    </DrillLayout>}
  </PlatformPage>;
}
