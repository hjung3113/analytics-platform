/**
 * Global audit-trail reads (issue #50). Not an analysis path — no GlobalContext, no Scope partition on the
 * console read, no serve() equipment/time-domain resolution — and not finished by finish(): its mart trust
 * (`mart.productivity_hourly`) and `collection` assessment would both be fake here, so trust is null and
 * assessments are empty on every branch. No new AssessmentKind: this query has no mart kind to declare.
 *
 * Two reads, two permission models. `auditTrail` mirrors `usageSummary()` (pinned-role console:access
 * before any scenario, then validation, then the empty scenario). `entityAudit` follows `getEntity()`'s
 * order (destination type → the destination's own view permission → scenarios → scope/room gates) so an
 * engineer without console:access still sees the equipment audit tab they already have; a miss never wears
 * mart trust. `partial` and `too_large` do not apply to `auditTrail` (not a mart, no period budget);
 * `entityAudit` consults `partial` through getEntity's shared counter.
 */
import type { ApiResponse, Assessment, AuditAction, AuditEvent, AuditSortField, AuditSource, AuditTrailPage, AuditTrailQuery, EntityRef } from '@ap/contracts';
import { instantEpochMs } from '@ap/contracts';
import { checkScope, getRole, getScenario, nextCorrelation, partialFails, sleep } from './server';
import { AUDIT_EVENTS } from './audit-fixtures';
import { EQUIPMENT, USERS, type RoleId } from './world';

export type AuditOptions = { role?: RoleId; latency?: number };

const AUDIT_TYPES = ['equipment', 'metric'];
const AUDIT_ACTIONS = ['create', 'update', 'retire', 'sync'] as const satisfies readonly AuditAction[];
const AUDIT_SOURCES = ['user', 'system'] as const satisfies readonly AuditSource[];
const AUDIT_SORT_FIELDS = ['at', 'actor', 'action', 'source', 'targetType'] as const satisfies readonly AuditSortField[];
/** Declared wire keys (issue #50) — anything else a client sends is an unknown key, not a silent no-op. */
const AUDIT_QUERY_KEYS = ['type', 'actor', 'action', 'source', 'fromAt', 'toAt', 'targetId', 'page', 'pageSize', 'sort'] as const;

/** True when the filter text is not a plain search token: empty, over 80 chars, or URL/whitespace-bearing. */
function invalidFilterText(value: unknown): boolean {
  return typeof value !== 'string' || !value || value.length > 80 || /[?#&\s]/.test(value);
}

/**
 * One message for every malformed query (`Invalid audit filter`); never a coercion to page 1 or to "all",
 * and never an echo of the bad value into a different filter. An id is only unique inside a type, so
 * `targetId` without `type` is a format error, not a search of both.
 */
function invalidAuditQuery(query: AuditTrailQuery): boolean {
  if (Object.keys(query).some(key => !(AUDIT_QUERY_KEYS as readonly string[]).includes(key))) return true;
  if (query.type !== undefined && (typeof query.type !== 'string' || !AUDIT_TYPES.includes(query.type))) return true;
  if (query.action !== undefined && !AUDIT_ACTIONS.includes(query.action)) return true;
  if (query.source !== undefined && !AUDIT_SOURCES.includes(query.source)) return true;
  if (query.actor !== undefined && invalidFilterText(query.actor)) return true;
  if (query.targetId !== undefined && (invalidFilterText(query.targetId) || query.type === undefined)) return true;
  if (query.sort !== undefined) {
    if (typeof query.sort !== 'object' || query.sort === null) return true;
    if (Object.keys(query.sort).some(key => key !== 'field' && key !== 'desc')) return true;
    if (!AUDIT_SORT_FIELDS.includes(query.sort.field) || typeof query.sort.desc !== 'boolean') return true;
  }
  // The window is half-open [fromAt, toAt) compared as epochs. One side only, a naive string, or
  // fromAt >= toAt is a format error (§6.4's one-sided rule), never a clamped range.
  let fromMs: number | null = null;
  let toMs: number | null = null;
  try {
    if (query.fromAt !== undefined) fromMs = instantEpochMs(query.fromAt);
    if (query.toAt !== undefined) toMs = instantEpochMs(query.toAt);
  } catch {
    return true;
  }
  if ((query.fromAt !== undefined) !== (query.toAt !== undefined)) return true;
  if (fromMs !== null && toMs !== null && fromMs >= toMs) return true;
  if (query.page !== undefined && (typeof query.page !== 'number' || !Number.isInteger(query.page) || query.page < 1)) return true;
  if (query.pageSize !== undefined && (typeof query.pageSize !== 'number' || !Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > 100)) return true;
  return false;
}

/** Newest first, with the id as the tie-break: string compare is wrong once `Z` and `+09:00` both occur. */
function compareEventsDesc(a: AuditEvent, b: AuditEvent): number {
  const byAt = instantEpochMs(b.at) - instantEpochMs(a.at);
  return byAt !== 0 ? byAt : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function sortValue(event: AuditEvent, field: AuditSortField): string {
  if (field === 'at') return event.at;
  if (field === 'targetType') return event.target.type;
  return event[field];
}

function compareBySort(sort: { field: AuditSortField; desc: boolean }): (a: AuditEvent, b: AuditEvent) => number {
  return (a, b) => {
    const ordered = sort.field === 'at'
      ? instantEpochMs(a.at) - instantEpochMs(b.at)
      : sortValue(a, sort.field).localeCompare(sortValue(b, sort.field));
    const directed = sort.desc ? -ordered : ordered;
    return directed !== 0 ? directed : compareEventsDesc(a, b);
  };
}

/**
 * The console audit log (docs/06 §22 index side). Not room-filtered: the one console role is the operator
 * role, and hiding a room's change is the opposite of an audit screen. A zero is a meaningful audit result,
 * so the empty scenario and an empty match both answer outcome 'empty'; a page past the end with rows
 * behind it answers ok with the true total, never a rewrite to page 1.
 */
export async function auditTrail(query: AuditTrailQuery, signal?: AbortSignal, opts?: AuditOptions): Promise<ApiResponse<AuditTrailPage>> {
  // Pin identity at send time, like serve(): a role switch while in flight must not re-evaluate this request.
  const s = getScenario();
  const requestRole = opts?.role ?? getRole();
  const correlationId = nextCorrelation();
  await sleep(opts?.latency ?? 80, signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  // Operator permission beats every scenario and every filter (a targetId here is search text, not the detail read).
  if (!USERS[requestRole].permissions.includes('console:access')) return { ...base, outcome: 'forbidden', message: 'No permission console:access' };
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  if (s === 'forbidden') return { ...base, outcome: 'forbidden', message: 'Permission revoked (scenario)' };
  if (invalidAuditQuery(query)) return { ...base, outcome: 'error', message: 'Invalid audit filter' };
  if (s === 'empty') return { ...base, outcome: 'empty' };
  const fromMs = query.fromAt !== undefined ? instantEpochMs(query.fromAt) : null;
  const toMs = query.toAt !== undefined ? instantEpochMs(query.toAt) : null;
  const filtered = AUDIT_EVENTS.filter(event =>
    (query.type === undefined || event.target.type === query.type)
    && (query.actor === undefined || event.actor === query.actor)
    && (query.action === undefined || event.action === query.action)
    && (query.source === undefined || event.source === query.source)
    && (query.targetId === undefined || event.target.id === query.targetId)
    && (fromMs === null || instantEpochMs(event.at) >= fromMs)
    && (toMs === null || instantEpochMs(event.at) < toMs))
    .sort(query.sort ? compareBySort(query.sort) : compareEventsDesc);
  if (filtered.length === 0) return { ...base, outcome: 'empty' };
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 25;
  const start = (page - 1) * pageSize;
  return { ...base, outcome: 'ok', data: { items: filtered.slice(start, start + pageSize), total: filtered.length } };
}

/**
 * One destination's audit events, the detail-tab read (docs/06 §22 destination side). Same order and
 * messages as getEntity(): unknown type first, the destination's own view permission, scenarios, then the
 * equipment scope/room gates — a room miss must not leak the id, name or any changes value. A metric has
 * no site, so a scopeId on a metric ref is a caller error, not a filter to drop. Unknown destination or
 * the empty scenario answer outcome 'empty' (a confirmed zero), never ok with an empty list.
 */
export async function entityAudit(ref: EntityRef, signal?: AbortSignal, opts?: AuditOptions): Promise<ApiResponse<{ events: readonly AuditEvent[] }>> {
  const s = getScenario();
  const requestRole = opts?.role ?? getRole();
  const correlationId = nextCorrelation();
  await sleep(opts?.latency ?? 80, signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  // 1. Unknown entity type, before the permission check (same as getEntity).
  if (ref.type !== 'equipment' && ref.type !== 'metric') return { ...base, outcome: 'error', message: 'Unknown entity type' };
  // 2. The destination's own view permission — not console:access.
  const permission = ref.type === 'equipment' ? 'equipment:view' : 'metrics:view';
  if (!USERS[requestRole].permissions.includes(permission)) return { ...base, outcome: 'forbidden', message: `No permission ${permission}` };
  // 3. Scenario early returns, same as getEntity() (shared partial counter).
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  if (partialFails(s)) return { ...base, outcome: 'error', message: 'Widget query failed (partial scenario)' };
  if (ref.type === 'equipment') {
    // 4. Site gate before any search: never look up equipment for an ungranted or unknown scope.
    const scope = checkScope(requestRole, ref.scopeId);
    if (scope.status !== 'valid') return { ...base, outcome: 'forbidden', message: scope.status === 'forbidden' ? `No grant for scope ${ref.scopeId}` : `Unknown scope ${ref.scopeId}` };
    // 5. Lookup only inside the requested site; a room miss beats the forbidden scenario and leaks nothing.
    const row = EQUIPMENT.find(e => e.site === ref.scopeId && e.equipmentId === ref.id);
    if (row && !scope.grantedRooms.includes(row.room)) return { ...base, outcome: 'forbidden', message: 'No grant for equipment' };
    if (s === 'forbidden') return { ...base, outcome: 'forbidden', message: 'Permission revoked (scenario)' };
    const events = AUDIT_EVENTS.filter(event => event.target.type === 'equipment' && event.target.id === ref.id);
    if (s === 'empty' || !row || events.length === 0) return { ...base, outcome: 'empty' };
    return { ...base, outcome: 'ok', data: { events: [...events].sort(compareEventsDesc) } };
  }
  // 6. A metric destination has no site; do not drop the site and do not filter by it.
  if (ref.scopeId !== null) return { ...base, outcome: 'error', message: 'Metric audit has no scope' };
  if (s === 'forbidden') return { ...base, outcome: 'forbidden', message: 'Permission revoked (scenario)' };
  const events = AUDIT_EVENTS.filter(event => event.target.type === 'metric' && event.target.id === ref.id);
  if (s === 'empty' || events.length === 0) return { ...base, outcome: 'empty' };
  return { ...base, outcome: 'ok', data: { events: [...events].sort(compareEventsDesc) } };
}
