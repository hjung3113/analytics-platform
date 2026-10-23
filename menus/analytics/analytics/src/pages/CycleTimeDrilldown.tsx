import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Gauge, Hash, RotateCw, Timer, X } from 'lucide-react';
import { periodHours, type GlobalContext, type Pair, type Trust } from '@ap/contracts';
import { type PageProps, PlatformLink, invalidValueSentence, useI18n, useMenuFetch, useMenuQuery, useQueryDraft, usePlatform } from '@ap/kernel';
import { PanelWorkspace, RowAction, AnalysisChartFrame, DataTrustIndicator, PageFilterBar, type Delta, type PlatformColumn, parsePageIndex, PlatformDataTable, PlatformPage, QueryView, StatCard, StateMessage } from '@ap/components';
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

function filterVocabulary(lang: 'ko' | 'en') {
  const ko = lang === 'ko';
  return {
    grainFieldLabel: ko ? '집계' : 'Grain',
    grainLabel: { hour: ko ? '시간' : 'Hour', day: ko ? '일' : 'Day', week: ko ? '주' : 'Week' } as const,
    tailFieldLabel: cycleTailFilterLabel(lang),
    tailOptions: [{ value: 'p95', label: '≥ P95' }, { value: 'p50', label: '≥ P50' }, { value: 'all', label: ko ? '전체 실행' : 'All executions' }],
    sortFieldLabel: ko ? '정렬' : 'Sort',
    sortOptions: [
      { value: 'cycleMin:desc', label: ko ? '사이클타임 내림차순' : 'Cycle time descending' },
      { value: 'cycleMin:asc', label: ko ? '사이클타임 오름차순' : 'Cycle time ascending' },
      { value: 'delta:desc', label: ko ? 'P95 대비 내림차순' : 'vs P95 descending' },
      { value: 'anchor:desc', label: ko ? '시작 최신' : 'Start newest' },
      { value: 'anchor:asc', label: ko ? '시작 오래된' : 'Start oldest' },
      { value: 'equipmentId:asc', label: 'Equipment A→Z' },
    ],
    unknownRaw: (value: string | null) => ko ? `이 화면에서 쓸 수 없는 값: ${value ?? ''}` : `Not a value this page can use: ${value ?? ''}`,
  };
}

function summaryFor(global: GlobalContext, page: readonly Pair[], lang: 'ko' | 'en') {
  const ko = lang === 'ko';
  const raw = (key: string) => page.find(([k]) => k === key)?.[1] ?? null;
  const grain = resolveGranularity(raw('granularity'), periodHours(global));
  const tail = resolveTail(raw('percentile'));
  const sort = parseSortParam(raw('sort'));
  const { grainFieldLabel, grainLabel, tailFieldLabel, tailOptions, sortFieldLabel, sortOptions, unknownRaw } = filterVocabulary(lang);
  return [
    { key: 'granularity', label: grainFieldLabel, value: grain.ok ? grainLabel[grain.value] : unknownRaw(raw('granularity')) },
    { key: 'percentile', label: tailFieldLabel, value: tail.ok ? tailOptions.find(option => option.value === tail.value)?.label ?? tail.value : unknownRaw(raw('percentile')) },
    { key: 'sort', label: sortFieldLabel, value: sort.ok ? sortOptions.find(option => option.value === encodeSort(sort.id, sort.desc))?.label ?? encodeSort(sort.id, sort.desc) : unknownRaw(raw('sort')) },
    ...(['bucket', 'bin', 'page'] as const).filter(key => raw(key) !== null).map(key => ({ key, label: key === 'bucket' ? (ko ? '버킷' : 'Bucket') : key === 'bin' ? (ko ? '분포 구간' : 'Histogram') : (ko ? '페이지' : 'Page'), value: raw(key)! })),
  ];
}

export default function CycleTimeDrilldown(_: PageProps) {
  const { t, lang } = useI18n();
  const { global, page, pageParam, setPage, setGlobal, linkTo, toast, route } = usePlatform();
  const queryDraft = useQueryDraft();
  const draftParam = (key: string) => queryDraft.draft.page.find(([k]) => k === key)?.[1] ?? null;
  const draftHours = periodHours(queryDraft.draft.global);
  const draftGrain = resolveGranularity(draftParam('granularity'), draftHours);
  const draftTail = resolveTail(draftParam('percentile'));
  const draftSort = parseSortParam(draftParam('sort'));
  const draftBucket = parseBucket(draftParam('bucket'), draftGrain.ok ? draftGrain.value : 'hour');
  const draftBin = parseBin(draftParam('bin'));
  const draftIndex = parsePageIndex(draftParam('page'));
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

  const filterKey = JSON.stringify({ tail: tailMode, granularity, bucket: bucketRange, bin, sort: sortRaw, reload });
  const unknown = ko ? '미확인' : 'Not confirmed';
  const granularityPending = draftParam('granularity') === null && draftHours === null;

  // #304 FIX1 (06 §19): each invalid field keeps its user name and the raw value as entered (quoted,
  // untruncated), one sentence per field — never `key=value`.
  const pageRefusals = [
    !granularityResult.ok ? invalidValueSentence(lang, 'plain', { ko: '집계', en: 'Grain' }, granularityRaw ?? '') : null,
    !tailResult.ok ? invalidValueSentence(lang, 'plain', { ko: '느린 실행 기준', en: 'Slow executions' }, percentileRaw ?? '') : null,
    !sortResult.ok ? invalidValueSentence(lang, 'plain', { ko: '정렬', en: 'Sort' }, sortRaw ?? '') : null,
    !bucketResult.ok ? invalidValueSentence(lang, 'plain', { ko: '버킷', en: 'Bucket' }, bucketRaw ?? '') : null,
    !binResult.ok ? invalidValueSentence(lang, 'plain', { ko: '분포 구간', en: 'Histogram' }, binRaw ?? '') : null,
    !pageResult.ok ? invalidValueSentence(lang, 'plain', { ko: '페이지', en: 'Page' }, pageRaw ?? '') : null,
  ].filter((sentence): sentence is string => sentence !== null);

  // Field labels and option labels shared by the edit controls and the collapsed summary. The summary states
  // facts: pending stays pending and unknown raw values are shown as unknown, never as a default value label.
  const { grainFieldLabel, grainLabel, tailFieldLabel, tailOptions, sortFieldLabel, sortOptions, unknownRaw } = filterVocabulary(lang);
  const pageSummary = summaryFor(queryDraft.draft.global, queryDraft.draft.page, lang);
  const appliedPageSummary = summaryFor(global, page, lang);
  const historyPageSummary = useCallback((candidate: GlobalContext, page: readonly Pair[]) => summaryFor(candidate, page, lang), [lang]);
  const issues = [
    ['granularity', grainFieldLabel, draftGrain.ok], ['percentile', tailFieldLabel, draftTail.ok], ['sort', sortFieldLabel, draftSort.ok],
    ['bucket', ko ? '버킷' : 'Bucket', draftBucket.ok], ['bin', ko ? '분포 구간' : 'Histogram', draftBin.ok], ['page', ko ? '페이지' : 'Page', draftIndex.ok],
  ].filter(([, , ok]) => !ok).map(([key, label]) => ({ key: String(key), label: String(label), reason: unknownRaw(draftParam(String(key))) }));
  const resetFilters = <Button type="button" variant="ghost" size="toolbar" onClick={() => queryDraft.setDraftPage({ granularity: null, percentile: null, sort: null, bucket: null, bin: null, page: null })}>{ko ? '페이지 조건 기본값' : 'Reset page filters'}</Button>;

  return <PlatformPage layout="fill"
    queryResult={{ completedAt: kpi.completedAt, status: kpi.status }}
    queryBarExtension={{ pageSummary, appliedPageSummary, historyPageSummary, issues }}
    description={ko
      ? '적용된 기간·설비의 사이클타임입니다. 점·분포 선택은 목록만 줄입니다.'
      : 'Cycle time for the applied period and equipment. Point and histogram choices filter only the list.'}
    secondaryActions={<Button variant="secondary" size="sm" onClick={() => { kpi.refetch(); trend.refetch(); dist.refetch(); setReload(n => n + 1); if (pageRaw !== null) setPage({ page: null }, { replace: true }); }}><RotateCw className="size-3.5" aria-hidden />{ko ? '새로고침' : 'Refresh'}</Button>}
    dataTrustSummary={kpi.response?.trust ? <DataTrustIndicator trust={kpi.response.trust} assessments={kpi.response.assessments} /> : undefined}
    contextNotes={[
      <MetricBanner key="metric" metric={metric} />,
      <p key="grain" className="text-xs text-text-muted">
        {ko
          ? `집계 기본값은 기간이 48시간 이하면 시간, 그보다 길면 일입니다${!draftGrain.ok || draftGrain.explicit ? '' : ` (지금 ${draftGrain.value === 'hour' ? '시간' : draftGrain.value === 'day' ? '일' : '주'})`}. 느린 실행은 표시된 P95 이상(같은 값 포함)이며 요약 모집단은 줄이지 않습니다.`
          : `The default grain is hours when the period is 48 hours or less, otherwise days${!draftGrain.ok || draftGrain.explicit ? '' : ` (now ${draftGrain.value})`}. Slow means at or above the displayed P95, including ties, and does not shrink the summary population.`}
      </p>,
    ]}
    contextExtension={<div className="space-y-2">
      <PageFilterBar mode="draft" hasPendingChanges={queryDraft.dirty.length > 0} label={t('pageFilter')} collapsible preferenceKey={route?.menu.id ?? ''} summaryItems={pageSummary} collapsedActions={resetFilters} fields={[
        { kind: 'custom', key: 'granularity', label: grainFieldLabel, content: <div className="flex flex-wrap items-center gap-1">
          {(['hour', 'day', 'week'] as const).map(value => {
            const pressed = !granularityPending && draftGrain.ok && draftGrain.value === value;
            return <Button key={value} type="button" size="md" variant={pressed ? 'secondary' : 'ghost'} aria-pressed={pressed}
              onClick={() => queryDraft.setDraftPage({ granularity: value, bucket: null, page: null })}>{grainLabel[value]}</Button>;
          })}
        </div> },
        { kind: 'select', key: 'percentile', label: tailFieldLabel, value: draftTail.ok ? draftTail.value : draftParam('percentile') ?? '', options: tailOptions, onValueChange: value => queryDraft.setDraftPage({ percentile: value, page: null }) },
        { kind: 'select', key: 'sort', label: sortFieldLabel, value: draftSort.ok ? encodeSort(draftSort.id, draftSort.desc) : draftParam('sort') ?? '', options: sortOptions, onValueChange: value => queryDraft.setDraftPage({ sort: value === DEFAULT_SORT ? null : value, page: null }) },
      ]} actions={resetFilters} />
      {(bucketRange || bin) && <div className="flex flex-wrap items-center gap-2">
        {bucketRange && <FilterChip label={ko ? '버킷' : 'Bucket'} value={`${bucketRange.from.replace('T', ' ')} → ${bucketRange.to.replace('T', ' ')}`} onClear={() => setPage({ bucket: null })} clearLabel={ko ? '버킷 필터 해제' : 'Clear bucket filter'} />}
        {bin && <FilterChip label={ko ? '분포 구간' : 'Histogram'} value={bin.from === bin.to ? bin.from : `${bin.from} – ${bin.to}`} onClear={() => setPage({ bin: null })} clearLabel={ko ? '분포 필터 해제' : 'Clear histogram filter'} />}
      </div>}
    </div>}
  >
    {invalidPage ? <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />} title={ko ? '페이지 키 값이 올바르지 않습니다' : 'Invalid page key'}
      body={pageRefusals.map((sentence, index) => <p key={index}>{sentence} {ko ? '페이지 조건을 기본값으로 되돌리세요.' : 'Reset the page conditions.'}</p>)} />
      : kpi.status === 'idle' ? <QueryView query={kpi}>{() => null}</QueryView>
        : <PanelWorkspace
          persistKey="drilldown"
          label={{ ko: '사이클타임 분석 영역', en: 'Cycle time workspace' }}
          initialPreset="balanced"
          presets={[
            { id: 'balanced', label: { ko: '기본', en: 'Balanced' }, layout: { type: 'branch', dir: 'row', sizes: [68, 32], children: [
              { type: 'group', panels: ['trend'] },
              { type: 'branch', dir: 'column', sizes: [38, 62], children: [{ type: 'group', panels: ['summary'] }, { type: 'group', panels: ['distribution', 'slow'] }] },
            ] } },
            { id: 'focus', label: { ko: '집중', en: 'Focus' }, layout: { type: 'branch', dir: 'row', sizes: [70, 30], children: [
              { type: 'group', panels: ['trend'] },
              { type: 'group', panels: ['summary', 'distribution', 'slow'] },
            ] } },
            // A natural start for the stacked height mode (#686): one row per question, the summary and the distribution side by side.
            { id: 'column', label: { ko: '세로', en: 'Stacked' }, layout: { type: 'branch', dir: 'column', sizes: [34, 33, 33], children: [
              { type: 'group', panels: ['trend'] },
              { type: 'branch', dir: 'row', sizes: [40, 60], children: [{ type: 'group', panels: ['summary'] }, { type: 'group', panels: ['distribution'] }] },
              { type: 'group', panels: ['slow'] },
            ] } },
          ]}
          panels={[
          { id: 'summary', title: { ko: '사이클타임 요약', en: 'Cycle time summary' }, render: () => <div className="space-y-3 p-3">
          <div className="relative" data-testid="cycle-kpi">
            <QueryView widgetName={ko ? '사이클타임 요약' : 'Cycle time summary'} query={kpi}>
              {data => <div className="grid grid-cols-2 gap-3">
                <StatCard icon={Timer} chip="blue" label="P50" value={formatMin(data.p50, lang)} unit={ko ? '분' : 'min'} delta={cycleDelta(data.p50, data.prevP50)} caption={ko ? '적용 모집단' : 'Applied population'} />
                <StatCard icon={Gauge} chip="amber" label="P95" value={formatMin(data.p95, lang)} unit={ko ? '분' : 'min'} delta={cycleDelta(data.p95, data.prevP95)} caption={ko ? '적용 모집단' : 'Applied population'} />
                <StatCard icon={Hash} chip="teal" label={ko ? '실행 수' : 'Executions'} value={data.count.toLocaleString(ko ? 'ko-KR' : 'en-US')} caption={ko ? '완료된 합성 Job' : 'Completed synthetic jobs'} />
                <StatCard icon={AlertTriangle} chip="purple" label={ko ? '느린 실행 (P95 기준)' : 'Slow executions (P95 threshold)'} value={data.slowCount.toLocaleString(ko ? 'ko-KR' : 'en-US')} caption={ko ? '표시된 P95 이상' : 'At or above the displayed P95'} />
              </div>}
            </QueryView>
          </div>
          <p className="text-xs text-text-muted">{ko
            ? '0.1분 단위로 반올림합니다. 진행 중인 Job은 넣지 않습니다. 느린 실행은 표시된 P95 이상(같은 값 포함)입니다. 증감은 직전 같은 길이의 기간과 비교하며, 줄어든 것을 개선으로 칠합니다. 빈 구간은 0이 아닙니다.'
            : 'Rounded to 0.1 min. In-progress jobs are not included. Slow means at or above the displayed P95, including ties. Deltas compare with the previous period of the same length and treat a decrease as an improvement. An empty bucket is not zero.'}</p>
          </div> },
            { id: 'trend', primary: true, minWidth: 480, minHeight: 320, title: { ko: '사이클타임 추세', en: 'Cycle time trend' }, render: () =>
            <QueryView widgetName={ko ? '사이클타임 추세' : 'Cycle time trend'} query={trend} skeletonHeight={280}>
              {(data, response) => <AnalysisChartFrame
                chartId="cycle-time-trend"
                size="fill"
                title={ko ? '사이클타임 추세' : 'Cycle time trend'}
                description={ko ? `버킷별 P50/P95 · ${granularity === 'hour' ? '시간' : granularity === 'day' ? '일' : '주'} · 단위 분` : `P50/P95 by bucket · ${granularity === 'hour' ? 'hour' : granularity === 'day' ? 'day' : 'week'} · minutes`}
                metricVersion={metricLabel(metric, ko)}
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
            },
            { id: 'distribution', title: { ko: '사이클타임 분포', en: 'Cycle time distribution' }, render: () =>
            <QueryView widgetName={ko ? '사이클타임 분포' : 'Cycle time distribution'} query={dist} skeletonHeight={220}>
              {(data, response) => <AnalysisChartFrame
                chartId="cycle-time-distribution"
                title={ko ? '사이클타임 분포' : 'Cycle time distribution'}
                description={ko ? '구간으로 나눕니다. “이 구간 실행 보기”만 목록을 줄입니다.' : 'Split into bins. Only “Show executions in this range” filters the list.'}
                metricVersion={metricLabel(metric, ko)}
                xType="category"
                unit={ko ? '건' : 'jobs'}
                valueFormat={value => Math.round(value).toLocaleString(ko ? 'ko-KR' : 'en-US')}
                size="fill"
                series={[{ id: 'hist', name: ko ? '실행 수' : 'Executions', color: 'chart-blue', kind: 'bar', points: data.bins.map((item): [string, number] => [item.id, item.count]) }]}
                trust={chartTrust(response.trust, unknown)}
                selectionActions={selection => <Button size="toolbar" onClick={() => setPage({ bin: selection.from === selection.to ? selection.from : `${selection.from}..${selection.to}`, page: null })}>{ko ? '이 구간 실행 보기' : 'Show executions in this range'}</Button>}
              />}
            </QueryView>
            },
          { id: 'slow', title: { ko: '느린 실행', en: 'Slow executions' }, render: () => <div className="space-y-3 p-3">
          <PlatformDataTable<SlowRow>
            title={ko ? '느린 실행' : 'Slow executions'}
            subtitle={ko
              ? `페이지 필터 적용 목록입니다. 느린 실행 기준 ${tailMode === 'all' ? '전체' : `≥ ${tailMode.toUpperCase()}`} · 모집단 ${kpi.response === null ? '…건' : kpi.response.outcome === 'ok' ? `${kpi.response.data!.count.toLocaleString('ko-KR')}건` : '확인할 수 없음'}.`
              : `Page-filtered list. Slow-execution predicate ${tailMode === 'all' ? 'all' : `≥ ${tailMode.toUpperCase()}`} · population ${kpi.response === null ? '…' : kpi.response.outcome === 'ok' ? kpi.response.data!.count.toLocaleString('en-US') : 'unavailable'}.`}
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
              onChange: ({ page, sorting }, reason) => {
                const first = sorting[0];
                const nextSort = first ? encodeSort(first.id, first.desc) : null;
                const history = { replace: reason === 'clamp' };
                if (nextSort === null) { setPage({ sort: null, page: null }, history); return; } // header removal toggle restores the absent default
                if (nextSort === encodeSort(sortSpec.id, sortSpec.desc)) { setPage({ page: page === null ? null : String(page) }, history); return; } // pagination keeps the sort untouched
                setPage({ sort: nextSort === DEFAULT_SORT ? null : nextSort, page: null }, history); // header sort gesture resets the page with the sort
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
            rowAction={(row, { compact }) => {
              const href = linkTo('execution-detail', { params: { equipmentId: row.equipmentId }, page: { entityType: 'job', anchor: row.anchor }, returnTo: true });
              const name = ko ? `${row.equipmentId} · ${row.anchor.replace('T', ' ')} 상세` : `Detail ${row.equipmentId} · ${row.anchor.replace('T', ' ')}`;
              return <RowAction compact={compact} icon={ArrowRight} label={name} text={ko ? '상세' : 'Detail'} textLink="primary" link={<PlatformLink href={href} />} />;
            }}
            bulkActions={ids => <Button size="toolbar" onClick={() => {
              const equipmentIds = [...new Set(ids.map(equipmentIdFromKey))];
              setGlobal({ selection: equipmentIds });
              toast(ko ? `설비 ${equipmentIds.length}대를 설비 선택으로 적용했습니다. 다른 메뉴에도 유지됩니다.` : `Applied ${equipmentIds.length} equipment as the equipment selection. It carries across menus.`);
            }}>{ko ? '선택 설비로 분석 좁히기' : 'Narrow analysis to selected equipment'}</Button>}
            loadPage={(query, signal) => slowPages.fetch({ ...listFilter, ...query, sorting: [{ id: sortSpec.id, desc: sortSpec.desc }] }, signal)}
          />
          <p className="text-xs text-text-muted">{ko
            ? '미확정은 정상으로 채우지 않습니다. 검토 표시는 불량·수율이 아닙니다.'
            : 'Unconfirmed is not filled in as pass. A review flag is not a defect or a yield.'}</p>
          {kpi.response && kpi.response.outcome === 'ok' && <DataTrustIndicator trust={kpi.response.trust} assessments={kpi.response.assessments} />}
          </div> },
          ]}
        />}
  </PlatformPage>;
}

function MetricBanner({ metric }: { metric: ResolvedMetric }) {
  const { lang } = useI18n();
  const ko = lang === 'ko';
  if (metric.kind === 'unconfirmed') {
    return <p className="text-xs text-text-secondary" data-testid="metric-banner">{ko ? `${metric.metricId} 버전이 확인되지 않았습니다. 버전을 고르세요.` : `${metric.metricId} has no confirmed version. Pick a version.`}</p>;
  }
  const versionNote = metric.metricVersion === '4'
    ? (ko ? '분은 생산성 개요의 cycle_time v4와 같습니다.' : 'Minutes match productivity’s cycle_time v4.')
    : CYCLE_VERSION_NOTE[ko ? 'ko' : 'en'];
  if (metric.kind === 'page-default') {
    return <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary" data-testid="metric-banner">
      <StatusBadge tone="info">{ko ? '페이지 기본값' : 'Page default'}</StatusBadge>
      <span className="t-mono">{PAGE_METRIC_ID} v{metric.metricVersion}</span>
      <span>{ko ? '전역 지표 쌍이 없습니다. 계산은 이 값을 사용합니다.' : 'No global metric pair. Calculations use this value.'}</span>
      <span>{versionNote}</span>
    </p>;
  }
  if (metric.kind === 'not-applied') {
    return <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary" data-testid="metric-banner">
      <StatusBadge tone="warning">{ko ? '미적용' : 'Not applied'}</StatusBadge>
      <span className="t-mono">{metric.globalMetricId}{metric.globalMetricVersion ? ` v${metric.globalMetricVersion}` : ''}</span>
      <span>{ko
        ? `전역 지표가 ${PAGE_METRIC_ID}이 아니라서 조회에 쓰지 않습니다. 계산은 페이지 기본값 ${PAGE_METRIC_ID} v${metric.metricVersion}이며 전역 쌍은 유지합니다.`
        : `The global metric is not ${PAGE_METRIC_ID}, so it is not used for this query. Calculations use the page default ${PAGE_METRIC_ID} v${metric.metricVersion}; the global pair is left unchanged.`}</span>
      <span>{versionNote}</span>
    </p>;
  }
  return <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary" data-testid="metric-banner">
    <StatusBadge tone="success">{ko ? '적용' : 'Applied'}</StatusBadge>
    <span className="t-mono">{metric.metricId} v{metric.metricVersion}</span>
    <span>{metric.versionIsPageDefault
      ? (ko ? '전역 cycle_time 쌍을 적용했습니다.' : 'The global cycle_time pair is applied.')
      : (ko ? '요청한 버전 라벨을 표시합니다. 합성 데이터는 v3 시계열만 있습니다.' : 'The requested version label is shown. Synthetic data has only the v3 series.')}</span>
    <span>{versionNote}</span>
  </p>;
}

function FilterChip({ label, value, onClear, clearLabel }: { label: string; value: string; onClear: () => void; clearLabel: string }) {
  return <span className="inline-flex items-center gap-1 rounded-sm border border-border-strong bg-surface-card px-2 py-1 text-xs">
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

function metricLabel(metric: ResolvedMetric, ko: boolean): string {
  if (metric.kind === 'unconfirmed') return ko ? `${metric.metricId} 버전 미확인` : `${metric.metricId} unconfirmed`;
  const suffix = metric.kind === 'page-default'
    ? (ko ? ' · 페이지 기본' : ' page default')
    : metric.kind === 'not-applied'
      ? (ko ? ' · 페이지 기본(전역 지표 미적용)' : ' page default, global not applied')
      : '';
  return `${metric.metricId} v${metric.metricVersion}${suffix}`;
}

function chartTrust(trust: Trust | null, unknown: string) {
  if (!trust) return undefined;
  return {
    source: trust.source,
    updated: trust.updatedAt.replace('T', ' '),
    coverage: trust.coverage === null ? unknown : `${(trust.coverage * 100).toFixed(1)}%`,
  };
}
