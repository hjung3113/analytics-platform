import type { Text } from './i18n';
import type { Permission, SpaceId } from './menu';
import type { AuditAction, AuditEvent, AuditSource } from './audit';
import type { ApiResponse } from './response';
import type { Condition, IdSet } from './url';

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
  spaceId: SpaceId;
  /** Manifest route pattern (`menu.path`), never the concrete pathname or search. */
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
/** from inclusive, to exclusive. */
export type UsageRange = { preset: 'all' } | { from: number; to: number };
export type UsageMenuSummary = { menuId: string; visits: number; distinctUsers: number; lastUsedAt: number };
export type UsageSummary = { preset: 'all' | 'range'; menus: UsageMenuSummary[] };

/** User-facing VOC status only (issue #60). Not triage_state, not an operator inbox. */
export type MyVocStatus =
  | 'received' | 'reviewing' | 'assigned' | 'progress'
  | 'prep' | 'resolved' | 'reopened' | 'closed';

/** One filed VOC, mapped from the FeedbackOps `VocListItem` (issue #60); the FeedbackOps DTO never leaks. */
export type MyVocItem = {
  id: string; // FeedbackOps voc id (uuid). Deep-link vocId. Not display_id.
  displayId: string; // display_id. Shown as-is; not translated.
  title: string; // user text; not translated (06 §23).
  status: MyVocStatus; // reporter_facing_status. The only status on the wire.
  openedAt: string; // created_at, ISO-8601. Not an analysis from/to.
  updatedAt: string; // updated_at, ISO-8601.
  managedSystemId: string; // primary_managed_system_id (uuid). Not a platform scopeId; never shown, never linked.
};

export type MyVocQuery = {
  /** Opaque token from the previous page's nextCursor. Omitted = first page. */
  cursor?: string;
};

export type MyVocPage = {
  items: readonly MyVocItem[];
  /** Null on the last page. Client must not parse it. */
  nextCursor: string | null;
};

export type MySurveyItem = {
  surveyId: string; // uuid, only once a source exists
  title: string;
  submittedAt: string; // ISO-8601
};

export type MySurveyPage = { items: readonly MySurveyItem[] };

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
  /** Anchor for default periods (naive wall-clock, docs/06 §6.3). */
  defaultRangeTo(): string;
  /**
   * Menu usage events (docs/05 메뉴 활용률 계측). No userId field — the server stamps SessionUser.id.
   * Fire-and-forget from the kernel: no AbortSignal, failures are silent, navigation never blocks.
   */
  recordUsage(events: readonly UsageEvent[]): Promise<{ accepted: number }>;
  /** Console aggregate read (docs/05 열람 권한: console:access, server-checked). The console never reads raw events. */
  usageSummary(range: UsageRange, signal?: AbortSignal): Promise<ApiResponse<UsageSummary>>;
  /**
   * The console audit log (issue #50): console:access, every site, no room gate — an audit screen that hid
   * a room's change would hide the change. Offset-paged, server-sorted; the client never re-sorts a page.
   */
  auditTrail(query: AuditTrailQuery, signal?: AbortSignal): Promise<ApiResponse<AuditTrailPage>>;
  /**
   * One destination's audit events (issue #50), the detail-tab read: the destination's own view permission,
   * not console:access, so an engineer sees the equipment tab they already have. A `targetId` on auditTrail
   * is only a list filter — one method with a weaker check for a target would let a list filter borrow the
   * detail permission. Not paged, no list filters.
   */
  entityAudit(ref: EntityRef, signal?: AbortSignal): Promise<ApiResponse<{ events: readonly AuditEvent[] }>>;
  /**
   * The console access directory (issue #49): console:access, every site, no room gate — the scope axis is
   * room_name (ADR-0005) and the same role already reads every site's audit. Read-only: grant/revoke has no
   * owner yet and waits on issue #98. Menus per permission are a client join over the registry; the server
   * returns the principal's permissions only. Not mart data: trust stays null, assessments stay empty.
   */
  accessDirectory(query: AccessDirectoryQuery, signal?: AbortSignal): Promise<ApiResponse<AccessDirectoryPage>>;
  /**
   * The session actor's filed VOCs, newest openedAt first, cursor-paged (issue #60). No user id, scopeId or
   * Global Context argument — the server stamps the session actor. `managedSystemId` is data, never a link or filter input.
   */
  myVocHistory(query: MyVocQuery, signal?: AbortSignal): Promise<ApiResponse<MyVocPage>>;
  /**
   * The session actor's survey submissions. No FeedbackOps read exists yet (issue #60): success is always the
   * declared `respondent_history`/`unknown` envelope, never a confirmed zero.
   */
  mySurveyHistory(signal?: AbortSignal): Promise<ApiResponse<MySurveyPage>>;
  /**
   * Announces that the session or server-side state changed. The kernel then re-reads the session,
   * re-validates the scope when the session changed, and hides every earlier query result.
   */
  subscribe(onChange: () => void): () => void;
};
