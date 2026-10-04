import { useMemo } from 'react';
import { type PageProps, PlatformLink, useI18n, useMenuFetch, useMenuQuery, usePlatform } from '@ap/kernel';
import { PageFilterBar, type PlatformColumn, PlatformDataTable, PlatformPage, QueryView, encodeTableSort, parsePageIndex, parseTableSort } from '@ap/components';
import { Button } from '@ap/ui';
import {
  DOMAINS, STATUSES, catalogExportEndpoint, catalogListEndpoint, catalogPageEndpoint, metricPairEndpoint, sortColumns,
  type CatalogRow, type Lang, type PairVerdict, type PublicationState,
} from '../endpoints';
import { exportFilterSummary, exportParams } from './data';
import { catalogColumns } from './columns';
import { metricCatalogHasActiveFilters, metricCatalogPageFilterFields, resetMetricCatalogPageFilters } from './filter-fields';

const NO_DESTINATION = { viewedId: null, pageVersion: null };

function pairText(verdict: PairVerdict, lang: 'ko' | 'en', pageVersion: string | null): { title: string; body: string; tone: 'neutral' | 'danger' | 'warning' } {
  const ko = lang === 'ko';
  switch (verdict.kind) {
    case 'absent':
      return { tone: 'neutral', title: ko ? '전역 지표 쌍 없음' : 'No global metric pair', body: ko ? 'metricId와 metricVersion이 모두 없습니다. 버전 숫자만으로 지표를 추정하지 않습니다.' : 'Both metricId and metricVersion are absent. A version number alone is not treated as a metric.' };
    case 'id-only':
      return { tone: 'warning', title: ko ? '미완성 쌍' : 'Incomplete pair', body: ko ? `${verdict.metricId}만 있고 버전은 없습니다. 버전만 채워 넣지 않으며, 게시 포인터로 자동 완성하지 않습니다.` : `${verdict.metricId} is present without a version. The version is not filled in, and the published pointer is not written automatically.` };
    case 'valid': {
      const matched = pageVersion !== null && pageVersion === verdict.metricVersion;
      const body = pageVersion === null
        ? (ko ? `${verdict.metricId} @ ${verdict.metricVersion}. 목록에서는 행 표시만 합니다. 상세에서는 이 값으로 페이지 버전을 자동 선택하지 않습니다.` : `${verdict.metricId} @ ${verdict.metricVersion}. The list only marks the row. Detail does not auto-select this as the page version.`)
        : matched
          ? (ko ? `${verdict.metricId} @ ${verdict.metricVersion}. 페이지에서 보는 버전과 같습니다.` : `${verdict.metricId} @ ${verdict.metricVersion}. It matches the version open on this page.`)
          : (ko ? `${verdict.metricId} @ ${verdict.metricVersion}. 목록 필터로 쓰지 않고 해당 행만 표시합니다.` : `${verdict.metricId} @ ${verdict.metricVersion}. It is not a list filter; only that row is marked.`);
      return { tone: 'neutral', title: ko ? '전역 쌍' : 'Global pair', body };
    }
    case 'unknown-metric':
      return { tone: 'danger', title: ko ? '전역 metricId를 찾을 수 없습니다' : 'Global metricId was not found', body: ko ? `${verdict.metricId}${verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ''} 은 카탈로그에 없습니다. 다른 지표나 최신 버전으로 대체하지 않습니다.` : `${verdict.metricId}${verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ''} is not in the catalog. Nothing is substituted.` };
    case 'version-not-member':
      return { tone: 'danger', title: ko ? '전역 버전이 그 지표에 속하지 않습니다' : 'Global version does not belong to that metric', body: ko ? `${verdict.metricId || '—'} @ ${verdict.metricVersion} 은 소속 검증에 실패했습니다. 최신 게시 버전으로 바꾸지 않습니다.` : `${verdict.metricId || '—'} @ ${verdict.metricVersion} failed membership. It is not replaced with the latest published version.` };
    case 'other-metric':
      return { tone: 'warning', title: ko ? '다른 지표 Context가 보존되어 있습니다' : 'A different metric context is preserved', body: ko ? `전역 ${verdict.metricId}${verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ' (버전 없음)'} 을 목적지 ${verdict.viewedId}로 덮어쓰지 않습니다.` : `Global ${verdict.metricId}${verdict.metricVersion ? ` @ ${verdict.metricVersion}` : ' (no version)'} is not overwritten with destination ${verdict.viewedId}.` };
    case 'conflict':
      return { tone: 'danger', title: ko ? '같은 지표의 버전이 서로 다릅니다' : 'Same metric, conflicting versions', body: ko ? `${verdict.metricId}: 전역 ${verdict.globalVersion}, 페이지 ${verdict.pageVersion}. 어느 쪽으로도 자동 보정하지 않습니다.` : `${verdict.metricId}: global ${verdict.globalVersion}, page ${verdict.pageVersion}. Neither side is applied over the other.` };
    default:
      return { tone: 'neutral', title: '', body: '' };
  }
}

/** The server validates the global metricId+metricVersion pair against the catalog (§6.1). Does not write the URL. */
export function MetricPairBanner({ viewedId = null, pageVersion = null }: { viewedId?: string | null; pageVersion?: string | null }) {
  const { setPage } = usePlatform();
  const { lang } = useI18n();
  const query = useMenuQuery(metricPairEndpoint, { viewedId, pageVersion });

  return <QueryView widgetName={lang === 'ko' ? '지표 쌍 검증' : 'Metric pair validation'} query={query} compact skeletonRows={2}>
    {verdict => {
      const copy = pairText(verdict, lang, pageVersion);
      const box = copy.tone === 'danger' ? 'border-border-strong bg-accent-danger-soft text-text-danger-label' : copy.tone === 'warning' ? 'border-border-strong bg-accent-warn-soft text-text-warning-label' : 'border-border-subtle bg-surface-card text-text-secondary';
      return <div role={copy.tone === 'danger' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-[12px] ${box}`}>
        <p className="font-semibold text-text-primary">{copy.title}</p>
        <p className="mt-0.5">{copy.body}</p>
        {verdict.kind === 'conflict' && <div className="mt-2">
          <Button variant="secondary" size="sm" className="h-8 rounded-sm" onClick={() => setPage({ version: verdict.globalVersion })}>
            {lang === 'ko' ? '전역 버전을 페이지에서 보기' : 'Show the global version on this page'}
          </Button>
        </div>}
      </div>;
    }}
  </QueryView>;
}

function detailPage(row: CatalogRow): Record<string, string> {
  return { version: row.publishedPointer ?? row.catalogVersion };
}

export default function MetricCatalogPage(_: PageProps) {
  const { pageParam, setPage, linkTo, global } = usePlatform();
  const { lang, tx } = useI18n();
  const q = pageParam('q');
  const status = pageParam('status');
  const domain = pageParam('domain');
  const statusIllegal = status !== null && !STATUSES.includes(status as PublicationState);
  const domainIllegal = domain !== null && !DOMAINS.includes(domain as typeof DOMAINS[number]);
  // §6.1 page keys: sort/page are URL-owned; invalid wire values alert instead of substituting (never "empty rows").
  const parsedSort = parseTableSort(pageParam('sort'), sortColumns);
  const parsedPage = parsePageIndex(pageParam('page'));
  const tableInvalid = !parsedSort.ok || !parsedPage.ok;
  // A global-Context change clears `page` in the kernel (manifest contextResetKeys); pages write no reset effect.
  const pair = useMenuQuery(metricPairEndpoint, NO_DESTINATION);
  const verdict = pair.response?.outcome === 'ok' ? pair.response.data : null;
  const activeRowId = verdict?.kind === 'valid' || verdict?.kind === 'id-only' ? verdict.metricId : null;
  const filter = { q, status, domain, lang: lang as Lang };
  const all = useMenuQuery(catalogListEndpoint, { q: null, status: null, domain: null, lang: lang as Lang });
  const metricCount = all.response?.outcome === 'ok' ? all.response.data!.rows.length : null;
  const pages = useMenuFetch(catalogPageEndpoint);
  const exports = useMenuFetch(catalogExportEndpoint);

  const columns = useMemo<PlatformColumn<CatalogRow>[]>(
    () => catalogColumns({ lang: lang as Lang, linkTo, tx }),
    [lang, linkTo, tx],
  );

  return <PlatformPage
    description={lang === 'ko'
      ? '정의·grain·분자/분모·게시 포인터를 탐색합니다. 초안은 분석 기본 버전이 아닙니다. 정의 등록·발행 화면은 Open이라 두지 않았습니다.'
      : 'Browse definitions, grain, numerator/denominator and the published pointer. Drafts are not analysis defaults. Registration and publish UI is Open and omitted.'}
    contextExtension={<PageFilterBar label={lang === 'ko' ? '페이지 필터' : 'Page filters'} fields={metricCatalogPageFilterFields({ q, status, domain, lang, tx, setPage })} actions={metricCatalogHasActiveFilters(q, status, domain) ? <Button type="button" variant="secondary" size="sm" className="h-8 rounded-sm" onClick={() => resetMetricCatalogPageFilters(setPage)}>{lang === 'ko' ? '필터 초기화' : 'Reset filters'}</Button> : undefined} />}
  >
    <div className="space-y-3">
      <MetricPairBanner />
      {global.selection !== null && <p className="text-[12px] text-text-secondary">
        {lang === 'ko'
          ? `설비 선택 ${global.selection.length}건은 참조만입니다. 명시적 빈 집합이어도 카탈로그를 0건으로 만들지 않습니다.`
          : `Equipment selection (${global.selection.length}) is reference only. An explicit empty set does not force the catalog to zero rows.`}
      </p>}
      {(statusIllegal || domainIllegal) && <p role="alert" className="rounded-md bg-accent-warn-soft px-3 py-2 text-[12px] text-text-warning-label">
        {lang === 'ko'
          ? `등록되지 않은 페이지 필터입니다 (${statusIllegal ? `status=${status}` : `domain=${domain}`}). 전체로 바꾸지 않아 결과가 비었습니다.`
          : `Unregistered page filter (${statusIllegal ? `status=${status}` : `domain=${domain}`}). It is not coerced to All, so the result is empty.`}
      </p>}
      {tableInvalid ? <p role="alert" className="rounded-md bg-accent-warn-soft px-3 py-2 text-[12px] text-text-warning-label">
        {lang === 'ko' ? '정렬·페이지 값이 잘못되었습니다.' : 'Invalid sort or page value.'}
        <Button variant="secondary" size="sm" className="ml-2 h-7 rounded-sm px-2 text-[12px]" onClick={() => setPage({ sort: null, page: null })}>{lang === 'ko' ? '초기화' : 'Reset'}</Button>
      </p> : <PlatformDataTable
        title={lang === 'ko' ? '지표 카탈로그' : 'Metric catalog'}
        subtitle={lang === 'ko'
          ? `합성 ${metricCount ?? '…'}건. 게시 포인터는 레코드에 저장된 값이며 최대 버전 번호가 아닙니다. 초안 열기는 동작 열.`
          : `${metricCount ?? '…'} synthetic metrics. The published pointer is stored on the record, not max(version). Open a draft from the action column.`}
        ariaLabel={lang === 'ko' ? '지표 카탈로그' : 'Metric catalog'}
        preferenceKey="platform:table:metric-catalog"
        columns={columns}
        getRowId={row => row.metricId}
        filterKey={JSON.stringify([q, status, domain, lang])}
        pageSize={8}
        height={360}
        urlState={parsedSort.ok && parsedPage.ok ? {
          page: parsedPage.page === 1 ? null : parsedPage.page,
          sorting: parsedSort.sorting,
          onChange: ({ page, sorting }) => setPage({ sort: encodeTableSort(sorting), page: page === null ? null : String(page) }),
        } : undefined}
        activeRowId={activeRowId}
        loadPage={(query, signal) => pages.fetch({ ...filter, ...query }, signal)}
        rowAction={row => <span className="flex flex-wrap gap-2">
          <PlatformLink className="text-[12px] font-medium text-accent-primary hover:underline" href={linkTo('metric-detail', { params: { metricId: row.metricId }, page: detailPage(row) })}>
            {lang === 'ko' ? '정의' : 'Definition'}
          </PlatformLink>
          {row.draftVersion && <PlatformLink className="text-[12px] text-text-secondary hover:underline" href={linkTo('metric-detail', { params: { metricId: row.metricId }, page: { version: row.draftVersion } })}>
            {lang === 'ko' ? `초안 v${row.draftVersion}` : `Draft v${row.draftVersion}`}
          </PlatformLink>}
        </span>}
        // Table-owned export (#173): the page only says how to read the rows; the table builds the file.
        exportRows={(request, signal) => exports.fetch(exportParams(filter, request), signal)}
        exportFilterSummary={exportFilterSummary(filter, lang, tx)} exportContext={catalogExportEndpoint.context}
      />}
      <p className="t-caption text-text-muted">
        {lang === 'ko'
          ? 'Time·Lot·room_name·Condition·Selection은 이 목록의 필터가 아닙니다. 검색·상태·domain만 페이지 필터이며 URL 키 q, status, domain에 있습니다. 예시 데이터입니다.'
          : 'Time, lot, room_name, condition and selection do not filter this list. Search, status and domain are the page filters (URL keys q, status, domain). Synthetic data.'}
      </p>
    </div>
  </PlatformPage>;
}
