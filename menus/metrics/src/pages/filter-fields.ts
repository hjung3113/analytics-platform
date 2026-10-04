import type { PageFilterField } from '@ap/components';
import { DOMAINS, STATUSES, type Text } from '../endpoints';
import { DOMAIN_LABEL, STATUS_LABEL } from './data';

type SetPage = (patch: Record<string, string | null>, options?: { replace?: boolean }) => void;

export function metricCatalogPageFilterFields({
  q, status, domain, lang, tx, setPage,
}: {
  q: string | null;
  status: string | null;
  domain: string | null;
  lang: 'ko' | 'en';
  tx: (text: Text) => string;
  setPage: SetPage;
}): PageFilterField[] {
  return [
    { kind: 'search', key: 'q', testId: 'metric-search', label: lang === 'ko' ? '이름 또는 metricId' : 'Name or metricId', value: q ?? '', placeholder: lang === 'ko' ? '검색' : 'Search', onValueChange: value => setPage({ q: value === '' ? null : value, page: null }, { replace: true }) },
    { kind: 'select', key: 'status', testId: 'metric-status-filter', label: lang === 'ko' ? '상태' : 'Status', value: status ?? '', emptyOptionLabel: lang === 'ko' ? '전체' : 'All', options: STATUSES.map(value => ({ value, label: tx(STATUS_LABEL[value]) })), onValueChange: value => setPage({ status: value === '' ? null : value, page: null }) },
    { kind: 'select', key: 'domain', testId: 'metric-domain-filter', label: 'domain', value: domain ?? '', emptyOptionLabel: lang === 'ko' ? '전체' : 'All', options: DOMAINS.map(value => ({ value, label: tx(DOMAIN_LABEL[value]) })), onValueChange: value => setPage({ domain: value === '' ? null : value, page: null }) },
  ];
}

export function metricCatalogHasActiveFilters(q: string | null, status: string | null, domain: string | null) {
  return Boolean(q || status || domain);
}

export function resetMetricCatalogPageFilters(setPage: SetPage) {
  setPage({ q: null, status: null, domain: null, page: null });
}
