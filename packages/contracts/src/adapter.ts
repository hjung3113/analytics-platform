import type { Text } from './i18n';
import type { Permission, SpaceId } from './menu';
import type { AuditAction, AuditEvent, AuditSource } from './audit';
import type { ApiResponse } from './response';
import type { Condition, IdSet } from './url';
import type { MenuQuery } from './menu-query';

/**
 * Kernel port to the platform server (docs/integration/platform-packages.md §4). The kernel consumes it;
 * the app injects an implementation (today the mock server). Field names are Candidates.
 *
 * Session-shaped data is a synchronous snapshot plus `subscribe`, so the shell renders without a loading gap;
 * a real implementation bootstraps the session before mounting. Per-request checks stay asynchronous.
 */
export type SessionUser = { id: string; name: string; title: Text; permissions: readonly Permission[] };

/** A scope the user holds at least one room_name grant in. Counts are for display only; the server re-validates. */
export type ScopeOption = { id: string; label: string; grantedRooms: number; totalRooms: number };

export type Session = { user: SessionUser; scopes: readonly ScopeOption[] };

export type ScopeCheck = { status: 'valid' | 'forbidden' | 'unknown_scope'; grantedRooms: string[] };

/** Server-owned published pointer per metricId (docs/06 §6.1). Bare version token. Null = known, unpublished. */
export type PublishedMetric = { metricId: string; publishedVersion: string | null };

/** Choices for the Global Context condition editor, per site (one axis at a time, docs/06 §11). */
export type ConditionOptions = { stgroup: string[]; team: string[]; makerModel: { maker: string; model: string }[] };

export type EquipmentOption = { equipmentId: string; room: string; model: string };
export type SelectionInput = { scopeId: string | null; roomNames: IdSet; condition: Condition | null; selection: IdSet };
/**
 * Server-side evaluation for the selection editor: equipment the user may pick under the current room/condition
 * (already filtered by the session's grants), and selected IDs that fall outside the condition (shown, never removed).
 */
export type SelectionEvaluation = { inCondition: EquipmentOption[]; outOfCondition: string[] };

/** Destination single-row lookup (docs/06 §22): menu constant + opaque destination id, never an analysis Context. */
export type EntityRef = {
  type: string; // menu constant; not a contracts union
  id: string; // opaque destination id
  scopeId: string | null; // requested site; never inferred from id (ADR-0004)
};

/** Menu usage telemetry (docs/05 메뉴 활용률 계측; 06 §4). v1 sends identity fields only (issue #75 pending). */
export type UsageEventName = 'entry' | 'dwell';
export type UsageEvent = {
  name: UsageEventName;
  menuId: string;
  /** The menu's space, or null when its group is a global utility (06 §9.1). */
  spaceId: SpaceId | null;
  /** Manifest route pattern (`menu.path`, app-relative), never the concrete pathname or search. */
  path: string;
  /** Client epoch ms. */
  at: number;
  /** Tab id, not a user id. */
  sessionId: string;
  /** dwell only, integer >= 0. */
  dwellMs?: number;
  /** dwell only; the entry's `at`. */
  enteredAt?: number;
};
/**
 * A render failure the kernel's route error boundary contained (issue #101). Identity fields only, like UsageEvent:
 * no URL, Context value, stack, component stack or `Error.message` — a thrown message is free text that can carry
 * a lot id or a person's value, and truncating is not redaction. `name` is limited to identifier syntax. Adding a
 * message needs a decided redaction policy first. The server stamps the session user and receive time.
 */
export type ClientErrorReport = {
  /** Client-generated `client-…`, the same id the person sees on the error screen. */
  correlationId: string;
  menuId: string;
  /** The menu's space, or null when its group is a global utility (06 §9.1). */
  spaceId: SpaceId | null;
  /** Manifest route pattern (`menu.path`), never the concrete pathname or search. */
  path: string;
  /** `Error.name` when it is identifier-shaped (`/^[A-Za-z_$][\w$]{0,79}$/`), else `Error`. */
  name: string;
};
/**
 * Persistent chart annotation (06 §16 layer 4, issue #103): a domain object owned by the server, keyed by the
 * site (Scope) it was written under — never by chartId alone, so a note written at one site can not appear at
 * another (ADR-0004 site boundary). `from`/`to` are the brushed range: naive wall-clock on a time axis, category
 * labels on a category axis. The server stamps author and `at`; the client never sends either.
 */
export type ChartAnnotation = { id: string; chartId: string; scopeId: string; from: string; to: string; text: string; at: string };
/** Which chart's notes at which site. A null scope is not a request the server answers (forbidden), never "all sites". */
export type AnnotationRef = { chartId: string; scopeId: string | null };
export type AnnotationInput = AnnotationRef & { from: string; to: string; text: string };
/** from inclusive, to exclusive. */
export type UsageRange = { preset: 'all' } | { from: number; to: number };
export type UsageMenuSummary = { menuId: string; visits: number; distinctUsers: number; lastUsedAt: number };
export type UsageSummary = { preset: 'all' | 'range'; menus: UsageMenuSummary[] };

/** Sort keys of the global audit index (issue #50). `targetType` sorts `target.type`. */
export type AuditSortField = 'at' | 'actor' | 'action' | 'source' | 'targetType';

/**
 * Global audit-trail read filters (issue #50). The client never sends a user id, a role, a Global Context
 * or an `at` to stamp — fixture actors are server data. The actor filter is a search constraint the
 * operator typed, not an identity stamp; a read does not append an audit row.
 */
export type AuditTrailQuery = {
  type?: string; // 'equipment' | 'metric'. Absent = all.
  actor?: string; // exact, case-sensitive.
  action?: AuditAction;
  source?: AuditSource;
  fromAt?: string; // inclusive instant. Half-open with toAt.
  toAt?: string; // exclusive instant.
  targetId?: string; // exact destination id. Requires type.
  page?: number; // 1-based. Absent = 1.
  pageSize?: number; // integer 1..100. Absent = 25.
  /** Absent = at desc, then id ascending. */
  sort?: { field: AuditSortField; desc: boolean };
};

/** Offset page, not cursor: the screen is a table (page + one sort column) over an arbitrarily filtered set. */
export type AuditTrailPage = { items: readonly AuditEvent[]; total: number };

/** Sort keys of the console access directory (issue #49). `permissionCount`/`grantCount` are sort keys only — the client recomputes both from the arrays; no second copy on the wire. */
export type AccessSortField = 'name' | 'role' | 'permissionCount' | 'grantCount';

/**
 * Console access-directory read filters (issue #49). Search constraints only — not an identity stamp: no
 * user id, no caller role, no scopeId. The role filter is an exact token, not a contracts enum: the mock
 * role keys are server data, and freezing them here would freeze a mock vocabulary.
 */
export type AccessDirectoryQuery = {
  role?: string; // exact, case-sensitive role key. Absent = all.
  permission?: Permission; // Absent = all.
  page?: number; // 1-based. Absent = 1.
  pageSize?: number; // integer 1..100. Absent = 25.
  /** Absent = role ascending, id ascending tie-break. */
  sort?: { field: AccessSortField; desc: boolean };
};

/**
 * One site's rooms granted to a principal (issue #49). Every known site, zero-grant sites included — unlike
 * ScopeOption, which drops them. Room names are master values, never translated: the data-scope axis is
 * room_name (ADR-0005).
 */
export type SiteGrant = { id: string; label: string; grantedRooms: readonly string[]; totalRooms: number };

/** One directory row (issue #49). `id` is opaque and never sent back — the mock sets it to the role key only because one mock role is one row. */
export type AccessPrincipal = {
  id: string;
  /** Untranslated master name. Sort uses this, not title. */
  name: string;
  title: Text;
  /** Role key. Exact target of the role filter. */
  role: string;
  /** Held permissions in canonical Permission order. The page joins menus from the registry client-side. */
  permissions: readonly Permission[];
  /** One row per known site in site order, zero-grant sites included. */
  sites: readonly SiteGrant[];
};

/** Offset page, not cursor, like AuditTrailPage: a table over an arbitrarily filtered set. */
export type AccessDirectoryPage = { items: readonly AccessPrincipal[]; total: number };

export type PlatformAdapter = {
  /** Current session. Must return the same object until the session changes (it is a store snapshot). */
  session(): Session;
  validateScope(scopeId: string, signal?: AbortSignal): Promise<ScopeCheck>;
  publishedMetrics(): readonly PublishedMetric[];
  contextOptions(scopeId: string, signal?: AbortSignal): Promise<ConditionOptions>;
  evaluateSelection(input: SelectionInput, signal?: AbortSignal): Promise<SelectionEvaluation>;
  /** One destination row by ref (detail pages). Not an analysis query: no GlobalContext, no Selection substitute. */
  getEntity(ref: EntityRef, signal?: AbortSignal): Promise<ApiResponse<unknown>>;
  /** Menu data query (packages/contracts/src/menu-query.ts, docs/adr/0019-menu-query-endpoint-declaration.md). The server resolves `req.endpoint` to its own copy of the declaration; permission, kinds and limits never travel in the request. */
  menuQuery(req: MenuQuery, signal?: AbortSignal): Promise<ApiResponse<unknown>>;
  /** Anchor for default periods (naive wall-clock, docs/06 §6.3). */
  defaultRangeTo(): string;
  /**
   * Menu usage events (docs/05 메뉴 활용률 계측). No userId field — the server stamps SessionUser.id.
   * Fire-and-forget from the kernel: no AbortSignal, failures are silent, navigation never blocks.
   */
  recordUsage(events: readonly UsageEvent[]): Promise<{ accepted: number }>;
  /**
   * Contained render failures (06 §4 전역 Error Boundary). Fire-and-forget from the kernel like `recordUsage`:
   * no AbortSignal, failures are silent — reporting must never cause a second failure.
   */
  reportClientError(report: ClientErrorReport): Promise<{ accepted: boolean }>;
  /**
   * Console aggregate read (docs/05 열람 권한: console:access, server-checked). The console never reads raw
   * events. Nothing matched is a successful zero: outcome `ok` with `menus: []`, never `empty` (the console
   * left-joins zero-visit menus; `empty` would hide them).
   */
  usageSummary(range: UsageRange, signal?: AbortSignal): Promise<ApiResponse<UsageSummary>>;
  /**
   * The console audit log (issue #50): console:access, every site, no room gate — an audit screen that hid
   * a room's change would hide the change. Offset-paged, server-sorted; the client never re-sorts a page.
   * A query that matches nothing is `empty`, not `ok` with `items: []`; a page past the end of a non-empty
   * result is `ok` with `items: []` and the true `total` (never rewritten to page 1).
   */
  auditTrail(query: AuditTrailQuery, signal?: AbortSignal): Promise<ApiResponse<AuditTrailPage>>;
  /**
   * One destination's audit events (issue #50), the detail-tab read: the destination's own view permission,
   * not console:access, so an engineer sees the equipment tab they already have. A `targetId` on auditTrail
   * is only a list filter — one method with a weaker check for a target would let a list filter borrow the
   * detail permission. Not paged, no list filters. Same gates as `getEntity`: the destination type's view
   * permission, the site·room grant for a site-scoped type (`scopeId: null` for a siteless type like 지표),
   * `error` for an unregistered type. A zero is a confirmed result: outcome `empty` (no data), not `ok` with
   * an empty list.
   */
  entityAudit(ref: EntityRef, signal?: AbortSignal): Promise<ApiResponse<{ events: readonly AuditEvent[] }>>;
  /**
   * The console access directory (issue #49): console:access, every site, no room gate — the scope axis is
   * room_name (ADR-0005) and the same role already reads every site's audit. Read-only: room_name and individual grants are owned by the
   * platform meta DB (issue #98, decided), but no write port exists until the role-membership source (IdP group
   * claim spec) is settled. Menus per permission are a client join over the registry; the server
   * returns the principal's permissions only. Not mart data: trust stays null, assessments stay empty.
   * A query that matches nothing is `empty`, not `ok` with `items: []`; a page past the end of a non-empty
   * result is `ok` with `items: []` and the true `total` (never rewritten to page 1).
   */
  accessDirectory(query: AccessDirectoryQuery, signal?: AbortSignal): Promise<ApiResponse<AccessDirectoryPage>>;
  /**
   * Notes on one chart at one site (06 §16, issue #103): the chart's permission and the requested site's grant,
   * both server-checked. Only rows written under `ref.scopeId` come back. Not mart data: trust stays null,
   * assessments stay empty. A zero is a meaningful answer (outcome 'empty').
   */
  listAnnotations(ref: AnnotationRef, signal?: AbortSignal): Promise<ApiResponse<{ items: readonly ChartAnnotation[] }>>;
  /**
   * Saves one note. The server stamps the session user and `at`, checks the same gates as `listAnnotations`,
   * and answers the stored row. A user/at/id in the input is an unknown key and rejects the call.
   */
  saveAnnotation(input: AnnotationInput, signal?: AbortSignal): Promise<ApiResponse<ChartAnnotation>>;
  /**
   * Announces that the session or server-side state changed. The kernel then re-reads the session,
   * re-validates the scope when the session changed, and hides every earlier query result.
   */
  subscribe(onChange: () => void): () => void;
};
