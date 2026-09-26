import { formatMetricVersion, shift } from '@ap/contracts';
/**
 * 생산성 분석 — 개요 (wireframe 11, Overview archetype §12.1).
 * Header → Global Context (kernel) → page-owned granularity → KPI row → main trend →
 * occupancy breakdown → attention list → Data Trust (header slot).
 *
 * Every widget runs its own usePlatformQuery so a partial failure stays local (§19).
 * Synthetic values from ./productivityData; definitions are Candidates per wireframe 11 §6.
 */
import { AlertTriangle, ArrowRight, BarChart3, Hourglass, Percent, RotateCw, Timer } from 'lucide-react';
import { type PageProps, PlatformLink, useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { CYCLE_VERSION_NOTE, periodHours, serve } from './api';
import { AnalysisChartFrame, type ChartSeries, DataTrustIndicator, type Delta, Panel, PlatformPage, QueryView, SegmentedRadio, StatCard, StateMessage } from '@ap/components';
import { Button, cn, StatusBadge } from '@ap/ui';
import {
  METRIC_VERSIONS, attentionRows, computeKpis, occupancyBreakdown, trendBuckets,
  type AttentionRow, type Granularity, type KpiKey, type KpiSet, type TrendBucket,
} from './productivityData';

/** Prototype guard against unbounded analytics (README serve contract; real limits are Open, wireframe 11 §6). */
const MAX_QUERY_HOURS = 2160;
const GRANS: readonly Granularity[] = ['hour', 'day', 'week'];
const KPI_KEYS = ['occupancy', 'dwell', 'cycleTime', 'throughput'] as const;
const AXES = ['room', 'stgroup'] as const;
const SORT_KEYS = ['key', 'occ', 'obs', 'pct', 'jobs'] as const;

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

type TrendData = { equipmentCount: number; current: TrendBucket[]; previous: TrendBucket[] };

export default function ProductivityOverview(_: PageProps) {
  const { global, scope, pageParam, setPage, setGlobal, linkTo } = usePlatform();
  const { lang } = useI18n();
  const ko = lang === 'ko';

  const from = global.from;
  const to = global.to;
  const hours = periodHours(global);
  const rawKpi = pageParam('kpi');
  const rawAxis = pageParam('axis');
  const rawSort = pageParam('sort');
  const kpiResult = resolveChoice(rawKpi, KPI_KEYS, 'throughput');
  const axisResult = resolveChoice(rawAxis, AXES, 'room');
  const sortResult = resolveBreakdownSort(rawSort);
  const invalidPage = !kpiResult.ok || !axisResult.ok || !sortResult.ok;
  const selectedKpi = kpiResult.ok ? kpiResult.value : 'throughput';
  const axis = axisResult.ok ? axisResult.value : 'room';
  const sort = sortResult.ok ? { key: sortResult.key, dir: sortResult.dir } : { key: 'key' as const, dir: 1 as const };
  const errors = [
    !kpiResult.ok ? `kpi=${rawKpi}` : null,
    !axisResult.ok ? `axis=${rawAxis}` : null,
    !sortResult.ok ? `sort=${rawSort}` : null,
  ].filter((item): item is string => item !== null).join(', ');
  const enabled = from !== null && to !== null && scope.status === 'valid' && !invalidPage;

  // Page-owned URL key `granularity` (wireframe 11 §3.1). Unset → hour for ≤48h, else day (Candidate).
  const rawGran = pageParam('granularity');
  const granKnown = GRANS.includes(rawGran as Granularity);
  const gran: Granularity = granKnown ? (rawGran as Granularity) : ((hours ?? 24) <= 48 ? 'hour' : 'day');
  const granLabel = gran === 'hour' ? (ko ? '시간' : 'hourly') : gran === 'day' ? (ko ? '일별' : 'daily') : (ko ? '주별' : 'weekly');

  const kpiQ = usePlatformQuery(signal => serve({
    global, signal, maxHours: MAX_QUERY_HOURS,
    metricVersion: `occupancy v${METRIC_VERSIONS.occupancy} · dwell v${METRIC_VERSIONS.dwell} · cycleTime v${METRIC_VERSIONS.cycleTime} · throughput v${METRIC_VERSIONS.throughput}`,
    kinds: ['collection', 'processing_delay', 'coverage', 'time_domain'],
    compute: ({ equipment }) => ({
      current: computeKpis(equipment, from!, to!),
      previous: hours !== null ? computeKpis(equipment, shift(from!, -hours), from!) : null,
    }),
    isEmpty: d => d.current.equipmentCount === 0 || d.current.knownBuckets === 0,
  }), 'kpis', enabled);

  const trendQ = usePlatformQuery(signal => serve({
    global, signal, maxHours: MAX_QUERY_HOURS, metricVersion: METRIC_VERSIONS[selectedKpi],
    compute: ({ equipment }) => ({
      equipmentCount: equipment.length,
      current: trendBuckets(equipment, from!, to!, gran),
      previous: trendBuckets(equipment, shift(from!, -hours!), from!, gran),
    }) as TrendData,
    isEmpty: d => d.equipmentCount === 0 || d.current.length === 0 || d.current.every(b => !b.known),
  }), ['trend', selectedKpi, gran], enabled);

  const breakdownQ = usePlatformQuery(signal => serve({
    global, signal, maxHours: MAX_QUERY_HOURS, metricVersion: METRIC_VERSIONS.occupancy,
    compute: ({ equipment }) => occupancyBreakdown(equipment, from!, to!, axis),
    isEmpty: rows => rows.length === 0,
  }), ['breakdown', axis], enabled);

  const attentionQ = usePlatformQuery(signal => serve({
    global, signal, maxHours: MAX_QUERY_HOURS,
    metricVersion: `dwell v${METRIC_VERSIONS.dwell} · cycleTime v${METRIC_VERSIONS.cycleTime}`,
    compute: ({ equipment }) => attentionRows(equipment, from!, to!),
    isEmpty: rows => rows.length === 0,
  }), 'attention', enabled);

  const locale = ko ? 'ko-KR' : 'en-US';
  const n1 = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const n2 = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const ni = (v: number) => Math.round(v).toLocaleString(locale);

  function deltaOf(cur: number | null, prev: number | null | undefined, goodWhenUp: boolean, format: (v: number) => string): Delta | undefined {
    if (cur === null || prev === null || prev === undefined || prev === 0) return undefined;
    const diff = cur - prev;
    const pct = `${diff > 0 ? '+' : ''}${((diff / prev) * 100).toFixed(1)}%`;
    return { value: `${diff > 0 ? '+' : ''}${format(diff)} (${pct})`, direction: diff >= 0 ? 'up' : 'down', good: goodWhenUp ? diff >= 0 : diff <= 0 };
  }

  /** Explicit-empty-selection escape hatch: outcome `empty` is valid, but the user can restore the unconstrained query in one action. */
  const clearEmptySelection = global.selection !== null && global.selection.length === 0
    ? <Button size="sm" variant="secondary" onClick={() => setGlobal({ selection: null })}>{ko ? '명시적 빈 Selection 지우기' : 'Clear explicit empty selection'}</Button>
    : undefined;

  // --- KPI cards (the selected trend is a registered page URL key) ---
  function selectKpi(kpi: KpiKey) {
    setPage({ kpi: kpi === 'throughput' ? null : kpi });
  }

  function kpiCard(kpi: KpiKey, data: { current: KpiSet; previous: KpiSet | null }) {
    const c = data.current; const p = data.previous;
    const active = selectedKpi === kpi;
    const ver = (v: string) => `${ko ? '지표 버전' : 'version'} ${formatMetricVersion(v)}`;
    if (kpi === 'occupancy') {
      const o = c.occupancy; const po = p?.occupancy ?? null;
      return <StatCard key={kpi} icon={Percent} chip="blue" label={ko ? '물리 점유율' : 'Physical occupancy'}
        onClick={() => selectKpi(kpi)} active={active}
        value={o ? n1(o.pct) : '—'} unit="%"
        delta={o && po ? deltaOf(o.pct, po.pct, true, v => `${v.toFixed(1)}pp`) : undefined}
        caption={o ? `${n1(o.num)}h / ${n1(o.den)}h · ${ver(METRIC_VERSIONS.occupancy)}` : (ko ? '분모 0 — 미확인 (0% 아님)' : 'denominator 0 — unknown, not 0%')}
        footnote={o && <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-pill bg-surface-sunken" role="img"
          aria-label={ko ? `점유 ${n1(o.num)}시간 / 관측 가능 ${n1(o.den)}시간 = ${n1(o.pct)}%` : `occupied ${n1(o.num)}h of ${n1(o.den)}h observable = ${n1(o.pct)}%`}>
          <span className="block h-full rounded-pill bg-chart-blue" style={{ width: `${Math.min(100, Math.max(0, o.pct))}%` }} />
        </span>} />;
    }
    if (kpi === 'dwell') {
      const d = c.dwell; const pd = p?.dwell ?? null;
      return <StatCard key={kpi} icon={Hourglass} chip="teal" label={ko ? '비Process 체류' : 'Non-process dwell'}
        onClick={() => selectKpi(kpi)} active={active}
        value={d ? n2(d.perJobH) : '—'} unit={ko ? '시간 / Job' : 'h / Job'}
        delta={d && pd ? deltaOf(d.perJobH, pd.perJobH, false, v => `${v.toFixed(3)}h`) : undefined}
        caption={d ? `${n1(d.hours)}h ÷ ${ni(d.jobs)} Job · ${ver(METRIC_VERSIONS.dwell)}` : (ko ? '완료 Job 없음 — 미확인' : 'no completed job — unknown')} />;
    }
    if (kpi === 'cycleTime') {
      const cy = c.cycle; const pc = p?.cycle ?? null;
      return <StatCard key={kpi} icon={Timer} chip="purple" label={ko ? '사이클타임 P50 / P95' : 'Cycle time P50 / P95'}
        onClick={() => selectKpi(kpi)} active={active}
        value={<span className="flex items-baseline gap-2">
          <span>{cy.p50 !== null ? n1(cy.p50) : '—'}</span>
          <span className="t-stat-2 text-text-secondary">{cy.p95 !== null ? n1(cy.p95) : '—'}</span>
        </span>} unit={ko ? '분 · P50/P95' : 'min · P50/P95'}
        delta={deltaOf(cy.p50, pc?.p50 ?? null, false, v => `${v.toFixed(1)}${ko ? '분' : 'min'}`)}
        caption={`${ko ? `완료 Job 모집단 n=${ni(cy.jobs)}` : `pooled jobs n=${ni(cy.jobs)}`} · ${ver(METRIC_VERSIONS.cycleTime)}`} />;
    }
    const t = c.throughput; const pt = p?.throughput ?? null;
    return <StatCard key={kpi} icon={BarChart3} chip="amber" label={ko ? 'Job 처리량' : 'Job throughput'}
      onClick={() => selectKpi(kpi)} active={active}
      value={ni(t.jobs)} unit={ko ? 'Job · 기간 내 완료' : 'jobs completed'}
      delta={deltaOf(t.jobs, pt?.jobs ?? null, true, v => ni(v))}
      caption={`${ko ? '완료' : 'completed'} ${ni(t.jobs)} / ${ko ? '착수' : 'started'} ${ni(t.started)} · ${ver(METRIC_VERSIONS.throughput)}`} />;
  }

  // --- Main trend: AnalysisChartFrame for the selected KPI; Compare overlays the previous equal period (bucket-index aligned). ---
  const trendMeta: Record<KpiKey, { title: string; names: string[]; colors: string[]; kind: 'line' | 'bar'; unit: string; decimals: 0 | 1 | 2; description: string }> = {
    occupancy: {
      title: ko ? '물리 점유율 추세' : 'Physical occupancy trend', names: [ko ? '물리 점유율' : 'Physical occupancy'], colors: ['chart-blue'], kind: 'line', unit: '%', decimals: 1,
      description: ko ? '점유 시간 합 ÷ 관측 가능 시간 합 — 비율은 분자·분모를 각각 합산 (설비별 %의 평균 아님)' : 'sum(occupied) ÷ sum(observable); ratios sum numerator and denominator separately, never average per-equipment %',
    },
    dwell: {
      title: ko ? '비Process 체류 추세' : 'Non-process dwell trend', names: [ko ? '비Process 체류' : 'Non-process dwell'], colors: ['chart-teal'], kind: 'line', unit: ko ? '시간/Job' : 'h/Job', decimals: 2,
      description: ko ? '체류 시간 합 ÷ 완료 Job 수' : 'sum(dwell hours) ÷ completed jobs',
    },
    cycleTime: {
      title: ko ? '사이클타임 추세 (P50·P95)' : 'Cycle time trend (P50·P95)', names: ['P50', 'P95'], colors: ['chart-blue', 'chart-purple'], kind: 'line', unit: ko ? '분' : 'min', decimals: 1,
      description: ko ? '완료 Job 풀링 모집단의 분위수 — 설비·버킷별 P95의 평균 아님' : 'quantiles over the pooled completed-job population, never averages of per-equipment/bucket P95s',
    },
    throughput: {
      title: ko ? 'Job 처리량 추세' : 'Job throughput trend', names: [ko ? '완료 Job' : 'Completed jobs'], colors: ['chart-purple'], kind: 'bar', unit: 'Job', decimals: 0,
      description: ko ? '완료 Job 수 · 0축 시작 막대' : 'completed jobs · zero-based bars',
    },
  };
  const meta = trendMeta[selectedKpi];
  const trendValue = (b: TrendBucket, i: number): number | null =>
    selectedKpi === 'occupancy' ? b.occupancyPct : selectedKpi === 'dwell' ? b.dwellPerJobH : selectedKpi === 'throughput' ? b.jobs : i === 0 ? b.p50 : b.p95;
  const fmtTrend = (v: number) => v.toLocaleString(locale, { minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals });

  function trendSeriesFor(data: TrendData): { series: ChartSeries[]; compareSeries: ChartSeries[]; total: number | null } {
    const build = (source: TrendBucket[], dashed: boolean): ChartSeries[] => meta.names.map((name, i) => ({
      id: `${selectedKpi}-${dashed ? 'prev' : 'cur'}-${i}`,
      name: dashed ? `${name} (${ko ? '이전 동일 기간' : 'previous period'})` : name,
      color: dashed ? 'cat-amber' : meta.colors[i],
      kind: meta.kind,
      dashed,
      // Compare is x-aligned by bucket index onto the current period's axis.
      points: data.current.map((c, idx) => [c.start, source[idx] ? trendValue(source[idx], i) : null] as [string, number | null]),
    }));
    return {
      series: build(data.current, false),
      compareSeries: build(data.previous, true),
      total: selectedKpi === 'throughput' ? data.current.reduce((s, b) => s + (b.jobs ?? 0), 0) : null,
    };
  }

  const coverageText = (c: number | null) => (c === null ? (ko ? '미확인' : 'unknown') : `${(c * 100).toFixed(1)}%`);
  const trustLine = (updatedAt: string, coverage: number | null, source: string) => ({
    updated: updatedAt.replace('T', ' ').slice(5, 16), coverage: coverageText(coverage), source,
  });

  return <PlatformPage
    description={ko
      ? '물리 점유율 · 비Process 체류 · 사이클타임 P50/P95 · Job 처리량 요약. 정의는 Candidate, 수치는 합성 예시입니다.'
      : 'Physical occupancy, non-process dwell, cycle time P50/P95 and job throughput. Definitions are Candidates; values are synthetic.'}
    primaryAction={<Button size="sm" asChild>
      <PlatformLink href={linkTo('cycle-time')}>{ko ? '사이클타임 상세 보기' : 'Cycle time detail'}<ArrowRight className="size-3.5" aria-hidden /></PlatformLink>
    </Button>}
    secondaryActions={<Button size="sm" variant="secondary" onClick={() => { kpiQ.refetch(); trendQ.refetch(); breakdownQ.refetch(); attentionQ.refetch(); }}>
      <RotateCw className="size-3.5" aria-hidden />{ko ? '새로고침' : 'Refresh'}
    </Button>}
    dataTrustSummary={kpiQ.response?.trust
      ? <DataTrustIndicator trust={kpiQ.response.trust} assessments={kpiQ.response.assessments} />
      : null}
    contextExtension={<div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <span id="granularity-label" className="text-[12px] font-medium text-text-secondary">{ko ? '집계 단위 (페이지 소유)' : 'Granularity (page-owned)'}</span>
      <SegmentedRadio
        labelledBy="granularity-label"
        label={ko ? '집계 단위 (페이지 소유)' : 'Granularity (page-owned)'}
        value={gran}
        onChange={g => setPage({ granularity: g })}
        className="inline-flex overflow-hidden rounded-md border border-border-subtle bg-surface-card"
        optionClassName={selected => cn('min-h-8 border-l border-border-subtle px-3 text-[12px] font-medium first:border-l-0 focus-visible:z-10',
          selected ? 'bg-accent-primary text-text-on-accent' : 'text-text-secondary hover:bg-surface-sunken')}
        options={GRANS.map(g => ({ value: g, label: g === 'hour' ? (ko ? '시간' : 'Hour') : g === 'day' ? (ko ? '일' : 'Day') : (ko ? '주' : 'Week') }))}
      />
      <span className="t-caption text-text-muted">
        {ko
          ? 'URL 키 granularity — 전역 필터가 아니라 이 화면 소유이며 기간과 독립입니다. 미지정 시 기본: 기간 ≤48시간이면 시간, 아니면 일 (Candidate).'
          : 'URL key granularity — owned by this page, not a global filter, independent of the period. Default when unset: hour for ≤48h, else day (Candidate).'}
      </span>
      {rawGran !== null && !granKnown && <StatusBadge tone="warning">{`granularity=${rawGran} — ${ko ? '알 수 없는 값, 기본 정책 적용' : 'unknown value, default policy applied'}`}</StatusBadge>}
    </div>}
  >
    {invalidPage ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={ko ? '페이지 키 값이 올바르지 않습니다' : 'Invalid page key'}
      body={ko
        ? `${errors} 은 이 화면의 등록 값이 아닙니다. kpi=occupancy|dwell|cycleTime|throughput, axis=room|stgroup, sort=key|occ|obs|pct|jobs:asc|desc 만 허용하며 다른 값으로 바꾸지 않습니다.`
        : `${errors} is not a registered value. Allowed: kpi=occupancy|dwell|cycleTime|throughput, axis=room|stgroup, sort=key|occ|obs|pct|jobs:asc|desc. Nothing was substituted.`} />
      : <div className="space-y-4">
      {/* Primary KPI / Summary */}
      <section aria-labelledby="kpi-heading">
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="kpi-heading" className="t-section-title">{ko ? '네 지표 요약' : 'Four-metric summary'}</h2>
          <div>
            <p className="t-caption text-text-muted">{ko ? '카드 클릭은 URL 키 kpi, 구성 축은 axis, 표 정렬은 sort에 기록됩니다. 증감은 직전 동일 길이 기간과 비교합니다.' : 'Card clicks write kpi to the URL, the axis writes axis, and table sorting writes sort. Deltas compare the previous equal-length period.'}</p>
            <p className="t-caption text-text-muted">{CYCLE_VERSION_NOTE[ko ? 'ko' : 'en']}</p>
          </div>
        </div>
        <QueryView query={kpiQ} skeletonRows={4} emptyAction={clearEmptySelection}>
          {data => <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(['occupancy', 'dwell', 'cycleTime', 'throughput'] as const).map(k => kpiCard(k, data))}
          </div>}
        </QueryView>
      </section>

      {/* Main Trend */}
      <section aria-label={ko ? '주요 추세' : 'Main trend'}>
        <QueryView query={trendQ} skeletonRows={5} emptyAction={clearEmptySelection}>
          {data => {
            const { series, compareSeries, total } = trendSeriesFor(data);
            const t = trendQ.response?.trust;
            return <AnalysisChartFrame
              chartId={`productivity-trend-${selectedKpi}`}
              title={meta.title}
              description={`${meta.description} · ${granLabel}${total !== null ? ` · ${ko ? '합계' : 'total'} ${ni(total)} Job (${ko ? 'KPI 카드와 동일 합산' : 'same sum as the KPI card'})` : ''}`}
              metricVersion={METRIC_VERSIONS[selectedKpi]}
              series={series}
              compareSeries={compareSeries}
              unit={meta.unit}
              valueFormat={fmtTrend}
              height={280}
              trust={t ? trustLine(t.updatedAt, t.coverage, t.source) : undefined}
            />;
          }}
        </QueryView>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        {/* Breakdown: occupancy composition per room_name / StGroup */}
        <section aria-label={ko ? '점유 구성' : 'Occupancy composition'}>
          <QueryView query={breakdownQ} skeletonRows={4} emptyAction={clearEmptySelection}>
            {rows => {
              const t = breakdownQ.response?.trust;
              const pct = (r: typeof rows[number]) => (r.observableHours > 0 ? (r.occupiedHours / r.observableHours) * 100 : null);
              const valueOf = (r: typeof rows[number]): number | string =>
                sort.key === 'key' ? r.key : sort.key === 'occ' ? r.occupiedHours : sort.key === 'obs' ? r.observableHours : sort.key === 'pct' ? (pct(r) ?? -1) : r.jobs;
              const sorted = [...rows].sort((a, b) => {
                const va = valueOf(a); const vb = valueOf(b);
                return (typeof va === 'string' || typeof vb === 'string' ? String(va).localeCompare(String(vb)) : va - vb) * sort.dir;
              });
              const columns: { key: typeof sort.key; label: string; align: 'left' | 'right' }[] = [
                { key: 'key', label: axis === 'room' ? 'room_name' : 'StGroup', align: 'left' },
                { key: 'occ', label: ko ? '점유 시간 (분자)' : 'Occupied h (numerator)', align: 'right' },
                { key: 'obs', label: ko ? '관측 가능 시간 (분모)' : 'Observable h (denominator)', align: 'right' },
                { key: 'pct', label: ko ? '점유율' : 'Occupancy', align: 'right' },
                { key: 'jobs', label: ko ? '완료 Job' : 'Jobs', align: 'right' },
              ];
              return <>
                <AnalysisChartFrame
                  chartId="productivity-occupancy-breakdown"
                  title={ko ? `점유 구성 — ${axis === 'room' ? 'room_name' : 'StGroup'}` : `Occupancy composition — ${axis === 'room' ? 'room_name' : 'StGroup'}`}
                  description={ko ? '기간 내 관측 가능 시간 대비 물리 점유 시간. 회색은 명명된 잔여 범주 “미점유(관측 가능 시간)”입니다.' : 'Occupied vs observable hours over the period; gray is the named remainder category “not occupied (observable)”.'}
                  metricVersion={METRIC_VERSIONS.occupancy}
                  xType="category" stacked unit="h" height={240} canApplyRange={false}
                  valueFormat={v => n1(v)}
                  extraActions={<SegmentedRadio
                    label={ko ? 'URL 키 axis' : 'URL key axis'}
                    value={axis}
                    onChange={a => setPage({ axis: a === 'room' ? null : a })}
                    className="inline-flex overflow-hidden rounded-md border border-border-subtle"
                    optionClassName={selected => cn('min-h-7 border-l border-border-subtle px-2 text-[11px] font-medium first:border-l-0',
                      selected ? 'bg-accent-primary text-text-on-accent' : 'text-text-secondary hover:bg-surface-sunken')}
                    options={[{ value: 'room', label: 'room_name' }, { value: 'stgroup', label: 'StGroup' }]}
                  />}
                  series={[
                    { id: 'occupied', name: ko ? '점유 시간' : 'Occupied hours', color: 'chart-blue', kind: 'bar', points: rows.map(r => [r.key, r.occupiedHours] as [string, number | null]) },
                    { id: 'remainder', name: ko ? '미점유 (관측 가능 시간)' : 'Not occupied (observable)', color: 'chart-remainder', kind: 'bar', points: rows.map(r => [r.key, r.observableHours - r.occupiedHours] as [string, number | null]) },
                  ]}
                  trust={t ? trustLine(t.updatedAt, t.coverage, t.source) : undefined}
                />
                <div className="mt-2 overflow-auto rounded-lg border border-border-subtle bg-surface-card">
                  <table className="w-full text-[12px]">
                    <caption className="sr-only">{ko ? '점유 구성 분자·분모 표 — 차트와 같은 세대' : 'Occupancy numerator/denominator table — same generation as the chart'}</caption>
                    <thead className="bg-surface-sunken"><tr>
                      {columns.map(col => <th key={col.key} scope="col" aria-sort={sort.key === col.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'} className={cn('t-table-header px-3 py-1.5 text-text-muted', col.align === 'right' ? 'text-right' : 'text-left')}>
                        <button type="button" onClick={() => {
                          const next = sort.key === col.key
                            ? { key: sort.key, dir: sort.dir === 1 ? -1 as const : 1 as const }
                            : { key: col.key, dir: col.key === 'key' ? 1 as const : -1 as const };
                          const value = `${next.key}:${next.dir === 1 ? 'asc' : 'desc'}`;
                          setPage({ sort: value === 'key:asc' ? null : value });
                        }}
                          className="inline-flex items-center gap-1 hover:text-text-primary">{col.label}{sort.key === col.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}</button>
                      </th>)}
                    </tr></thead>
                    <tbody className="tabular">
                      {sorted.map(r => <tr key={r.key} className="border-t border-border-subtle">
                        <td className="t-mono px-3 py-1.5">{r.key}</td>
                        <td className="px-3 py-1.5 text-right">{n1(r.occupiedHours)} h</td>
                        <td className="px-3 py-1.5 text-right">{n1(r.observableHours)} h</td>
                        <td className="px-3 py-1.5 text-right">{pct(r) !== null ? `${n1(pct(r)!)}%` : (ko ? '미확인' : 'unknown')}</td>
                        <td className="px-3 py-1.5 text-right">{ni(r.jobs)}</td>
                      </tr>)}
                    </tbody>
                  </table>
                </div>
              </>;
            }}
          </QueryView>
        </section>

        {/* Attention List: ranking only, no threshold verdicts (wireframe 11 §1) */}
        <section aria-label={ko ? '확인할 항목' : 'Attention list'}>
          <Panel title={ko ? '확인할 항목' : 'Attention'}
            subtitle={ko ? '비Process 체류·P95 상위 설비 (랭킹만, 임계값 이상 판정 아님 — Candidate).' : 'Top equipment by dwell and P95 (ranking only, no threshold verdicts — Candidate).'}>
            <QueryView query={attentionQ} skeletonRows={4} emptyAction={clearEmptySelection}>
              {(rows: AttentionRow[]) => <>
                <ul className="divide-y divide-border-subtle">
                  {rows.map(r => <li key={`${r.kind}-${r.equipmentId}`} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                    <StatusBadge tone="neutral">{r.kind === 'dwell' ? (ko ? '비Process 체류 상위' : 'Top dwell') : (ko ? 'P95 상위' : 'Slowest P95')}</StatusBadge>
                    <span className="t-mono">{r.equipmentId}</span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-text-secondary" title={`${r.name} · ${r.room} · ${r.stgroup}`}>{r.name} · {r.room} · {r.stgroup}</span>
                    <span className="tabular text-[13px] font-medium">
                      {r.kind === 'dwell' ? `${n2(r.dwellPerJobH ?? 0)} ${ko ? '시간/Job' : 'h/Job'}` : `P95 ${n1(r.p95Min ?? 0)} ${ko ? '분' : 'min'}`}
                      <span className="ml-1 text-[11px] font-normal text-text-muted">n={ni(r.jobs)}</span>
                    </span>
                    <PlatformLink href={linkTo('cycle-time', { global: { selection: [r.equipmentId] } })}
                      title={ko ? '전역 Selection을 이 설비로 명시 교체하고 사이클타임 상세로 이동합니다 (§22 Context Link).' : 'Overrides the global selection to this equipment and opens cycle time detail (§22 Context Link).'}
                      className="text-[12px] font-medium text-accent-primary hover:underline">{ko ? '사이클타임 상세 →' : 'Cycle time →'}</PlatformLink>
                    <PlatformLink href={linkTo('equipment-detail', { params: { equipmentId: r.equipmentId }, returnTo: true })}
                      title={ko ? '목적지 ID(params)로만 이동 — 분석 Selection을 바꾸지 않습니다.' : 'Carries the destination ID only; the analysis selection is untouched.'}
                      className="text-[12px] text-text-secondary hover:text-accent-primary hover:underline">{ko ? '설비 상세' : 'Equipment'}</PlatformLink>
                  </li>)}
                </ul>
                <p className="t-caption mt-2 text-text-muted">
                  {ko
                    ? '사이클타임 상세 링크는 전역 Selection을 해당 설비로 명시 교체하고 나머지 Context를 보존합니다. 설비 상세 링크는 목적지 ID(params)로만 이동하며 Selection을 바꾸지 않습니다 (§22).'
                    : 'The cycle-time link explicitly overrides the global selection to that equipment while preserving other context; the equipment link carries a destination ID only and never changes the selection (§22).'}
                </p>
              </>}
            </QueryView>
          </Panel>
        </section>
      </div>
    </div>}
  </PlatformPage>;
}
