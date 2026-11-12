import type { AxisOptionsInput, AxisOptionsPage, EquipmentSearchInput, EquipmentSearchPage, SelectionResolveInput, SelectionResolveResult } from './selection-ports.js';
import type { Text } from '../i18n.js';
import type { Permission, SpaceId } from '../menu/menu.js';
import type { ModuleScopedId } from '../host/host.js';
import type { AuditAction, AuditEvent, AuditSource } from './audit.js';
import type { ApiResponse } from './response.js';
import type { Condition, IdSet } from '../links/url.js';
import type { MenuQuery } from '../menu/menu-query.js';
import type { ActionResponse, MenuAction } from './action.js';
import type { GroupMember } from '../links/saved-view.js';
import type { DeleteNoticeInput, NoticeListPage, Notice, PreferencesImport, PreferencesPatch, PreferencesSnapshot, SaveNoticeInput, UploadedFile, UploadFileInput } from './service-ports.js';

/**
 * Kernel port to the platform server (docs/integration/platform-packages.md §4). The kernel consumes it;
 * the app injects an implementation (today the mock server). Field names are Candidates.
 *
 * Session-shaped data is a synchronous snapshot plus `subscribe`, so the shell renders without a loading gap;
 * a real implementation bootstraps the session before mounting. Per-request checks stay asynchronous.
 */
export type SessionUser = { id: string; name: string; title: Text; permissions: readonly (Permission | ModuleScopedId)[] };

/** A scope the user holds at least one room_name grant in. Counts are for display only; the server re-validates. */
export type ScopeOption = { id: string; label: string; grantedRooms: number; totalRooms: number };

export type Session = {
  user: SessionUser;
  scopes: readonly ScopeOption[];
  /** Catalog sites without any room grant; only a platform grant-table source emits this field. */
  requestableScopes?: readonly { id: string; label: string; totalRooms: number }[];
};

export type ScopeCheck = { status: 'valid' | 'forbidden' | 'unknown_scope'; grantedRooms: string[] };

/**
 * What a blocked place asks access for (ADR-0154 decision 6): a menu permission, a whole site (every catalog room,
 * later rooms included) or one room of a site. The shell fills it from the place; the app's request dialog maps it.
 * `site`/`room` are Scope catalog values (`ScopeOption.id`, room_name), never invented by the shell.
 */
export type PermissionRequestTarget =
  | { kind: 'permission'; permission: Permission }
  | { kind: 'site'; site: string }
  | { kind: 'site_room'; site: string; room: string };

/** Server-owned published pointer per metricId (docs/06 §6.1). Bare version token. Null = known, unpublished. */
export type PublishedMetric = { metricId: string; publishedVersion: string | null };

/** Choices for the Global Context condition editor, per site (one axis at a time, docs/06 §11). */
/** @deprecated Legacy options; migrate to app-injected axes (ADR-0059). */
export type ConditionOptions = { stgroup: string[]; team: string[]; makerModel: { maker: string; model: string }[] };

export type EquipmentOption = { equipmentId: string; room: string; model: string };
export type SelectionInput = { scopeId: string | null; roomNames: IdSet; condition: Condition | null; lineNames: IdSet; prcGroups: IdSet; membershipBasis: 'asOf' | null; selection: IdSet };
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

/** `entityAudit` request (ADR-0085): the destination ref plus an optional keyset cursor. An `EntityRef` is a valid request (first page). */
export type EntityAuditRequest = EntityRef & { cursor?: string };
/** `entityAudit` answer: one page, newest first. `nextCursor` null = last page; a missing key = a server that does not page (read as the end). */
export type EntityAuditPage = { events: readonly AuditEvent[]; nextCursor?: string | null };

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
  /** Where the screen was shown: absent or `'main'` = the main screen, `'board'` = a pane on the analysis board (ADR-0049). Provenance only — never a Context value. */
  source?: UsageSource;
  /** Board events only: opaque id of one admitted pane stay, equal on its entry and every dwell, fresh on re-entry. Dwell replacement for such events keys on it instead of `enteredAt`. */
  stayId?: string;
  /** `entry` only (absent on dwell): how the person got here. Main screen: an old value (`sidebar` … `link`); board pane: `paneOpen` or `paneReplace`. Optional on a board entry (older clients omit it). Identity/provenance only — never a Context value (ADR-0020). */
  via?: UsageVia;
  /** `entry` only: menu id of the screen shown right before — in this tab's JS run on the main screen, in the same pane on a board entry (`null` on `paneOpen`). `null` when that screen was not a menu (board, contract error). Never a path or a Context value; not persisted across reloads. */
  fromMenuId?: string | null;
};
export type UsageSource = 'main' | 'board';
/**
 * How an entry was reached. Closed set. Main screen: `sidebar` (menu link, rail section/board button), `switcher` (space switcher),
 * `palette` (command palette), `board` (leaving or opening from the analysis board), `return` (return-to-origin link),
 * `crossLink` (06 §22 cross-menu Context link), `drill` (a drill step landing on another path), `history` (Back/Forward),
 * `direct` (the tab's first entry when unmarked: new tab, reload, typed address; an explicit mark wins), `link` (any other in-app navigation).
 * Board pane entry (#605): `paneOpen` (the pane's first admitted screen in this mount), `paneReplace` (the pane switched to another screen). A main entry never carries a pane value and a board entry never an old one.
 */
export const USAGE_VIAS = ['sidebar', 'switcher', 'palette', 'board', 'return', 'crossLink', 'drill', 'history', 'direct', 'link', 'paneOpen', 'paneReplace'] as const;
export type UsageVia = typeof USAGE_VIAS[number];
/** The board-pane values of `UsageVia`; the rest are main-screen values. */
export const PANE_USAGE_VIAS = ['paneOpen', 'paneReplace'] as const;
/** What a main-screen navigation may be marked with: `UsageVia` without the pane values (the server rejects a main entry carrying one). */
export type MainUsageVia = Exclude<UsageVia, typeof PANE_USAGE_VIAS[number]>;
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
 * labels on a category axis. The server stamps author and `at`; the client never sends either. `mine` is the
 * server-computed display hint "the requesting user wrote this note" (never the author id; #399): it only decides
 * whether the delete control is drawn, and `deleteAnnotation` re-checks authorship.
 */
export type ChartAnnotation = { id: string; chartId: string; scopeId: string; from: string; to: string; text: string; at: string; mine: boolean };
/** Which chart's notes at which site. A null scope is not a request the server answers (forbidden), never "all sites". */
export type AnnotationRef = { chartId: string; scopeId: string | null };
export type AnnotationInput = AnnotationRef & { from: string; to: string; text: string };
/** from inclusive, to exclusive. */
export type UsageRange = { preset: 'all' } | { from: number; to: number };
export type UsageMenuSummary = {
  menuId: string;
  visits: number;
  distinctUsers: number;
  lastUsedAt: number;
  /** Main-screen entry count N (`source=main` only, `name='entry'`). `null` when the menu's main entries come from < 3 distinct users (mask k = 3; includes no main entry at all) or when 1–2 of its entries are covered by no open inflow cell (`usageNextScreens` `masked`), same mask as the rates. Absent from a server that predates #605 part 2. */
  entries?: number | null;
  /** Share 0..1 of those entries whose NEXT main entry carried via `history`/`return` (「뒤로 나감」). `null` under the `entries` mask. The numerator counts only transitions to a destination used by >= 3 distinct people (smaller groups count as 0). Computed on the server, never in the browser. */
  backRate?: number | null;
  /** Share 0..1 of the menu's main entries with via `palette` (「검색 진입」). `null` under the `entries` mask, and `null` when either side of the split (palette entries / the other main entries) has 1–2 distinct people, so `entries × (1 − rate)` never gives the size of a small group. */
  searchEntryRate?: number | null;
};
export type UsageSummary = { preset: 'all' | 'range'; menus: UsageMenuSummary[] };
/** `usageNextScreens` request. `menuId` is validated like a `fromMenuId`; `includeBack` (default false) also ranks history/return and same-menu entries. */
export type UsageNextQuery = { menuId: string; includeBack?: boolean };
/**
 * One ranked destination. `count`, `distinctUsers` and `vias` come from the SAME set of next entries (never mixed sets); `distinctUsers >= 3` always. With `includeBack`, a later cell (back, same menu) joins a row only if it adds >= 3 people the row does not yet have (otherwise its entries stay in `summary` only), so `distinctUsers` with and without `includeBack` never differs by 1 or 2.
 * `vias` is all-or-nothing: the split of `count` by `via` when every via kind present was used by >= 3 distinct people, else `{}` (show count and users only).
 */
export type UsageNextDestination = { menuId: string; count: number; distinctUsers: number; vias: Partial<Record<UsageVia, number>> };
/**
 * Where people went right after one menu (main source only, #605). The < 3 distinct-user mask works on cells (one kind of next entry at one
 * destination): every number is a sum of cells with >= 3 distinct users, so no subtraction of two numbers, and no `includeBack` toggle, isolates a smaller group.
 * `masked` means exactly: the menu has 1 or 2 distinct main-entry users, OR `uncovered` is 1 or 2 (all numbers hidden, `entries: 0`). `uncovered(M) = entries(M) − events of the open inflow cells into M`, where an open inflow cell is a group of main entries into M from one other-or-same menu X (`fromMenuId`) of one kind (moved / sameMenu / backOrReturn) by >= 3 distinct people; a client that subtracts the visible inflow from `entries` would otherwise recover 1–2 entries that came from outside open cells. `uncovered` 0 or >= 3 changes nothing. `usageSummary` masks `entries`, `backRate` and `searchEntryRate` of such a menu the same way. A menu with no main entry at all answers `masked: false`, `entries: 0`, empty lists.
 */
export type UsageNextScreens = {
  menuId: string;
  /** Main-screen entries of the menu (N). 0 when masked or when there is none. */
  entries: number;
  masked: boolean;
  /** Next entries (fromMenuId = menuId) split four ways. The first three count only cells with >= 3 distinct people; `noMove` is `max(0, entries − the other three)` and so also holds transitions of fewer than 3 people. The four values sum to >= `entries` (equal unless the floor applied; one entry can be followed by several, so the three can exceed N): the screen uses their sum as the 100 % base. All 0 when masked or empty. */
  summary: { moved: number; sameMenu: number; backOrReturn: number; noMove: number };
  /** Count desc (menuId asc tie-break), at most 20. A destination is named only through a cell of >= 3 distinct people; `count` sums only such cells. */
  next: UsageNextDestination[];
  /** Destinations in the ranked set that have no cell of >= 3 people: how many, never which (can differ with `includeBack`). */
  hiddenDestinations: number;
};

/** Sort keys of the global audit index (issue #50). `targetType` sorts `target.type`. */
export type AuditSortField = 'at' | 'actor' | 'action' | 'source' | 'targetType';

/**
 * Global audit-trail read filters (issue #50). The client never sends a user id, a role, a Global Context
 * or an `at` to stamp — fixture actors are server data. The actor filter is a search constraint the
 * operator typed, not an identity stamp; a read does not append an audit row.
 */
export type AuditTrailQuery = {
  type?: string; // opaque case-sensitive token [A-Za-z][A-Za-z0-9_.:-]{0,79}; well-formed unknown = empty, malformed = error. Absent = all. Owner: real-server-checklist §2 auditTrail (ADR-0101).
  actor?: string; // exact, case-sensitive.
  action?: AuditAction;
  source?: AuditSource;
  fromAt?: string; // inclusive instant. Absent = no lower bound. With toAt, half-open [fromAt, toAt).
  toAt?: string; // exclusive instant. Absent = no upper bound.
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
  /** Non-envelope metadata reads. Every call rechecks session, Scope and rooms; limits clamp to 1–200. */
  listAxisOptions(input: AxisOptionsInput, signal?: AbortSignal): Promise<AxisOptionsPage>;
  searchEquipment(input: EquipmentSearchInput, signal?: AbortSignal): Promise<EquipmentSearchPage>;
  resolveSelection(input: SelectionResolveInput, signal?: AbortSignal): Promise<SelectionResolveResult>;
  publishedMetrics(): readonly PublishedMetric[];
  /** @deprecated Migrate to listAxisOptions (ADR-0059). */
  contextOptions(scopeId: string, signal?: AbortSignal): Promise<ConditionOptions>;
  /** @deprecated Migrate to searchEquipment / resolveSelection (ADR-0059). */
  evaluateSelection(input: SelectionInput, signal?: AbortSignal): Promise<SelectionEvaluation>;
  /** One destination row by ref (detail pages). Not an analysis query: no GlobalContext, no Selection substitute. */
  getEntity(ref: EntityRef, signal?: AbortSignal): Promise<ApiResponse<unknown>>;
  /** Menu data query (packages/sdk/contracts/src/menu/menu-query.ts, docs/adr/0019-menu-query-endpoint-declaration.md). The server resolves `req.endpoint` to its own copy of the declaration; permission, kinds and limits never travel in the request. */
  menuQuery(req: MenuQuery, signal?: AbortSignal): Promise<ApiResponse<unknown>>;
  /** Menu write (packages/sdk/contracts/src/adapter/action.ts, docs/adr/0054-write-port-declared-actions-idempotency-version.md). The server resolves `req.action` to its own copy of the declaration; permission and concurrency never travel in the request. Never throws for a judged request. */
  menuAction(req: MenuAction, signal?: AbortSignal): Promise<ActionResponse<unknown>>;
  /**
   * Anchor for default periods (naive wall-clock, docs/06 §6.3). `null` = the server has no anchor: the client never
   * substitutes the browser clock, a timezone conversion, the epoch or any invented date (ADR-0098).
   */
  defaultRangeTo(): string | null;
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
   * Console aggregate read (#605): where people went right after one menu. Same permission, errors and per-actor rate
   * budget as `usageSummary` (console:access; scenarios and errors answer like there); a read appends no audit row.
   * `menuId` is validated like a `fromMenuId` (malformed = outcome `error`); a well-formed menu with no data is `ok`, `masked: false`, `entries: 0`. All time, no range.
   */
  usageNextScreens(query: UsageNextQuery, signal?: AbortSignal): Promise<ApiResponse<UsageNextScreens>>;
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
   * detail permission. No list filters. Cursor-paged (ADR-0085): the server picks the page size, at most
   * ENTITY_AUDIT_PAGE_MAX, ordered `at` desc (instant) then `id` asc; `cursor` is an opaque keyset token bound to the
   * ref (a malformed or foreign cursor is outcome `error`, message `Invalid cursor`), read only after every gate
   * below has passed. The last page answers `nextCursor: null`; a page past the first with no rows is `ok` with
   * `events: []`. A response without a `nextCursor` key (a server that does not page) is the end. Same gates as `getEntity`: the destination type's view
   * permission, the site·room grant for a site-scoped type (`scopeId: null` for a siteless type like 지표),
   * `error` for an unregistered type. A zero is a confirmed result: outcome `empty` (no data), not `ok` with
   * an empty list.
   */
  entityAudit(req: EntityAuditRequest, signal?: AbortSignal): Promise<ApiResponse<EntityAuditPage>>;
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
   * Deletes one note (06 §16, issue #399, ADR-0041): only its author may, and the server records the deletion in
   * the audit trail. Same gates as `listAnnotations` (a null, unknown or ungranted scope is `forbidden`); then a
   * note written by someone else is `forbidden`, and an id that is not in this `(chartId, scopeId)` is `empty`,
   * so the answer never reveals a row of another site or author. An unknown key in the input rejects the call.
   * Answers the deleted id. Not mart data: trust stays null, assessments stay empty.
   */
  deleteAnnotation(ref: AnnotationRef & { id: string }, signal?: AbortSignal): Promise<ApiResponse<{ id: string }>>;
  /**
   * The signed-in user's server-held preferences (ADR-0098). No identity argument: the server reads the session. Not
   * mart data: trust stays null, assessments stay empty. `importedAt` is null until the one-time local import commits.
   */
  readPreferences(signal?: AbortSignal): Promise<ApiResponse<PreferencesSnapshot>>;
  /**
   * Patches keys of the session user's preferences: `set` stores (null stores null), `remove` deletes; the other keys
   * are untouched. A key in both `set` and `remove`, an out-of-grammar key or a value that is not JSON is outcome `error`; an oversized value, request or an account total over
   * the key limit is `too_large` (a failed patch changes nothing). Answers the whole snapshot after the write.
   */
  patchPreferences(patch: PreferencesPatch, signal?: AbortSignal): Promise<ApiResponse<PreferencesSnapshot>>;
  /**
   * One-time, atomic import of browser-held values (ADR-0098): a key the server already holds wins, only missing keys
   * are saved, all in one commit, and `importedAt` is stamped in that commit. The answer carries the snapshot after the
   * commit, so `importedAt !== null` is the acknowledgement. After completion it is a permanent no-op (answers the
   * current snapshot, writes nothing), so a key deleted later is never resurrected from another device.
   */
  importPreferences(input: PreferencesImport, signal?: AbortSignal): Promise<ApiResponse<PreferencesSnapshot>>;
  /**
   * Exact lookup of people by opaque user ids (batch, at most PEOPLE_LOOKUP_MAX). Returns only the visible people the
   * session may see: an unknown or unavailable id is simply absent (never an error, never private data), so callers keep
   * an id fallback. Not a name search and never capped by one. No console role or grant data.
   */
  lookupPeople(ids: readonly string[], signal?: AbortSignal): Promise<readonly GroupMember[]>;
  /**
   * Management list of platform notices including expired ones (notice:view). Not the Home banner (`home.notices`
   * menu query). Not mart data: trust null, assessments empty.
   */
  listNotices(signal?: AbortSignal): Promise<ApiResponse<NoticeListPage>>;
  /**
   * Creates (no `id`) or updates (`id` + `expectedVersion`) one notice; console:access. The server stamps identity and
   * times; a supplied author/time/unknown key is `invalid`. A stale `expectedVersion` is `conflict`; a retry with the
   * same `idempotencyKey` is answered `replayed`. Direct calls do not refresh the Home banner (#1106).
   */
  saveNotice(input: SaveNoticeInput, signal?: AbortSignal): Promise<ActionResponse<Notice>>;
  /** Deletes one notice; console:access, optimistic `expectedVersion`, replay-safe `idempotencyKey`. */
  deleteNotice(input: DeleteNoticeInput, signal?: AbortSignal): Promise<ActionResponse<{ id: string }>>;
  /**
   * Optional (an adapter without it behaves as before). Stores one file and answers an opaque id; the server decides
   * size (UPLOAD_FILE_MAX_BYTES), MIME (a closed set; set `file.type`, an empty type is rejected), name and permission,
   * so a UI pre-check never replaces the answer. Needs only a session: the right to *use* the file is judged by whoever
   * consumes the id. The stored file is unlinked: only the uploader can read it back and it is purged after 24 h, so
   * the consumer reads it within that window or links it. `idempotencyKey` is a UUIDv4 (the Kernel mints one per user action; anything else is `invalid`). A retry with the same key and file is `replayed`;
   * the same key with another file is `conflict`; a second use of a key never stores a second object. Judged failures
   * (too large, unsupported type, bad name, busy) are `invalid`/`error` outcomes, not thrown. No list, delete, link or
   * resumable upload.
   */
  uploadFile?(input: UploadFileInput, signal?: AbortSignal): Promise<ActionResponse<UploadedFile>>;
  /**
   * Announces that the session or server-side state changed. The kernel then re-reads the session,
   * re-validates the scope when the session changed, and hides every earlier query result.
   */
  subscribe(onChange: () => void): () => void;
};
