// `POST /api/v1/menu-query` and `POST /api/v1/menu-action` — the two business-menu ports, served
// from one declaration registry. Like the platform port they answer every judged request with HTTP
// 200; a missing/expired session is 401 and another workspace's session 403 (judged first). They sit
// beside, not inside, `/api/v1/platform`, so each installs the platform transport policy itself
// (no-store, malformed-JSON-as-a-judged-request, error handler) without a second prefix 404.
// The read is a POST without CSRF (ADR-0069 decision 4); the write carries the CSRF check of the
// notice writes, after the session is judged. `Idempotency-Key` / `If-Match` also travel as headers
// (http-adapter `actionCall`), but the body copy is the one judged (checklist §3 step 1–2): the adapter
// always sends both from the same value, so a header can never decide a different request.

import type { FastifyPluginAsync, FastifyRequest, preHandlerHookHandler } from 'fastify';

import type { Db } from '../../db/client.js';
import type { SessionService } from '../auth/session-service.js';
import { requireCsrf } from '../platform-port/csrf.js';
import {
  type LoadedSession,
  MALFORMED_BODY,
  createAuthenticator,
  installPlatformTransport,
  platformActorOf,
} from '../platform-port/transport.js';
import { createMenuActionEngine } from './action.js';
import { judgeQueryShape, runQuery } from './query.js';
import type { MenuDispatchRegistry } from './registry.js';

export const MENU_QUERY_PREFIX = '/api/v1/menu-query';
export const MENU_ACTION_PREFIX = '/api/v1/menu-action';

export interface MenuDispatchRoutesOptions {
  sessionService: SessionService;
  workspaceId: string;
  registry: MenuDispatchRegistry;
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

  app.post('/', async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const shape = judgeQueryShape(req.body === MALFORMED_BODY ? null : req.body, opts.registry);
    if (!shape.ok) return answerOf(req, { outcome: 'error', message: shape.message });
    return answerOf(req, await runQuery(shape, platformActorOf(loaded), req.id));
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

  app.post('/', { preHandler: [authenticateFirst, csrf] }, async (req, reply) => {
    const loaded = authenticated.get(req);
    if (!loaded) return reply.code(401).send({ code: 'auth.session_invalid' });
    return engine.run(platformActorOf(loaded), req.body === MALFORMED_BODY ? null : req.body, req.id);
  });
};
