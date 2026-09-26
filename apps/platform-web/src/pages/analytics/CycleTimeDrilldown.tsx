import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Gauge, Hash, RotateCw, Timer, X } from 'lucide-react';
import type { Trust } from '@ap/contracts';
import { type PageProps, PlatformLink, useI18n, usePlatform, usePlatformQuery } from '@ap/kernel';
import { CYCLE_VERSION_NOTE, periodHours, serve } from './api';
import { AnalysisChartFrame, type ColumnMeta, DataTrustIndicator, type Delta, PlatformDataTable, PlatformPage, QueryView, sortAndPage, StatCard, StateMessage } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import {
  DEFAULT_SORT, MAX_HOURS, PAGE_METRIC_ID, SORT_COLUMNS, bucketContaining, bucketEnd,
  encodeSort, histogram, parseSortParam, percentile, population, previousWindow, resolveGranularity,
  resolveMetric, rowsForExport, resolveTail, slowExecutions, trendOf, executionKey, equipmentIdFromKey,
  type Granularity, type ResolvedMetric, type SlowRow, type SortColumn, type TailMode,
} from './cycleData';

type Kpi = { p50: number | null; p95: number | null; count: number; slowCount: number; prevP50: number | null; prevP95: number | null };
type TrendData = { count: number; populationP95: number | null; current: ReturnType<typeof trendOf>; previous: ReturnType<typeof trendOf> };
type DistData = { count: number; bins: { id: string; count: number }[] };

const control = 'h-8 rounded-md border border-border-strong bg-surface-card px-2 text-[12px] text-text-primary';

export default function CycleTimeDrilldown(_: PageProps) {
  const { lang } = useI18n();
  const { global, pageParam, setPage, setGlobal, linkTo, toast } = usePlatform();
  const granularityRaw = pageParam('granularity');
  const percentileRaw = pageParam('percentile');
  const sortRaw = pageParam('sort');
  const hours = periodHours(global);
  const granularityResult = resolveGranularity(granularityRaw, hours);
  const tailResult = resolveTail(percentileRaw);
  const sortResult = parseSortParam(sortRaw);
  const invalidPage = !granularityResult.ok || !tailResult.ok || !sortResult.ok;
  const granularity: Granularity = granularityResult.ok ? granularityResult.value : 'hour';
  const tailMode: TailMode = tailResult.ok ? tailResult.value : 'p95';
  const sortSpec = sortResult.ok ? sortResult : { ok: true as const, id: 'cycleMin' as const, desc: true, explicit: false };
  const periodReady = global.from !== null && global.to !== null;
  const metric = resolveMetric(global);
  const cycleVersion = metric.kind === 'page-default' || metric.kind === 'applied' || metric.kind === 'not-applied'
    ? metric.metricVersion
    : null;
  const enabled = !invalidPage && periodReady && cycleVersion !== null;
  const ko = lang === 'ko';

  const [bucket, setBucket] = useState<string | null>(null);
  const [bin, setBin] = useState<{ from: string; to: string } | null>(null);
  const [tableKey, setTableKey] = useState(0);
  const [reload, setReload] = useState(0);
  const headerSortRef = useRef<string | null>(null);

  useEffect(() => { setBucket(null); }, [granularity, global.from, global.to]);
  const globalKey = `${global.scopeId}|${global.from}|${global.to}|${JSON.stringify(global.roomNames)}|${JSON.stringify(global.condition)}|${JSON.stringify(global.selection)}|${JSON.stringify(global.lotIds)}|${global.ppid}|${JSON.stringify(global.recipeIds)}`;
  useEffect(() => { setBin(null); }, [globalKey]);

  const bucketRange = bucket ? { from: bucket, to: bucketEnd(bucket, granularity) } : null;
  const inputs = [cycleVersion, metric.kind];

  const kpi = usePlatformQuery(signal => serve<Kpi>({
    global, signal, maxHours: MAX_HOURS, metricVersion: cycleVersion ?? undefined,
    isEmpty: data => data.count === 0,
    compute: ({ equipment }) => summarize(equipment, global, cycleVersion),
  }), ['kpi', ...inputs], enabled);

  const trend = usePlatformQuery(signal => serve<TrendData>({
    global, signal, maxHours: MAX_HOURS, metricVersion: cycleVersion ?? undefined,
    isEmpty: data => data.count === 0,
    compute: ({ equipment }) => {
      const rows = populationForVersion(equipment, global, cycleVersion);
      const from = global.from!;
      const to = global.to!;
      const prev = previousWindow(from, to);
      return {
        count: rows.length,
        populationP95: percentile(rows.map(row => row.cycleMin), 0.95),
        current: trendOf(rows, from, to, granularity),
        previous: trendOf(populationForVersion(equipment, { ...global, from: prev.from, to: prev.to }, cycleVersion), prev.from, prev.to, granularity),
      };
    },
  }), ['trend', granularity, ...inputs], enabled);

  const dist = usePlatformQuery(signal => serve<DistData>({
    global, signal, maxHours: MAX_HOURS, metricVersion: cycleVersion ?? undefined,
    isEmpty: data => data.count === 0,
    compute: ({ equipment }) => {
      const rows = populationForVersion(equipment, global, cycleVersion);
      return { count: rows.length, bins: histogram(rows) };
    },
  }), ['dist', ...inputs], enabled);

  const columns = useMemo<ColumnDef<SlowRow>[]>(() => [
    { id: 'equipmentId', accessorKey: 'equipmentId', header: 'Equipment', meta: { label: 'Equipment' } satisfies ColumnMeta, cell: ({ getValue }) => <span className="t-mono">{getValue<string>()}</span> },
    { id: 'room', accessorKey: 'room', header: 'room_name', meta: { label: 'room_name' } satisfies ColumnMeta, cell: ({ getValue }) => <span className="t-mono">{getValue<string>()}</span> },
    { id: 'recipe', accessorKey: 'recipe', header: 'Recipe', meta: { label: 'Recipe' } satisfies ColumnMeta, cell: ({ getValue }) => <span className="t-mono">{getValue<string>()}</span> },
    { id: 'lotId', accessorKey: 'lotId', header: 'Lot', meta: { label: 'Lot' } satisfies ColumnMeta, cell: ({ getValue }) => <span className="t-mono">{getValue<string>()}</span> },
    { id: 'anchor', accessorKey: 'anchor', header: ko ? '시작' : 'Start', meta: { label: ko ? '시작' : 'Start' } satisfies ColumnMeta, cell: ({ getValue }) => <span className="t-mono tabular">{getValue<string>().replace('T', ' ')}</span> },
    {
      id: 'cycleMin', accessorKey: 'cycleMin', header: ko ? '사이클타임 (분)' : 'Cycle time (min)',
      meta: { align: 'right', label: ko ? '사이클타임 (분)' : 'Cycle time (min)' } satisfies ColumnMeta,
      cell: ({ getValue }) => <span className="tabular">{formatMin(getValue<number>(), lang)}</span>,
    },
    {
      id: 'delta', accessorKey: 'delta', header: ko ? 'P95 대비' : 'vs P95',
      meta: { align: 'right', label: ko ? 'P95 대비' : 'vs P95' } satisfies ColumnMeta,
      cell: ({ getValue }) => {
        const value = getValue<number | null>();
        return <span className={value !== null && value > 0 ? 'tabular text-text-danger' : 'tabular text-text-secondary'}>{formatDelta(value, lang)}</span>;
      },
    },
    {
      id: 'quality', accessorKey: 'quality', header: ko ? '품질' : 'Quality', meta: { label: ko ? '품질' : 'Quality' } satisfies ColumnMeta,
      cell: ({ getValue }) => qualityBadge(getValue<SlowRow['quality']>(), ko),
    },
  ], [ko, lang]);

  const filterKey = JSON.stringify({ tail: tailMode, bucket: bucketRange, bin, sort: sortRaw, reload });
  const unknown = ko ? '미확인' : 'Unknown';
  const granularityPending = granularityRaw === null && hours === null;

  function exportRows(scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered'; total: number }) {
    const result = rowsForExport(global, cycleVersion);
    if (result.status === 'unavailable') {
      toast(ko ? '이 응답 상태에서는 목록을 내보내지 않습니다.' : 'Export is not available for this response state.');
      return;
    }
    if (result.status === 'rejected') {
      toast(ko ? '서버가 이 조건의 내보내기를 거부했습니다.' : 'The server rejected export for this context.');
      return;
    }
    const rows = result.rows;
    const p50 = percentile(rows.map(row => row.cycleMin), 0.5);
    const p95 = percentile(rows.map(row => row.cycleMin), 0.95);
    let list = slowExecutions(rows, tailMode, p50, p95, bucketRange, bin);
    if (scope.kind === 'selected') {
      const ids = new Set(scope.ids);
      list = list.filter(row => ids.has(executionKey(row)));
    }
    const header = ['equipmentId', 'room', 'recipe', 'lotId', 'anchor', 'cycleMin', 'deltaVsP95', 'quality'];
    const lines = [header.join(','), ...list.map(row => [row.equipmentId, row.room, row.recipe, row.lotId, row.anchor, row.cycleMin, row.delta ?? '', row.quality].map(csvCell).join(','))];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'cycle-time-executions.csv';
    link.click();
    URL.revokeObjectURL(link.href);
    toast(ko ? `실행 ${list.length}건을 내보냈습니다. 페이지 필터가 적용된 목록이며 KPI 모집단 전체가 아닙니다.` : `Exported ${list.length} executions. Page filters apply; this is not the full KPI population.`);
  }

  const pageErrors = [
    !granularityResult.ok ? `granularity=${granularityRaw}` : null,
    !tailResult.ok ? `percentile=${percentileRaw}` : null,
    !sortResult.ok ? `sort=${sortRaw}` : null,
  ].filter((item): item is string => item !== null);

  return <PlatformPage
    description={ko
      ? '적용된 전역 기간·설비의 사이클타임입니다. 분위수·느린 실행 기준은 Candidate이고, 점·분포 선택은 목록만 줄입니다.'
      : 'Cycle time for the applied global period and equipment. Percentiles are Candidate; point and histogram choices filter only the list.'}
    secondaryActions={<Button variant="secondary" size="sm" onClick={() => { kpi.refetch(); trend.refetch(); dist.refetch(); setReload(n => n + 1); }}><RotateCw className="size-3.5" aria-hidden />{ko ? '새로고침' : 'Refresh'}</Button>}
    dataTrustSummary={kpi.response?.trust ? <DataTrustIndicator trust={kpi.response.trust} assessments={kpi.response.assessments} /> : undefined}
    contextExtension={<div className="space-y-2">
      <MetricBanner metric={metric} />
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border-subtle bg-surface-card px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">{ko ? '페이지 필터' : 'Page filter'}</span>
        <span className="text-[12px] text-text-secondary">{ko ? '집계' : 'Grain'}</span>
        {(['hour', 'day', 'week'] as const).map(value => <button key={value} type="button" aria-pressed={!granularityPending && granularityResult.ok && granularity === value}
          className={!granularityPending && granularityResult.ok && granularity === value ? 'h-8 rounded-md bg-accent-primary-soft px-2 text-[12px] font-medium text-accent-primary' : 'h-8 rounded-md px-2 text-[12px] text-text-secondary hover:bg-surface-sunken'}
          onClick={() => setPage({ granularity: value })}>{value === 'hour' ? (ko ? '시간' : 'Hour') : value === 'day' ? (ko ? '일' : 'Day') : (ko ? '주' : 'Week')}</button>)}
        <label className="flex items-center gap-1 text-[12px] text-text-secondary">{ko ? '꼬리' : 'Tail'}
          <select aria-label={ko ? '느린 실행 기준' : 'Slow-execution predicate'} className={control} value={tailResult.ok ? tailMode : ''}
            onChange={event => setPage({ percentile: event.target.value })}>
            <option value="p95">≥ P95</option>
            <option value="p50">≥ P50</option>
            <option value="all">{ko ? '전체 실행' : 'All executions'}</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[12px] text-text-secondary">{ko ? '정렬' : 'Sort'}
          <select aria-label={ko ? '정렬' : 'Sort'} className={control} value={sortResult.ok ? encodeSort(sortSpec.id, sortSpec.desc) : ''}
            onChange={event => { setPage({ sort: event.target.value === DEFAULT_SORT ? null : event.target.value }); headerSortRef.current = null; setTableKey(key => key + 1); }}>
            <option value="cycleMin:desc">{ko ? '사이클타임 내림차순' : 'Cycle time descending'}</option>
            <option value="cycleMin:asc">{ko ? '사이클타임 오름차순' : 'Cycle time ascending'}</option>
            <option value="delta:desc">{ko ? 'P95 대비 내림차순' : 'vs P95 descending'}</option>
            <option value="anchor:desc">{ko ? '시작 최신' : 'Start newest'}</option>
            <option value="anchor:asc">{ko ? '시작 오래된' : 'Start oldest'}</option>
            <option value="equipmentId:asc">Equipment A→Z</option>
          </select>
        </label>
        <Button variant="ghost" size="sm" className="h-8 px-2 text-[12px]" onClick={() => { setPage({ granularity: null, percentile: null, sort: null }); setBucket(null); setBin(null); headerSortRef.current = null; setTableKey(key => key + 1); }}>{ko ? '페이지 조건 기본값' : 'Reset page filters'}</Button>
      </div>
      <p className="text-[12px] text-text-muted">
        {ko
          ? `집계 기본값은 기간 ≤48h이면 hour, 아니면 day${!granularityResult.ok || granularityResult.explicit ? '' : ` (지금 ${granularity}, URL에 없음)`}. 꼬리 기본값은 ≥ P95 (Candidate, 동률 포함)이며 KPI 모집단을 다시 줄이지 않습니다. 버킷·분포 구간은 등록된 page key가 없어 URL과 복귀 링크에 남지 않습니다.`
          : `Default grain is hour when the period is ≤48h, otherwise day${!granularityResult.ok || granularityResult.explicit ? '' : ` (now ${granularity}, not in the URL)`}. Default tail is ≥ P95 (Candidate, ties included) and does not shrink the KPI population. Bucket and histogram filters have no registered page key, so they are absent from the URL and the return link.`}
      </p>
      {(bucketRange || bin) && <div className="flex flex-wrap items-center gap-2">
        {bucketRange && <FilterChip label={ko ? '버킷' : 'Bucket'} value={`${bucketRange.from.replace('T', ' ')} → ${bucketRange.to.replace('T', ' ')}`} onClear={() => setBucket(null)} clearLabel={ko ? '버킷 필터 해제' : 'Clear bucket filter'} />}
        {bin && <FilterChip label={ko ? '분포 구간' : 'Histogram'} value={bin.from === bin.to ? bin.from : `${bin.from} – ${bin.to}`} onClear={() => setBin(null)} clearLabel={ko ? '분포 필터 해제' : 'Clear histogram filter'} />}
      </div>}
    </div>}
  >
    {invalidPage ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={ko ? '페이지 키 값이 올바르지 않습니다' : 'Invalid page key'}
      body={ko
          ? `${pageErrors.join(', ')} 은 이 화면의 등록 값이 아닙니다. hour|day|week, p50|p95|all, column:asc|desc 만 허용하며 다른 값으로 바꾸지 않습니다.`
        : `${pageErrors.join(', ')} is not a registered value. Allowed: hour|day|week, p50|p95|all, column:asc|desc. Nothing was substituted.`} />
      : !periodReady ? <p className="text-[13px] text-text-muted">{ko ? '전역 기간이 URL에 확정되면 조회합니다.' : 'The query starts once the global period is in the URL.'}</p>
        : <div className="space-y-4">
          <div className="relative pt-6" data-testid="cycle-kpi">
            <QueryView query={kpi}>
              {data => <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard icon={Timer} chip="blue" label="P50" value={formatMin(data.p50, lang)} unit={ko ? '분' : 'min'} delta={cycleDelta(data.p50, data.prevP50)} caption={ko ? '적용 모집단' : 'Applied population'} />
                <StatCard icon={Gauge} chip="amber" label="P95" value={formatMin(data.p95, lang)} unit={ko ? '분' : 'min'} delta={cycleDelta(data.p95, data.prevP95)} caption={ko ? '적용 모집단' : 'Applied population'} />
                <StatCard icon={Hash} chip="teal" label={ko ? '실행 수' : 'Executions'} value={data.count.toLocaleString(ko ? 'ko-KR' : 'en-US')} caption={ko ? '완료된 합성 Job' : 'Completed synthetic jobs'} />
                <StatCard icon={AlertTriangle} chip="purple" label={ko ? '느린 실행' : 'Slow executions'} value={data.slowCount.toLocaleString(ko ? 'ko-KR' : 'en-US')} caption={ko ? '≥ P95 (Candidate)' : '≥ P95 (Candidate)'} />
              </div>}
            </QueryView>
          </div>
          <p className="text-[12px] text-text-muted">{ko
            ? 'Candidate: 선형 보간 후 0.1분 반올림, 미완료 Job은 생성하지 않음, 느린 실행은 표시된 P95 이상(동률 포함). 감소를 개선으로 칠한 증감은 직전 동일 길이 기간 대비입니다. 빈 버킷은 0이 아닙니다.'
            : 'Candidate: linear interpolation rounded to 0.1 min, no in-progress jobs, slow means ≥ the displayed P95 (ties included). Deltas versus the previous equal-length period treat a decrease as an improvement. Empty buckets are not zero.'}</p>

          <div className="relative pt-6">
            <QueryView query={trend} skeletonHeight={280}>
              {(data, response) => <AnalysisChartFrame
                chartId="cycle-time-trend"
                title={ko ? '사이클타임 추세' : 'Cycle time trend'}
                description={ko ? `버킷별 P50/P95 · ${granularity === 'hour' ? '시간' : granularity === 'day' ? '일' : '주'} · 단위 분(Candidate)` : `P50/P95 by bucket · ${granularity} · minutes (Candidate)`}
                metricVersion={metricLabel(metric)}
                unit={ko ? '분' : 'min'}
                valueFormat={value => formatMin(value, lang)}
                series={[
                  { id: 'p50', name: 'P50', color: 'chart-blue', points: data.current.p50 },
                  { id: 'p95', name: 'P95', color: 'chart-teal', points: data.current.p95, dashed: true },
                ]}
                compareSeries={[
                  { id: 'p50-prev', name: ko ? 'P50 이전 기간' : 'P50 previous period', color: 'chart-purple', points: data.previous.p50, dashed: true },
                  { id: 'p95-prev', name: ko ? 'P95 이전 기간' : 'P95 previous period', color: 'accent-warn', points: data.previous.p95, dashed: true },
                ]}
                markLines={data.populationP95 === null ? undefined : [{ y: data.populationP95, label: `P95 ${formatMin(data.populationP95, lang)}` }]}
                trust={chartTrust(response.trust, unknown)}
                pointClickHint={ko ? '점을 클릭하면 그 버킷만 목록에 남습니다. 전역 기간은 바뀌지 않습니다.' : 'Click a point to keep that bucket in the list. The global period does not change.'}
                onPointClick={(x, seriesId) => {
                  if (seriesId.endsWith('-prev')) {
                    toast(ko ? '이전 기간 점은 비교용입니다. 목록은 현재 전역 기간의 버킷만 필터합니다.' : 'Previous-period points are for comparison. The list only filters buckets in the current global period.');
                    return;
                  }
                  const start = bucketContaining(x, granularity);
                  if (!start || !global.from || !global.to) return;
                  const end = bucketEnd(start, granularity);
                  if (end <= global.from || start >= global.to) return;
                  setBucket(start);
                }}
              />}
            </QueryView>
          </div>

          <div className="relative pt-6">
            <QueryView query={dist} skeletonHeight={220}>
              {(data, response) => <AnalysisChartFrame
                chartId="cycle-time-distribution"
                title={ko ? '사이클타임 분포' : 'Cycle time distribution'}
                description={ko ? 'Candidate 구간 [하한, 상한). Brush 후 “이 구간 실행 보기”만 목록을 줄입니다.' : 'Candidate bins [min, max). Only “Show executions in this range” filters the list.'}
                metricVersion={metricLabel(metric)}
                xType="category"
                unit={ko ? '건' : 'jobs'}
                valueFormat={value => Math.round(value).toLocaleString(ko ? 'ko-KR' : 'en-US')}
                height={220}
                series={[{ id: 'hist', name: ko ? '실행 수' : 'Executions', color: 'chart-blue', kind: 'bar', points: data.bins.map((item): [string, number] => [item.id, item.count]) }]}
                trust={chartTrust(response.trust, unknown)}
                selectionActions={selection => <Button size="sm" className="h-7 px-2 text-[12px]" onClick={() => setBin({ from: selection.from, to: selection.to })}>{ko ? '이 구간 실행 보기' : 'Show executions in this range'}</Button>}
              />}
            </QueryView>
          </div>

          <PlatformDataTable<SlowRow>
            key={tableKey}
            title={ko ? '느린 실행' : 'Slow executions'}
            subtitle={ko
              ? `페이지 필터 적용 목록입니다. 꼬리 ${tailMode === 'all' ? '전체' : `≥ ${tailMode.toUpperCase()}`} · 모집단 ${kpi.response?.outcome === 'ok' ? kpi.response.data!.count.toLocaleString('ko-KR') : '…'}건. 정렬은 URL sort 키입니다.`
              : `Page-filtered list. Tail ${tailMode === 'all' ? 'all' : `≥ ${tailMode.toUpperCase()}`} · population ${kpi.response?.outcome === 'ok' ? kpi.response.data!.count.toLocaleString('en-US') : '…'}. Sort is the URL sort key.`}
            ariaLabel={ko ? '느린 실행 목록' : 'Slow executions'}
            columns={columns}
            getRowId={executionKey}
            preferenceKey="cycle-time-slow"
            filterKey={filterKey}
            pageSize={50}
            height={420}
            onExport={exportRows}
            emptyAction={(bucketRange || bin || tailMode !== 'p95')
              ? <Button size="sm" variant="secondary" onClick={() => { setBucket(null); setBin(null); setPage({ percentile: 'all' }); }}>{ko ? '목록 필터 해제' : 'Clear list filters'}</Button>
              : undefined}
            rowAction={row => <PlatformLink className="text-[12px] font-medium text-accent-primary hover:underline" href={linkTo('execution-detail', { params: { equipmentId: row.equipmentId }, page: { entityType: 'job', anchor: row.anchor }, returnTo: true })}>{ko ? '상세' : 'Detail'}</PlatformLink>}
            bulkActions={ids => <Button size="sm" className="h-7 px-2 text-[12px]" onClick={() => {
              const equipmentIds = [...new Set(ids.map(equipmentIdFromKey))];
              setGlobal({ selection: equipmentIds });
              toast(ko ? `설비 ${equipmentIds.length}대를 전역 Selection으로 적용했습니다. 다른 메뉴에도 유지됩니다.` : `Applied ${equipmentIds.length} equipment as the global selection. It carries across menus.`);
            }}>{ko ? '선택 설비로 분석 좁히기' : 'Narrow analysis to selected equipment'}</Button>}
            loadPage={(query, signal) => {
              const header = query.sorting[0];
              const headerEncoded = header && SORT_COLUMNS.includes(header.id as SortColumn) ? encodeSort(header.id, !!header.desc) : null;
              if (headerEncoded && headerEncoded !== headerSortRef.current) {
                headerSortRef.current = headerEncoded;
                if ((pageParam('sort') ?? DEFAULT_SORT) !== headerEncoded) setPage({ sort: headerEncoded === DEFAULT_SORT ? null : headerEncoded }, { replace: true });
              }
              const sorting = [{ id: sortSpec.id, desc: sortSpec.desc }];
              return serve({
                global, signal, maxHours: MAX_HOURS, metricVersion: cycleVersion ?? undefined,
                isEmpty: data => data.total === 0,
                compute: ({ equipment }) => {
                  const rows = populationForVersion(equipment, global, cycleVersion);
                  const p50 = percentile(rows.map(row => row.cycleMin), 0.5);
                  const p95 = percentile(rows.map(row => row.cycleMin), 0.95);
                  return sortAndPage(slowExecutions(rows, tailMode, p50, p95, bucketRange, bin), { ...query, sorting });
                },
              });
            }}
          />
          <p className="text-[12px] text-text-muted">{ko
            ? '품질 배지는 Candidate입니다. unknown은 미확정이며 정상으로 채우지 않습니다. review는 합성 플래그이고 불량·수율이 아닙니다.'
            : 'Quality badges are Candidate. unknown stays unconfirmed and is not filled in as pass. review is a synthetic flag, not a defect or yield.'}</p>
          {kpi.response && kpi.response.outcome === 'ok' && <DataTrustIndicator trust={kpi.response.trust} assessments={kpi.response.assessments} />}
        </div>}
  </PlatformPage>;
}

function populationForVersion(equipment: ExecutionSource, global: Parameters<typeof population>[1], version: string | null): ReturnType<typeof population> {
  return version === null ? [] : population(equipment, global, version);
}

function summarize(equipment: ExecutionSource, global: Parameters<typeof population>[1], version: string | null): Kpi {
  const rows = populationForVersion(equipment, global, version);
  const values = rows.map(row => row.cycleMin);
  const p50 = percentile(values, 0.5);
  const p95 = percentile(values, 0.95);
  const prev = global.from && global.to ? previousWindow(global.from, global.to) : null;
  const prevValues = prev ? populationForVersion(equipment, { ...global, from: prev.from, to: prev.to }, version).map(row => row.cycleMin) : [];
  return {
    p50, p95, count: rows.length,
    slowCount: p95 === null ? 0 : rows.filter(row => row.cycleMin >= p95).length,
    prevP50: percentile(prevValues, 0.5),
    prevP95: percentile(prevValues, 0.95),
  };
}

type ExecutionSource = Parameters<typeof population>[0];

function MetricBanner({ metric }: { metric: ResolvedMetric }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  if (metric.kind === 'unconfirmed') {
    return <p className="text-[12px] text-text-secondary" data-testid="metric-banner">{ko ? `${metric.metricId} 버전이 확인되지 않았습니다. 페이지 기본 버전으로 채우지 않습니다.` : `${metric.metricId} has no confirmed version. The page default is not filled in.`}</p>;
  }
  const versionNote = metric.metricVersion === '4'
    ? (ko ? '분은 생산성 개요의 cycle_time v4와 같습니다.' : 'Minutes match productivity’s cycle_time v4.')
    : CYCLE_VERSION_NOTE[ko ? 'ko' : 'en'];
  if (metric.kind === 'page-default') {
    return <p className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary" data-testid="metric-banner">
      <StatusBadge tone="info">{ko ? '페이지 기본값' : 'Page default'}</StatusBadge>
      <span className="t-mono">{PAGE_METRIC_ID} v{metric.metricVersion}</span>
      <span>{ko ? '전역 metric 쌍이 없습니다. 이 값으로 계산하며 URL에는 쓰지 않습니다.' : 'No global metric pair. Calculations use this value and do not write it into the URL.'}</span>
      <span>{versionNote}</span>
    </p>;
  }
  if (metric.kind === 'not-applied') {
    return <p className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary" data-testid="metric-banner">
      <StatusBadge tone="warning">{ko ? '미적용' : 'Not applied'}</StatusBadge>
      <span className="t-mono">{metric.globalMetricId}{metric.globalMetricVersion ? ` v${metric.globalMetricVersion}` : ''}</span>
      <span>{ko
        ? `전역 지표가 ${PAGE_METRIC_ID}이 아니라서 조회에 쓰지 않습니다. 계산은 페이지 기본값 ${PAGE_METRIC_ID} v${metric.metricVersion}이며 전역 쌍은 유지합니다.`
        : `The global metric is not ${PAGE_METRIC_ID}, so it is not used for this query. Calculations use the page default ${PAGE_METRIC_ID} v${metric.metricVersion}; the global pair is left unchanged.`}</span>
      <span>{versionNote}</span>
    </p>;
  }
  return <p className="flex flex-wrap items-center gap-2 text-[12px] text-text-secondary" data-testid="metric-banner">
    <StatusBadge tone="success">{ko ? '적용' : 'Applied'}</StatusBadge>
    <span className="t-mono">{metric.metricId} v{metric.metricVersion}</span>
    <span>{metric.versionIsPageDefault
      ? (ko ? '전역 cycle_time 쌍을 적용했습니다.' : 'The global cycle_time pair is applied.')
      : (ko ? '요청한 버전 라벨을 표시합니다. 합성 데이터는 v3 시계열 하나뿐이라 다른 세대 숫자로 바꾸지 않습니다. (Open)' : 'The requested version label is shown. Synthetic data has only the v3 series, so figures are not rewritten as another generation. (Open)')}</span>
    <span>{versionNote}</span>
  </p>;
}

function FilterChip({ label, value, onClear, clearLabel }: { label: string; value: string; onClear: () => void; clearLabel: string }) {
  return <span className="inline-flex items-center gap-1 rounded-sm border border-border-strong bg-surface-card px-2 py-1 text-[12px]">
    <span className="text-text-muted">{label}</span>
    <span className="tabular">{value}</span>
    <button type="button" aria-label={clearLabel} className="grid size-5 place-items-center rounded-xs text-text-muted hover:bg-surface-sunken" onClick={onClear}><X className="size-3" aria-hidden /></button>
  </span>;
}

function qualityBadge(quality: SlowRow['quality'], ko: boolean) {
  return quality === 'review'
    ? <StatusBadge tone="warning">{ko ? '검토 표시' : 'Review flag'}</StatusBadge>
    : <StatusBadge tone="neutral">{ko ? '미확정' : 'Unconfirmed'}</StatusBadge>;
}

function formatMin(value: number | null, lang: string): string {
  if (value === null) return '—';
  return value.toLocaleString(lang === 'ko' ? 'ko-KR' : 'en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatDelta(value: number | null, lang: string): string {
  if (value === null) return '—';
  const text = formatMin(Math.abs(value), lang);
  return value > 0 ? `+${text}` : value < 0 ? `-${text}` : text;
}

function cycleDelta(current: number | null, previous: number | null): Delta | undefined {
  if (current === null || previous === null || previous === 0 || current === previous) return undefined;
  const pct = ((current - previous) / previous) * 100;
  const direction = pct > 0 ? 'up' : 'down';
  return { value: `${Math.abs(pct).toFixed(1)}%`, direction, good: direction === 'down' };
}

function metricLabel(metric: ResolvedMetric): string {
  if (metric.kind === 'unconfirmed') return `${metric.metricId} unconfirmed`;
  return `${metric.metricId} v${metric.metricVersion}${metric.kind === 'page-default' ? ' page default' : metric.kind === 'not-applied' ? ' page default, global not applied' : ''}`;
}

function chartTrust(trust: Trust | null, unknown: string) {
  if (!trust) return undefined;
  return {
    source: trust.source,
    updated: trust.updatedAt.replace('T', ' '),
    coverage: trust.coverage === null ? unknown : `${(trust.coverage * 100).toFixed(1)}%`,
  };
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
