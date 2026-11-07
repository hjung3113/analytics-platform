// The token gate (ADR-0116 decisions 2, 4, 8): two root hooks.
//   1. `installAuthStore` — first hook of every request: opens the request's auth-context holder (default
//      session) so `check-service` and the audit writer can read it.
//   2. `installTokenGate` — after the rate limiter (appended to each route's own `onRequest` list, because
//      `@fastify/rate-limit` runs as a route-level hook, which is after every app-level `onRequest` hook): when `Authorization: Bearer …` is present the cookie is
//      ignored and the token is authenticated; any failure is one `auth.token_invalid` 401. A route that has not
//      set `config.tokenCallable` refuses an authenticated token with `permission.session_required` (deny by
//      default), and the refusal is audited.

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { type AuthStore, currentAuthContext, runWithAuthStore } from '../../lib/auth-context.js';
import { sendError } from '../../lib/errors.js';
import type { ApiTokenService } from './service.js';
import { bearerValue } from './token-format.js';
import { authResultOf, authStoreOf, setAuthStore, setTokenSession, tokenSessionOf } from './request-state.js';

const HEALTH_PATHS = new Set(['/health', '/health/live', '/health/ready']);

export function installAuthStore(app: FastifyInstance): void {
  app.addHook('onRequest', (req, _reply, done) => {
    const store: AuthStore = { ctx: { kind: 'session' } };
    setAuthStore(req, store);
    runWithAuthStore(store, () => done());
  });
}

/**
 * Fail closed (ADR-0116): a token request whose AsyncLocalStorage context was lost (a callback-style library, an
 * event emitter) would read `session` from `currentAuthContext()` and run every check as a cookie session. Returns
 * true after refusing such a request with a logged 500; the caller stops and does no work.
 */
export function refuseLostTokenContext(req: FastifyRequest, reply: FastifyReply): boolean {
  if (!tokenSessionOf(req) || currentAuthContext().kind === 'token') return false;
  req.log.error({ request_id: req.id }, 'api token request lost its auth context; refusing to run as a session');
  void sendError(reply, 'internal.unexpected', 'internal server error');
  return true;
}

export function installTokenGate(app: FastifyInstance, deps: { tokens: ApiTokenService }): void {
  const gate = async (req: FastifyRequest, reply: FastifyReply) => {
    const value = bearerValue(req.headers.authorization);
    if (value === null) return undefined;
    if (HEALTH_PATHS.has(req.url)) return undefined;

    const result = await authResultOf(req, () => deps.tokens.authenticate(value, req.ip));
    if (!result.ok) {
      try {
        await deps.tokens.recordAuthFailure(result);
      } catch (err) {
        req.log.warn({ err }, 'api token auth failure could not be audited');
      }
      return sendError(reply, 'auth.token_invalid', 'API token is not valid');
    }

    const store = authStoreOf(req);
    if (store) store.ctx = { kind: 'token', tokenId: result.tokenId, scopes: result.scopes };
    req.session = {
      session_id: `token:${result.tokenId}`,
      actor_id: result.actorId,
      workspace_id: result.workspaceId,
      role_level: result.roleLevel as 'admin' | 'developer' | 'user',
    };
    setTokenSession(req, {
      session: {
        id: `token:${result.tokenId}`,
        actorId: result.actorId,
        workspaceId: result.workspaceId,
        roleLevel: result.roleLevel as 'admin' | 'developer' | 'user',
      },
      actor: result.actor,
    });

    if (req.routeOptions?.config?.tokenCallable !== true) {
      try {
        await deps.tokens.recordSessionRequiredDenied({
          workspaceId: result.workspaceId,
          actorId: result.actorId,
          tokenId: result.tokenId,
          method: req.method,
          route: req.routeOptions?.url ?? 'unknown',
          capability: null,
        });
      } catch (err) {
        req.log.warn({ err }, 'api token refusal could not be audited');
      }
      return sendError(reply, 'permission.session_required', 'this call requires a login session');
    }
    return undefined;
  };
  // Runs after the rate limiter's own onRoute hook (registered earlier), so the limiter's handler is already in the
  // list and ours is appended behind it: a failed Bearer call is counted in the IP bucket before it is refused.
  app.addHook('onRoute', (routeOptions) => {
    const hook = routeOptions.onRequest;
    routeOptions.onRequest = Array.isArray(hook) ? [...hook, gate] : hook ? [hook, gate] : [gate];
  });

  // A token that hit a session-only capability inside a callable route is refused as `forbidden` by the check; the
  // check only notes it in the request's auth store, and the refusal is audited here, before the response leaves.
  // Callback form on purpose: a request without a noted denial passes through synchronously. As an async hook it
  // ran on every reply and made the auth and survey integration suites throw ERR_HTTP_HEADERS_SENT (#1442).
  app.addHook('onSend', (req, _reply, payload, done) => {
    const store = authStoreOf(req);
    const loaded = tokenSessionOf(req);
    if (!store || !loaded || store.ctx.kind !== 'token' || !store.sessionOnlyDenied?.size) {
      done(null, payload);
      return;
    }
    const capabilities = [...store.sessionOnlyDenied];
    store.sessionOnlyDenied.clear();
    const { tokenId } = store.ctx;
    const audit = async () => {
      for (const capability of capabilities) {
        try {
          await deps.tokens.recordSessionRequiredDenied({
            workspaceId: loaded.session.workspaceId,
            actorId: loaded.session.actorId,
            tokenId,
            method: req.method,
            route: req.routeOptions?.url ?? 'unknown',
            capability,
          });
        } catch (err) {
          req.log.warn({ err }, 'api token refusal could not be audited');
        }
      }
    };
    void audit().then(() => done(null, payload));
  });
}
