// Platform saved views — `/api/v1/platform/saved-views/commands` and `/people/lookup` (ADR-0099). A second plugin
// registered with the platform prefix (sibling to the platform port). The route only authenticates, checks CSRF (commands),
// parses with the shared runtime schemas and responds; policy lives in the service. Cookie session, the session
// workspace and CSRF apply to every command, reads included. `/people/lookup` is a standalone read-only endpoint: like
// the other read-only POSTs of the HTTP adapter contract it needs the session and workspace but not CSRF. Responses
// are never ApiResponse-wrapped and are `no-store`, errors too.

import { peopleLookupRequestSchema, savedViewCommandSchema } from '@ap/contract-schemas';
import { errorCodeSchema } from '@ap/feature-shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { Db } from '../../db/client.js';
import { sendError, statusForCode } from '../../lib/errors.js';
import { SESSION_COOKIE_NAME } from '../../middleware/require-session.js';
import type { ActorRecord, SessionRecord, SessionService } from '../auth/session-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { requireCsrf } from '../platform-port/csrf.js';
import { type SavedViewSession, createSavedViewService } from './service.js';

export interface PlatformSavedViewsOptions {
  sessionService: SessionService;
  checkService: CheckService;
  workspaceId: string;
  db: Db;
  now?: () => number;
}

const MALFORMED_BODY = Symbol('malformed-json-body');

export const platformSavedViewRoutes: FastifyPluginAsync<PlatformSavedViewsOptions> = async (
  app,
  opts,
) => {
  const service = createSavedViewService({
    db: opts.db,
    checkService: opts.checkService,
    ...(opts.now ? { now: opts.now } : {}),
  });
  const csrf = requireCsrf(opts.sessionService);

  // Malformed JSON is a validation failure, not a framework 4xx.
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

  app.setErrorHandler((err, req, reply) => {
    const rawCode = (err as { code?: string }).code;
    const parsed = typeof rawCode === 'string' ? errorCodeSchema.safeParse(rawCode) : null;
    if (parsed?.success) {
      const detail = (err as { detail?: Record<string, unknown> }).detail;
      if (statusForCode(parsed.data) === 429 && typeof detail?.retry_after_seconds === 'number') {
        reply.header('Retry-After', String(detail.retry_after_seconds));
      }
      return reply
        .code(statusForCode(parsed.data))
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

  async function authenticate(
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<SavedViewSession | null> {
    const cookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (!cookie) {
      sendError(reply, 'auth.session_invalid', 'session cookie missing');
      return null;
    }
    const loaded: { session: SessionRecord; actor: ActorRecord } | null =
      await opts.sessionService.loadAndTouch(cookie);
    if (!loaded) {
      sendError(reply, 'auth.session_invalid', 'session not active');
      return null;
    }
    if (loaded.session.workspaceId !== opts.workspaceId) {
      sendError(reply, 'auth.workspace_mismatch', 'session is bound to a different workspace');
      return null;
    }
    // The platform session's user id is core.actors.id; nothing about identity or role comes from the body.
    return {
      actorId: loaded.actor.id,
      workspaceId: loaded.session.workspaceId,
      roleLevel: loaded.actor.roleLevel,
    };
  }

  /** Plain JSON, serialized by hand: `null` (a missing `get`) must reach the client as the text `null`, not an empty body. */
  const respond = (reply: FastifyReply, value: unknown) =>
    reply.code(200).type('application/json; charset=utf-8').send(JSON.stringify(value));

  app.post('/saved-views/commands', { preHandler: csrf }, async (req, reply) => {
    const session = await authenticate(req, reply);
    if (!session) return reply;
    const parsed = req.body === MALFORMED_BODY ? null : savedViewCommandSchema.safeParse(req.body);
    if (!parsed?.success)
      return sendError(reply, 'validation.malformed_request', 'invalid saved view command');
    return respond(reply, await service.execute(session, parsed.data));
  });

  app.post('/people/lookup', async (req, reply) => {
    const session = await authenticate(req, reply);
    if (!session) return reply;
    const parsed =
      req.body === MALFORMED_BODY ? null : peopleLookupRequestSchema.safeParse(req.body);
    if (!parsed?.success)
      return sendError(reply, 'validation.malformed_request', 'invalid people lookup');
    return respond(reply, { items: await service.lookup(session, parsed.data.ids) });
  });
};
