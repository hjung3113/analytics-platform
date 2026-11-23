import { useMessages, formatText } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../messages';
import { formatWallClock, isAnswered } from '@ap/contracts';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { AlertTriangle, ArrowRight, ChartColumn, Gauge, Hash, ListFilter, RotateCw, Timer } from 'lucide-react';
import { formatNumber, periodHours, type GlobalContext, type Pair } from '@ap/contracts';
import { type PageProps, PlatformLink, useI18n, useMenuFetch, useMenuQuery, useQueryDraft, usePlatform, useSavedViewSupport } from '@ap/kernel';
import { PanelWorkspace, RowAction, AnalysisChartFrame, DataTrustIndicator, PageFilterBar, type PageFilterAppliedChip, type Delta, type PlatformColumn, parsePageIndex, PageKeyWarning, PlatformDataTable, PlatformPage, QueryView, StatCard, StateMessage, usePageKeyRules } from '@ap/components';
import { Button, StatusBadge } from '@ap/ui';
import {
  CYCLE_VERSION_NOTE, PAGE_METRIC_ID, bucketEnd, cycleDistEndpoint, cycleExportEndpoint, cycleKpiEndpoint, cycleSlowPageEndpoint,
  cycleTrendEndpoint, cycleVersionOf, resolveMetric,
  type Granularity, type ResolvedMetric, type SlowRow, type TailMode,
} from '../endpoints';
import { binText, bucketText } from '../bucket-format';
import {
  DEFAULT_SORT, bucketContaining, encodeSort, exportFilterSummary, exportParams, parseBucket, parseBin, parseSortParam, qualityLabel, resolveGranularity, resolveTail,
  cycleTailFilterLabel, executionKey, equipmentIdFromKey, exportRowsWhenConfirmed,
} from './cycleData';
import { CYCLE_TIME_SAVED_VIEW } from '../saved-view';

const NO_PARAMS = {};

function filterVocabulary(lang: 'ko' | 'en') {
  return {
    grainFieldLabel: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownGrain, lang),
    grainLabel: { hour: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownHour, lang), day: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownDay, lang), week: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownWeek, lang) } as const,
    tailFieldLabel: cycleTailFilterLabel(lang),
    tailOptions: [{ value: 'p95', label: '≥ P95' }, { value: 'p50', label: '≥ P50' }, { value: 'all', label: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownAllExecutions, lang) }],
    sortFieldLabel: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownSort, lang),
    sortOptions: [
      { value: 'cycleMin:desc', label: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownCycleTimeDescending, lang) },
      { value: 'cycleMin:asc', label: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownCycleTimeAscending, lang) },
      { value: 'delta:desc', label: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownVsP95Descending, lang) },
      { value: 'startedAt:desc', label: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownStartNewest, lang) },
      { value: 'startedAt:asc', label: formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownStartOldest, lang) },
      { value: 'equipmentId:asc', label: 'Equipment A→Z' },
    ],
    unknownRaw: (value: string | null) => formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownNotAValueThisPageCanUse, lang, { value: String(value ?? '') }),
  };
}

function summaryFor(global: GlobalContext, page: readonly Pair[], lang: 'ko' | 'en') {
  const raw = (key: string) => page.find(([k]) => k === key)?.[1] ?? null;
  const grain = resolveGranularity(raw('granularity'), periodHours(global));
  const tail = resolveTail(raw('percentile'));
  const sort = parseSortParam(raw('sort'));
  const bin = parseBin(raw('bin'));
  const { grainFieldLabel, grainLabel, tailFieldLabel, tailOptions, sortFieldLabel, sortOptions, unknownRaw } = filterVocabulary(lang);
  return [
    { key: 'granularity', label: grainFieldLabel, value: grain.ok ? grainLabel[grain.value] : unknownRaw(raw('granularity')) },
    { key: 'percentile', label: tailFieldLabel, value: tail.ok ? tailOptions.find(option => option.value === tail.value)?.label ?? tail.value : unknownRaw(raw('percentile')) },
    { key: 'sort', label: sortFieldLabel, value: sort.ok ? sortOptions.find(option => option.value === encodeSort(sort.id, sort.desc))?.label ?? encodeSort(sort.id, sort.desc) : unknownRaw(raw('sort')) },
    // One bucket/bin text with the chips (#1218 FORMAT); a value the page refuses stays the raw token, never corrected.
    ...(['bucket', 'bin', 'page'] as const).filter(key => raw(key) !== null).map(key => ({
      key,
      label: key === 'bucket' ? (formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownBucket, lang)) : key === 'bin' ? (formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownHistogram, lang)) : (formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownPage, lang)),
      value: key === 'bucket'
        ? bucketText(raw('bucket')!, grain.ok ? grain.value : 'hour', lang)
        : key === 'bin' && bin.ok && bin.value !== null ? binText(bin.value, lang)
        : raw(key)!,
    })),
  ];
}

export default function CycleTimeDrilldown(_: PageProps) {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { t, lang } = useI18n();
  const { global, page, pageParam, setPage, setGlobal, linkTo, toast, route } = usePlatform();
  useSavedViewSupport(CYCLE_TIME_SAVED_VIEW);
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
  // Rejected, never corrected (06 §6): one sentence per bad key (user name + raw value as entered) and a Reset that clears exactly those keys.
  const keys = usePageKeyRules([
    { key: 'granularity', label: ANALYTICS_MESSAGES.cycleTimeDrilldownGrain2, valid: raw => resolveGranularity(raw, hours).ok },
    { key: 'percentile', label: ANALYTICS_MESSAGES.cycleTimeDrilldownSlowExecutions, valid: raw => resolveTail(raw).ok },
    { key: 'sort', label: ANALYTICS_MESSAGES.cycleTimeDrilldownSort2, valid: raw => parseSortParam(raw).ok },
    { key: 'bucket', label: ANALYTICS_MESSAGES.cycleTimeDrilldownBucket2, valid: raw => parseBucket(raw, granularityResult.ok ? granularityResult.value : 'hour').ok },
    { key: 'bin', label: ANALYTICS_MESSAGES.cycleTimeDrilldownHistogram2, valid: raw => parseBin(raw).ok },
    { key: 'page', label: ANALYTICS_MESSAGES.cycleTimeDrilldownPage2, valid: raw => parsePageIndex(raw).ok },
  ]);

  const invalidPage = keys.invalid;
  const granularity: Granularity = granularityResult.ok ? granularityResult.value : 'hour';
  const tailMode: TailMode = tailResult.ok ? tailResult.value : 'p95';
  const sortSpec = sortResult.ok ? sortResult : { ok: true as const, id: 'cycleMin' as const, desc: true, explicit: false };
  const bucket = bucketResult.ok ? bucketResult.value : null;
  const bin = binResult.ok ? binResult.value : null;
  const periodReady = global.from !== null && global.to !== null;
  const metric = resolveMetric(global);
  const cycleVersion = cycleVersionOf(metric);
  const enabled = !invalidPage && periodReady && cycleVersion !== null;

  const [reload, setReload] = useState(0);
  // A global-Context change clears page/bucket/bin in the kernel (manifest contextResetKeys); pages write no reset effect.

  const bucketRange = bucket ? { from: bucket, to: bucketEnd(bucket, granularity) } : null;
  // The server resolves the computation version from the applied metric pair; the page only gates the unconfirmed pair.
  const kpi = useMenuQuery(cycleKpiEndpoint, NO_PARAMS, enabled);
  // keepPrevious ON (#1365, ADR-0114): another grain re-buckets the same period and Scope, so the old chart stays (refreshing) until the new buckets arrive.
  const trend = useMenuQuery(cycleTrendEndpoint, { granularity }, enabled, { keepPrevious: true });
  const dist = useMenuQuery(cycleDistEndpoint, NO_PARAMS, enabled);
  const slowPages = useMenuFetch(cycleSlowPageEndpoint);
  const exports = useMenuFetch(cycleExportEndpoint);
  const shownGrain = trend.resultParams?.granularity ?? granularity;
  const listFilter = { tail: tailMode, granularity, bucket, bin };

  const columns = useMemo<PlatformColumn<SlowRow>[]>(() => [
    { id: 'equipmentId', header: 'Equipment', cell: row => <span className="t-mono">{row.equipmentId}</span> },
    { id: 'room', header: m('cycleTimeDrilldownProcess'), cell: row => <span className="t-mono">{row.room}</span> },
    { id: 'recipe', header: 'Recipe', cell: row => <span className="t-mono">{row.recipe}</span> },
    { id: 'lotId', header: 'Lot', cell: row => <span className="t-mono">{row.lotId}</span> },
    {
      id: 'startedAt', header: m('cycleTimeDrilldownStart'), cell: row => <span className="t-mono tabular">{formatWallClock(row.startedAt)}</span>,
      // The cell shows the wall-clock start space-separated (§6.3); the export shows the same text.
      exportValue: row => formatWallClock(row.startedAt),
    },
    {
      id: 'cycleMin', header: m('cycleTimeDrilldownCycleTimeMin'), align: 'right',
      cell: row => <span className="tabular">{formatMin(row.cycleMin, lang)}</span>,
    },
    {
      id: 'delta', header: m('cycleTimeDrilldownVsP95'), align: 'right',
      cell: row => {
        const value = row.delta;
        return <span className={value !== null && value > 0 ? 'tabular text-text-danger-label' : 'tabular text-text-secondary'}>{formatDelta(value, lang)}</span>;
      },
    },
    {
      id: 'quality', header: m('cycleTimeDrilldownQuality'),
      cell: row => qualityBadge(row.quality, lang === 'ko'),
      // The cell shows a label badge; the export shows the same text. Numbers (cycleMin, delta) stay numbers.
      exportValue: row => qualityLabel(row.quality, lang === 'ko'),
    },
  ], [m, lang]);

  const filterKey = JSON.stringify({ tail: tailMode, granularity, bucket: bucketRange, bin, sort: sortRaw, reload });
  const granularityPending = draftParam('granularity') === null && draftHours === null;

  // Field labels and option labels shared by the edit controls and the collapsed summary. The summary states
  // facts: pending stays pending and unknown raw values are shown as unknown, never as a default value label.
  const { grainFieldLabel, grainLabel, tailFieldLabel, tailOptions, sortFieldLabel, sortOptions, unknownRaw } = filterVocabulary(lang);
  const pageSummary = summaryFor(queryDraft.draft.global, queryDraft.draft.page, lang);
  const appliedPageSummary = summaryFor(global, page, lang);
  // ADR-0112: a chip never touches the draft; the two narrowings still clear immediately as applied-state
  // writes. The kernel rebases the whole draft to the applied state on every address change (kernel
  // query/draft-state reconcile), so the page re-asserts the other pending values right after the write;
  // flushSync lands the rebase and the restore inside one paint, so the pending marker never flashes off.
  const queryDraftRef = useRef(queryDraft);
  useLayoutEffect(() => { queryDraftRef.current = queryDraft; });
  const clearNarrowing = useCallback((key: 'bucket' | 'bin') => {
    const { global: globalDraft, page: pageDraft } = queryDraft.draft;
    const pending = queryDraft.dirty.length > 0;
    flushSync(() => setPage({ [key]: null }));
    if (!pending) return;
    const restored: Partial<GlobalContext> = { ...globalDraft };
    delete restored.scopeId;
    queryDraftRef.current.setDraftGlobal(restored);
    const keys = new Set([...pageDraft, ...page].map(([name]) => name));
    keys.delete(key);
    if (keys.size > 0) queryDraftRef.current.setDraftPage(Object.fromEntries([...keys].map(name => [name, pageDraft.find(([k]) => k === name)?.[1] ?? null])));
  }, [queryDraft, page, setPage]);

  const appliedChips: PageFilterAppliedChip[] = appliedPageSummary.filter(item => item.key !== 'page').map(item => ({
    ...item,
    ...(item.key === 'bucket' ? { onClear: () => clearNarrowing('bucket'), clearLabel: m('cycleTimeDrilldownClearBucketFilter') }
      : item.key === 'bin' ? { onClear: () => clearNarrowing('bin'), clearLabel: m('cycleTimeDrilldownClearHistogramFilter') }
      : {}),
  }));
  const historyPageSummary = useCallback((candidate: GlobalContext, page: readonly Pair[]) => summaryFor(candidate, page, lang), [lang]);
  const issues = [
    ['granularity', grainFieldLabel, draftGrain.ok], ['percentile', tailFieldLabel, draftTail.ok], ['sort', sortFieldLabel, draftSort.ok],
    ['bucket', m('cycleTimeDrilldownBucket3'), draftBucket.ok], ['bin', m('cycleTimeDrilldownHistogram3'), draftBin.ok], ['page', m('cycleTimeDrilldownPage3'), draftIndex.ok],
  ].filter(([, , ok]) => !ok).map(([key, label]) => ({ key: String(key), label: String(label), reason: unknownRaw(draftParam(String(key))) }));
  const resetFilters = <Button type="button" variant="ghost" size="toolbar" onClick={() => queryDraft.setDraftPage({ granularity: null, percentile: null, sort: null, bucket: null, bin: null, page: null })}>{m('cycleTimeDrilldownResetPageFilters')}</Button>;

  return <PlatformPage layout="fill"
    queryResult={{ completedAt: kpi.completedAt, status: kpi.status, failed: kpi.response != null && !isAnswered(kpi.response.outcome), message: kpi.response?.message }}
    queryBarExtension={{ pageSummary, appliedPageSummary, historyPageSummary, issues }}
    description={m('cycleTimeDrilldownCycleTimeForTheAppliedPeriodAnd')}
    secondaryActions={<Button variant="secondary" size="sm" onClick={() => { kpi.refetch(); trend.refetch(); dist.refetch(); setReload(n => n + 1); if (pageRaw !== null) setPage({ page: null }, { replace: true }); }}><RotateCw className="size-3.5" aria-hidden />{m('cycleTimeDrilldownRefresh')}</Button>}
    dataTrustSummary={kpi.response?.trust ? <DataTrustIndicator trust={kpi.response.trust} assessments={kpi.response.assessments} /> : undefined}
    contextNotes={[
      <MetricBanner key="metric" metric={metric} />,
      <p key="grain" className="text-xs text-text-muted">
        {!draftGrain.ok || draftGrain.explicit ? m('cycleTimeDrilldownTheDefaultGrainIsHoursWhenThe') : m('cycleTimeDefaultGrainWithCurrent', { grain: m(draftGrain.value === 'hour' ? 'cycleTimeGrainHour' : draftGrain.value === 'day' ? 'cycleTimeGrainDay' : 'cycleTimeGrainWeek') })}
      </p>,
    ]}
    contextExtension={<div className="space-y-2">
      <PageFilterBar mode="draft" hasPendingChanges={queryDraft.dirty.length > 0} label={t('pageFilter')} collapsible preferenceKey={route?.menu.id ?? ''} summaryItems={pageSummary} appliedChips={appliedChips} collapsedActions={resetFilters} fields={[
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
    </div>}
  >
    {invalidPage ? <PageKeyWarning sentences={keys.sentences} onRecover={keys.recover} />
      : kpi.status === 'idle' ? <QueryView query={kpi}>{() => null}</QueryView>
        : <PanelWorkspace
          persistKey="drilldown"
          label={ANALYTICS_MESSAGES.cycleTimeDrilldownCycleTimeWorkspace}
          initialPreset="balanced"
          stackPreset="column"
          presets={[
            { id: 'balanced', label: ANALYTICS_MESSAGES.cycleTimeDrilldownBalanced, layout: { type: 'branch', dir: 'row', sizes: [68, 32], children: [
              { type: 'group', panels: ['trend'] },
              { type: 'branch', dir: 'column', sizes: [38, 62], children: [{ type: 'group', panels: ['summary'] }, { type: 'group', panels: ['distribution', 'slow'] }] },
            ] } },
            { id: 'focus', label: ANALYTICS_MESSAGES.cycleTimeDrilldownFocus, layout: { type: 'branch', dir: 'row', sizes: [70, 30], children: [
              { type: 'group', panels: ['trend'] },
              { type: 'group', panels: ['summary', 'distribution', 'slow'] },
            ] } },
            // A natural start for the stacked height mode (#686): one row per question, the summary and the distribution side by side.
            { id: 'column', label: ANALYTICS_MESSAGES.cycleTimeDrilldownStacked, layout: { type: 'branch', dir: 'column', sizes: [34, 33, 33], children: [
              { type: 'group', panels: ['trend'] },
              { type: 'branch', dir: 'row', sizes: [40, 60], children: [{ type: 'group', panels: ['summary'] }, { type: 'group', panels: ['distribution'] }] },
              { type: 'group', panels: ['slow'] },
            ] } },
          ]}
          panels={[
          { id: 'summary', icon: Gauge, preferredHeight: 360, title: ANALYTICS_MESSAGES.cycleTimeDrilldownCycleTimeSummary, render: () => <div className="space-y-3 p-3">
          <div className="relative" data-testid="cycle-kpi">
            <QueryView widgetName={m('cycleTimeDrilldownCycleTimeSummary2')} query={kpi}>
              {data => <div className="grid grid-cols-2 gap-3">
                <StatCard icon={Timer} chip="blue" label="P50" value={formatMin(data.p50, lang)} unit={m('cycleTimeDrilldownMin')} delta={cycleDelta(data.p50, data.prevP50)} />
                <StatCard icon={Gauge} chip="teal" label="P95" value={formatMin(data.p95, lang)} unit={m('cycleTimeDrilldownMin2')} delta={cycleDelta(data.p95, data.prevP95)} />
                <StatCard icon={Hash} chip="teal" label={m('cycleTimeDrilldownExecutions')} value={formatNumber(data.count, lang)} />
                <StatCard icon={AlertTriangle} chip="teal" label={m('cycleTimeDrilldownSlowExecutionsP95Threshold')} value={formatNumber(data.slowCount, lang)} caption={m('cycleTimeDrilldownAtOrAboveTheDisplayedP95')} />
              </div>}
            </QueryView>
          </div>
          <p className="text-xs text-text-muted">{m('cycleTimeDrilldownAppliedPopulationCompletedSyntheticJobs')}</p>
          <p className="text-xs text-text-muted">{m('cycleTimeDrilldownRoundedTo01MinCompletedJobs')}</p>
          </div> },
            { id: 'trend', primary: true, minWidth: 480, minHeight: 320, preferredHeight: 420, title: ANALYTICS_MESSAGES.cycleTimeDrilldownCycleTimeTrend, render: () =>
            <QueryView widgetName={m('cycleTimeDrilldownCycleTimeTrend2')} query={trend} skeletonHeight={280}>
              {(data, response) => <AnalysisChartFrame
                chartId="cycle-time-trend"
                size="fill"
                title={m('cycleTimeDrilldownCycleTimeTrend3')}
                description={m('cycleTimeDrilldownP50P95ByBucketMinutes', { grain: m(shownGrain === 'hour' ? 'cycleTimeGrainHour' : shownGrain === 'day' ? 'cycleTimeGrainDay' : 'cycleTimeGrainWeek') })}
                metricVersion={metricLabel(metric, lang === 'ko')}
                unit={m('cycleTimeDrilldownMin3')}
                valueFormat={value => formatMin(value, lang)}
                series={[
                  { id: 'p50', name: 'P50', color: 'chart-blue', unit: m('cycleTimeDrilldownMin3'), points: data.current.p50 },
                  { id: 'p95', name: 'P95', color: 'chart-teal', unit: m('cycleTimeDrilldownMin3'), points: data.current.p95, dashed: true },
                ]}
                compareSeries={[
                  { id: 'p50-prev', name: m('cycleTimeDrilldownP50PreviousPeriod'), color: 'chart-series-3', unit: m('cycleTimeDrilldownMin3'), points: data.previous.p50 },
                  { id: 'p95-prev', name: m('cycleTimeDrilldownP95PreviousPeriod'), color: 'cat-amber', unit: m('cycleTimeDrilldownMin3'), points: data.previous.p95, dashed: true },
                ]}
                markLines={data.populationP95 === null ? undefined : [{ y: data.populationP95, label: `P95 ${formatMin(data.populationP95, lang)}` }]}
                trust={response.trust}
                onPointClick={(x, seriesId) => {
                  if (seriesId.endsWith('-prev')) {
                    toast(m('cycleTimeDrilldownPreviousPeriodPointsAreForComparisonThe'));
                    return;
                  }
                  // The kept series are in the previous grain; a bucket of that unit cannot be written under the new one (#1365).
                  if (trend.showingPrevious) {
                    toast(m('cycleTimeDrilldownTheGrainIsChangingClickAPoint'));
                    return;
                  }
                  const start = bucketContaining(x, shownGrain);
                  if (!start || !global.from || !global.to) return;
                  const end = bucketEnd(start, shownGrain);
                  if (end <= global.from || start >= global.to) return;
                  setPage({ bucket: start, page: null });
                }}
              />}
            </QueryView>
            },
            { id: 'distribution', icon: ChartColumn, preferredHeight: 440, title: ANALYTICS_MESSAGES.cycleTimeDrilldownCycleTimeDistribution, render: () =>
            <QueryView widgetName={m('cycleTimeDrilldownCycleTimeDistribution2')} query={dist} skeletonHeight={220}>
              {(data, response) => <AnalysisChartFrame
                chartId="cycle-time-distribution"
                title={m('cycleTimeDrilldownCycleTimeDistribution3')}
                description={m('cycleTimeDrilldownSplitIntoBinsOnlyShowExecutionsIn')}
                metricVersion={metricLabel(metric, lang === 'ko')}
                xType="category"
                unit={m('cycleTimeDrilldownJobs')}
                valueFormat={value => formatNumber(Math.round(value), lang)}
                size="fill"
                series={[{ id: 'hist', name: m('cycleTimeDrilldownExecutions2'), color: 'chart-blue', kind: 'bar', points: data.bins.map((item): [string, number] => [item.id, item.count]) }]}
                trust={response.trust}
                selectionActions={selection => <Button size="toolbar" onClick={() => setPage({ bin: selection.from === selection.to ? selection.from : `${selection.from}..${selection.to}`, page: null })}>{m('cycleTimeDrilldownShowExecutionsInThisRange')}</Button>}
              />}
            </QueryView>
            },
          { id: 'slow', icon: ListFilter, preferredHeight: 420, title: ANALYTICS_MESSAGES.cycleTimeDrilldownSlowExecutions2, render: () => <div className="flex h-full min-h-0 flex-col gap-3 p-3">
          <PlatformDataTable<SlowRow>
            title={m('cycleTimeDrilldownSlowExecutions3')}
            subtitle={m('cycleTimeDrilldownPageFilteredListSlowExecutionPredicatePopulation', { predicate: tailMode === 'all' ? m('cycleTimePredicateAll') : `≥ ${tailMode.toUpperCase()}`, population: kpi.response === null ? m('cycleTimePopulationLoading') : kpi.response.outcome === 'ok' ? m('cycleTimePopulationCount', { count: formatNumber(kpi.response.data!.count, lang) }) : m('cycleTimePopulationUnavailable') })}
            ariaLabel={m('cycleTimeDrilldownSlowExecutions4')}
            columns={columns}
            getRowId={executionKey}
            preferenceKey="cycle-time-slow"
            filterKey={filterKey}
            pageSize={50}
            fill
            editableColumnGroups
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
            exportFilterSummary={exportFilterSummary(listFilter, lang === 'ko')} exportContext={cycleExportEndpoint.context}
            exportNote={m('cycleTimeDrilldownPageFilteredListSeparateFromTheKpi')}
            emptyAction={(bucketRange || bin || tailMode !== 'p95')
              ? <Button size="sm" variant="secondary" onClick={() => setPage({ bucket: null, bin: null, percentile: 'all', page: null })}>{m('cycleTimeDrilldownClearListFilters')}</Button>
              : undefined}
            rowAction={(row, { compact }) => {
              const href = linkTo('execution-detail', { params: { equipmentId: row.equipmentId }, page: { entityType: 'job', anchor: row.anchor }, returnTo: true });
              const name = m('cycleTimeDrilldownDetail', { equipmentId: String(row.equipmentId), value: String(formatWallClock(row.startedAt)) });
              return <RowAction compact={compact} icon={ArrowRight} label={name} text={m('cycleTimeDrilldownDetail2')} textLink="primary" link={<PlatformLink href={href} />} />;
            }}
            bulkActions={ids => <Button size="toolbar" onClick={() => {
              const equipmentIds = [...new Set(ids.map(equipmentIdFromKey))];
              setGlobal({ selection: equipmentIds });
              toast(m('cycleTimeDrilldownAppliedEquipmentAsTheEquipmentSelectionIt', { length: String(equipmentIds.length) }));
            }}>{m('cycleTimeDrilldownNarrowAnalysisToSelectedEquipment')}</Button>}
            loadPage={(query, signal) => slowPages.fetch({ ...listFilter, ...query, sorting: [{ id: sortSpec.id, desc: sortSpec.desc }] }, signal)}
          />
          <p className="shrink-0 text-xs text-text-muted">{m('cycleTimeDrilldownUnconfirmedExecutionsWithoutVerdictEvidenceReviewFlags')}</p>
          {kpi.response && kpi.response.outcome === 'ok' && <div className="shrink-0"><DataTrustIndicator trust={kpi.response.trust} assessments={kpi.response.assessments} /></div>}
          </div> },
          ]}
        />}
  </PlatformPage>;
}

function MetricBanner({ metric }: { metric: ResolvedMetric }) {
  const m = useMessages(ANALYTICS_MESSAGES);
  const { lang } = useI18n();
  if (metric.kind === 'unconfirmed') {
    return <p className="text-xs text-text-secondary" data-testid="metric-banner">{m('cycleTimeDrilldownHasNoConfirmedVersionPickAVersion', { metricId: String(metric.metricId) })}</p>;
  }
  const versionNote = metric.metricVersion === '4'
    ? (m('cycleTimeDrilldownMinutesMatchProductivitySCycleTimeV4'))
    : CYCLE_VERSION_NOTE[lang];
  if (metric.kind === 'page-default') {
    return <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary" data-testid="metric-banner">
      <StatusBadge tone="info">{m('cycleTimeDrilldownPageDefault')}</StatusBadge>
      <span className="t-mono">{PAGE_METRIC_ID} v{metric.metricVersion}</span>
      <span>{m('cycleTimeDrilldownNoGlobalMetricPairCalculationsUseThis')}</span>
      <span>{versionNote}</span>
    </p>;
  }
  if (metric.kind === 'not-applied') {
    return <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary" data-testid="metric-banner">
      <StatusBadge tone="warning">{m('cycleTimeDrilldownNotApplied')}</StatusBadge>
      <span className="t-mono">{metric.globalMetricId}{metric.globalMetricVersion ? ` v${metric.globalMetricVersion}` : ''}</span>
      <span>{m('cycleTimeDrilldownTheGlobalMetricIsNotSoIt', { PAGEMETRICID: String(PAGE_METRIC_ID), metricVersion: String(metric.metricVersion) })}</span>
      <span>{versionNote}</span>
    </p>;
  }
  return <p className="flex flex-wrap items-center gap-2 text-xs text-text-secondary" data-testid="metric-banner">
    <StatusBadge tone="success">{m('cycleTimeDrilldownApplied')}</StatusBadge>
    <span className="t-mono">{metric.metricId} v{metric.metricVersion}</span>
    <span>{metric.versionIsPageDefault
      ? (m('cycleTimeDrilldownTheGlobalCycleTimePairIsApplied'))
      : (m('cycleTimeDrilldownCalculatedWithTheRequestedVersion'))}</span>
    <span>{versionNote}</span>
  </p>;
}

function qualityBadge(quality: SlowRow['quality'], ko: boolean) {
  const label = qualityLabel(quality, ko);
  return quality === 'review'
    ? <StatusBadge tone="warning">{label}</StatusBadge>
    : <StatusBadge tone="neutral">{label}</StatusBadge>;
}

function formatMin(value: number | null, lang: 'ko' | 'en'): string {
  if (value === null) return '—';
  return formatNumber(value, lang, { decimals: 1 });
}

function formatDelta(value: number | null, lang: 'ko' | 'en'): string {
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
  if (metric.kind === 'unconfirmed') return formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownUnconfirmed, (ko ? 'ko' : 'en'), { metricId: String(metric.metricId) });
  const suffix = metric.kind === 'page-default'
    ? (formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownPageDefault2, (ko ? 'ko' : 'en')))
    : metric.kind === 'not-applied'
      ? (formatText(ANALYTICS_MESSAGES.cycleTimeDrilldownPageDefaultGlobalNotApplied, (ko ? 'ko' : 'en')))
      : '';
  return `${metric.metricId} v${metric.metricVersion}${suffix}`;
}
