/**
 * Metric catalog filter declarations (ADR-0105, #1218): 상태 and 도메인 are pinned enum conditions of the hidden
 * repeated page key `filter`, both table columns, applied per condition and instantly. `q` stays the toolbar
 * quick search (`TableQuickSearch`). The URL codec checks the condition shape but not enum membership, so the
 * page value check below refuses unknown tokens (rejected, never corrected — 06 §6).
 */
import type { FilterValueCheck, TableFilterDeclaration } from '@ap/components';
import { catalogFilterSpecs, DOMAINS, STATUSES, type Domain, type Lang, type PublicationState } from '../endpoints';
import { DOMAIN_LABEL, STATUS_LABEL } from './data';

/** Both fields are catalog columns: the funnel, chip line and editor come from `filterColumnProps(id, options)`; `filterFields` stays empty. */
export const catalogFilterDeclarations: readonly TableFilterDeclaration[] = [
  { id: 'status', label: { ko: '상태', en: 'Status' }, spec: catalogFilterSpecs.status, pinned: true },
  { id: 'domain', label: { ko: '도메인', en: 'Domain' }, spec: catalogFilterSpecs.domain, pinned: true },
];

const BAD_STATUS = { ko: '등록되지 않은 발행 상태입니다.', en: 'This publication state is not registered.' };
const BAD_DOMAIN = { ko: '등록되지 않은 도메인입니다.', en: 'This domain is not registered.' };

/** The enum token rules the codec's shape check cannot express: membership in STATUSES/DOMAINS (#304; same check in the editor draft and every condition read from the address). */
export const catalogValueCheck: FilterValueCheck = filter => {
  if (filter.id === 'status' && filter.op === 'in' && !filter.value.every(v => STATUSES.includes(v as PublicationState))) return BAD_STATUS;
  if (filter.id === 'domain' && filter.op === 'in' && !filter.value.every(v => DOMAINS.includes(v as Domain))) return BAD_DOMAIN;
  return null;
};

/** Localized editor/chip options for the column funnel. The URL spec keeps the raw tokens; late options change only the editor, never the wire rules. */
export function catalogFilterOptions(id: 'status' | 'domain', lang: Lang): { value: string; label: string }[] {
  if (id === 'status') return STATUSES.map(value => ({ value, label: STATUS_LABEL[value][lang] }));
  return DOMAINS.map(value => ({ value, label: DOMAIN_LABEL[value][lang] }));
}
