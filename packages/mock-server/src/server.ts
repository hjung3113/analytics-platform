/**
 * Mock request validation + response envelope (docs/06 §19): exclusive `outcome` plus declared `assessments[]`.
 * Every page query goes through `serve()` so Scope/room grants are re-validated per request (§6.2).
 */
import { parseDateTime, periodHours, type ApiResponse, type ClientErrorReport, type Assessment, type AssessmentKind, type Condition, type EntityRef, type GlobalContext, type Permission, type ScopeCheck, type SpaceId, type Trust, type UsageEvent, type UsageRange, type UsageSummary } from '@ap/contracts';
import { EQUIPMENT, SITES, TIME_DOMAIN_ASSERTIONS, USERS, type Equipment, type RoleId, type TimeDomainAssertion } from './world';

/**
 * Server-side state the dev tools can flip: the signed-in role (a stand-in for SSO) and the response scenario.
 * Listeners hear both; the platform adapter forwards them to the kernel (mock/adapter.ts).
 */
export type Scenario = 'normal' | 'slow' | 'empty' | 'error' | 'forbidden' | 'too_large' | 'timeout' | 'partial' | 'unknown_status' | 'malformed';
const ROLE_KEY = 'platform:role';
function storedRole(): RoleId {
  try { const raw = localStorage.getItem(ROLE_KEY); const role = raw ? JSON.parse(raw) : null; return role in USERS ? role : 'engineer'; } catch { return 'engineer'; }
}
let role: RoleId = storedRole();
let scenario: Scenario = 'normal';
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());
export const getRole = () => role;
export function setRole(next: RoleId) {
  role = next;
  try { localStorage.setItem(ROLE_KEY, JSON.stringify(next)); } catch { /* memory-only */ }
  notify();
}
export const getScenario = () => scenario;
export function setScenario(next: Scenario) { scenario = next; notify(); }
export function subscribeServer(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

let correlation = 4100;
let partialCounter = 0;
/** Shared by every endpoint module (server.ts itself, my-voc.ts): one counter, one format `corr-…`. */
export const nextCorrelation = () => `corr-${(correlation++).toString(16)}-${Math.random().toString(16).slice(2, 6)}`;
/** §19: under the partial scenario every other widget query fails. One shared counter for every endpoint
 *  that consults partial (serve, getEntity, entityAudit) — endpoints that do not apply partial never call it. */
export function partialFails(s: Scenario): boolean {
  return s === 'partial' && partialCounter++ % 2 === 1;
}
export const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const id = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('aborted', 'AbortError')); });
});

export function checkScope(role: RoleId, scopeId: string | null): ScopeCheck {
  if (!scopeId) return { status: 'unknown_scope', grantedRooms: [] };
  if (!SITES.some(s => s.id === scopeId)) return { status: 'unknown_scope', grantedRooms: [] };
  const grants = USERS[role].grants[scopeId];
  return grants?.length ? { status: 'valid', grantedRooms: grants } : { status: 'forbidden', grantedRooms: [] };
}

export async function validateScope(role: RoleId, scopeId: string, signal?: AbortSignal): Promise<ScopeCheck> {
  await sleep(350, signal);
  return checkScope(role, scopeId);
}

export function matchesCondition(e: Equipment, c: Condition | null): boolean {
  if (!c) return true;
  if (c.axis === 'stgroup') return e.stgroup === c.id;
  if (c.axis === 'team') return e.team === c.id;
  return e.maker === c.maker && e.model === c.model;
}

/** Equipment the request may analyse: Scope → granted rooms → room filter → Condition → Selection. */
export function resolveEquipment(g: GlobalContext, role: RoleId = getRole()): { rows: Equipment[]; forbidden: string | null } {
  const scope = checkScope(role, g.scopeId);
  if (scope.status !== 'valid') return { rows: [], forbidden: scope.status === 'forbidden' ? `No grant for scope ${g.scopeId}` : `Unknown scope ${g.scopeId}` };
  if (g.roomNames?.length) {
    const denied = g.roomNames.filter(r => !scope.grantedRooms.includes(r));
    if (denied.length) return { rows: [], forbidden: `No grant for room_name ${denied.join(', ')}` };
  }
  let rows = EQUIPMENT.filter(e => e.site === g.scopeId && scope.grantedRooms.includes(e.room));
  if (g.roomNames !== null) rows = rows.filter(e => g.roomNames!.includes(e.room));
  rows = rows.filter(e => matchesCondition(e, g.condition));
  if (g.selection !== null) {
    const outside = g.selection.filter(id => !EQUIPMENT.some(e => e.equipmentId === id && e.site === g.scopeId && scope.grantedRooms.includes(e.room)));
    if (outside.length) return { rows: [], forbidden: `Selection outside scope/grants: ${outside.join(', ')}` };
    rows = rows.filter(e => g.selection!.includes(e.equipmentId));
  }
  return { rows, forbidden: null };
}

export type ServeOptions<T> = {
  /** Tests pin a role; pages omit it and the server uses the signed-in session, as a real server would. */
  role?: RoleId;
  global: GlobalContext;
  /**
   * The endpoint's access rule, like a real server's per-endpoint ACL. The server decides with the
   * request's pinned role; the client route gate is only UX.
   */
  permission: Permission;
  /** Kinds this query contract declares (§19); every one is answered exactly once. */
  kinds?: AssessmentKind[];
  requiresScope?: boolean;
  /** Reject unbounded analytics: prototype max period in hours when no fixed Selection narrows it. */
  maxHours?: number;
  latency?: number;
  signal?: AbortSignal;
  metricVersion?: string;
  /** @internal Engine-only; menu handlers declare metricVersion on their endpoint instead. */
  metricVersionOf?: () => string | undefined;
  /** Logical source shown in Data Trust (e.g. 'master.equipment'); defaults to the productivity mart. */
  source?: string;
  /**
   * Default true. Set false when this query does not merge equipment onto one time axis
   * (master list, catalog, notices, one occurrence). §6.3.
   */
  mergeTimeDomain?: boolean;
  compute: (ctx: { equipment: Equipment[] }) => T;
  isEmpty?: (data: T) => boolean;
};

export type TimeDomainMergeResult =
  | { ok: true; timeDomainId: string }
  | { ok: false; code: 'time_domain_unverified' | 'time_domain_mismatch'; message: string };

const wallMs = (value: string) => parseDateTime(value, 'time').getTime();

/** §6.3. No scopeId argument. Call only when [from, to) exists. Length 1 is a coverage check, not a rejection by itself. */
export function evaluateTimeDomainMerge(
  equipmentIds: readonly string[],
  from: string,
  to: string,
  assertions: readonly TimeDomainAssertion[],
): TimeDomainMergeResult {
  const fromMs = wallMs(from);
  const toMs = wallMs(to);
  const unverified: string[] = [];
  const domains = new Set<string>();
  for (const equipmentId of equipmentIds) {
    const slices = assertions
      .filter(a => a.equipmentId === equipmentId)
      .map(a => ({
        domain: a.timeDomainId,
        start: Math.max(wallMs(a.validFrom), fromMs),
        end: Math.min(wallMs(a.validTo), toMs),
      }))
      .filter(s => s.start < s.end)
      .sort((a, b) => a.start - b.start || a.end - b.end);
    let cursor = fromMs;
    const local = new Set<string>();
    for (const slice of slices) {
      if (slice.start > cursor) break;
      local.add(slice.domain);
      if (slice.end > cursor) cursor = slice.end;
    }
    if (cursor < toMs || local.size === 0) unverified.push(equipmentId);
    else for (const domain of local) domains.add(domain);
  }
  if (unverified.length) {
    const ids = [...new Set(unverified)].sort();
    return { ok: false, code: 'time_domain_unverified', message: `time_domain_unverified: ${ids.join(', ')}` };
  }
  const domainIds = [...domains].sort();
  if (domainIds.length !== 1) {
    return { ok: false, code: 'time_domain_mismatch', message: `time_domain_mismatch: ${domainIds.join(', ')}` };
  }
  return { ok: true, timeDomainId: domainIds[0] };
}

const OBSERVED = '2026-09-26T08:58:00';

/** Shared successful-response tail (declared assessments §19 + Trust envelope). Private; serve() and getEntity() only. */
function finish<T>(args: {
  correlationId: string;
  data: T;
  empty: boolean;
  scenario: Scenario;
  verifiedDomain?: string | null;
  kinds?: AssessmentKind[];
  metricVersion?: string;
  source?: string;
  provisional: boolean;
}): ApiResponse<T> {
  const kinds = args.kinds ?? ['collection', 'processing_delay', 'coverage'];
  const assessments: Assessment[] = kinds.map(kind => {
    if (args.scenario === 'unknown_status' || kind === 'collection') return { kind, state: 'unknown', reason: 'source_unavailable' };
    if (kind === 'processing_delay') return { kind, state: 'clear', statusSource: 'mart-watermark', observedAt: OBSERVED };
    if (kind === 'coverage') return { kind, state: 'clear', statusSource: 'coverage-service', observedAt: OBSERVED, detail: '98.7%' };
    if (kind === 'time_domain' && args.verifiedDomain) return { kind, state: 'clear', statusSource: 'time-domain-registry', observedAt: OBSERVED, detail: args.verifiedDomain };
    return { kind, state: 'unknown', reason: 'source_unavailable' };
  });
  return {
    correlationId: args.correlationId,
    outcome: args.empty ? 'empty' : 'ok',
    data: args.data,
    assessments,
    trust: {
      updatedAt: '2026-09-26T09:02:00', dataThrough: '2026-09-26T08:00:00', coverage: args.scenario === 'unknown_status' ? null : 0.987,
      metricVersion: args.metricVersion, provisional: args.provisional, source: args.source ?? 'mart.productivity_hourly',
    },
  };
}

export async function serve<T>(o: ServeOptions<T>): Promise<ApiResponse<T>> {
  // Pin the request's identity at send time, like a session cookie on the request: a role switch while it is
  // in flight must not re-evaluate it with the new user's grants.
  const s = scenario;
  const requestRole = o.role ?? role;
  const correlationId = nextCorrelation();
  await sleep((o.latency ?? 450) + (s === 'slow' ? 2200 : 0) + Math.random() * 200, o.signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  // Menu permission (§17): the same rule as menu visibility and route access, re-validated per request
  // with the pinned role. A missing permission outranks every response scenario.
  if (!USERS[requestRole].permissions.includes(o.permission)) return { ...base, outcome: 'forbidden', message: `No permission ${o.permission}` };
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  // Every other widget query fails so pages can show a local failure next to healthy widgets (§19 Partial widget failure).
  if (partialFails(s)) return { ...base, outcome: 'error', message: 'Widget query failed (partial scenario)' };
  const requiresScope = o.requiresScope ?? true;
  const resolved = requiresScope ? resolveEquipment(o.global, requestRole) : { rows: EQUIPMENT, forbidden: null };
  if (s === 'forbidden' || resolved.forbidden) return { ...base, outcome: 'forbidden', message: resolved.forbidden ?? 'Permission revoked (scenario)' };
  const hours = periodHours(o.global);
  if (s === 'too_large' || (o.maxHours && hours !== null && hours > o.maxHours && (o.global.selection === null || o.global.selection.length > 40))) {
    return { ...base, outcome: 'too_large', message: `Period ${hours ?? '?'}h exceeds ${o.maxHours ?? '—'}h without a narrow fixed Selection` };
  }
  if (o.global.selection?.length === 0 || o.global.roomNames?.length === 0) {
    return { ...base, outcome: 'empty' };
  }
  let verifiedDomain: string | null = null;
  if (o.mergeTimeDomain !== false && o.global.from && o.global.to && resolved.rows.length >= 1) {
    const verdict = evaluateTimeDomainMerge(
      resolved.rows.map(e => e.equipmentId),
      o.global.from,
      o.global.to,
      TIME_DOMAIN_ASSERTIONS,
    );
    if (!verdict.ok) {
      if (resolved.rows.length >= 2) return { ...base, outcome: 'error', message: verdict.message };
    } else {
      verifiedDomain = verdict.timeDomainId;
    }
  }

  const equipment = s === 'empty' ? [] : resolved.rows;
  // malformed: an ok envelope whose data does not match the declared shape, so a page that trusts it throws while rendering.
  const data = s === 'malformed' ? ({} as T) : o.compute({ equipment });
  const empty = s === 'empty'
    || (s !== 'malformed' && o.isEmpty?.(data) === true);
  const metricVersion = o.metricVersionOf ? o.metricVersionOf() : o.metricVersion;
  return finish({
    correlationId,
    data,
    empty,
    scenario: s,
    verifiedDomain,
    kinds: o.kinds,
    metricVersion,
    source: o.source,
    provisional: hours !== null && hours <= 24,
  });
}

export type GetEntityOptions = { role?: RoleId; latency?: number };

/**
 * Single destination row (docs/06 §22). Not an analysis path: no GlobalContext, no Selection substitute, and the
 * endpoint's permission is a server-side map (`equipment` → `equipment:view`), never a client argument.
 */
export async function getEntity(ref: EntityRef, signal?: AbortSignal, opts?: GetEntityOptions): Promise<ApiResponse<unknown>> {
  // Pin identity at send time, like serve(): a role switch while in flight must not re-evaluate this request.
  const s = scenario;
  const requestRole = opts?.role ?? role;
  const correlationId = nextCorrelation();
  await sleep((opts?.latency ?? 450) + (s === 'slow' ? 2200 : 0) + Math.random() * 200, signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  // 1. Unknown entity type.
  if (ref.type !== 'equipment') return { ...base, outcome: 'error', message: 'Unknown entity type' };
  // 2. Endpoint permission. A missing permission outranks every response scenario.
  if (!USERS[requestRole].permissions.includes('equipment:view')) return { ...base, outcome: 'forbidden', message: 'No permission equipment:view' };
  // 3. Scenario early returns, same as serve() (shared partialCounter).
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  if (partialFails(s)) return { ...base, outcome: 'error', message: 'Widget query failed (partial scenario)' };
  // 4. Site gate first (same messages as resolveEquipment): never search equipment for an ungranted or unknown scope.
  const scope = checkScope(requestRole, ref.scopeId);
  if (scope.status !== 'valid') return { ...base, outcome: 'forbidden', message: scope.status === 'forbidden' ? `No grant for scope ${ref.scopeId}` : `Unknown scope ${ref.scopeId}` };
  // 5. Lookup only inside the requested site: other sites are invisible, whatever the id says.
  const row = EQUIPMENT.find(e => e.site === ref.scopeId && e.equipmentId === ref.id);
  // 6. Room gate. Beats scenario empty/too_large; the message must not leak id, name, room, maker, model, team, line, stgroup.
  if (row && !scope.grantedRooms.includes(row.room)) return { ...base, outcome: 'forbidden', message: 'No grant for equipment' };
  // 7–8. Dev-tools scenarios (no period on this port, so too_large is reachable only by flipping the scenario).
  if (s === 'forbidden') return { ...base, outcome: 'forbidden', message: 'Permission revoked (scenario)' };
  if (s === 'too_large') return { ...base, outcome: 'too_large', message: 'Period ?h exceeds —h without a narrow fixed Selection' };
  // 9. A miss (scenario empty, other site, or unknown id) is a successful zero with the same trust + assessments as serve.
  if (s === 'empty' || !row) return finish({ correlationId, data: null, empty: true, scenario: s, provisional: false });
  // 10. Hit: that one object, not an array. No period on this port, so trust.provisional is false.
  return finish({ correlationId, data: row, empty: false, scenario: s, provisional: false });
}

/**
 * Menu usage telemetry (docs/05 메뉴 활용률 계측; 06 §4). Module-level store: it survives `setRole`, so an
 * admin reading aggregates still sees engineer visits. Aggregates use entries only and `receivedAt`, so a
 * lying client `at` cannot move "last used"; dwell never changes visits, distinct users or lastUsedAt.
 */
export type StoredUsageEvent = UsageEvent & { userId: string; receivedAt: number };

const usageEvents: StoredUsageEvent[] = [];

const SPACE_IDS = ['analytics', 'operations', 'feedback'] as const satisfies readonly SpaceId[];

/** True when the id is not a string, or carries anything the manifest route pattern must not: empty, `?`, `#`, `&`, whitespace, too long. */
function invalidUsageId(value: string, max: number): boolean {
  return typeof value !== 'string' || !value || value.length > max || /[?#&\s]/.test(value);
}

/** Declared wire fields (docs/05 v1) — anything else a client sends is an unknown key. */
const USAGE_KEYS = ['name', 'menuId', 'spaceId', 'path', 'at', 'sessionId'] as const;

/** True when the event is not exactly the declared wire shape for its name (unknown or missing keys). */
function hasUnknownUsageKeys(e: UsageEvent): boolean {
  const allowed: readonly string[] = e.name === 'dwell' ? [...USAGE_KEYS, 'dwellMs', 'enteredAt'] : USAGE_KEYS;
  const keys = Object.keys(e);
  return keys.length !== allowed.length || keys.some(k => !allowed.includes(k));
}

/**
 * Records a batch of events. Any signed-in session may record (engineers must be counted), so this endpoint
 * never checks console:access. Whole-call reject: one invalid event stores nothing (accepted: 0) — bad
 * clients must not poison the log piecemeal. An event must be exactly the declared wire shape: unknown
 * keys (query strings, recent URLs, Context values) are rejected wholesale, not stored, and every field
 * is shape-checked (string ids, finite `at`/`enteredAt`, `dwellMs` a nonnegative integer). The server
 * stamps userId and receivedAt; stored rows carry only the projected wire fields.
 */
export async function recordUsage(events: readonly UsageEvent[], opts?: { role?: RoleId }): Promise<{ accepted: number }> {
  if (events.length > 20) return { accepted: 0 };
  const invalid = events.some(e =>
    hasUnknownUsageKeys(e)
    || invalidUsageId(e.menuId, 80)
    || invalidUsageId(e.path, 200)
    || typeof e.sessionId !== 'string'
    || typeof e.spaceId !== 'string' || !SPACE_IDS.includes(e.spaceId)
    || typeof e.name !== 'string' || (e.name !== 'entry' && e.name !== 'dwell')
    || typeof e.at !== 'number' || !Number.isFinite(e.at)
    || (e.name === 'dwell' && (typeof e.enteredAt !== 'number' || !Number.isFinite(e.enteredAt)
      || typeof e.dwellMs !== 'number' || e.dwellMs < 0 || !Number.isInteger(e.dwellMs))));
  if (invalid) return { accepted: 0 };
  const userId = USERS[opts?.role ?? role].role;
  const receivedAt = Date.now();
  for (const e of events) {
    if (e.name === 'dwell') {
      // Same (userId, sessionId, menuId, enteredAt) dwell replaces the previous one — the final dwell wins.
      const previous = usageEvents.findIndex(x => x.name === 'dwell' && x.userId === userId && x.sessionId === e.sessionId && x.menuId === e.menuId && x.enteredAt === e.enteredAt);
      if (previous >= 0) usageEvents.splice(previous, 1);
    }
    usageEvents.push({
      name: e.name, menuId: e.menuId, spaceId: e.spaceId, path: e.path, at: e.at, sessionId: e.sessionId,
      ...(e.name === 'dwell' && { dwellMs: e.dwellMs, enteredAt: e.enteredAt }),
      userId, receivedAt,
    });
  }
  return { accepted: events.length };
}

/** Pure aggregate over stored events. Entries only; zero-visit menus are omitted here (the screen left-joins). */
export function aggregateUsage(events: readonly StoredUsageEvent[], range: UsageRange): UsageSummary {
  const inRange = events.filter(e =>
    e.name === 'entry'
    && ('preset' in range || (e.receivedAt >= range.from && e.receivedAt < range.to)));
  const byMenu = new Map<string, { visits: number; users: Set<string>; last: number }>();
  for (const e of inRange) {
    const agg = byMenu.get(e.menuId) ?? { visits: 0, users: new Set<string>(), last: 0 };
    agg.visits += 1;
    agg.users.add(e.userId);
    if (e.receivedAt > agg.last) agg.last = e.receivedAt;
    byMenu.set(e.menuId, agg);
  }
  return {
    preset: 'preset' in range ? 'all' : 'range',
    menus: [...byMenu.entries()].map(([menuId, agg]) => ({ menuId, visits: agg.visits, distinctUsers: agg.users.size, lastUsedAt: agg.last })),
  };
}

/** Test-only store reset (docs/05: manual deletion is a real-adapter concern). Not on the adapter, no UI. */
export function resetUsage() { usageEvents.length = 0; }

/** Read-only store snapshot for tests (e.g. the dwell replace rule). */
export function storedUsage(): readonly StoredUsageEvent[] { return usageEvents; }

export type StoredClientError = ClientErrorReport & { userId: string; receivedAt: number };
const clientErrors: StoredClientError[] = [];
const CLIENT_ERROR_KEYS = ['correlationId', 'menuId', 'spaceId', 'path', 'name'] as const;
const CLIENT_ERROR_CAP = 200;

/**
 * Contained render failures (issue #101). Any signed-in session may report — the person who hit the failure is
 * rarely console:access. Same posture as recordUsage: exactly the declared wire shape (unknown keys rejected,
 * so a client cannot smuggle a URL or Context value in), identifier-shaped `name` and an app-relative `path` (no absolute or protocol-relative URL), no free-text message, whole-call reject, the server
 * stamps userId and receivedAt. Bounded log: the oldest rows drop first.
 */
export async function reportClientError(report: ClientErrorReport, opts?: { role?: RoleId }): Promise<{ accepted: boolean }> {
  const keys = typeof report === 'object' && report !== null ? Object.keys(report) : [];
  const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
  const invalid = keys.length !== CLIENT_ERROR_KEYS.length || keys.some(k => !(CLIENT_ERROR_KEYS as readonly string[]).includes(k))
    || !text(report.correlationId, 80) || !report.correlationId.startsWith('client-')
    || invalidUsageId(report.menuId, 80) || invalidUsageId(report.path, 200) || !/^\/(?!\/)/.test(report.path)
    || typeof report.spaceId !== 'string' || !SPACE_IDS.includes(report.spaceId)
    || typeof report.name !== 'string' || !/^[A-Za-z_$][\w$]{0,79}$/.test(report.name);
  if (invalid) return { accepted: false };
  clientErrors.push({ ...report, userId: USERS[opts?.role ?? role].role, receivedAt: Date.now() });
  if (clientErrors.length > CLIENT_ERROR_CAP) clientErrors.splice(0, clientErrors.length - CLIENT_ERROR_CAP);
  return { accepted: true };
}

/** Read-only store snapshot for tests. Not on the adapter: the console has no client-error read yet. */
export function storedClientErrors(): readonly StoredClientError[] { return clientErrors; }
export function resetClientErrors() { clientErrors.length = 0; }

export type UsageSummaryOptions = { role?: RoleId; latency?: number };

/**
 * Console aggregate read (docs/05 열람 권한). console:access on the pinned role is checked BEFORE any dev
 * scenario (same order as serve(): a missing permission outranks every scenario). Scope, time-domain and
 * partial do not apply to this endpoint. Nothing matched is a successful zero — outcome 'ok' with
 * `menus: []`, never 'empty' (empty would trip OutcomeView and hide the zero rows).
 */
export async function usageSummary(range: UsageRange, signal?: AbortSignal, opts?: UsageSummaryOptions): Promise<ApiResponse<UsageSummary>> {
  const s = scenario;
  const requestRole = opts?.role ?? role;
  const correlationId = nextCorrelation();
  await sleep(opts?.latency ?? 80, signal);
  const base = { correlationId, data: null, trust: null, assessments: [] as Assessment[] };
  if (!USERS[requestRole].permissions.includes('console:access')) return { ...base, outcome: 'forbidden', message: 'No permission console:access' };
  if (s === 'timeout') return { ...base, outcome: 'timeout', message: 'Query exceeded 30s budget' };
  if (s === 'error') return { ...base, outcome: 'error', message: 'Upstream mart query failed' };
  if (s === 'forbidden') return { ...base, outcome: 'forbidden', message: 'Permission revoked (scenario)' };
  if ('from' in range && range.from >= range.to) return { ...base, outcome: 'error', message: 'Invalid usage range' };
  return { ...base, outcome: 'ok', data: aggregateUsage(usageEvents, range) };
}
