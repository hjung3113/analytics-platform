import { useMemo, useState } from 'react';
import { AlertTriangle, Gauge, Hash, RotateCw, Timer, X } from 'lucide-react';
import { periodHours, type Trust } from '@ap/contracts';
import { type PageProps, PlatformLink, useI18n, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { AnalysisChartFrame, DataTrustIndicator, PageFilterBar, type Delta, type PlatformColumn, parsePageIndex, PlatformDataTable, PlatformPage, QueryView, StatCard, StateMessage } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import {
  CYCLE_VERSION_NOTE, PAGE_METRIC_ID, bucketEnd, cycleDistEndpoint, cycleExportEndpoint, cycleKpiEndpoint, cycleSlowPageEndpoint,
  cycleTrendEndpoint, cycleVersionOf, resolveMetric,
  type Granularity, type ResolvedMetric, type SlowRow, type TailMode,
} from '../endpoints';
import {
  DEFAULT_SORT, bucketContaining, encodeSort, exportFilterSummary, exportParams, parseBucket, parseBin, parseSortParam, qualityLabel, resolveGranularity, resolveTail,
  cycleTailFilterLabel, executionKey, equipmentIdFromKey, exportRowsWhenConfirmed,
} from './cycleData';

const NO_PARAMS = {};

export default function CycleTimeDrilldown(_: PageProps) {
  const { lang } = useI18n();
  const { global, pageParam, setPage, setGlobal, linkTo, toast } = usePlatform();
  const granularityRaw = pageParam('granularity');
  const percentileRaw = pageParam('percentile');
  const sortRaw = pageParam('sort');
  const bucketRaw = pageParam('bucket');
  const binRaw = pageParam('bin');
  const pageRaw = pageParam('page');
  const hours = periodHours(global);
  const granularityResult = resolveGranularity(granularityRaw, hours);
  const tailResult = resolveTail(percentileRaw);
  const sortResult = parseSortParam(sortRaw);
  const bucketResult = parseBucket(bucketRaw, granularityResult.ok ? granularityResult.value : 'hour');
  const binResult = parseBin(binRaw);
  const pageResult = parsePageIndex(pageRaw);
  const invalidPage = !granularityResult.ok || !tailResult.ok || !sortResult.ok || !bucketResult.ok || !binResult.ok || !pageResult.ok;
  const granularity: Granularity = granularityResult.ok ? granularityResult.value : 'hour';
  const tailMode: TailMode = tailResult.ok ? tailResult.value : 'p95';
  const sortSpec = sortResult.ok ? sortResult : { ok: true as const, id: 'cycleMin' as const, desc: true, explicit: false };
  const bucket = bucketResult.ok ? bucketResult.value : null;
  const bin = binResult.ok ? binResult.value : null;
  const periodReady = global.from !== null && global.to !== null;
  const metric = resolveMetric(global);
  const cycleVersion = cycleVersionOf(metric);
  const enabled = !invalidPage && periodReady && cycleVersion !== null;
  const ko = lang === 'ko';

  const [reload, setReload] = useState(0);
  // A global-Context change clears page/bucket/bin in the kernel (manifest contextResetKeys); pages write no reset effect.

  const bucketRange = bucket ? { from: bucket, to: bucketEnd(bucket, granularity) } : null;
  // The server resolves the computation version from the applied metric pair; the page only gates the unconfirmed pair.
  const kpi = useMenuQuery(cycleKpiEndpoint, NO_PARAMS, enabled);
  const trend = useMenuQuery(cycleTrendEndpoint, { granularity }, enabled);
  const dist = useMenuQuery(cycleDistEndpoint, NO_PARAMS, enabled);
  const slowPages = useMenuFetch(cycleSlowPageEndpoint);
  const exports = useMenuFetch(cycleExportEndpoint);
  const listFilter = { tail: tailMode, granularity, bucket, bin };

  const columns = useMemo<PlatformColumn<SlowRow>[]>(() => [
    { id: 'equipmentId', header: 'Equipment', cell: row => <span className="t-mono">{row.equipmentId}</span> },
    { id: 'room', header: 'room_name', cell: row => <span className="t-mono">{row.room}</span> },
    { id: 'recipe', header: 'Recipe', cell: row => <span className="t-mono">{row.recipe}</span> },
    { id: 'lotId', header: 'Lot', cell: row => <span className="t-mono">{row.lotId}</span> },
    {
      id: 'anchor', header: ko ? '시작' : 'Start', cell: row => <span className="t-mono tabular">{row.anchor.replace('T', ' ')}</span>,
      // The cell shows the wall-clock anchor space-separated (§6.3); the export shows the same text.
      exportValue: row => row.anchor.replace('T', ' '),
    },
    {
      id: 'cycleMin', header: ko ? '사이클타임 (분)' : 'Cycle time (min)', align: 'right',
      cell: row => <span className="tabular">{formatMin(row.cycleMin, lang)}</span>,
    },
    {
      id: 'delta', header: ko ? 'P95 대비' : 'vs P95', align: 'right',
      cell: row => {
        const value = row.delta;
        return <span className={value !== null && value > 0 ? 'tabular text-text-danger-label' : 'tabular text-text-secondary'}>{formatDelta(value, lang)}</span>;
      },
    },
    {
      id: 'quality', header: ko ? '품질' : 'Quality',
      cell: row => qualityBadge(row.quality, ko),
      // The cell shows a label badge; the export shows the same text. Numbers (cycleMin, delta) stay numbers.
      exportValue: row => qualityLabel(row.quality, ko),
    },
  ], [ko, lang]);

  const filterKey = JSON.stringify({ tail: tailMode, bucket: bucketRange, bin, sort: sortRaw, reload });
  const unknown = ko ? '미확인' : 'Unknown';
  const granularityPending = granularityRaw === null && hours === null;

  const pageErrors = [
    !granularityResult.ok ? `granularity=${granularityRaw}` : null,
    !tailResult.ok ? `percentile=${percentileRaw}` : null,
    !sortResult.ok ? `sort=${sortRaw}` : null,
    !bucketResult.ok ? `bucket=${bucketRaw}` : null,
    !binResult.ok ? `bin=${binRaw}` : null,
    !pageResult.ok ? `page=${pageRaw}` : null,
  ].filter((item): item is string => item !== null);

  return <PlatformPage
    description={ko
      ? '적용된 전역 기간·설비의 사이클타임입니다. 분위수·느린 실행 기준은 Candidate이고, 점·분포 선택은 목록만 줄입니다.'
      : 'Cycle time for the applied global period and equipment. Percentiles are Candidate; point and histogram choices filter only the list.'}
    secondaryActions={<Button variant="secondary" size="sm" onClick={() => { kpi.refetch(); trend.refetch(); dist.refetch(); setReload(n => n + 1); if (pageRaw !== null) setPage({ page: null }, { replace: true }); }}><RotateCw className="size-3.5" aria-hidden />{ko ? '새로고침' : 'Refresh'}</Button>}
    dataTrustSummary={kpi.response?.trust ? <DataTrustIndicator trust={kpi.response.trust} assessments={kpi.response.assessments} /> : undefined}
    contextExtension={<div className="space-y-2">
      <MetricBanner metric={metric} />
      <PageFilterBar label={ko ? '페이지 필터' : 'Page filter'} fields={[
        { kind: 'custom', key: 'granularity', label: ko ? '집계' : 'Grain', content: <div className="flex flex-wrap items-center gap-1">
          {(['hour', 'day', 'week'] as const).map(value => <button key={value} type="button" aria-pressed={!granularityPending && granularityResult.ok && granularity === value}
            className={!granularityPending && granularityResult.ok && granularity === value ? 'h-8 rounded-md bg-accent-primary-soft px-2 text-[12px] font-medium text-accent-primary' : 'h-8 rounded-md px-2 text-[12px] text-text-secondary hover:bg-surface-sunken'}
            onClick={() => setPage({ granularity: value, bucket: null, page: null })}>{value === 'hour' ? (ko ? '시간' : 'Hour') : value === 'day' ? (ko ? '일' : 'Day') : (ko ? '주' : 'Week')}</button>)}
        </div> },
        { kind: 'select', key: 'percentile', label: cycleTailFilterLabel(ko ? 'ko' : 'en'), value: tailResult.ok ? tailMode : percentileRaw ?? '', options: [
          { value: 'p95', label: '≥ P95' }, { value: 'p50', label: '≥ P50' }, { value: 'all', label: ko ? '전체 실행' : 'All executions' },
        ], onValueChange: value => setPage({ percentile: value, page: null }) },
        { kind: 'select', key: 'sort', label: ko ? '정렬' : 'Sort', value: sortResult.ok ? encodeSort(sortSpec.id, sortSpec.desc) : sortRaw ?? '', options: [
          { value: 'cycleMin:desc', label: ko ? '사이클타임 내림차순' : 'Cycle time descending' },
          { value: 'cycleMin:asc', label: ko ? '사이클타임 오름차순' : 'Cycle time ascending' },
          { value: 'delta:desc', label: ko ? 'P95 대비 내림차순' : 'vs P95 descending' },
          { value: 'anchor:desc', label: ko ? '시작 최신' : 'Start newest' },
          { value: 'anchor:asc', label: ko ? '시작 오래된' : 'Start oldest' },
          { value: 'equipmentId:asc', label: 'Equipment A→Z' },
        ], onValueChange: value => setPage({ sort: value === DEFAULT_SORT ? null : value, page: null }) },
      ]} actions={<Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-[12px]" onClick={() => setPage({ granularity: null, percentile: null, sort: null, bucket: null, bin: null, page: null })}>{ko ? '페이지 조건 기본값' : 'Reset page filters'}</Button>} />
      <p className="text-[12px] text-text-muted">
        {ko
          ? `집계 기본값은 기간 ≤48h이면 hour, 아니면 day${!granularityResult.ok || granularityResult.explicit ? '' : ` (지금 ${granularity}, URL에 없음)`}. 꼬리 기본값은 ≥ P95 (Candidate, 동률 포함)이며 KPI 모집단을 다시 줄이지 않습니다. 버킷·분포 구간은 URL 키 bucket·bin에, 정렬·페이지는 sort·page에 남습니다.`
          : `Default grain is hour when the period is ≤48h, otherwise day${!granularityResult.ok || granularityResult.explicit ? '' : ` (now ${granularity}, not in the URL)`}. Default tail is ≥ P95 (Candidate, ties included) and does not shrink the KPI population. Bucket and histogram selections stay in the URL keys bucket and bin; sort and page are URL keys too.`}
      </p>
      {(bucketRange || bin) && <div className="flex flex-wrap items-center gap-2">
        {bucketRange && <FilterChip label={ko ? '버킷' : 'Bucket'} value={`${bucketRange.from.replace('T', ' ')} → ${bucketRange.to.replace('T', ' ')}`} onClear={() => setPage({ bucket: null })} clearLabel={ko ? '버킷 필터 해제' : 'Clear bucket filter'} />}
        {bin && <FilterChip label={ko ? '분포 구간' : 'Histogram'} value={bin.from === bin.to ? bin.from : `${bin.from} – ${bin.to}`} onClear={() => setPage({ bin: null })} clearLabel={ko ? '분포 필터 해제' : 'Clear histogram filter'} />}
      </div>}
    </div>}
  >
    {invalidPage ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={ko ? '페이지 키 값이 올바르지 않습니다' : 'Invalid page key'}
      body={ko
          ? `${pageErrors.join(', ')} 은 이 화면의 등록 값이 아닙니다. hour|day|week, p50|p95|all, column:asc|desc, bucket=경계 시각, bin=구간|from..to, page=1 이상 정수 만 허용하며 다른 값으로 바꾸지 않습니다.`
        : `${pageErrors.join(', ')} is not a registered value. Allowed: hour|day|week, p50|p95|all, column:asc|desc, bucket=aligned timestamp, bin=id|from..to, page=integer ≥ 1. Nothing was substituted.`} />
      : !periodReady ? <p className="text-[13px] text-text-muted">{ko ? '전역 기간이 URL에 확정되면 조회합니다.' : 'The query starts once the global period is in the URL.'}</p>
        : <div className="space-y-4">
          <div className="relative pt-6" data-testid="cycle-kpi">
            <QueryView widgetName={ko ? '사이클타임 요약' : 'Cycle time summary'} query={kpi}>
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
            <QueryView widgetName={ko ? '사이클타임 추세' : 'Cycle time trend'} query={trend} skeletonHeight={280}>
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
                  { id: 'p50-prev', name: ko ? 'P50 이전 기간' : 'P50 previous period', color: 'chart-purple', points: data.previous.p50 },
                  { id: 'p95-prev', name: ko ? 'P95 이전 기간' : 'P95 previous period', color: 'cat-amber', points: data.previous.p95, dashed: true },
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
                  setPage({ bucket: start, page: null });
                }}
              />}
            </QueryView>
          </div>

          <div className="relative pt-6">
            <QueryView widgetName={ko ? '사이클타임 분포' : 'Cycle time distribution'} query={dist} skeletonHeight={220}>
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
                selectionActions={selection => <Button size="sm" className="h-7 px-2 text-[12px]" onClick={() => setPage({ bin: selection.from === selection.to ? selection.from : `${selection.from}..${selection.to}`, page: null })}>{ko ? '이 구간 실행 보기' : 'Show executions in this range'}</Button>}
              />}
            </QueryView>
          </div>

          <PlatformDataTable<SlowRow>
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
            urlState={{
              page: pageResult.ok && pageResult.page !== 1 ? pageResult.page : null,
              sorting: [{ id: sortSpec.id, desc: sortSpec.desc }],
              onChange: ({ page, sorting }) => {
                const first = sorting[0];
                const nextSort = first ? encodeSort(first.id, first.desc) : null;
                if (nextSort === null) { setPage({ sort: null, page: null }); return; } // header removal toggle restores the absent default
                if (nextSort === encodeSort(sortSpec.id, sortSpec.desc)) { setPage({ page: page === null ? null : String(page) }); return; } // pagination keeps the sort untouched
                setPage({ sort: nextSort === DEFAULT_SORT ? null : nextSort, page: null }); // header sort gesture resets the page with the sort
              },
            }}
            // Table-owned export (#173): the page only says how to read the rows; the table builds the file and toasts.
            // No confirmed metric version → no export menu (D-9).
            exportRows={exportRowsWhenConfirmed(cycleVersion, (request, signal) => exports.fetch(exportParams(listFilter, request), signal))}
            exportFilterSummary={exportFilterSummary(listFilter, ko)} exportContext={cycleExportEndpoint.context}
            exportNote={ko ? '페이지 필터가 적용된 목록이며 KPI 모집단 전체가 아닙니다' : 'Page filters apply; this is not the full KPI population'}
            emptyAction={(bucketRange || bin || tailMode !== 'p95')
              ? <Button size="sm" variant="secondary" onClick={() => setPage({ bucket: null, bin: null, percentile: 'all', page: null })}>{ko ? '목록 필터 해제' : 'Clear list filters'}</Button>
              : undefined}
            rowAction={row => <PlatformLink className="text-[12px] font-medium text-accent-primary hover:underline" href={linkTo('execution-detail', { params: { equipmentId: row.equipmentId }, page: { entityType: 'job', anchor: row.anchor }, returnTo: true })}>{ko ? '상세' : 'Detail'}</PlatformLink>}
            bulkActions={ids => <Button size="sm" className="h-7 px-2 text-[12px]" onClick={() => {
              const equipmentIds = [...new Set(ids.map(equipmentIdFromKey))];
              setGlobal({ selection: equipmentIds });
              toast(ko ? `설비 ${equipmentIds.length}대를 전역 Selection으로 적용했습니다. 다른 메뉴에도 유지됩니다.` : `Applied ${equipmentIds.length} equipment as the global selection. It carries across menus.`);
            }}>{ko ? '선택 설비로 분석 좁히기' : 'Narrow analysis to selected equipment'}</Button>}
            loadPage={(query, signal) => slowPages.fetch({ ...listFilter, ...query, sorting: [{ id: sortSpec.id, desc: sortSpec.desc }] }, signal)}
          />
          <p className="text-[12px] text-text-muted">{ko
            ? '품질 배지는 Candidate입니다. unknown은 미확정이며 정상으로 채우지 않습니다. review는 합성 플래그이고 불량·수율이 아닙니다.'
            : 'Quality badges are Candidate. unknown stays unconfirmed and is not filled in as pass. review is a synthetic flag, not a defect or yield.'}</p>
          {kpi.response && kpi.response.outcome === 'ok' && <DataTrustIndicator trust={kpi.response.trust} assessments={kpi.response.assessments} />}
        </div>}
  </PlatformPage>;
}

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
  const label = qualityLabel(quality, ko);
  return quality === 'review'
    ? <StatusBadge tone="warning">{label}</StatusBadge>
    : <StatusBadge tone="neutral">{label}</StatusBadge>;
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
