// Platform saved views — `/api/v1/platform/saved-views/commands` and `/people/lookup` (ADR-0099). A second plugin
// registered with the platform prefix (sibling to the platform port). The route only authenticates, checks CSRF (commands),
// parses with the shared runtime schemas and responds; policy lives in the service. Cookie session, the session
// workspace and CSRF apply to every command, reads included. `/people/lookup` is a standalone read-only endpoint: like
// the other read-only POSTs of the HTTP adapter contract it needs the session and workspace but not CSRF. Responses
// are never ApiResponse-wrapped and are `no-store`, errors too.

import { peopleLookupRequestSchema, savedViewCommandSchema } from '@ap/contract-schemas';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { Db } from '../../db/client.js';
import { sendError } from '../../lib/errors.js';
import type { SessionService } from '../auth/session-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { requireCsrf } from '../platform-port/csrf.js';
import {
  MALFORMED_BODY,
  createAuthenticator,
  createSessionGuard,
  installPlatformTransport,
} from '../platform-port/index.js';
import { type SavedViewSession, createSavedViewService } from './service.js';

export interface PlatformSavedViewsOptions {
  sessionService: SessionService;
  checkService: CheckService;
  workspaceId: string;
  db: Db;
  now?: () => number;
}

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

  installPlatformTransport(app, { notFound: false });
  // Keep CSRF before the touching session lookup on commands (#1972).
  const { preHandler: authenticateFirst, loadedOf } = createSessionGuard(
    createAuthenticator(opts),
    true,
  );
  const sessionOf = (req: FastifyRequest): SavedViewSession => {
    const loaded = loadedOf(req);
    // Identity and role come only from the authenticated session, never from the body.
    return {
      actorId: loaded.actor.id,
      workspaceId: loaded.session.workspaceId,
      roleLevel: loaded.actor.roleLevel,
    };
  };

  /** Plain JSON, serialized by hand: `null` (a missing `get`) must reach the client as the text `null`, not an empty body. */
  const respond = (reply: FastifyReply, value: unknown) =>
    reply.code(200).type('application/json; charset=utf-8').send(JSON.stringify(value));

  app.post('/saved-views/commands', { preHandler: [csrf, authenticateFirst] }, async (req, reply) => {
    const session = sessionOf(req);
    const parsed = req.body === MALFORMED_BODY ? null : savedViewCommandSchema.safeParse(req.body);
    if (!parsed?.success)
      return sendError(reply, 'validation.malformed_request', 'invalid saved view command');
    return respond(reply, await service.execute(session, parsed.data));
  });

  app.post('/people/lookup', { preHandler: authenticateFirst }, async (req, reply) => {
    const session = sessionOf(req);
    const parsed =
      req.body === MALFORMED_BODY ? null : peopleLookupRequestSchema.safeParse(req.body);
    if (!parsed?.success)
      return sendError(reply, 'validation.malformed_request', 'invalid people lookup');
    return respond(reply, { items: await service.lookup(session, parsed.data.ids) });
  });
};
