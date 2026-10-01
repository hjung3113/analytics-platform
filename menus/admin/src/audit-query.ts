/**
 * Page-key vocabulary and parser for the console audit screen (#50, 06 §6.1). Pure and node-runnable:
 * the screen calls it before loadPage, and an invalid wire value alerts instead of substituting (same
 * pattern as UsageOverview). Absent = unset. The value domains mirror the server's `Invalid audit filter`
 * list (§2 step 4): an id is only unique inside a type, and the instant window is half-open [fromAt, toAt)
 * compared as epochs — a one-sided pair, a naive digit string or fromAt >= toAt is invalid, never clamped.
 */
import type { AuditAction, AuditSource, PageSort } from '@ap/contracts';
import { instantEpochMs } from '@ap/contracts';
import { parsePageIndex, parseTableSort } from '@ap/components';

/** The nine page keys of `admin-audit`; the reset button clears exactly these. */
export const AUDIT_PAGE_KEYS = ['type', 'actor', 'action', 'source', 'fromAt', 'toAt', 'targetId', 'sort', 'page'] as const;

/** Sortable columns only — `targetType` sorts `target.type`; the destination columns never sort. */
const SORT_FIELDS = ['at', 'actor', 'action', 'source', 'targetType'];
const AUDIT_TYPES = ['equipment', 'metric'];
const AUDIT_ACTIONS = ['create', 'update', 'retire', 'sync'];
const AUDIT_SOURCES = ['user', 'system'];

/** The four timeline words, copied from AuditTimeline (§6: do not export a label helper from components). */
export const ACTION_LABEL: Record<AuditAction, { ko: string; en: string }> = {
  create: { ko: '생성', en: 'Created' }, update: { ko: '변경', en: 'Updated' },
  retire: { ko: '유효 종료', en: 'Retired' }, sync: { ko: '동기화', en: 'Synced' },
};

export type AuditFilters = {
  type: 'equipment' | 'metric' | null;
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

/** True when the operator text is not a plain token: empty, over 80 chars, or URL/whitespace-bearing. */
const invalidText = (value: string): boolean => !value || value.length > 80 || /[?#&\s]/.test(value);

/** The screen's URL keys, validated without coercion. Anything the server would reject with
 *  `Invalid audit filter` is already invalid here, so a bad value never reaches the adapter. */
export function parseAuditKeys(raw: {
  type: string | null; actor: string | null; action: string | null; source: string | null;
  fromAt: string | null; toAt: string | null; targetId: string | null; sort: string | null; page: string | null;
}): ParsedAuditKeys {
  const parsedSort = parseTableSort(raw.sort, SORT_FIELDS);
  const parsedPage = parsePageIndex(raw.page);
  if (!parsedSort.ok || !parsedPage.ok) return { ok: false };
  if (raw.type !== null && !AUDIT_TYPES.includes(raw.type)) return { ok: false };
  if (raw.action !== null && !AUDIT_ACTIONS.includes(raw.action)) return { ok: false };
  if (raw.source !== null && !AUDIT_SOURCES.includes(raw.source)) return { ok: false };
  if (raw.actor !== null && invalidText(raw.actor)) return { ok: false };
  if (raw.targetId !== null && (invalidText(raw.targetId) || raw.type === null)) return { ok: false };
  let fromMs: number | null = null;
  let toMs: number | null = null;
  try {
    if (raw.fromAt !== null) fromMs = instantEpochMs(raw.fromAt);
    if (raw.toAt !== null) toMs = instantEpochMs(raw.toAt);
  } catch {
    return { ok: false };
  }
  if ((raw.fromAt !== null) !== (raw.toAt !== null)) return { ok: false };
  if (fromMs !== null && toMs !== null && fromMs >= toMs) return { ok: false };
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
