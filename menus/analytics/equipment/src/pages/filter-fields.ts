import type { PageFilterField } from '@ap/components';
import { statusText } from './data';

type EquipmentFilterKey = 'q' | 'status' | 'maker';

/** Draft + apply (ADR-0037): every field edits the host's draft; `useManagementFilters` owns the apply. */
export function equipmentPageFilterFields({
  values, set, makers, lang,
}: {
  values: Record<EquipmentFilterKey, string>;
  set: (key: EquipmentFilterKey, value: string) => void;
  makers: readonly string[];
  lang: 'ko' | 'en';
}): PageFilterField[] {
  return [
    { kind: 'search', key: 'q', label: lang === 'ko' ? '설비 ID 검색' : 'Search equipment ID', value: values.q, onValueChange: value => set('q', value) },
    { kind: 'select', key: 'status', label: lang === 'ko' ? '상태' : 'Status', value: values.status, emptyOptionLabel: lang === 'ko' ? '전체' : 'All', options: Object.entries(statusText).map(([value, text]) => ({ value, label: text[lang] })), onValueChange: value => set('status', value) },
    { kind: 'select', key: 'maker', label: 'Maker', value: values.maker, emptyOptionLabel: lang === 'ko' ? '전체' : 'All', options: makers.map(value => ({ value, label: value })), onValueChange: value => set('maker', value) },
  ];
}
