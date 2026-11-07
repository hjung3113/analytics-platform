// `POST /api/v1/validation-catalog/report` — the Validator's catalog snapshot (#1491, design §5.1, ADR-0122).
// Token-callable only. Order of judgment: rate limit → token gate (401 `auth.token_invalid`; the cookie is ignored when
// a Bearer value is present) → session/workspace → capability `validation.catalog.report` (403 `permission.denied`: a
// cookie session is refused `token_required`, a token without the scope `token_scope`, a token whose owner lost the
// grant `no_grant` — owner's grant ∩ scopes) → body size/shape/limits/text checks → one transaction. A refused body is
// 422 `validation.failed` with `detail.fields[].code` and is recorded without its content.

import type { FastifyPluginAsync } from 'fastify';

import { VALIDATION_CATALOG_REPORT_PATH } from '@ap/contract-schemas';

import { sendError } from '../../lib/errors.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import { refuseLostTokenContext } from '../api-tokens/gate.js';
import type { SessionService } from '../auth/session-service.js';
import type { LogRulesDeps } from './deps.js';
import { createReportService } from './report-service.js';

export const CATALOG_REPORT_CAPABILITY = 'validation.catalog.report';

/** Bodies up to here reach the handler so an oversize report is judged and recorded (`too_large`); beyond it Fastify answers 413. */
export const REPORT_TRANSPORT_LIMIT_BYTES = 8 * 1024 * 1024;

export interface ReportRouteOptions extends LogRulesDeps {
  sessionService: SessionService;
  workspaceId: string;
  rateLimitConfig: { mutation: Record<string, unknown> };
}

export const catalogReportRoutes: FastifyPluginAsync<ReportRouteOptions> = async (app, opts) => {
  const service = createReportService({ db: opts.db, auditService: opts.auditService });

  // The body stays raw bytes: the size is judged before any parse, and a malformed one is a recorded refusal.
  app.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: REPORT_TRANSPORT_LIMIT_BYTES }, (_req, body, done) => {
    done(null, body);
  });
  app.addHook('onSend', async (_req, reply) => {
    reply.header('cache-control', 'no-store');
  });

  app.route({
    method: 'POST',
    url: VALIDATION_CATALOG_REPORT_PATH,
    config: { tokenCallable: true, tokenMutation: true, rateLimit: opts.rateLimitConfig.mutation as never },
    preHandler: [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId)],
    handler: async (req, reply) => {
      const session = req.session;
      if (!session) return sendError(reply, 'auth.session_invalid', 'session missing after middleware');
      if (refuseLostTokenContext(req, reply)) return reply;

      const actor = { actor_id: session.actor_id, workspace_id: session.workspace_id, role_level: session.role_level };
      const decision = await opts.checkService.checkCapability(actor, CATALOG_REPORT_CAPABILITY, { workspace_id: actor.workspace_id });
      if (!decision.allow) {
        return sendError(reply, 'permission.denied', `No permission ${CATALOG_REPORT_CAPABILITY}`, { capability: CATALOG_REPORT_CAPABILITY });
      }

      const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const result = await service.submit(actor, body);
      if (result.kind === 'rejected') {
        return sendError(reply, 'validation.failed', `report refused: ${result.fields[0]?.code ?? 'invalid_value'}`, {
          fields: result.fields,
          report_id: result.reportId,
        });
      }
      return reply.code(200).send({
        reportId: result.reportId,
        outcome: 'accepted',
        replayed: result.replayed,
        current: result.current,
      });
    },
  });
};

