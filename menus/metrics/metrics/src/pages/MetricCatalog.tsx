import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { type PageProps, PlatformLink, type QueryState, invalidValueSentence, useI18n, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { PageFilterBar, type PlatformColumn, PlatformDataTable, PlatformPage, QueryView, StateMessage, TableUrlWarning, encodeTableSort, useTableUrlWarning } from '@ap/components';
import { Button } from '@ap/ui';
import {
  DOMAINS, STATUSES, catalogExportEndpoint, catalogListEndpoint, catalogPageEndpoint, metricPairEndpoint, sortColumns,
  type CatalogRow, type Lang, type PairVerdict, type PublicationState,
} from '../endpoints';
import { exportFilterSummary, exportParams } from './data';
import { catalogColumns } from './columns';
import { metricDetailHref } from './detail-link';
import { metricCatalogHasActiveFilters, metricCatalogPageFilterFields, resetMetricCatalogPageFilters } from './filter-fields';

const NO_DESTINATION = { viewedId: null, pageVersion: null };

function pairText(verdict: PairVerdict, lang: 'ko' | 'en', pageVersion: string | null): { title: string; body: string; tone: 'neutral' | 'danger' | 'warning' } {
  const ko = lang === 'ko';
  switch (verdict.kind) {
    case 'absent':
      return { tone: 'neutral', title: ko ? '전역 지표 쌍 없음' : 'No global metric pair', body: ko ? '지표와 버전이 모두 없습니다. 정의를 보려면 지표를 고르세요.' : 'Both the metric and the version are missing. Pick a metric to see its definition.' };
    case 'id-only':
      return { tone: 'warning', title: ko ? '미완성 쌍' : 'Incomplete pair', body: ko ? `${verdict.metricId}만 있고 버전은 없습니다. 버전도 함께 고르세요.` : `${verdict.metricId} is present without a version. Pick a version too.` };
    case 'valid': {
      const matched = pageVersion !== null && pageVersion === verdict.metricVersion;
      const body = pageVersion === null
        ? (ko ? `${verdict.metricId} @ ${verdict.metricVersion}. 목록에서는 그 행만 표시합니다.` : `${verdict.metricId} @ ${verdict.metricVersion}. The list only marks that row.`)
        : matched
          ? (ko ? `${verdict.metricId} @ ${verdict.metricVersion}. 페이지에서 보는 버전과 같습니다.` : `${verdict.metricId} @ ${verdict.metricVersion}. It matches the version open on this page.`)
          : (ko ? `${verdict.metricId} @ ${verdict.metricVersion}. 목록에서는 그 행만 표시합니다.` : `${verdict.metricId} @ ${verdict.metricVersion}. The list only marks that row.`);
      return { tone: 'neutral', title: ko ? '전역 쌍' : 'Global pair', body };
    }
    case 'unknown-metric':
      return { tone: 'danger', title: ko ? '지표를 찾을 수 없습니다' : 'Metric was not found', body: ko ? `${verdict.metricId}${verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ''} 은 카탈로그에 없습니다. 목록에서 다시 고르세요.` : `${verdict.metricId}${verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ''} is not in the catalog. Pick another from the list.` };
    case 'version-not-member':
      return { tone: 'danger', title: ko ? '그 버전이 이 지표의 버전이 아닙니다' : 'That version is not one of this metric', body: ko ? `${verdict.metricId || '—'} @ ${verdict.metricVersion} 은 이 지표의 버전이 아닙니다. 목록에서 버전을 고르세요.` : `${verdict.metricId || '—'} @ ${verdict.metricVersion} is not a version of this metric. Pick a version from the list.` };
    case 'other-metric':
      return { tone: 'warning', title: ko ? '다른 지표가 선택되어 있습니다' : 'A different metric is selected', body: ko ? `고른 지표는 ${verdict.metricId}${verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ''} 입니다. 이 목록의 ${verdict.viewedId}와 다릅니다.` : `The selected metric is ${verdict.metricId}${verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ''}. It differs from ${verdict.viewedId} on this list.` };
    case 'conflict':
      return { tone: 'danger', title: ko ? '같은 지표의 버전이 서로 다릅니다' : 'Same metric, conflicting versions', body: ko ? `${verdict.metricId}: 전역 ${verdict.globalVersion}, 이 화면 ${verdict.pageVersion}. 하나를 고르세요.` : `${verdict.metricId}: global ${verdict.globalVersion}, this page ${verdict.pageVersion}. Pick one.` };
    default:
      return { tone: 'neutral', title: '', body: '' };
  }
}

/** The server validates the global metricId+metricVersion pair against the catalog (§6.1). Does not write the URL.
 *  The page owns the `metrics.pair` query and passes it in (#325-2): the banner is the first section of both
 *  pages, so the same single request also gates the detail page's anchor scroll — and the catalog, which reads
 *  the verdict for its active row, no longer sends the request twice. */
export function MetricPairBanner({ query, pageVersion = null }: { query: QueryState<PairVerdict>; pageVersion?: string | null }) {
  const { setPage } = usePlatform();
  const { lang } = useI18n();

  return <QueryView widgetName={lang === 'ko' ? '지표 쌍 검증' : 'Metric pair validation'} query={query} compact skeletonRows={2}>
    {verdict => {
      const copy = pairText(verdict, lang, pageVersion);
      const box = copy.tone === 'danger' ? 'border-border-strong bg-accent-danger-soft text-text-danger-label' : copy.tone === 'warning' ? 'border-border-strong bg-accent-warn-soft text-text-warning-label' : 'border-border-subtle bg-surface-card text-text-secondary';
      return <div role={copy.tone === 'danger' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-xs ${box}`}>
        <p className="font-semibold text-text-primary">{copy.title}</p>
        <p className="mt-0.5">{copy.body}</p>
        {verdict.kind === 'conflict' && <div className="mt-2">
          <Button variant="secondary" size="sm" onClick={() => setPage({ version: verdict.globalVersion })}>
            {lang === 'ko' ? '전역 버전을 페이지에서 보기' : 'Show the global version on this page'}
          </Button>
        </div>}
      </div>;
    }}
  </QueryView>;
}

export default function MetricCatalogPage(_: PageProps) {
  const { pageParam, setPage, linkTo, global } = usePlatform();
  const { lang, tx, t } = useI18n();
  const q = pageParam('q');
  const status = pageParam('status');
  const domain = pageParam('domain');
  const statusIllegal = status !== null && !STATUSES.includes(status as PublicationState);
  const domainIllegal = domain !== null && !DOMAINS.includes(domain as typeof DOMAINS[number]);
  // §6.1 page keys: sort/page are URL-owned; invalid wire values alert instead of substituting (never "empty rows").
  const { parsedSort, parsedPage, invalid: tableInvalid, sentences: invalidTableSentences } = useTableUrlWarning(sortColumns);
  // #304 FIX1 (06 §19): each invalid field keeps its user name and the raw value as entered (quoted, untruncated),
  // one sentence per field — never `key=value`.
  const invalidFilterSentences = [
    statusIllegal ? invalidValueSentence(lang, 'filter', { ko: '상태', en: 'Status' }, status) : null,
    domainIllegal ? invalidValueSentence(lang, 'filter', { ko: '도메인', en: 'Domain' }, domain) : null,
  ].filter((sentence): sentence is string => sentence !== null);
  // A global-Context change clears `page` in the kernel (manifest contextResetKeys); pages write no reset effect.
  const pair = useMenuQuery(metricPairEndpoint, NO_DESTINATION);
  const verdict = pair.response?.outcome === 'ok' ? pair.response.data : null;
  const activeRowId = verdict?.kind === 'valid' || verdict?.kind === 'id-only' ? verdict.metricId : null;
  const filter = { q, status, domain, lang: lang as Lang };
  const all = useMenuQuery(catalogListEndpoint, { q: null, status: null, domain: null, lang: lang as Lang });
  const metricCount = all.response?.outcome === 'ok' ? all.response.data!.rows.length : null;
  // UXA-4: `…` only while the count is pending; a failed count query says nothing numeric.
  const metricCountText = metricCount !== null
    ? (lang === 'ko' ? `합성 ${metricCount}건` : `${metricCount} synthetic metrics`)
    : all.response === null
      ? (lang === 'ko' ? '합성 …건' : '… synthetic metrics')
      : (lang === 'ko' ? '합성 지표입니다' : 'Synthetic metrics');
  const pages = useMenuFetch(catalogPageEndpoint);
  const exports = useMenuFetch(catalogExportEndpoint);

  const columns = useMemo<PlatformColumn<CatalogRow>[]>(
    () => catalogColumns({ lang: lang as Lang, linkTo, tx }),
    [lang, linkTo, tx],
  );

  return <PlatformPage
    description={lang === 'ko'
      ? '정의·grain·분자/분모·게시 포인터를 탐색합니다. 초안은 분석 기본 버전이 아닙니다.'
      : 'Browse definitions, grain, numerator/denominator and the published pointer. Drafts are not analysis defaults.'}
    contextExtension={<PageFilterBar label={t('pageFilter')} fields={metricCatalogPageFilterFields({ q, status, domain, lang, tx, setPage })} actions={metricCatalogHasActiveFilters(q, status, domain) ? <Button type="button" variant="secondary" size="sm" onClick={() => resetMetricCatalogPageFilters(setPage)}>{t('clearFilters')}</Button> : undefined} />}
  >
    <div className="space-y-3">
      <MetricPairBanner query={pair} />
      {global.selection !== null && <p className="text-xs text-text-secondary">
        {lang === 'ko'
          ? `설비 선택 ${global.selection.length}건은 이 화면에서 참조만입니다.`
          : `Equipment selection (${global.selection.length}) is reference only on this page.`}
      </p>}
      {(statusIllegal || domainIllegal) && <StateMessage tone="danger" icon={<AlertTriangle className="size-4" aria-hidden />}
        title={lang === 'ko' ? '등록되지 않은 필터입니다' : 'This filter is not registered'}
        body={invalidFilterSentences.map((sentence, index) => <p key={index}>{sentence}</p>)}
        action={<Button size="sm" variant="secondary" onClick={() => setPage({ ...(statusIllegal ? { status: null } : {}), ...(domainIllegal ? { domain: null } : {}) })}>{lang === 'ko' ? '초기화' : 'Reset'}</Button>} />}
      {tableInvalid ? <TableUrlWarning sentences={invalidTableSentences} /> : <PlatformDataTable
        title={lang === 'ko' ? '지표 카탈로그' : 'Metric catalog'}
        subtitle={lang === 'ko'
          ? `${metricCountText}. 게시 포인터는 레코드에 저장된 값이며 최대 버전 번호가 아닙니다. 초안 열기는 동작 열.`
          : `${metricCountText}. The published pointer is stored on the record, not max(version). Open a draft from the action column.`}
        ariaLabel={lang === 'ko' ? '지표 카탈로그' : 'Metric catalog'}
        preferenceKey="platform:table:metric-catalog"
        columns={columns}
        getRowId={row => row.metricId}
        filterKey={JSON.stringify([q, status, domain, lang])}
        pageSize={8}
        urlState={parsedSort.ok && parsedPage.ok ? {
          page: parsedPage.page === 1 ? null : parsedPage.page,
          sorting: parsedSort.sorting,
          onChange: ({ page, sorting }, reason) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }, { replace: reason === 'clamp' }),
        } : undefined}
        activeRowId={activeRowId}
        loadPage={(query, signal) => pages.fetch({ ...filter, ...query }, signal)}
        rowAction={row => <span className="flex flex-wrap gap-2">
          <PlatformLink className="text-xs font-medium text-accent-primary hover:underline" href={metricDetailHref(linkTo, row)}>
            {lang === 'ko' ? '정의' : 'Definition'}
          </PlatformLink>
          {row.draftVersion && <PlatformLink className="text-xs text-text-secondary hover:underline" href={metricDetailHref(linkTo, row, row.draftVersion)}>
            {lang === 'ko' ? `초안 v${row.draftVersion}` : `Draft v${row.draftVersion}`}
          </PlatformLink>}
        </span>}
        // Table-owned export (#173): the page only says how to read the rows; the table builds the file.
        exportRows={(request, signal) => exports.fetch(exportParams(filter, request), signal)}
        exportFilterSummary={exportFilterSummary(filter, lang, tx)} exportContext={catalogExportEndpoint.context}
      />}
      <p className="t-caption text-text-muted">
        {lang === 'ko'
          ? 'Time·Lot·room_name·Condition·Selection은 이 목록의 필터가 아닙니다. 검색·상태·도메인으로 거릅니다. 예시 데이터입니다.'
          : 'Time, lot, room_name, condition and selection do not filter this list. It is filtered by search, status and domain. Synthetic data.'}
      </p>
    </div>
  </PlatformPage>;
}
