import type { Text } from './i18n';
import type { Permission, SpaceId } from './menu';
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
   * Announces that the session or server-side state changed. The kernel then re-reads the session,
   * re-validates the scope when the session changed, and hides every earlier query result.
   */
  subscribe(onChange: () => void): () => void;
};
