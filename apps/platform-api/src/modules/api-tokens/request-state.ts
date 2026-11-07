// Per-request state of a token call (ADR-0116). Kept in WeakMaps keyed by the request so the Fastify request type
// is not widened and nothing leaks across requests.

import type { FastifyRequest } from 'fastify';

import type { AuthStore } from '../../lib/auth-context.js';
import type { ActorRecord, SessionRecord } from '../auth/session-service.js';
import type { TokenAuthResult } from './service.js';

export interface TokenLoadedSession {
  session: SessionRecord;
  actor: ActorRecord;
}

const stores = new WeakMap<FastifyRequest, AuthStore>();
const loaded = new WeakMap<FastifyRequest, TokenLoadedSession>();

export const authStoreOf = (req: FastifyRequest): AuthStore | undefined => stores.get(req);
export const setAuthStore = (req: FastifyRequest, store: AuthStore): void => {
  stores.set(req, store);
};

/** The session-shaped identity of an authenticated token call, or undefined for a cookie request. */
export const tokenSessionOf = (req: FastifyRequest): TokenLoadedSession | undefined => loaded.get(req);
export const setTokenSession = (req: FastifyRequest, value: TokenLoadedSession): void => {
  loaded.set(req, value);
};

const authResults = new WeakMap<FastifyRequest, Promise<TokenAuthResult>>();

/**
 * The one authentication of a Bearer request. The rate-limit key generator needs the outcome before the gate runs
 * (bucket selection), so the first caller starts it and the gate reuses it: one lookup and one use stamp per request.
 */
export const authResultOf = (
  req: FastifyRequest,
  authenticate: () => Promise<TokenAuthResult>,
): Promise<TokenAuthResult> => {
  let pending = authResults.get(req);
  if (!pending) {
    pending = authenticate();
    authResults.set(req, pending);
  }
  return pending;
};
