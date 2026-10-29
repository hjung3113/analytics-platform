// `POST /api/v1/menu-query` — the first business menuQuery route (ADR-0095 §1). It sits beside, not
// inside, the `/api/v1/platform` prefix, so it installs the platform transport policy itself (no-store,
// malformed-JSON judgment, error handler) without a second prefix 404. A read POST: no CSRF
// (ADR-0069 decision 4). Judgment order (real-server-checklist §3): no session → 401; request shape /
// endpoint / context / params keys → `error`; params value → `error`; `notice:view` → `forbidden`;
// handler. Every judged answer is HTTP 200 + an `ApiResponse` envelope.

import type { FastifyPluginAsync } from 'fastify';

import type { Db } from '../../db/client.js';
import type { SessionService } from '../auth/session-service.js';
import type { CheckService } from '../permissions/check-service.js';
import { createPlatformNoticeService } from '../platform-notices/index.js';
import { envelope } from '../platform-port/envelope.js';
import { holdsPlatformPermission } from '../platform-port/permissions.js';
import {
  MALFORMED_BODY,
  createAuthenticator,
  installPlatformTransport,
  platformActorOf,
} from '../platform-port/transport.js';
import { judgeMenuQuery } from './parse-request.js';

export const MENU_QUERY_PREFIX = '/api/v1/menu-query';

export interface MenuQueryRoutesOptions {
  sessionService: SessionService;
  checkService: CheckService;
  workspaceId: string;
  db: Db;
  now?: () => Date;
}

export const menuQueryRoutes: FastifyPluginAsync<MenuQueryRoutesOptions> = async (app, opts) => {
  installPlatformTransport(app, { notFound: false });
  const authenticate = createAuthenticator({
    sessionService: opts.sessionService,
    workspaceId: opts.workspaceId,
  });
  const notices = createPlatformNoticeService({
    db: opts.db,
    checkService: opts.checkService,
    ...(opts.now ? { now: opts.now } : {}),
  });

  app.post('/', async (req, reply) => {
    const loaded = await authenticate(req, reply, true);
    if (!loaded) return reply;
    const judged = judgeMenuQuery(req.body === MALFORMED_BODY ? null : req.body);
    if (!judged.ok) return envelope(req, 'error', null, judged.message);
    const actor = platformActorOf(loaded);
    // The endpoint's own permission (data access), not the Home menu's `platform:view` (Q5).
    if (!(await holdsPlatformPermission(opts.checkService, actor, 'notice:view'))) {
      return envelope(req, 'forbidden', null, 'No permission notice:view');
    }
    const result = await notices.homeNotices(actor, judged.targetScopeId);
    return envelope(req, result.outcome, result.data);
  });
};
