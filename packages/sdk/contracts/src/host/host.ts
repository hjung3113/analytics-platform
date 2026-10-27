import type { ActionResult, ActionSpec } from '../adapter/action.js';
import type { Text } from '../i18n.js';
import type { ApiResponse } from '../adapter/response.js';
import type { EndpointSpec } from '../menu/menu-query.js';
import type { ContextKey, MenuMeta } from '../menu/menu.js';
import type { GlobalContext } from '../links/url.js';

/**
 * Host → module contract, version 1 (ADR-0053, docs/integration/platform-hosting-design.md §2.5).
 * A module declares a ModuleManifest and renders screens that receive a ModuleHost; the kernel registers the first
 * and implements the second. React-bound values (nodes, elements) are `unknown` here. Field names are Candidates.
 */
export type HostContract = 1;
/** Contract versions a host accepts; a manifest with any other `contract` is rejected at registration (fail closed). */
export const HOST_CONTRACTS = [1] as const;
/** Optional host features a module may require. `query` = platform server query, `detailSlot` = shell detail panel slot, `write` = declared server write (ADR-0054). */
export type HostFeature = 'query' | 'detailSlot' | 'write';

/** Open vocabulary (G1): a module permission or group id is `<moduleId>:<name>`; the registry checks the prefix. */
export type ModuleScopedId = `${string}:${string}`;

/** A screen declaration. The path is module-relative (`''` = the module prefix itself); the host adds the prefix. */
export type ModuleScreenMeta = Omit<MenuMeta, 'group' | 'path' | 'permission'> & {
  path: string;
  /** A group id declared in the manifest's `groups`. Which space it sits in is the host's decision. */
  group: ModuleScopedId;
  /** Display-only permission string; the server re-checks every request. */
  permission: ModuleScopedId;
};

export type ModuleManifest = {
  module: { id: string; label: Text; contract: HostContract; languages: readonly ('ko' | 'en')[] };
  /** Host features the module cannot run without; the registration fails if the host lacks one. */
  requires: readonly HostFeature[];
  /** Host features the module uses when present. */
  optional?: readonly HostFeature[];
  /** Config keys the assembly must supply (G5); a missing key fails registration. */
  config?: readonly string[];
  groups: readonly { id: ModuleScopedId; label: Text }[];
  screens: readonly ModuleScreenMeta[];
};

/** Where a module link goes: a screen of the same module, or any registered menu by id. Never a URL string (06 §22). */
export type ModuleTarget =
  | { screen: string; params?: Record<string, string>; page?: Record<string, string>; returnTo?: boolean }
  | { menuId: string; params?: Record<string, string>; page?: Record<string, string>; returnTo?: boolean };

export type ModuleStatus = 'ready' | 'auth_required' | 'identity_mismatch' | 'unavailable';

/** The one object a module screen gets from the host. */
export type ModuleHost = {
  contract: HostContract;
  session(): { user: { id: string; name: string } | null; generation: number };
  /** Display only. */
  can(permission: string): boolean;
  params(): Readonly<Record<string, string>>;
  page(key: string): string | null;
  setPage(patch: Record<string, string | null>, options?: { replace?: boolean }): void;
  href(target: ModuleTarget): { href: string; allowed: boolean } | null;
  navigate(target: ModuleTarget, options?: { replace?: boolean }): boolean;
  returnTarget(): string;
  context(): { values: Partial<GlobalContext>; unsupported: readonly ContextKey[] };
  /** Feature `query`; absent when the host does not provide it. */
  query?<P, T>(spec: EndpointSpec<P, T>, params: P, signal?: AbortSignal): Promise<ApiResponse<T>>;
  /**
   * Feature `write` (ADR-0054). One server write: the host mints the idempotency key, applies the Scope gate and, on `ok`,
   * `conflict` or `unknown`, refreshes the queries in `spec.invalidates`. `concurrency: 'version'` needs `expectedVersion`
   * (a `RangeError` before anything is sent). A second call for the same `spec.id` while one is unsettled returns that call's
   * promise. Rejects `AbortError` when the screen is released or the session generation changes before the answer; a sent write is
   * not undone. `error` and `unknown` answers carry `retry()`, which resends the identical request.
   */
  act?<I, T>(spec: ActionSpec<I, T>, input: I, options?: { expectedVersion?: string }): Promise<ActionResult<T>>;
  config(key: string): string | null;
  lang(): 'ko' | 'en';
  notify(text: string, tone?: 'info' | 'warning' | 'danger'): void;
  status(next: ModuleStatus): void;
  reportError(error: unknown): string;
  /** `el` is a DOM element; the contract does not know DOM types. */
  focusTarget(el: unknown): void;
  /** Feature `detailSlot`; `node` is a React node. */
  detail?: { show(node: unknown, label: string): void; clear(): void };
  subscribe(onChange: () => void): () => void;
  /** Aborted when the screen is released; for resources outside React. */
  signal: AbortSignal;
};

/** Props of a module screen component. */
export type ModuleScreenProps = { params: Readonly<Record<string, string>>; host: ModuleHost };
