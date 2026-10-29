// `/api/v1/platform/notices*` — a child of the platform-port plugin (so it inherits that plugin's
// no-store hook, malformed-JSON parser, error handler and prefix 404; none of it is repeated here).
// Reads are `ApiResponse` envelopes; writes are `ActionResponse` bodies, every judged result HTTP 200.
// Missing/expired session stays 401 and a bad CSRF token 403 (ADR-0069 decision 3).

import type { FastifyPluginAsync, preHandlerHookHandler } from 'fastify';

import type { Db } from '../../db/client.js';
import type { CheckService } from '../permissions/check-service.js';
import { envelope } from '../platform-port/envelope.js';
import { type Authenticate, MALFORMED_BODY, platformActorOf } from '../platform-port/transport.js';
import { createPlatformNoticeService } from './service.js';

export interface PlatformNoticeRoutesOptions {
  db: Db;
  checkService: CheckService;
  authenticate: Authenticate;
  csrf: preHandlerHookHandler;
  now?: () => Date;
}

export const platformNoticeRoutes: FastifyPluginAsync<PlatformNoticeRoutesOptions> = async (
  app,
  opts,
) => {
  const notices = createPlatformNoticeService({
    db: opts.db,
    checkService: opts.checkService,
    ...(opts.now ? { now: opts.now } : {}),
  });

  app.get('/notices', async (req, reply) => {
    const loaded = await opts.authenticate(req, reply, true);
    if (!loaded) return reply;
    const result = await notices.list(platformActorOf(loaded));
    return envelope(req, result.outcome, result.data, result.message);
  });

  for (const [path, operation] of [
    ['/notices/save', 'save'],
    ['/notices/delete', 'delete'],
  ] as const) {
    app.post(path, { preHandler: opts.csrf }, async (req, reply) => {
      const loaded = await opts.authenticate(req, reply, true);
      if (!loaded) return reply;
      return notices.write(platformActorOf(loaded), {
        operation,
        body: req.body === MALFORMED_BODY ? null : req.body,
        headers: {
          idempotencyKey: req.headers['idempotency-key'],
          ifMatch: req.headers['if-match'],
        },
        correlationId: req.id,
      });
    });
  }
};
