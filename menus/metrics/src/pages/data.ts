/** Metric display labels (client only). Record types and the shared diff live in `../endpoints`. */
import type { Tone } from '@ap/ui';
import type { CatalogExportFilter, CatalogFilter, ConsumerMenuId, Domain, MetricKind, PublicationState, Text } from '../endpoints';
import type { PageSort } from '@ap/contracts';

export const DOMAIN_LABEL: Record<Domain, Text> = {
  productivity: { ko: '생산성', en: 'Productivity' },
  time: { ko: '시간', en: 'Time' },
  movement: { ko: '이송', en: 'Movement' },
  quality: { ko: '품질', en: 'Quality' },
  maintenance: { ko: '보전', en: 'Maintenance' },
};

export const STATUS_LABEL: Record<PublicationState, Text> = {
  draft: { ko: '초안', en: 'Draft' },
  published: { ko: '게시', en: 'Published' },
  deprecated: { ko: '폐기', en: 'Deprecated' },
};

export const STATUS_TONE: Record<PublicationState, Tone> = {
  draft: 'neutral',
  published: 'success',
  deprecated: 'warning',
};

export const KIND_LABEL: Record<MetricKind, Text> = {
  ratio: { ko: '비율', en: 'Ratio' },
  quantile: { ko: '분위수', en: 'Quantile' },
  count: { ko: '건수', en: 'Count' },
  duration: { ko: '시간', en: 'Duration' },
};

export const CONSUMER_LABEL: Record<ConsumerMenuId, Text> = {
  'productivity-overview': { ko: '생산성 개요', en: 'Productivity overview' },
  'cycle-time': { ko: '사이클타임 상세', en: 'Cycle time detail' },
};

/** Table-owned export params (#173): the catalog filters, the selection ids (`null` = every filtered row) and the table's active sort. */
export function exportParams(
  filter: CatalogFilter,
  request: { scope: { kind: 'selected'; ids: string[] } | { kind: 'filtered' }; sorting: PageSort[] },
): CatalogExportFilter {
  return { ...filter, ids: request.scope.kind === 'selected' ? request.scope.ids : null, sorting: request.sorting };
}

/** Readable page filters for the XLSX 조회 정보 sheet (#173 review P2-3); unset filters are omitted. */
export function exportFilterSummary({ q, status, domain }: CatalogFilter, lang: 'ko' | 'en', tx: (text: Text) => string): [string, string][] {
  const rows: [string, string][] = [];
  if (q) rows.push([lang === 'ko' ? '검색어' : 'Search', q]);
  if (status != null && status in STATUS_LABEL) rows.push([lang === 'ko' ? '상태' : 'Status', tx(STATUS_LABEL[status as PublicationState])]);
  if (domain != null && domain in DOMAIN_LABEL) rows.push([lang === 'ko' ? '도메인' : 'Domain', tx(DOMAIN_LABEL[domain as Domain])]);
  return rows;
}

