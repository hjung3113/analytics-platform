// Platform port — `/api/v1/platform/*` (ADR-0069). A Fastify plugin registered with
// that prefix: camelCase JSON, `Cache-Control: no-store` on every response and a
// plugin-scoped error handler. It reads other modules through their services
// (session, permission check) and writes nothing outside `core.sessions.csrf_token`.

import { errorCodeSchema } from '@fops/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { Db } from '../../db/client.js';
import { sendError, statusForCode } from '../../lib/errors.js';
import { SESSION_COOKIE_NAME } from '../../middleware/require-session.js';
import type { ActorRecord, SessionRecord, SessionService } from '../auth/session-service.js';
import type { EntityLinkProviderRegistry } from '../entity-links/provider-types.js';
import type { CheckService } from '../permissions/check-service.js';
import { createPlatformAuditService } from './audit-service.js';
import { envelope } from './envelope.js';
import { resolvePlatformPermissions } from './permissions.js';
import { sessionVersionOf } from './session-version.js';

export const PLATFORM_PORT_PREFIX = '/api/v1/platform';

const ROLE_TITLES: Record<string, { ko: string; en: string }> = {
  user: { ko: '사용자', en: 'User' },
  developer: { ko: '개발자', en: 'Developer' },
  admin: { ko: '관리자', en: 'Admin' },
};

function titleFor(roleLevel: string): { ko: string; en: string } {
  return ROLE_TITLES[roleLevel] ?? { ko: '사용자', en: 'User' };
}

export interface PlatformPortOptions {
  sessionService: SessionService;
  checkService: CheckService;
  workspaceId: string;
  /** Audit reads go through the allowlisted projection; entity reads through the providers. */
  db: Db;
  providers: EntityLinkProviderRegistry;
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
  const audit = createPlatformAuditService({
    db: opts.db,
    checkService: opts.checkService,
    providers: opts.providers,
  });

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
};
