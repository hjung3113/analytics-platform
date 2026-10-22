// Platform port — `/api/v1/platform/*` (ADR-0069). A Fastify plugin registered with
// that prefix: camelCase JSON, `Cache-Control: no-store` on every response and a
// plugin-scoped error handler. It reads other modules through their services
// (session, permission check) and writes only its own tables — `platform.usage_events`,
// `platform.client_errors` — plus `core.sessions.csrf_token` (ADR-0069 decision 1).

import { errorCodeSchema } from '@fops/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { Db } from '../../db/client.js';
import { sendError, statusForCode } from '../../lib/errors.js';
import { SESSION_COOKIE_NAME } from '../../middleware/require-session.js';
import type { ActorRecord, SessionRecord, SessionService } from '../auth/session-service.js';
import type { FindingsService } from '../findings/index.js';
import type { CheckService } from '../permissions/check-service.js';
import type { TasksService } from '../tasks/index.js';
import type { VocReadService } from '../voc/index.js';
import { createAccessDirectoryService } from './access-directory.js';
import { createPlatformAuditService } from './audit-service.js';
import { createPlatformClientErrorService, parseClientError } from './client-errors.js';
import { requireCsrf } from './csrf.js';
import { createEntityReader } from './entity-read.js';
import { envelope } from './envelope.js';
import { holdsPlatformPermission, resolvePlatformPermissions } from './permissions.js';
import { sessionVersionOf } from './session-version.js';
import { titleFor } from './titles.js';
import { createPlatformUsageService, parseUsageBatch } from './usage.js';

export const PLATFORM_PORT_PREFIX = '/api/v1/platform';

export interface PlatformPortOptions {
  sessionService: SessionService;
  checkService: CheckService;
  workspaceId: string;
  /** Audit reads go through the allowlisted projection; entity reads through the owning modules' services. */
  db: Db;
  vocReadService: VocReadService;
  findingsService: FindingsService;
  tasksService: TasksService;
  now?: () => Date;
}

/** Asia/Seoul wall-clock `now`, truncated to the minute: `YYYY-MM-DDTHH:mm:ss`. */
export function seoulWallClockMinute(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:00`;
}

const MALFORMED_BODY = Symbol('malformed-json-body');

export const platformPortRoutes: FastifyPluginAsync<PlatformPortOptions> = async (app, opts) => {
  const now = opts.now ?? (() => new Date());
  const entityReader = createEntityReader({
    vocReadService: opts.vocReadService,
    findingsService: opts.findingsService,
    tasksService: opts.tasksService,
  });
  const audit = createPlatformAuditService({
    db: opts.db,
    checkService: opts.checkService,
    entityReader,
  });
  const access = createAccessDirectoryService({ db: opts.db, checkService: opts.checkService });
  const usage = createPlatformUsageService({ db: opts.db, checkService: opts.checkService });
  const clientErrors = createPlatformClientErrorService({ db: opts.db });
  const csrf = requireCsrf(opts.sessionService);

  // A body that is not valid JSON is a judged malformed request (HTTP 200 + `error` envelope,
  // ADR-0069 decision 2), not a framework 4xx: hand the route a sentinel instead of throwing.
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
  app.setNotFoundHandler((_req, reply) =>
    reply.code(404).send({ code: 'not_found', message: 'route not found' }),
  );

  // Plugin-scoped: sibling FeedbackOps routes keep the root handler. Covers what can
  // reach these two GETs — a thrown HttpError / rate-limit error with a known code,
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

  async function authenticate(
    req: FastifyRequest,
    reply: FastifyReply,
    touch: boolean,
  ): Promise<{ session: SessionRecord; actor: ActorRecord } | null> {
    const cookie = req.cookies?.[SESSION_COOKIE_NAME];
    if (!cookie) {
      sendError(reply, 'auth.session_invalid', 'session cookie missing');
      return null;
    }
    const loaded = touch
      ? await opts.sessionService.loadAndTouch(cookie)
      : await opts.sessionService.loadActive(cookie);
    if (!loaded) {
      sendError(reply, 'auth.session_invalid', 'session not active');
      return null;
    }
    if (loaded.session.workspaceId !== opts.workspaceId) {
      sendError(reply, 'auth.workspace_mismatch', 'session is bound to a different workspace');
      return null;
    }
    return loaded;
  }

  function actorOf(loaded: { session: SessionRecord; actor: ActorRecord }) {
    return {
      actor_id: loaded.actor.id,
      workspace_id: loaded.session.workspaceId,
      role_level: loaded.actor.roleLevel,
    };
  }

  async function buildSession(loaded: { session: SessionRecord; actor: ActorRecord }) {
    const { actor, session } = loaded;
    const permissions = await resolvePlatformPermissions(opts.checkService, {
      actor_id: actor.id,
      workspace_id: session.workspaceId,
      role_level: actor.roleLevel,
    });
    return {
      user: {
        id: actor.id,
        name: actor.displayName,
        title: titleFor(actor.roleLevel),
        permissions,
      },
      scopes: [],
    };
  }

  app.get('/bootstrap', async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const session = await buildSession(loaded);
    const csrfToken = await opts.sessionService.ensureCsrfToken(loaded.session.id);
    if (!csrfToken) return sendError(reply, 'auth.session_invalid', 'session not active');
    return {
      session,
      publishedMetrics: [],
      defaultRangeTo: seoulWallClockMinute(now()),
      sessionVersion: sessionVersionOf(session),
      csrfToken,
    };
  });

  // Polling is not activity (http-adapter-contract §4.5): the non-touching lookup.
  app.get('/session-state', async (req, reply) => {
    const loaded = await authenticate(req, reply, false);
    if (!loaded) return reply;
    return { sessionVersion: sessionVersionOf(await buildSession(loaded)) };
  });

  // Read POSTs (ADR-0069 decision 4): no CSRF. Every judged result is HTTP 200 + envelope.
  app.post('/audit-trail/search', async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const body = req.body === MALFORMED_BODY ? null : req.body;
    const result = await audit.auditTrail(actorOf(loaded), body);
    return envelope(req, result.outcome, result.data ?? null, result.message);
  });

  app.post('/entity/audit', async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const body = req.body === MALFORMED_BODY ? null : req.body;
    const result = await audit.entityAudit(actorOf(loaded), body);
    return envelope(req, result.outcome, result.data ?? null, result.message);
  });

  // O19: a readable row is never `empty` for getEntity — `empty` is unreachable today.
  app.post('/entity', async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const body = req.body === MALFORMED_BODY ? null : req.body;
    const gate = await entityReader.gateEntity(actorOf(loaded), body);
    return gate.ok
      ? envelope(req, 'ok', gate.entity)
      : envelope(req, gate.outcome, null, gate.message);
  });

  app.post('/access-directory/search', async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const body = req.body === MALFORMED_BODY ? null : req.body;
    const result = await access.accessDirectory(actorOf(loaded), body);
    return envelope(req, result.outcome, result.data ?? null, result.message);
  });

  // Fire-and-forget writes (http-adapter-contract §6): CSRF failure stays 403 `csrf.invalid` (the
  // adapter re-checks the session on it), no cookie 401; every judged rejection is HTTP 200 with
  // `accepted: 0 / false`. Plain JSON, not an envelope. No per-route rate-limit tier: only the global
  // 100/min/actor applies, since the kernel sends one POST per event (~2 per navigation). Above that a
  // 429 is dropped silently by the adapter.
  app.post('/usage-events', { preHandler: csrf }, async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const events = req.body === MALFORMED_BODY ? null : parseUsageBatch(req.body);
    if (!events) return { accepted: 0 };
    await usage.recordUsage(actorOf(loaded), events);
    return { accepted: events.length };
  });

  app.get('/usage-summary', async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const result = await usage.usageSummary(actorOf(loaded), req.query);
    return envelope(req, result.outcome, result.data ?? null, result.message);
  });

  app.post('/client-errors', { preHandler: csrf }, async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const report = req.body === MALFORMED_BODY ? null : parseClientError(req.body);
    if (!report) return { accepted: false };
    await clientErrors.reportClientError(actorOf(loaded), req.id, report);
    return { accepted: true };
  });

  // Annotations are a gate only (#622 decision 6): `analytics:view` is never granted and FeedbackOps
  // has no sites, so every call is `forbidden`. Storage, validation, the site grant, author-only
  // delete and its ADR-0041 audit are NOT implemented — recorded in .planning/backlog.md
  // (## 작은 후속, "주석 저장"); the full ADR-0041 order is validation → site grant → lookup.
  async function annotationGate(req: FastifyRequest, reply: FastifyReply) {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    if (!(await holdsPlatformPermission(opts.checkService, actorOf(loaded), 'analytics:view'))) {
      return envelope(req, 'forbidden', null, 'No permission analytics:view');
    }
    // Unreachable while the table says `never`; failing closed beats an unfinished write path.
    return envelope(req, 'error', null, 'Annotations are not implemented');
  }
  app.get('/annotations', annotationGate);
  app.post('/annotations', { preHandler: csrf }, annotationGate);
  app.post('/annotations/delete', { preHandler: csrf }, annotationGate);
};
