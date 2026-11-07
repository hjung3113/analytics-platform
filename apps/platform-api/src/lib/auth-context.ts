// Request-scoped auth context (ADR-0116, #1442). One mutable holder per request, created by the first
// `onRequest` hook (modules/api-tokens/gate.ts) and filled when a Bearer API token authenticates. The
// capability check (`permissions/check-service.ts`) and the audit writer read it from here, so the token
// rules apply centrally without threading a parameter through every call site. Outside a request (jobs,
// seeds, unit tests) there is no store and the context is a plain session.

import { AsyncLocalStorage } from 'node:async_hooks';

export type AuthContext =
  | { kind: 'session' }
  | { kind: 'token'; tokenId: string; scopes: readonly string[] };

export interface AuthStore {
  ctx: AuthContext;
  /** Session-only capabilities a token call was refused (set by `check-service`, audited by the token gate on send). */
  sessionOnlyDenied?: Set<string>;
}

const storage = new AsyncLocalStorage<AuthStore>();

export function runWithAuthStore<T>(store: AuthStore, fn: () => T): T {
  return storage.run(store, fn);
}

export function currentAuthContext(): AuthContext {
  return storage.getStore()?.ctx ?? { kind: 'session' };
}

/** Test seam: run `fn` as if a token call were in flight. */
export function runAsToken<T>(tokenId: string, scopes: readonly string[], fn: () => T): T {
  return storage.run({ ctx: { kind: 'token', tokenId, scopes } }, fn);
}

/** Remember, in memory only, that this token call hit a session-only capability. No write happens here. */
export function noteSessionOnlyDenial(capability: string): void {
  const store = storage.getStore();
  if (store?.ctx.kind !== 'token') return;
  (store.sessionOnlyDenied ??= new Set()).add(capability);
}
