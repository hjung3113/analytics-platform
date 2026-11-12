// `POST /api/v1/menu-query` and `POST /api/v1/menu-action` — the two business-menu ports, served
// from one declaration registry. Like the platform port they answer every judged request with HTTP
// 200; a missing/expired session is 401 and another workspace's session 403 (judged first). They sit
// beside, not inside, `/api/v1/platform`, so each installs the platform transport policy itself
// (no-store, malformed-JSON-as-a-judged-request, error handler) without a second prefix 404.
// The read is a POST without CSRF (platform ADR-0069 decision 4); the write carries the CSRF check of the
// notice writes, after the session is judged. `Idempotency-Key` / `If-Match` also travel as headers
// (http-adapter `actionCall`), but the body copy is the one judged (checklist §3 step 1–2): the adapter
// always sends both from the same value, so a header can never decide a different request.

import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from 'fastify';

import type { Db } from '../../db/client.js';
import type { SessionService } from '../auth/session-service.js';
import { refuseLostTokenContext } from '../api-tokens/gate.js';
import { requireCsrf } from '../platform-port/csrf.js';
import {
  type LoadedSession,
  MALFORMED_BODY,
  createAuthenticator,
  installPlatformTransport,
  platformActorOf,
} from '../platform-port/transport.js';
import { createMenuActionEngine } from './action.js';
import { MenuUpstreamError } from './forwarder.js';
import { judgeQueryShape, runQuery, unavailableSessionVersion } from './query.js';
import type { MenuDispatchRegistry } from './registry.js';

export const MENU_QUERY_PREFIX = '/api/v1/menu-query';
export const MENU_ACTION_PREFIX = '/api/v1/menu-action';

export interface MenuDispatchRoutesOptions {
  sessionService: SessionService;
  workspaceId: string;
  registry: MenuDispatchRegistry;
  sessionVersionOf?: (loaded: LoadedSession) => Promise<string>;
}

export interface MenuActionRoutesOptions extends MenuDispatchRoutesOptions {
  db: Db;
}

export const menuQueryDispatchRoutes: FastifyPluginAsync<MenuDispatchRoutesOptions> = async (
  app,
  opts,
) => {
  installPlatformTransport(app, { notFound: false });
  const authenticate = createAuthenticator({
    sessionService: opts.sessionService,
    workspaceId: opts.workspaceId,
  });

  // tokenCallable (ADR-0116): every judgment of a menu-query goes through `declaration.authorize` →
  // `holdsPlatformPermission` → `checkCapability`, which applies the token scopes.
  app.post('/', { config: { tokenCallable: true } }, async (req, reply) => {
    // The client going away cancels the read: handlers that call a slow Source take this signal into the port. Tracked before the
    // authentication await, so a disconnect while the session loads is not missed.
    const abandoned = new AbortController();
    const abandon = () => {
      if (!reply.raw.writableFinished) abandoned.abort();
    };
    reply.raw.once('close', abandon);
    if (reply.raw.destroyed) abandon();
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    if (refuseLostTokenContext(req, reply)) return reply; // fail closed again right before dispatch authorizes
    const shape = judgeQueryShape(req.body === MALFORMED_BODY ? null : req.body, opts.registry);
    if (!shape.ok) return answerOf(req, { outcome: 'error', message: shape.message });
    let version: Promise<string> | undefined;
    const sessionVersion = () => version ??= opts.sessionVersionOf
      ? opts.sessionVersionOf(loaded)
      : unavailableSessionVersion();
    let answer;
    try {
      answer = await runQuery(shape, platformActorOf(loaded), req.id, abandoned.signal, sessionVersion);
    } catch (error) {
      // A forwarded endpoint's upstream failed as transport (forwarder.ts): 502/504 with the same
      // correlation id and none of the upstream's body text. Anything else keeps the 500 path.
      if (error instanceof MenuUpstreamError) {
        return reply.code(error.httpStatus).send({ code: error.code, message: error.message, correlationId: req.id });
      }
      throw error;
    }
    return answerOf(req, answer);
  });
};

/** `ApiResponse` wire body: the engine decides assessments/trust, the transport only adds the correlation id. */
function answerOf(
  req: Pick<FastifyRequest, 'id'>,
  answer: {
    outcome: string;
    data?: unknown;
    assessments?: readonly unknown[];
    trust?: unknown;
    message?: string;
  },
) {
  return {
    outcome: answer.outcome,
    data: answer.data ?? null,
    assessments: answer.assessments ?? [],
    trust: answer.trust ?? null,
    correlationId: req.id,
    ...(answer.message !== undefined ? { message: answer.message } : {}),
  };
}

export const menuActionRoutes: FastifyPluginAsync<MenuActionRoutesOptions> = async (app, opts) => {
  installPlatformTransport(app, { notFound: false });
  const authenticate = createAuthenticator({
    sessionService: opts.sessionService,
    workspaceId: opts.workspaceId,
  });
  const csrf = requireCsrf(opts.sessionService);
  const engine = createMenuActionEngine({ db: opts.db, registry: opts.registry });

  // The session is loaded once, before the CSRF hook: a stale cookie never reaches the CSRF check.
  const authenticated = new WeakMap<FastifyRequest, LoadedSession>();
  const authenticateFirst: preHandlerHookHandler = async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    authenticated.set(req, loaded);
    return undefined;
  };

  app.post('/', { config: { tokenCallable: true, tokenMutation: true }, preHandler: [authenticateFirst, csrf] }, async (req, reply) => {
    const loaded = authenticated.get(req);
    if (!loaded) return reply.code(401).send({ code: 'auth.session_invalid' });
    if (refuseLostTokenContext(req, reply)) return reply; // fail closed again right before dispatch authorizes
    const abandoned = new AbortController();
    reply.raw.once('close', () => { if (!reply.raw.writableFinished) abandoned.abort(); });
    if (reply.raw.destroyed) abandoned.abort();
    return engine.run(platformActorOf(loaded), req.body === MALFORMED_BODY ? null : req.body, req.id, abandoned.signal);
  });
};
