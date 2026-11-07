// REST endpoints of API token management (ADR-0116, #1442). Session-only: no route here sets `tokenCallable`, so a
// Bearer call is refused by the gate with `permission.session_required` before any handler runs.
//   Personal (any signed-in actor):  POST /api-tokens · GET /api-tokens · POST /api-tokens/:id/revoke
//   Service (role_level admin):      POST /api-tokens/service · GET /api-tokens/service?noExpiry=true
//                                    POST /api-tokens/service/:id/revoke

import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { HttpError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import type { SessionService } from '../auth/session-service.js';
import { type ApiTokenService, MAX_PAGE_SIZE, type TokenActor } from './service.js';

export const API_TOKEN_ROUTE_PREFIX = '/api-tokens';

const issueBody = z.object({
  name: z.string().trim().min(1).max(100),
  scopes: z.array(z.string().min(1).max(100)).max(64),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});
const serviceIssueBody = issueBody.extend({ actorId: z.string().uuid() });
const idParams = z.object({ id: z.string().uuid() });
const pageQuery = {
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
  cursor: z.string().min(1).max(200).optional(),
};
const personalListQuery = z.object(pageQuery);
const serviceListQuery = z.object({
  ...pageQuery,
  noExpiry: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export interface ApiTokenRoutesOptions {
  sessionService: SessionService;
  tokens: ApiTokenService;
  workspaceId: string;
  rateLimitConfig: { mutation: Record<string, unknown> };
}

function actorOf(req: FastifyRequest): TokenActor {
  const s = req.session;
  if (!s) throw new HttpError('internal.unexpected', 'session missing after middleware');
  return { actor_id: s.actor_id, workspace_id: s.workspace_id, role_level: s.role_level };
}

export const apiTokenRoutes: FastifyPluginAsync<ApiTokenRoutesOptions> = async (app, opts) => {
  const pre = [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)];
  const mutation = { rateLimit: opts.rateLimitConfig.mutation as never };
  const expiry = (v: string | null | undefined) => (v ? new Date(v) : null);

  app.route({
    method: 'POST',
    url: API_TOKEN_ROUTE_PREFIX,
    preHandler: pre,
    config: mutation,
    schema: { body: issueBody },
    handler: async (req, reply) => {
      const body = req.body as z.infer<typeof issueBody>;
      const out = await opts.tokens.issue(actorOf(req), {
        kind: 'personal',
        name: body.name,
        scopes: body.scopes,
        expiresAt: expiry(body.expiresAt),
      });
      reply.header('cache-control', 'no-store');
      return reply.code(201).send({ token: out.token, item: out.row });
    },
  });

  app.route({
    method: 'GET',
    url: API_TOKEN_ROUTE_PREFIX,
    preHandler: pre,
    schema: { querystring: personalListQuery },
    handler: async (req) =>
      opts.tokens.listPersonal(actorOf(req), req.query as z.infer<typeof personalListQuery>),
  });

  app.route({
    method: 'POST',
    url: `${API_TOKEN_ROUTE_PREFIX}/:id/revoke`,
    preHandler: pre,
    config: mutation,
    schema: { params: idParams },
    handler: async (req) => ({
      item: await opts.tokens.revoke(actorOf(req), (req.params as z.infer<typeof idParams>).id, 'own'),
    }),
  });

  app.route({
    method: 'POST',
    url: `${API_TOKEN_ROUTE_PREFIX}/service`,
    preHandler: pre,
    config: mutation,
    schema: { body: serviceIssueBody },
    handler: async (req, reply) => {
      const body = req.body as z.infer<typeof serviceIssueBody>;
      const out = await opts.tokens.issue(actorOf(req), {
        kind: 'service',
        name: body.name,
        scopes: body.scopes,
        expiresAt: expiry(body.expiresAt),
        actorId: body.actorId,
      });
      reply.header('cache-control', 'no-store');
      return reply.code(201).send({ token: out.token, item: out.row });
    },
  });

  app.route({
    method: 'GET',
    url: `${API_TOKEN_ROUTE_PREFIX}/service`,
    preHandler: pre,
    schema: { querystring: serviceListQuery },
    handler: async (req) =>
      opts.tokens.listWorkspace(actorOf(req), req.query as z.infer<typeof serviceListQuery>),
  });

  app.route({
    method: 'POST',
    url: `${API_TOKEN_ROUTE_PREFIX}/service/:id/revoke`,
    preHandler: pre,
    config: mutation,
    schema: { params: idParams },
    handler: async (req) => ({
      item: await opts.tokens.revoke(actorOf(req), (req.params as z.infer<typeof idParams>).id, 'workspace'),
    }),
  });
};
