// VOC public-read routes (ADR-0110 decision 3): the allowlisted public part of a VOC. Separate from
// the operator `/vocs` handlers on purpose — no shared branch, so an operator response can never
// pick up a public-shape change or the reverse. Static `/vocs/public` wins over `/vocs/:id`.

import type { FastifyPluginAsync } from 'fastify';

import { publicVocListQuerySchema } from '@ap/feature-shared';

import { HttpError, fieldsFromZodIssues, sendError } from '../../../lib/errors.js';
import { UUID_REGEX } from '../../../lib/http-headers.js';
import { requireSession } from '../../../middleware/require-session.js';
import { requireWorkspace } from '../../../middleware/require-workspace.js';
import type { VocRoutesOptions } from './index.js';

export const vocPublicReadRoutes: FastifyPluginAsync<VocRoutesOptions> = async (app, opts) => {
  const { sessionService, vocPublicReadService, workspaceId, rateLimitConfig } = opts;
  const rateLimit = rateLimitConfig?.read ? { config: { rateLimit: rateLimitConfig.read as never } } : {};

  app.route({
    method: 'GET',
    url: '/vocs/public',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...rateLimit,
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const parsed = publicVocListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return sendError(reply, 'validation.failed', 'invalid query parameters', {
          fields: fieldsFromZodIssues(parsed.error.issues),
        });
      }
      const result = await vocPublicReadService.listPublic({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        query: parsed.data,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });

  app.route({
    method: 'GET',
    url: '/vocs/public/:id',
    preHandler: [requireSession(sessionService), requireWorkspace(workspaceId)],
    ...rateLimit,
    handler: async (req, reply) => {
      const sess = req.session;
      if (!sess) throw new HttpError('internal.unexpected', 'session missing after middleware');
      const { id: vocId } = req.params as { id: string };
      if (!UUID_REGEX.test(vocId)) {
        return sendError(reply, 'validation.failed', 'id must be a valid UUID', {
          fields: [{ path: ['id'], code: 'invalid' }],
        });
      }
      const result = await vocPublicReadService.getPublicDetail({
        actor: {
          actor_id: sess.actor_id,
          workspace_id: sess.workspace_id,
          role_level: sess.role_level,
        },
        vocId,
      });
      return reply.header('cache-control', 'private, no-cache').code(200).send(result);
    },
  });
};
