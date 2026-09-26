import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import type { PageProps } from '../../kernel/registry';
import { useI18n } from '../../kernel/i18n';
import { PlatformLink, usePlatform } from '../../kernel/platform';
import { usePlatformQuery } from '../../kernel/query';
import { serve } from '../../mock/server';
import { PlatformDataTable, sortAndPage, type ColumnMeta } from '../../platform/PlatformDataTable';
import { PlatformPage } from '../../platform/PlatformPage';
import { QueryView } from '../../platform/StateView';
import { Button, Input, StatusBadge } from '@ap/ui';
import {
  DOMAINS, DOMAIN_LABEL, METRICS, STATUS_LABEL, STATUS_TONE, STATUSES,
  catalogRows, filterCatalog, judgeGlobalPair,
  type CatalogRow, type PairVerdict, type PublicationState,
} from './data';

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

/** Validates the global metricId+metricVersion pair through serve() (§6.1). Does not write the URL. */
export function MetricPairBanner({ viewedId = null, pageVersion = null }: { viewedId?: string | null; pageVersion?: string | null }) {
  const { global, setPage } = usePlatform();
  const { lang } = useI18n();
  const query = usePlatformQuery(signal => serve({
    global, signal, requiresScope: false, mergeTimeDomain: false, latency: 180, kinds: ['processing_delay'],
    metricVersion: global.metricVersion ?? undefined,
    compute: () => judgeGlobalPair(global.metricId, global.metricVersion, viewedId, pageVersion),
  }), [global.metricId, global.metricVersion, viewedId, pageVersion]);

  return <QueryView query={query} compact skeletonRows={2}>
    {verdict => {
      const copy = pairText(verdict, lang, pageVersion);
      const box = copy.tone === 'danger' ? 'border-border-strong bg-accent-danger-soft text-text-danger' : copy.tone === 'warning' ? 'border-border-strong bg-accent-warn-soft text-text-warning' : 'border-border-subtle bg-surface-card text-text-secondary';
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
  const verdict = judgeGlobalPair(global.metricId, global.metricVersion, null, null);
  const activeRowId = verdict.kind === 'valid' || verdict.kind === 'id-only' ? verdict.metricId : null;

  const columns = useMemo<ColumnDef<CatalogRow>[]>(() => [
    {
      id: 'metricId', accessorKey: 'metricId', header: 'metricId', size: 200,
      meta: { label: 'metricId' } satisfies ColumnMeta,
      cell: ({ row }) => <PlatformLink className="t-mono text-accent-primary hover:underline" href={linkTo('metric-detail', { params: { metricId: row.original.metricId }, page: detailPage(row.original) })}>{row.original.metricId}</PlatformLink>,
    },
    {
      id: 'nameSort', accessorKey: 'nameSort', header: lang === 'ko' ? '이름' : 'Name', size: 180,
      cell: ({ row }) => lang === 'ko' ? row.original.nameKo : row.original.nameEn,
    },
    {
      id: 'domain', accessorKey: 'domain', header: lang === 'ko' ? '도메인' : 'Domain', size: 120,
      cell: ({ row }) => tx(DOMAIN_LABEL[row.original.domain]),
    },
    { id: 'grain', accessorKey: 'grain', header: 'grain', size: 180, cell: ({ row }) => row.original.grain },
    {
      id: 'numerator', accessorKey: 'numerator', header: lang === 'ko' ? '분자' : 'Numerator', size: 200,
      meta: { label: lang === 'ko' ? '분자' : 'Numerator' } satisfies ColumnMeta,
      cell: ({ row }) => <span className="t-mono">{row.original.numerator}</span>,
    },
    {
      id: 'denominator', accessorKey: 'denominator', header: lang === 'ko' ? '분모' : 'Denominator', size: 200,
      cell: ({ row }) => <span className="t-mono">{row.original.denominator}</span>,
    },
    {
      id: 'publishedPointer', accessorKey: 'publishedPointer', header: lang === 'ko' ? '게시 포인터' : 'Published pointer', size: 130,
      meta: { align: 'right', label: lang === 'ko' ? '게시 포인터' : 'Published pointer' } satisfies ColumnMeta,
      cell: ({ row }) => row.original.publishedPointer ? <span className="tabular">v{row.original.publishedPointer}</span> : <span className="text-text-muted">{lang === 'ko' ? '없음' : 'None'}</span>,
    },
    {
      id: 'status', accessorKey: 'status', header: lang === 'ko' ? '상태' : 'Status', size: 110,
      cell: ({ row }) => <StatusBadge tone={STATUS_TONE[row.original.status]} dot>{tx(STATUS_LABEL[row.original.status])}</StatusBadge>,
    },
    { id: 'owner', accessorKey: 'owner', header: lang === 'ko' ? '정의 책임' : 'Owner', size: 160, cell: ({ row }) => row.original.owner },
    {
      id: 'updatedAt', accessorKey: 'updatedAt', header: lang === 'ko' ? '수정 시각' : 'Updated', size: 170,
      meta: { align: 'right', label: lang === 'ko' ? '수정 시각' : 'Updated' } satisfies ColumnMeta,
      cell: ({ row }) => <time className="tabular" dateTime={row.original.updatedAt}>{row.original.updatedAt.replace('T', ' ').slice(0, 16)}</time>,
    },
  ], [lang, linkTo, tx]);

  const filteredForExport = filterCatalog(catalogRows(lang), q, status, domain).rows;

  return <PlatformPage
    description={lang === 'ko'
      ? '정의·grain·분자/분모·게시 포인터를 탐색합니다. 초안은 분석 기본 버전이 아닙니다. 정의 등록·발행 화면은 Open이라 두지 않았습니다.'
      : 'Browse definitions, grain, numerator/denominator and the published pointer. Drafts are not analysis defaults. Registration and publish UI is Open and omitted.'}
    contextExtension={<div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-[11px] text-text-muted">
        {lang === 'ko' ? '이름 또는 metricId' : 'Name or metricId'}
        <Input data-testid="metric-search" value={q ?? ''} placeholder={lang === 'ko' ? '검색' : 'Search'} className="h-8 w-56 rounded-sm text-[12px]"
          onChange={e => setPage({ q: e.target.value === '' ? null : e.target.value }, { replace: true })} />
      </label>
      <label className="grid gap-1 text-[11px] text-text-muted">
        {lang === 'ko' ? '상태' : 'Status'}
        <select data-testid="metric-status-filter" value={status ?? ''} className="h-8 rounded-sm border border-border-strong bg-surface-card px-2 text-[12px] text-text-primary"
          onChange={e => setPage({ status: e.target.value === '' ? null : e.target.value })}>
          <option value="">{lang === 'ko' ? '전체' : 'All'}</option>
          {STATUSES.map(s => <option key={s} value={s}>{tx(STATUS_LABEL[s])}</option>)}
          {statusIllegal && <option value={status!}>{status}</option>}
        </select>
      </label>
      <label className="grid gap-1 text-[11px] text-text-muted">
        domain
        <select data-testid="metric-domain-filter" value={domain ?? ''} className="h-8 rounded-sm border border-border-strong bg-surface-card px-2 text-[12px] text-text-primary"
          onChange={e => setPage({ domain: e.target.value === '' ? null : e.target.value })}>
          <option value="">{lang === 'ko' ? '전체' : 'All'}</option>
          {DOMAINS.map(d => <option key={d} value={d}>{tx(DOMAIN_LABEL[d])}</option>)}
          {domainIllegal && <option value={domain!}>{domain}</option>}
        </select>
      </label>
      {(q || status || domain) && <Button variant="secondary" size="sm" className="h-8 rounded-sm" onClick={() => setPage({ q: null, status: null, domain: null })}>{lang === 'ko' ? '필터 초기화' : 'Reset filters'}</Button>}
    </div>}
  >
    <div className="space-y-3">
      <MetricPairBanner />
      {global.selection !== null && <p className="text-[12px] text-text-secondary">
        {lang === 'ko'
          ? `설비 선택 ${global.selection.length}건은 참조만입니다. 명시적 빈 집합이어도 카탈로그를 0건으로 만들지 않습니다.`
          : `Equipment selection (${global.selection.length}) is reference only. An explicit empty set does not force the catalog to zero rows.`}
      </p>}
      {(statusIllegal || domainIllegal) && <p role="alert" className="rounded-md bg-accent-warn-soft px-3 py-2 text-[12px] text-text-warning">
        {lang === 'ko'
          ? `등록되지 않은 페이지 필터입니다 (${statusIllegal ? `status=${status}` : `domain=${domain}`}). 전체로 바꾸지 않아 결과가 비었습니다.`
          : `Unregistered page filter (${statusIllegal ? `status=${status}` : `domain=${domain}`}). It is not coerced to All, so the result is empty.`}
      </p>}
      <PlatformDataTable
        title={lang === 'ko' ? '지표 카탈로그' : 'Metric catalog'}
        subtitle={lang === 'ko'
          ? `합성 ${METRICS.length}건. 게시 포인터는 레코드에 저장된 값이며 최대 버전 번호가 아닙니다. 초안 열기는 동작 열.`
          : `${METRICS.length} synthetic metrics. The published pointer is stored on the record, not max(version). Open a draft from the action column.`}
        ariaLabel={lang === 'ko' ? '지표 카탈로그' : 'Metric catalog'}
        preferenceKey="platform:table:metric-catalog"
        columns={columns}
        getRowId={row => row.metricId}
        filterKey={JSON.stringify([q, status, domain, lang])}
        pageSize={8}
        height={360}
        activeRowId={activeRowId}
        loadPage={(query, signal) => serve({
          global, signal, requiresScope: false, mergeTimeDomain: false, latency: 280, kinds: ['processing_delay'],
          compute: () => sortAndPage(filterCatalog(catalogRows(lang), q, status, domain).rows, query),
          isEmpty: data => data.total === 0,
        })}
        rowAction={row => <span className="flex flex-wrap gap-2">
          <PlatformLink className="text-[12px] font-medium text-accent-primary hover:underline" href={linkTo('metric-detail', { params: { metricId: row.metricId }, page: detailPage(row) })}>
            {lang === 'ko' ? '정의' : 'Definition'}
          </PlatformLink>
          {row.draftVersion && <PlatformLink className="text-[12px] text-text-secondary hover:underline" href={linkTo('metric-detail', { params: { metricId: row.metricId }, page: { version: row.draftVersion } })}>
            {lang === 'ko' ? `초안 v${row.draftVersion}` : `Draft v${row.draftVersion}`}
          </PlatformLink>}
        </span>}
        onExport={scope => {
          const rows = scope.kind === 'selected' ? filteredForExport.filter(r => scope.ids.includes(r.metricId)) : filteredForExport;
          const header = ['metricId', 'name', 'domain', 'grain', 'numerator', 'denominator', 'publishedPointer', 'status', 'owner', 'updatedAt'];
          const lines = rows.map(r => [r.metricId, lang === 'ko' ? r.nameKo : r.nameEn, r.domain, r.grain, r.numerator, r.denominator, r.publishedPointer ?? '', r.status, r.owner, r.updatedAt]
            .map(value => `"${String(value).replaceAll('"', '""')}"`).join(','));
          const blob = new Blob([`\uFEFF${header.join(',')}\n${lines.join('\n')}\n`], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'metric-catalog.csv';
          a.click();
          URL.revokeObjectURL(url);
        }}
      />
      <p className="t-caption text-text-muted">
        {lang === 'ko'
          ? 'Time·Lot·room_name·Condition·Selection은 이 목록의 필터가 아닙니다. 검색·상태·domain만 페이지 필터이며 URL 키 q, status, domain에 있습니다. 예시 데이터입니다.'
          : 'Time, lot, room_name, condition and selection do not filter this list. Search, status and domain are the page filters (URL keys q, status, domain). Synthetic data.'}
      </p>
    </div>
  </PlatformPage>;
}
