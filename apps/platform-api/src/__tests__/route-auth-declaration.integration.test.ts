// #1972 — every route of the real server declares its auth mode at registration. Boots `buildServer()` against the
// throwaway database (apps/platform-api/AGENTS.md → Verification): the public list is exactly the eight probe and
// login routes, the in-handler count is pinned, and the routes moved to a guard preHandler still answer 401 with no
// cookie, with the same body as before.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { type DbHandle, createDb } from '../db/client.js';
import { declaredRouteAuth } from '../middleware/route-auth.js';
import { buildServer } from '../server.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const PUBLIC_ROUTES = [
  'GET /auth/callback',
  'GET /auth/login',
  'GET /auth/mock-login',
  'GET /health',
  'GET /health/live',
  'GET /health/ready',
  'POST /auth/logout',
  'POST /auth/mock-login',
];

// Routes whose handler authenticates itself: the disconnect listener must be attached before the session lookup.
const AUTH_IN_HANDLER_ROUTES = ['POST /api/v1/log-explorer/export', 'POST /api/v1/menu-query'];

// Routes moved from an in-handler lookup to a guard preHandler (#1972). With no cookie each still answers
// 401 `auth.session_invalid` before any other check (CSRF routes: the CSRF hook's own 401, which ran first before too).
const MOVED_ROUTES: Array<[method: 'GET' | 'POST', url: string]> = [
  ['GET', '/api/v1/platform/scopes/site-a/check'],
  ['GET', '/api/v1/platform/bootstrap'],
  ['GET', '/api/v1/platform/session-state'],
  ['POST', '/api/v1/platform/audit-trail/search'],
  ['POST', '/api/v1/platform/entity/audit'],
  ['POST', '/api/v1/platform/entity'],
  ['POST', '/api/v1/platform/access-directory/search'],
  ['POST', '/api/v1/platform/usage-events'],
  ['GET', '/api/v1/platform/usage-summary'],
  ['POST', '/api/v1/platform/usage-next-screens'],
  ['POST', '/api/v1/platform/client-errors'],
  ['GET', '/api/v1/platform/preferences'],
  ['POST', '/api/v1/platform/preferences/patch'],
  ['POST', '/api/v1/platform/preferences/import'],
  ['GET', '/api/v1/platform/annotations'],
  ['POST', '/api/v1/platform/annotations'],
  ['POST', '/api/v1/platform/annotations/delete'],
  ['GET', '/api/v1/platform/notices'],
  ['POST', '/api/v1/platform/saved-views/commands'],
  ['POST', '/api/v1/platform/people/lookup'],
  ['GET', '/api/v1/log-knowledge/imports/00000000-0000-4000-8000-000000000001/report.csv'],
];

describe.skipIf(!runIntegration)('route auth declaration on the real server (#1972)', () => {
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    await migrate.pool.query('delete from core.rate_limits');
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    await dbHandle?.pool.end();
    await migrate?.pool.end();
  });

  const routesOf = (mode: string) =>
    [...new Set(
      declaredRouteAuth(app)
        .filter((r) => r.mode === mode && r.method !== 'HEAD')
        .map((r) => `${r.method} ${r.url}`),
    )].sort();

  it('boots with every route declared, and the public routes are exactly the eight probe and login routes', () => {
    expect(declaredRouteAuth(app).length).toBeGreaterThan(100);
    expect(routesOf('public')).toEqual(PUBLIC_ROUTES);
  });

  it('pins the routes that authenticate in their handler', () => {
    expect(routesOf('authInHandler')).toEqual(AUTH_IN_HANDLER_ROUTES);
  });

  it.each(MOVED_ROUTES)('%s %s still answers 401 auth.session_invalid without a cookie', async (method, url) => {
    const res = await app.inject({
      method,
      url,
      ...(method === 'POST' ? { headers: { 'content-type': 'application/json' }, payload: '{}' } : {}),
    });
    expect(res.statusCode, res.body).toBe(401);
    expect(res.json()).toEqual({ code: 'auth.session_invalid', message: 'session cookie missing' });
  });
});
