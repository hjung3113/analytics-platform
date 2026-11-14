// Worker REST of the validation request queue (`v0`, provisional; #1445 d, ADR-0117 decisions 1-9). Token-only: the
// caller must be an authenticated API token (ADR-0116) whose scopes hold `validation.worker`; a cookie session is
// refused with `permission.denied` (the capability is never granted to a human session) and a token without the scope
// likewise. Each route opts in with `tokenCallable` so the token gate lets the call through.
//   POST /claim                        -> 200 { request, attempt, leaseExpiresAt } | 204 (nothing claimable now)
//   POST /requests/:id/heartbeat       { attemptNo }  -> 200 { leaseExpiresAt } | 409 queue.lease_lost
//   POST /requests/:id/result          { attemptNo, ... } -> 200 | 409 conflict.stale_write | 409 queue.lease_lost | 422
//   POST /requests/:id/fail            { attemptNo, reason? } -> 200 | 409 ...
//   POST /requests/:id/attempts/:attemptNo/opinions  { submissionId, opinions } -> 200 | 404 | 409 conflict.attempt_not_succeeded | 409 conflict.stale_write | 422
// The mutation judgments live in `queue-service.ts`; this file is authentication, the scope check and the wire shape.

import type { FastifyPluginAsync, FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';

import { currentAuthContext } from '../../lib/auth-context.js';
import { HttpError, sendError } from '../../lib/errors.js';
import { UUID_REGEX } from '../../lib/http-headers.js';
import { requireSession } from '../../middleware/require-session.js';
import { requireWorkspace } from '../../middleware/require-workspace.js';
import { refuseLostTokenContext } from '../api-tokens/gate.js';
import { tokenSessionOf } from '../api-tokens/request-state.js';
import type { SessionService } from '../auth/session-service.js';
import { AttemptNotSucceededError } from './opinion-service.js';
import { LeaseLostError, type QueueService, type WorkerCaller } from './queue-service.js';

export const VALIDATION_QUEUE_ROUTE_PREFIX = '/api/v1/validation-queue';
/** The token scope the worker routes need; token-only by design (ADR-0117 decision 9). */
export const VALIDATION_WORKER_SCOPE = 'validation.worker';

export interface WorkerRoutesOptions {
  sessionService: SessionService;
  queue: QueueService;
  workspaceId: string;
}

export const workerRoutes: FastifyPluginAsync<WorkerRoutesOptions> = async (app, opts) => {
  const requireWorker: preHandlerHookHandler = async (req: FastifyRequest, reply: FastifyReply) => {
    if (refuseLostTokenContext(req, reply)) return reply;
    const token = tokenSessionOf(req);
    const ctx = currentAuthContext();
    if (!token || ctx.kind !== 'token') return sendError(reply, 'permission.denied', 'the validation worker API needs an API token');
    if (!ctx.scopes.includes(VALIDATION_WORKER_SCOPE)) {
      return sendError(reply, 'permission.denied', `token scope ${VALIDATION_WORKER_SCOPE} required`, { capability: VALIDATION_WORKER_SCOPE });
    }
    return undefined;
  };
  const pre = [requireSession(opts.sessionService), requireWorkspace(opts.workspaceId), requireWorker];
  const config = { tokenCallable: true };

  const callerOf = (req: FastifyRequest): WorkerCaller => {
    const loaded = tokenSessionOf(req);
    const ctx = currentAuthContext();
    if (!loaded || ctx.kind !== 'token') throw new HttpError('internal.unexpected', 'worker route reached without a token');
    return { workspaceId: loaded.session.workspaceId, actorId: loaded.session.actorId, tokenId: ctx.tokenId };
  };
  const idOf = (req: FastifyRequest): string => {
    const id = (req.params as { id?: string }).id ?? '';
    if (!UUID_REGEX.test(id)) throw new HttpError('validation.failed', 'request id must be a uuid', { fields: [{ path: ['id'], code: 'malformed' }] });
    return id.toLowerCase();
  };
  const attemptNoOf = (body: unknown): number => {
    const n = (body as { attemptNo?: unknown } | null | undefined)?.attemptNo;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
      throw new HttpError('validation.failed', 'attemptNo required', { fields: [{ path: ['attemptNo'], code: n === undefined ? 'required' : 'malformed' }] });
    }
    return n;
  };
  /** Runs `work`, answering a lost lease as the queue's own 409. */
  async function guard(reply: FastifyReply, work: () => Promise<unknown>) {
    reply.header('cache-control', 'no-store');
    try {
      return await work();
    } catch (err) {
      if (err instanceof LeaseLostError) return reply.code(409).send({ code: 'queue.lease_lost', message: err.message });
      if (err instanceof AttemptNotSucceededError) return reply.code(409).send({ code: 'conflict.attempt_not_succeeded', message: err.message });
      throw err;
    }
  }

  app.post('/claim', { preHandler: pre, config }, async (req, reply) =>
    guard(reply, async () => {
      const claimed = await opts.queue.claim(callerOf(req));
      return claimed ? claimed : reply.code(204).send();
    }),
  );
  app.post('/requests/:id/heartbeat', { preHandler: pre, config }, async (req, reply) =>
    guard(reply, () => opts.queue.heartbeat(callerOf(req), idOf(req), attemptNoOf(req.body))),
  );
  app.post('/requests/:id/result', { preHandler: pre, config }, async (req, reply) =>
    guard(reply, () => opts.queue.submitResult(callerOf(req), idOf(req), req.body)),
  );
  app.post('/requests/:id/fail', { preHandler: pre, config }, async (req, reply) =>
    guard(reply, () => opts.queue.fail(callerOf(req), idOf(req), req.body)),
  );
  app.post('/requests/:id/attempts/:attemptNo/opinions', { preHandler: pre, config }, async (req, reply) =>
    guard(reply, () => {
      const raw = (req.params as { attemptNo?: string }).attemptNo ?? '';
      const attemptNo = /^[1-9][0-9]{0,8}$/.test(raw) ? Number(raw) : 0;
      if (attemptNo < 1) throw new HttpError('validation.failed', 'attemptNo must be a positive integer', { fields: [{ path: ['attemptNo'], code: 'malformed' }] });
      return opts.queue.recordOpinions(callerOf(req), idOf(req), attemptNo, req.body);
    }),
  );
  app.post('/requests/:id/attempts/:attemptNo/diagnostics', { preHandler: pre, config }, async (req, reply) =>
    guard(reply, () => {
      const raw = (req.params as { attemptNo?: string }).attemptNo ?? '';
      const attemptNo = /^[1-9][0-9]{0,8}$/.test(raw) ? Number(raw) : 0;
      if (attemptNo < 1) throw new HttpError('validation.failed', 'attemptNo must be a positive integer', { fields: [{ path: ['attemptNo'], code: 'malformed' }] });
      return opts.queue.recordDiagnostics(callerOf(req), idOf(req), attemptNo, req.body);
    }),
  );
};
