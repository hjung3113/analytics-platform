import { formatSummaryTime, useMessages } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../messages';
import { ObjectLinks, RowAction } from '@ap/components';
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
import { AlertTriangle, ArrowRight, ArrowUpRight, ChevronRight, RotateCw } from 'lucide-react';
import { type PageProps, PlatformLink, useDrill, useI18n, usePlatform, useMenuQuery } from '@ap/kernel';
import { AnalysisChartFrame, type ChartSeries, DataTrustIndicator, DrillLayout, PageKeyWarning, PlatformPage, QueryView, SegmentedRadio, StatCard, StateMessage, usePageKeyRules } from '@ap/components';
import { Button, InfoTip, StatusBadge, Table, TableCaption, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@ap/ui';
import type { ThemeColorToken } from '@ap/ui/theme';
import {
  CYCLE_VERSION_NOTE, CYCLE_VERSION_TEXT, METRIC_VERSIONS, attentionEndpoint, breakdownEndpoint, drillEndpoint, kpisEndpoint, trendEndpoint,
  type AttentionRow, type Granularity, type KpiKey, type KpiSet, type TrendBucket, type TrendData,
} from '../endpoints';
import { pctHint, ProductivityDrillBody } from './productivity-drill';

const GRANS: readonly Granularity[] = ['hour', 'day', 'week'];
const KPI_KEYS = ['occupancy', 'dwell', 'cycleTime', 'throughput'] as const;
/** The field of a trend bucket that draws each KPI card's mini trend; every bucket carries all four (#2743). */
const KPI_TREND_FIELD = { occupancy: 'occupancyPct', dwell: 'dwellPerJobH', cycleTime: 'p50', throughput: 'jobs' } as const;
/** Occupancy moves within ±2pp between ordinary periods (the reference period moved 1.54pp), so the card calls that no change (#2743 variant A). */
const OCCUPANCY_NO_CHANGE_PP = 2;
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

  const kpiQ = useMenuQuery(kpisEndpoint, {}, { enabled: summary });
  // keepPrevious ON (#1365, ADR-0114): a KPI card or grain change reads the same period/Scope again, so the old chart stays (refreshing) until the new series arrives.
  const trendQ = useMenuQuery(trendEndpoint, { kpi: selectedKpi, granularity: gran }, { enabled: summary, ...KEEP_PREVIOUS });
  // The KPI cards' mini trends reuse the trend response the chart already loads: no extra read (#2743).
  const cardTrend = trendQ.response?.outcome === 'ok' ? trendQ.response.data?.current ?? null : null;
  // keepPrevious ON: the group-axis tab only regroups the same period; the tab itself already shows the new axis while the old rows refresh.
  const breakdownQ = useMenuQuery(breakdownEndpoint, { axis }, { enabled: canQuery && (drill.depth === 0 || axis === 'room'), ...KEEP_PREVIOUS });
  const attentionQ = useMenuQuery(attentionEndpoint, {}, { enabled: summary });
  const roomsQ = useMenuQuery(breakdownEndpoint, { axis: 'room' }, canQuery && drill.depth > 0 && axis !== 'room');
  const stgroupQ = useMenuQuery(drillEndpoint, { level: 'stgroup', room: room ?? '', stgroup: '' }, canQuery && room !== null);
  const equipmentQ = useMenuQuery(drillEndpoint, { level: 'equipment', room: room ?? '', stgroup: stgroup ?? '' }, canQuery && room !== null && stgroup !== null);

  // While a kept result is shown (#1365), everything that describes or acts on the DATA follows the params it was loaded with, not the current selection.
  const trendShown = trendQ.previousResult?.params ?? trendQ.resultParams ?? { kpi: selectedKpi, granularity: gran };
  const shownKpi = trendShown.kpi;
  const shownGranLabel = trendShown.granularity === 'hour' ? (m('productivityOverviewHourly2')) : trendShown.granularity === 'day' ? (m('productivityOverviewDaily2')) : (m('productivityOverviewWeekly2'));
  const shownAxis = breakdownQ.previousResult?.params?.axis ?? breakdownQ.resultParams?.axis ?? axis;

  const n1 = (v: number) => formatNumber(v, lang, { decimals: 1 });
  const n2 = (v: number) => formatNumber(v, lang, { decimals: 2 });
  const ni = (v: number) => formatNumber(Math.round(v), lang);

  /** Explicit-empty-selection escape hatch: outcome `empty` is valid, but the user can restore the unconstrained query in one action. */
  const selection = global.selection?.length === 0
    ? { label: m('productivityOverviewZeroEquipment'), clear: () => setGlobal({ selection: null }) }
    : undefined;

  // --- KPI cards (the selected trend is a registered page URL key) ---
  function selectKpi(kpi: KpiKey) {
    setPage({ kpi: kpi === 'throughput' ? null : kpi });
  }

  function kpiCard(kpi: KpiKey, data: { current: KpiSet; previous: KpiSet | null }) {
    const c = data.current; const p = data.previous;
    // Variant A (#2743): the delta pill and the 80×28 mini trend; the basis line stays one line, so the version is the short «v3» form.
    const shared = {
      onClick: () => selectKpi(kpi), active: selectedKpi === kpi,
      trend: cardTrend?.map(bucket => bucket.known ? bucket[KPI_TREND_FIELD[kpi]] : null) ?? [],
    };
    if (kpi === 'occupancy') {
      const o = c.occupancy; const po = p?.occupancy ?? null;
      return <StatCard key={kpi} {...shared} label={m('productivityOverviewPhysicalOccupancy')} value={o ? n1(o.pct) : '—'} unit="%"
        comparison={{ kind: 'absolute', current: o?.pct ?? null, previous: po?.pct ?? null, good: 'up', noChangeBand: OCCUPANCY_NO_CHANGE_PP,
          formatValue: v => `${n1(v)}%`, formatChange: v => `${n1(v)}pp` }}
        caption={o ? `${n1(o.num)}h / ${n1(o.den)}h · ${formatMetricVersion(METRIC_VERSIONS.occupancy)}` : m('productivityOverviewDenominator0NotConfirmedNot0')} />;
    }
    if (kpi === 'dwell') {
      const d = c.dwell; const pd = p?.dwell ?? null;
      const n3 = (v: number) => formatNumber(v, lang, { decimals: 3 });
      const unit = m('productivityOverviewHJob2');
      return <StatCard key={kpi} {...shared} label={m('productivityOverviewNonProcessDwell')} value={d ? n3(d.perJobH) : '—'} unit={unit}
        comparison={{ kind: 'absolute', current: d?.perJobH ?? null, previous: pd?.perJobH ?? null, good: 'down',
          formatValue: v => `${n3(v)} ${unit}`, formatChange: v => `${n3(v)}h` }}
        caption={d ? `${n1(d.hours)}h ÷ ${ni(d.jobs)} Job · ${formatMetricVersion(METRIC_VERSIONS.dwell)}` : m('productivityOverviewNoCompletedJobNotConfirmed')} />;
    }
    if (kpi === 'cycleTime') {
      const cy = c.cycle; const pc = p?.cycle ?? null;
      const min = m('productivityOverviewMin');
      const version = METRIC_VERSIONS.cycleTime as keyof typeof CYCLE_VERSION_TEXT;
      const caption = `${m('productivityOverviewPooledJobsN', { value: String(ni(cy.jobs)) })} · ${formatMetricVersion(version)}`;
      return <StatCard key={kpi} {...shared} label={m('productivityOverviewCycleTimeP50P95')} unit={min}
        value={<span className="flex items-baseline gap-2">
          <span>{cy.p50 !== null ? n1(cy.p50) : '—'}</span>
          <span className="t-stat-2 text-text-secondary">{cy.p95 !== null ? n1(cy.p95) : '—'}</span>
        </span>}
        // The comparison is P50 only while the card shows P50 / P95, so its text says so (#398).
        comparison={{ kind: 'absolute', current: cy.p50, previous: pc?.p50 ?? null, good: 'down',
          formatValue: v => `P50 ${n1(v)}${min}`, formatChange: v => `P50 ${n1(v)}${min}` }}
        // The version's meaning no longer fits the one-line basis; it stays in the tooltip (#2743).
        caption={caption} captionTitle={`${caption} (${CYCLE_VERSION_TEXT[version][lang]})`} />;
    }
    const t = c.throughput; const pt = p?.throughput ?? null;
    // Throughput declares no good direction (variant A as confirmed): more completed jobs is not good or bad without the load behind it.
    return <StatCard key={kpi} {...shared} label={m('productivityOverviewJobThroughput')} value={ni(t.jobs)} unit="Job"
      comparison={{ kind: 'absolute', current: t.jobs, previous: pt?.jobs ?? null, formatValue: v => `${ni(v)} Job`, formatChange: v => `${ni(v)} Job` }}
      caption={`${m('productivityOverviewCompleted')} ${ni(t.jobs)} / ${m('productivityOverviewStarted')} ${ni(t.started)} · ${formatMetricVersion(METRIC_VERSIONS.throughput)}`} />;
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
  const trustQuery = drill.depth === 0 ? kpiQ : drill.depth >= 2 && equipmentQ.response?.outcome === 'ok' ? equipmentQ : stgroupQ;
  const kpiTitleNote = <InfoTip label={m('guidanceLabel')}>
    {m('productivityOverviewSelectACardToShowItsTrend')}
    {' '}{CYCLE_VERSION_NOTE[lang]}
  </InfoTip>;
  const unknownTrendTotal = shownKpi === 'throughput' && trendQ.response?.outcome === 'empty' && trendQ.response.data !== null
    && trendQ.response.data.equipmentCount > 0 && trendQ.response.data.current.length > 0
    && trendQ.response.data.current.every(bucket => !bucket.known);
  const kpiColumns = [m('productivityOverviewPhysicalOccupancy'), m('productivityOverviewNonProcessDwell'),
    m('productivityOverviewCycleTimeP50P95'), m('productivityOverviewJobThroughput')];

  return <PlatformPage
    description={m('productivityOverviewPhysicalOccupancyNonProcessDwellCycleTime')}
    primaryAction={<Button size="sm" asChild>
      <PlatformLink href={linkTo('cycle-time')}>{m('productivityOverviewCycleTimeDetail')}<ArrowRight className="size-3.5" aria-hidden /></PlatformLink>
    </Button>}
    secondaryActions={<Button size="sm" variant="secondary" onClick={() => { kpiQ.refetch(); trendQ.refetch(); breakdownQ.refetch(); attentionQ.refetch(); roomsQ.refetch(); stgroupQ.refetch(); equipmentQ.refetch(); }}>
      <RotateCw className="size-3.5" aria-hidden />{m('productivityOverviewRefresh')}
    </Button>}
    dataTrustSummary={<DataTrustIndicator query={trustQuery} />}
    queryBarExtension={{ appliedPageSummary: [{ key: 'granularity', label: m('productivityOverviewGranularity'), value: granLabel }] }}
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
      <QueryView query={kpiQ} panel={{ kind: 'kpi', height: 152, title: m('productivityOverviewMetricSummary'), columns: kpiColumns, titleNote: kpiTitleNote, selection }}>
        {data => KPI_KEYS.map(k => kpiCard(k, data))}
      </QueryView>

      {/* Main Trend */}
      <section aria-label={m('productivityOverviewMainTrend')}>
        <QueryView query={trendQ} panel={{
          kind: 'chart', height: 486, title: meta.title, selection,
          emptyNote: unknownTrendTotal && <p role="status">{m('productivityOverviewUnconfirmedTrendTotal')}</p>,
          footerTrust: (data, response) => {
            const trust = response.trust;
            if (shownKpi !== 'throughput' || !trust) return trust;
            const count = data.current.filter(bucket => bucket.known).length;
            const coverage = trust.coverage === null ? m('productivityTableUnknown') : `${(trust.coverage * 100).toFixed(1)}%`;
            return {
              source: trust.source,
              updated: trustInstant(trust.updatedAt),
              coverage: `${coverage} · ${m('productivityOverviewObservedBucketCoverage', { observed: String(count), total: String(data.current.length) })}`,
            };
          },
        }}>
          {data => {
            const { series, compareSeries, total, knownBucketCount, bucketCount } = trendSeriesFor(data);
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
            />;
          }}
        </QueryView>
      </section>

      <div className="grid grid-cols-1 gap-4 @xl:grid-cols-2">
        {/* Breakdown: occupancy composition per room_name / StGroup */}
        <QueryView query={breakdownQ} panel={{
          kind: 'chart-table', height: 564, title: m('productivityOverviewOccupancyComposition'), selection,
          controls: <SegmentedRadio
            label={m('productivityOverviewGroupBy')}
            value={axis}
            onChange={a => setPage({ axis: a === 'room' ? null : a })}
            options={[{ value: 'room', label: m('productivityOverviewProcess') }, { value: 'stgroup', label: 'StGroup' }]}
          />,
        }}>
            {(rows, _response, { stale }) => {
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
                  series={[
                    { id: 'occupied', name: m('productivityOverviewOccupiedHours'), color: 'chart-blue', kind: 'bar', unit: 'h', points: rows.map(r => [r.key, r.occupiedHours] as [string, number | null]) },
                    { id: 'remainder', name: m('productivityOverviewNotOccupiedObservable'), color: 'chart-remainder', kind: 'bar', unit: 'h', points: rows.map(r => [r.key, r.observableHours - r.occupiedHours] as [string, number | null]) },
                  ]}
                />
                <div className="mt-2 overflow-auto border-t border-border-subtle">
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
                          <button type="button" aria-label={m('productivityTableEnterRow', { key: r.key })} disabled={stale} onClick={() => drill.enter('drillRoom', r.key)}
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
        </QueryView>

        {/* Attention List: ranking only, no threshold verdicts (wireframe 11 §1) */}
        <QueryView query={attentionQ} panel={{ kind: 'table', height: 564, title: m('productivityOverviewAttention'),
          subtitle: m('productivityOverviewTopEquipmentByNonProcessDwellAnd'), selection }}>
              {(rows: AttentionRow[], _response, { stale }) => <>
                <ul className="divide-y divide-border-subtle">
                  {rows.map(r => <li key={`${r.kind}-${r.equipmentId}`} className="flex items-center gap-x-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-x-2">
                        <StatusBadge tone="neutral">{r.kind === 'dwell' ? (m('productivityOverviewTopDwell')) : (m('productivityOverviewSlowestP95'))}</StatusBadge>
                        <span className="t-mono truncate" title={r.equipmentId}>{r.equipmentId}</span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-x-2">
                        <span className="tabular shrink-0 whitespace-nowrap text-sm font-medium">
                          {r.kind === 'dwell' ? `${n2(r.dwellPerJobH ?? 0)} ${m('productivityOverviewHJob3')}` : `P95 ${n1(r.p95Min ?? 0)} ${m('productivityOverviewMin3')}`}
                          <span className="ml-1 text-tiny font-normal text-text-muted">n={ni(r.jobs)}</span>
                        </span>
                        <span className="min-w-0 truncate text-xs text-text-secondary" title={`${r.room} · ${r.stgroup}`}>{r.room} · {r.stgroup}</span>
                      </div>
                    </div>
                    {/* Row actions stay on the equipment's line as one-line buttons (#2651). */}
                    {!stale && <span className="flex shrink-0 items-center gap-1">
                      <RowAction compact={false} icon={ArrowUpRight} label={m('productivityOverviewCycleTimeName')} text={m('productivityOverviewCycleTime')}
                        link={<PlatformLink href={linkTo('cycle-time', { global: { selection: [r.equipmentId] } })}
                          title={m('productivityOverviewChangesTheEquipmentSelectionToThisEquipment')} />} />
                      <ObjectLinks kind="equipment" id={r.equipmentId} returnTo />
                    </span>}
                  </li>)}
                </ul>
                <p className="t-caption mt-2 text-text-muted">
                  {m('productivityOverviewTheCycleTimeLinkChangesTheEquipment')}
                </p>
              </>}
        </QueryView>
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
