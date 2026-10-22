import { createHash, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { sendError } from '../../lib/errors.js';
import { SESSION_COOKIE_NAME } from '../../middleware/require-session.js';
import type { SessionService } from '../auth/session-service.js';

export const CSRF_HEADER_NAME = 'x-csrf-token';

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/**
 * Double-submit check against the session's stored token (`core.sessions.csrf_token`,
 * handed out by `GET /api/v1/platform/bootstrap`). For the platform port's mutating
 * routes (#622); no route applies it yet. Runs after the session cookie is present:
 * no cookie → 401 `auth.session_invalid`; missing, wrong or not-yet-issued token →
 * 403 `csrf.invalid`. `csrf.invalid` is outside the closed `ErrorCode` enum, so the
 * body is sent directly rather than through `sendError`.
 */
export function requireCsrf(sessionService: SessionService): preHandlerHookHandler {
  // An async preHandler that sends a reply must return it: otherwise Fastify still runs the route
  // handler, and a 403 response would hide a write that already happened (#622).
  return async function requireCsrfHandler(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply | undefined> {
    const cookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (!cookie) {
      return sendError(reply, 'auth.session_invalid', 'session cookie missing');
    }
    const header = req.headers[CSRF_HEADER_NAME];
    const expected = await sessionService.getCsrfToken(cookie);
    const ok =
      typeof header === 'string' &&
      header.length > 0 &&
      expected !== null &&
      timingSafeEqual(digest(header), digest(expected));
    if (!ok) {
      return reply.code(403).send({ code: 'csrf.invalid', message: 'csrf token mismatch' });
    }
    return undefined;
  };
}
