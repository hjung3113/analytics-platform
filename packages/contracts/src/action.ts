import type { Permission } from './menu.js';
import type { AnyEndpointSpec } from './menu-query.js';

/** Menu write declaration shared by the client and server (docs/adr/0054-write-port-declared-actions-idempotency-version.md). */
export type ActionSpec<I, T> = {
  /** '<group>.<name>', globally unique transport key. */
  id: string;
  /** Owning menu manifest id; the Registry must contain it. */
  menuId: string;
  /** Runtime allow-list is Object.keys(spec.inputKeys); list every input key, including optional ones. */
  inputKeys: Readonly<Record<keyof I & string, true>>;
  /** Server action ACL; may differ from the menu permission and is not sent in the request. */
  permission: Permission;
  /** Whether the action requires a scope; `context.scopeId` travels exactly when true. */
  requiresScope: boolean;
  /** `version`: the request carries `expectedVersion` and a mismatch answers `conflict`. */
  concurrency: 'none' | 'version';
  /** Queries to read again after the write (the Kernel's job, #502); each belongs to the same menu. */
  invalidates: readonly AnyEndpointSpec[];
  /** Phantom types only; no runtime value. */
  readonly _types?: { input: I; data: T };
};

/** Returns the action declaration unchanged. */
export const defineAction = <I, T>(spec: Omit<ActionSpec<I, T>, '_types'>): ActionSpec<I, T> => spec;

/** Any action for heterogeneous registries; `I` is invariant like `AnyEndpointSpec`'s `P`. */
export type AnyActionSpec = ActionSpec<any, unknown>;

/**
 * Request sent to the transport. Permission is not included; actor and time never travel (the server stamps them).
 * `context.scopeId` is present exactly when the action `requiresScope`; `expectedVersion` exactly when
 * `concurrency` is `version`.
 */
export type MenuAction<I = unknown> = {
  action: string;
  context: { scopeId?: string | null };
  input: I;
  /** UUID the Kernel mints per user action; a retry resends the same key. */
  idempotencyKey: string;
  expectedVersion?: string;
};

/** `unknown`: no answer was received, so whether the write applied is not known (never produced by a server that answered). */
export type ActionOutcome = 'ok' | 'invalid' | 'conflict' | 'forbidden' | 'not_found' | 'error' | 'unknown';

export type FieldError = { path: readonly string[]; code: string };

/** The write envelope. Not `ApiResponse`: no assessments or trust, and `Outcome` is not widened. */
export type ActionResponse<T> = {
  outcome: ActionOutcome;
  data: T | null;
  /** Version after the write on `ok`; the current version on `conflict`; otherwise null. */
  version: string | null;
  fieldErrors: readonly FieldError[];
  /** True when this is the stored answer of an earlier request with the same key and input. */
  replayed: boolean;
  correlationId: string;
  message?: string;
};

/**
 * What a screen receives. `retry` resends the identical request (same key, input and version) and is present only on
 * `error` and `unknown` answers that reached or may have reached the server — never on `not_ready`.
 */
export type ActionResult<T> = ActionResponse<T> & { retry?: () => Promise<ActionResult<T>> };
