// THROWAWAY #306 — never merge.
import type { PageFilterField } from '@ap/components';
import { statusText } from './data';

type SetPage = (patch: Record<string, string | null>, options?: { replace?: boolean }) => void;

export function equipmentPageFilterFields({
  q, status, maker, makers, lang, setPage, onField = (key, value) => setPage({ [key]: value || null, page: null }, key === 'q' ? { replace: true } : undefined),
}: {
  q: string;
  status: string;
  maker: string;
  makers: readonly string[];
  lang: 'ko' | 'en';
  setPage: SetPage;
  /** #306 prototype: hosts that own a draft pass this instead of committing per field. */
  onField?: (key: 'q' | 'status' | 'maker', value: string) => void;
}): PageFilterField[] {
  return [
    { kind: 'search', key: 'q', label: lang === 'ko' ? '설비 ID 검색' : 'Search equipment ID', value: q, onValueChange: value => onField('q', value) },
    { kind: 'select', key: 'status', label: lang === 'ko' ? '상태' : 'Status', value: status, emptyOptionLabel: lang === 'ko' ? '전체' : 'All', options: Object.entries(statusText).map(([value, text]) => ({ value, label: text[lang] })), onValueChange: value => onField('status', value) },
    { kind: 'select', key: 'maker', label: 'Maker', value: maker, emptyOptionLabel: lang === 'ko' ? '전체' : 'All', options: makers.map(value => ({ value, label: value })), onValueChange: value => onField('maker', value) },
  ];
}

export function resetEquipmentPageFilters(setPage: SetPage) {
  setPage({ q: null, status: null, maker: null, page: null });
}
