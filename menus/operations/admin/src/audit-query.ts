/**
 * Page-key vocabulary and parser for the console audit screen (#50, #305, 06 §6.1). Pure and node-runnable:
 * the screen calls it before loadPage, and an invalid wire value alerts instead of substituting (same
 * pattern as UsageOverview). Absent = unset. The value domains mirror the server's `Invalid audit filter`
 * list (§2 step 4): an id is only unique inside a type. The time window is compared as epochs — one side
 * alone is an open bound, both sides are half-open [fromAt, toAt), and fromAt >= toAt, a string without a
 * zone, or a calendar error is invalid, never clamped. This is the audit page key, not the global from/to
 * rule in 06 §6.4.
 */
import type { AuditAction, AuditSource, PageSort } from '@ap/contracts';
import { instantEpochMs } from '@ap/contracts';
import { parsePageIndex, parseTableSort } from '@ap/components';

/** The nine page keys of `admin-audit`; the reset button clears exactly these. */
export const AUDIT_PAGE_KEYS = ['type', 'actor', 'action', 'source', 'fromAt', 'toAt', 'targetId', 'sort', 'page'] as const;

/** Sortable columns only — `targetType` sorts `target.type`; the destination columns never sort. */
export const SORT_FIELDS = ['at', 'actor', 'action', 'source', 'targetType'];

/** The timeline words, copied from AuditTimeline (§6: do not export a label helper from components). */
export const ACTION_LABEL: Record<AuditAction, { ko: string; en: string }> = {
  create: { ko: '생성', en: 'Created' }, update: { ko: '변경', en: 'Updated' },
  retire: { ko: '유효 종료', en: 'Retired' }, sync: { ko: '동기화', en: 'Synced' }, delete: { ko: '삭제', en: 'Deleted' },
};

/** Display words for the wire values; the URL and adapter keep the raw `user`/`system`·`equipment`/`metric`. */
export const SOURCE_LABEL: Record<AuditSource, { ko: string; en: string }> = {
  user: { ko: '사용자', en: 'User' }, system: { ko: '시스템', en: 'System' },
};
export type AuditTargetType = 'equipment' | 'metric' | 'annotation';
export const TYPE_LABEL: Record<AuditTargetType, { ko: string; en: string }> = {
  equipment: { ko: '설비', en: 'Equipment' }, metric: { ko: '지표', en: 'Metric' }, annotation: { ko: '차트 주석', en: 'Chart annotation' },
};

const AUDIT_TYPES: readonly string[] = Object.keys(TYPE_LABEL);
const AUDIT_ACTIONS: readonly string[] = Object.keys(ACTION_LABEL);
const AUDIT_SOURCES: readonly string[] = Object.keys(SOURCE_LABEL);

export type AuditFilters = {
  type: AuditTargetType | null;
  actor: string | null;
  action: AuditAction | null;
  source: AuditSource | null;
  fromAt: string | null;
  toAt: string | null;
  targetId: string | null;
};

export type ParsedAuditKeys =
  | { ok: true; filters: AuditFilters; sorting: PageSort[]; page: number | null }
  | { ok: false };

/** Which URL key failed, for the table-slot line. `order` is the end bound not after the start;
 *  `calendar` is a well-formed instant that names no real date/time, `invalid` the rest. */
export type AuditKeyProblem =
  | { key: 'sort' | 'page' | 'type' | 'action' | 'source' | 'actor'; reason: 'invalid' }
  | { key: 'targetId'; reason: 'invalid' | 'needs-type' }
  | { key: 'fromAt'; reason: 'invalid' | 'calendar' }
  | { key: 'toAt'; reason: 'invalid' | 'calendar' | 'order' };

type AuditRaw = {
  type: string | null; actor: string | null; action: string | null; source: string | null;
  fromAt: string | null; toAt: string | null; targetId: string | null; sort: string | null; page: string | null;
};

/** True when the operator text is not a plain token: empty, over 80 chars, or URL/whitespace-bearing. */
const invalidText = (value: string): boolean => !value || value.length > 80 || /[?#&\s]/.test(value);

/** The time keys' wire form (ISO-8601 instant with a required zone), matching the anchored grammar
 *  `instantEpochMs` accepts. Tested first because `instantEpochMs` throws one error for both a format
 *  miss and a calendar miss, and @ap/contracts is not the menu's to change. Keep in lockstep. */
const AT_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|z|[+-]\d{2}:?\d{2})$/;

/** The first key the server would reject, or null when the URL is a query the adapter may see. */
export function auditKeyProblem(raw: AuditRaw): AuditKeyProblem | null {
  if (!parseTableSort(raw.sort, SORT_FIELDS).ok) return { key: 'sort', reason: 'invalid' };
  if (!parsePageIndex(raw.page).ok) return { key: 'page', reason: 'invalid' };
  if (raw.type !== null && !AUDIT_TYPES.includes(raw.type)) return { key: 'type', reason: 'invalid' };
  if (raw.action !== null && !AUDIT_ACTIONS.includes(raw.action)) return { key: 'action', reason: 'invalid' };
  if (raw.source !== null && !AUDIT_SOURCES.includes(raw.source)) return { key: 'source', reason: 'invalid' };
  if (raw.actor !== null && invalidText(raw.actor)) return { key: 'actor', reason: 'invalid' };
  if (raw.targetId !== null && invalidText(raw.targetId)) return { key: 'targetId', reason: 'invalid' };
  if (raw.targetId !== null && raw.type === null) return { key: 'targetId', reason: 'needs-type' };
  for (const key of ['fromAt', 'toAt'] as const) {
    const value = raw[key];
    if (value === null) continue;
    if (!AT_INSTANT.test(value)) return { key, reason: 'invalid' };
    try {
      instantEpochMs(value);
    } catch {
      return { key, reason: 'calendar' };
    }
  }
  if (raw.fromAt !== null && raw.toAt !== null && instantEpochMs(raw.fromAt) >= instantEpochMs(raw.toAt)) {
    return { key: 'toAt', reason: 'order' };
  }
  return null;
}

/** The screen's URL keys, validated without coercion. Anything the server would reject with
 *  `Invalid audit filter` is already invalid here, so a bad value never reaches the adapter. */
export function parseAuditKeys(raw: AuditRaw): ParsedAuditKeys {
  const parsedSort = parseTableSort(raw.sort, SORT_FIELDS);
  const parsedPage = parsePageIndex(raw.page);
  if (!parsedSort.ok || !parsedPage.ok || auditKeyProblem(raw)) return { ok: false };
  return {
    ok: true,
    filters: {
      type: raw.type as AuditFilters['type'],
      actor: raw.actor,
      action: raw.action as AuditFilters['action'],
      source: raw.source as AuditFilters['source'],
      fromAt: raw.fromAt,
      toAt: raw.toAt,
      targetId: raw.targetId,
    },
    sorting: parsedSort.sorting,
    page: parsedPage.page === 1 ? null : parsedPage.page,
  };
}
