import type { Text } from './i18n';
import type { Permission } from './menu';

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

export type PlatformAdapter = {
  /** Current session. Must return the same object until the session changes (it is a store snapshot). */
  session(): Session;
  validateScope(scopeId: string, signal?: AbortSignal): Promise<ScopeCheck>;
  publishedMetrics(): readonly PublishedMetric[];
  /** Anchor for default periods (naive wall-clock, docs/06 §6.3). */
  defaultRangeTo(): string;
  /**
   * Announces that the session or server-side state changed. The kernel then re-reads the session,
   * re-validates the scope when the session changed, and hides every earlier query result.
   */
  subscribe(onChange: () => void): () => void;
};
