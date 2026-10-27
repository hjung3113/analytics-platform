// Validation of `AuditTrailQuery` / `EntityRef` bodies (packages/contracts adapter.ts), mirroring
// the reference semantics of packages/mock-server/src/audit.ts: unknown keys, wrong types, bad
// ranges and unparsable instants are all one malformed-query answer, never a coercion.

import { PLATFORM_AUDIT_ACTIONS, type PlatformAuditAction } from './audit-actions.js';

/** FeedbackOps `target.type` vocabulary: the subject types the SQL projection releases. */
export const AUDIT_TRAIL_SUBJECT_TYPES = [
  'voc',
  'finding',
  'task',
  'task_request',
  'entity_link',
  'voc_cluster',
  'permission_request',
  'permission_grant',
  'permission_deny',
  'survey',
  'survey_question',
  'managed_system',
  'analytics_area',
  'milestone',
  'attachment',
  'public_update_review_candidate',
  'voc_cluster_suggestion',
  'workspace',
] as const;

/** Entity types `getEntity` and `entityAudit` answer (ADR-0069 decision 9): the shared read gate's types. */
export const ENTITY_READABLE_TYPES = ['voc', 'finding', 'task'] as const;

export const AUDIT_SOURCES = ['user', 'system'] as const;
export type PlatformAuditSource = (typeof AUDIT_SOURCES)[number];
export const AUDIT_SORT_FIELDS = ['at', 'actor', 'action', 'source', 'targetType'] as const;
export type AuditSortField = (typeof AUDIT_SORT_FIELDS)[number];

const QUERY_KEYS = [
  'type',
  'actor',
  'action',
  'source',
  'fromAt',
  'toAt',
  'targetId',
  'page',
  'pageSize',
  'sort',
] as const;

export interface ParsedAuditQuery {
  type?: string;
  actor?: string;
  action?: PlatformAuditAction;
  source?: PlatformAuditSource;
  from?: Date;
  to?: Date;
  targetId?: string;
  page: number;
  pageSize: number;
  sort: { field: AuditSortField; desc: boolean };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string): boolean => UUID.test(value);

// Full ISO-8601 datetime with a REQUIRED zone (Z/z/±HH:MM/±HHMM), calendar-validated:
// same grammar as `instantEpochMs` in the platform contracts.
const ISO_INSTANT =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|z|([+-])(\d{2}):?(\d{2}))$/;

function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = ISO_INSTANT.exec(value);
  if (!m) return null;
  const [y, mo, d, h, mi, s, offH, offM] = [1, 2, 3, 4, 5, 6, 8, 9].map((i) => Number(m[i] ?? 0));
  const leap = (y as number) % 4 === 0 && ((y as number) % 100 !== 0 || (y as number) % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][(mo as number) - 1];
  if (
    (mo as number) < 1 ||
    (mo as number) > 12 ||
    (d as number) < 1 ||
    (d as number) > (days as number) ||
    (h as number) > 23 ||
    (mi as number) > 59 ||
    (s as number) > 59 ||
    (offH as number) > 23 ||
    (offM as number) > 59
  ) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Not a plain search token: empty, over 80 chars, or URL/whitespace-bearing. */
function invalidFilterText(value: unknown): boolean {
  return typeof value !== 'string' || !value || value.length > 80 || /[?#&\s]/.test(value);
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function parseAuditQuery(body: unknown): ParsedAuditQuery | null {
  if (!isPlainObject(body)) return null;
  if (Object.keys(body).some((key) => !(QUERY_KEYS as readonly string[]).includes(key))) {
    return null;
  }
  const { type, actor, action, source, fromAt, toAt, targetId, page, pageSize, sort } = body;
  if (
    type !== undefined &&
    (typeof type !== 'string' || !(AUDIT_TRAIL_SUBJECT_TYPES as readonly string[]).includes(type))
  ) {
    return null;
  }
  if (action !== undefined && !(PLATFORM_AUDIT_ACTIONS as readonly unknown[]).includes(action)) {
    return null;
  }
  if (source !== undefined && !(AUDIT_SOURCES as readonly unknown[]).includes(source)) return null;
  if (actor !== undefined && invalidFilterText(actor)) return null;
  if (targetId !== undefined && (invalidFilterText(targetId) || type === undefined)) return null;
  let parsedSort: ParsedAuditQuery['sort'] = { field: 'at', desc: true };
  if (sort !== undefined) {
    if (!isPlainObject(sort)) return null;
    if (Object.keys(sort).some((key) => key !== 'field' && key !== 'desc')) return null;
    if (
      !(AUDIT_SORT_FIELDS as readonly unknown[]).includes(sort.field) ||
      typeof sort.desc !== 'boolean'
    ) {
      return null;
    }
    parsedSort = { field: sort.field as AuditSortField, desc: sort.desc };
  }
  const from = fromAt === undefined ? undefined : parseInstant(fromAt);
  const to = toAt === undefined ? undefined : parseInstant(toAt);
  if (from === null || to === null) return null;
  if (from && to && from.getTime() >= to.getTime()) return null;
  if (page !== undefined && (typeof page !== 'number' || !Number.isSafeInteger(page) || page < 1)) {
    return null;
  }
  if (
    pageSize !== undefined &&
    (typeof pageSize !== 'number' || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100)
  ) {
    return null;
  }
  return {
    ...(type !== undefined ? { type: type as string } : {}),
    ...(actor !== undefined ? { actor: actor as string } : {}),
    ...(action !== undefined ? { action: action as PlatformAuditAction } : {}),
    ...(source !== undefined ? { source: source as PlatformAuditSource } : {}),
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
    ...(targetId !== undefined ? { targetId: targetId as string } : {}),
    page: (page as number | undefined) ?? 1,
    pageSize: (pageSize as number | undefined) ?? 25,
    sort: parsedSort,
  };
}

export interface ParsedEntityRef {
  type: string;
  id: string;
  scopeId: string | null;
}

export function parseEntityRef(body: unknown): ParsedEntityRef | null {
  if (!isPlainObject(body)) return null;
  if (Object.keys(body).some((key) => key !== 'type' && key !== 'id' && key !== 'scopeId')) {
    return null;
  }
  const { type, id, scopeId } = body;
  if (typeof type !== 'string' || typeof id !== 'string') return null;
  if (scopeId !== null && typeof scopeId !== 'string') return null;
  return { type, id, scopeId };
}
