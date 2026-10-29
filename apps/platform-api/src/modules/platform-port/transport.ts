// Shared transport policy of the platform port (ADR-0069 decisions 2, 3), installed by the
// `/api/v1/platform` plugin and by the separate `/api/v1/menu-query` plugin: malformed JSON as a
// judged request, `Cache-Control: no-store` on every response, one error handler, and the
// cookie-session lookup. Notice routes are children of the platform plugin and inherit all of it.

import { errorCodeSchema } from '@ap/feature-shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { sendError, statusForCode } from '../../lib/errors.js';
import { SESSION_COOKIE_NAME } from '../../middleware/require-session.js';
import type { ActorRecord, SessionRecord, SessionService } from '../auth/session-service.js';
import type { PlatformActor } from './permissions.js';

export const MALFORMED_BODY = Symbol('malformed-json-body');

export interface LoadedSession {
  session: SessionRecord;
  actor: ActorRecord;
}

/**
 * Installs the JSON parser, the no-store hook and the error handler on `app`. A body that is not
 * valid JSON is a judged malformed request (HTTP 200 + a judged answer, ADR-0069 decision 2), not a
 * framework 4xx: the route receives `MALFORMED_BODY` instead of a throw. `notFound` also installs the
 * prefix's own 404; the menu-query plugin has no prefix of its own to claim, so it opts out.
 */
export function installPlatformTransport(
  app: FastifyInstance,
  options: { notFound: boolean },
): void {
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '') return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(null, MALFORMED_BODY);
    }
  });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
  });

  // Unknown paths under the prefix still get this plugin's hooks (no-store); outside the
  // prefix Fastify's default 404 is unchanged.
  if (options.notFound) {
    app.setNotFoundHandler((_req, reply) =>
      reply.code(404).send({ code: 'not_found', message: 'route not found' }),
    );
  }

  // Plugin-scoped: sibling feature routes keep the root handler. Covers what can
  // reach these routes — a thrown HttpError / rate-limit error with a known code,
  // a 4xx from the framework, anything else as 500.
  app.setErrorHandler((err, req, reply) => {
    const rawCode = (err as { code?: string }).code;
    const parsed = typeof rawCode === 'string' ? errorCodeSchema.safeParse(rawCode) : null;
    if (parsed?.success) {
      const status = statusForCode(parsed.data);
      const detail = (err as { detail?: Record<string, unknown> }).detail;
      if (status === 429 && typeof detail?.retry_after_seconds === 'number') {
        reply.header('Retry-After', String(detail.retry_after_seconds));
      }
      return reply
        .code(status)
        .send({ code: parsed.data, message: err.message, ...(detail ? { detail } : {}) });
    }
    const statusCode = (err as { statusCode?: unknown }).statusCode;
    if (typeof statusCode === 'number' && statusCode >= 400 && statusCode <= 499) {
      return reply
        .code(statusForCode('validation.malformed_request'))
        .send({ code: 'validation.malformed_request', message: 'malformed request' });
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ code: 'internal.unexpected', message: 'internal server error' });
  });
}

export type Authenticate = (
  req: FastifyRequest,
  reply: FastifyReply,
  touch: boolean,
) => Promise<LoadedSession | null>;

/** The cookie-session lookup of every platform route: no/inactive cookie → 401, other workspace → 403. */
export function createAuthenticator(deps: {
  sessionService: SessionService;
  workspaceId: string;
}): Authenticate {
  return async function authenticate(req, reply, touch) {
    const cookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (!cookie) {
      sendError(reply, 'auth.session_invalid', 'session cookie missing');
      return null;
    }
    const loaded = touch
      ? await deps.sessionService.loadAndTouch(cookie)
      : await deps.sessionService.loadActive(cookie);
    if (!loaded) {
      sendError(reply, 'auth.session_invalid', 'session not active');
      return null;
    }
    if (loaded.session.workspaceId !== deps.workspaceId) {
      sendError(reply, 'auth.workspace_mismatch', 'session is bound to a different workspace');
      return null;
    }
    return loaded;
  };
}

export function platformActorOf(loaded: LoadedSession): PlatformActor {
  return {
    actor_id: loaded.actor.id,
    workspace_id: loaded.session.workspaceId,
    role_level: loaded.actor.roleLevel,
  };
}
