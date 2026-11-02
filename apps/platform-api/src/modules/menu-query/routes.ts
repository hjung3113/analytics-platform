// `POST /api/v1/menu-query` — the read port of the business menus (ADR-0095 §1). The route and the
// judgment order live in `menu-dispatch` (real-server-checklist §3 steps 1–10); this plugin only
// fixes what the route serves when no registry is passed: `home.notices`, the first endpoint
// (#1106). `server.ts` passes the shared registry that every module contributes to, so the same
// registry also feeds `POST /api/v1/menu-action`.

import type { FastifyPluginAsync } from 'fastify';

import type { Db } from '../../db/client.js';
import type { SessionService } from '../auth/session-service.js';
import {
  MENU_QUERY_PREFIX,
  type MenuDispatchRegistry,
  createMenuDispatchRegistry,
  menuQueryDispatchRoutes,
} from '../menu-dispatch/index.js';
import type { CheckService } from '../permissions/check-service.js';
import { homeNoticesContribution } from './home-notices.js';

export { MENU_QUERY_PREFIX };

export interface MenuQueryRoutesOptions {
  sessionService: SessionService;
  checkService: CheckService;
  workspaceId: string;
  db: Db;
  now?: () => Date;
  /** The shared registry; absent = a registry holding only `home.notices`. */
  registry?: MenuDispatchRegistry;
}

export const menuQueryRoutes: FastifyPluginAsync<MenuQueryRoutesOptions> = async (app, opts) => {
  const registry =
    opts.registry ??
    createMenuDispatchRegistry([
      homeNoticesContribution({
        db: opts.db,
        checkService: opts.checkService,
        ...(opts.now ? { now: opts.now } : {}),
      }),
    ]);
  await app.register(menuQueryDispatchRoutes, {
    sessionService: opts.sessionService,
    workspaceId: opts.workspaceId,
    registry,
  });
};
