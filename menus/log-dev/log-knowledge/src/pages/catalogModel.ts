/**
 * Pure model of the catalog screen (#1194 b): the four tabs, URL page-key rules, default filter, Korean messages per
 * field-error code, the impact sentence of a deactivation and the links between tabs. No React here, so the rules are
 * unit-tested without a DOM.
 */
import { encodeFilterParams, type ColumnFilter, type FieldError } from '@ap/contracts';
import type { ModelRow, ProcessRow, SoftwareRow, VendorRow } from '../endpoints';
import { isUuid } from '../endpoints';

export const CATALOG_TABS = ['vendor', 'process', 'model', 'software'] as const;
export type CatalogKind = (typeof CATALOG_TABS)[number];
export const DEFAULT_TAB: CatalogKind = 'model';
export type CatalogRow = VendorRow | ProcessRow | ModelRow | SoftwareRow;

export const TAB_LABEL: Record<CatalogKind, string> = { vendor: '제조사', process: '공정', model: '모델', software: 'SW 버전' };
/** Page key `tab`: only the four ids; an absent key is the default tab. */
export const isCatalogTab = (raw: string): raw is CatalogKind => (CATALOG_TABS as readonly string[]).includes(raw);
export const tabOf = (raw: string | null): CatalogKind | 'invalid' => (raw === null ? DEFAULT_TAB : isCatalogTab(raw) ? raw : 'invalid');

/** Page key `focus`: a row id or `new`. */
export const isFocusValue = (raw: string): boolean => raw === 'new' || isUuid(raw);

/** The pinned 상태 filter every tab opens with: active rows only. */
export const ACTIVE_ONLY: ColumnFilter = { id: 'active', op: 'in', value: ['true'] };
export const defaultFilterParams = (): string[] => encodeFilterParams([ACTIVE_ONLY]);

/** The ids a table URL already names on the pickable fields (vendorId, processes, modelId): they stay selectable even when the bounded option list lacks them. */
export function chosenIds(rawFilters: readonly string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const raw of rawFilters) {
    const [id, op, value] = raw.split(':', 3) as [string, string | undefined, string | undefined];
    if (!['vendorId', 'processes', 'modelId'].includes(id) || (op !== 'in' && op !== 'notIn') || !value) continue;
    out[id] = [...(out[id] ?? []), ...value.split('~').filter(v => isUuid(v))];
  }
  return out;
}

/** Muted rows are the inactive ones (the 상태 badge keeps the state visible when the drawer narrows the table). */
export const isRowMuted = (row: { active: boolean }): boolean => !row.active;

/** A count cell opens the child tab with that parent as the filter (active rows only, like every tab entry). */
export type TabLink = { tab: CatalogKind; filter: string[] };
export function childLink(row: CatalogRow, from: CatalogKind): TabLink {
  const tab: CatalogKind = from === 'model' ? 'software' : 'model';
  const field = from === 'vendor' ? 'vendorId' : from === 'process' ? 'processes' : 'modelId';
  return { tab, filter: encodeFilterParams([ACTIVE_ONLY, { id: field, op: 'in', value: [row.id] }]) };
}
/** The page-key patch that switches tabs: search, sort, page and the open row are the old tab's, so they are cleared. */
export const tabPatch = (link: TabLink) => ({ tab: link.tab, filter: link.filter, q: null, sort: null, page: null, focus: null });

export const FIELD_LABEL: Record<string, string> = {
  code: '코드', name: '이름', vendorId: '제조사', processIds: '공정', modelId: '모델', versionLabel: '버전 표기',
};
const CODE_TEXT: Record<string, Record<string, string>> = {
  required: { '*': '필수 항목입니다' },
  too_long: { '*': '입력 길이가 너무 깁니다' },
  malformed: { '*': '사용할 수 없는 문자가 들어 있습니다' },
  duplicate: { code: '같은 코드가 이미 있습니다', versionLabel: '같은 버전 표기가 이미 있습니다', '*': '이미 있는 값입니다' },
  not_found: { '*': '찾을 수 없는 항목입니다' },
  inactive: { '*': '비활성 항목에는 연결할 수 없습니다' },
};
export function fieldErrorText(code: string, field: string): string {
  const byField = CODE_TEXT[code];
  return byField?.[field] ?? byField?.['*'] ?? `입력을 확인해 주세요 (${code})`;
}
/** Server field errors keyed by form field (first error per field wins); `form` collects errors on no known input (e.g. `id`). */
export function mapFieldErrors(errors: readonly FieldError[], fields: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const error of errors) {
    const head = error.path[0] ?? '';
    const key = fields.includes(head) ? head : 'form';
    out[key] ??= fieldErrorText(error.code, head);
  }
  return out;
}

/** ADR-0107 decision 4: only active children count, and they are not changed by deactivating the parent. */
export function impactText(kind: CatalogKind, row: CatalogRow): string {
  if (kind === 'vendor') return `이 제조사의 활성 모델 ${(row as VendorRow).modelCount}개가 있습니다. 모델은 바뀌지 않고 그대로 남습니다.`;
  if (kind === 'process') return `이 공정에 연결된 활성 모델 ${(row as ProcessRow).modelCount}개가 있습니다. 모델은 바뀌지 않고 그대로 남습니다.`;
  if (kind === 'model') return `이 모델의 활성 SW 버전 ${(row as ModelRow).softwareCount}개가 있습니다. SW 버전은 바뀌지 않고 그대로 남습니다.`;
  return '이 SW 버전은 하위 항목이 없습니다.';
}

/** SW 버전 column of the model tab: latest label and `외 n` for the others. */
export function softwareSummary(row: ModelRow): string {
  if (row.latestSoftwareLabel === null) return '—';
  return row.softwareCount > 1 ? `${row.latestSoftwareLabel} 외 ${row.softwareCount - 1}` : row.latestSoftwareLabel;
}

export type Banner = { kind: 'conflict' } | { kind: 'failed'; text: string; retry?: () => void };
/** Text of the banner for a write that did not succeed and has no field errors to show. */
export function failureText(outcome: string): string {
  if (outcome === 'forbidden') return '이 작업을 할 권한이 없습니다.';
  if (outcome === 'not_found') return '항목을 찾을 수 없습니다. 삭제되었거나 주소가 틀렸습니다.';
  if (outcome === 'invalid') return '입력을 확인해 주세요.';
  return '저장하지 못했습니다. 잠시 뒤 다시 시도해 주세요.';
}
