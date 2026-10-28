// @vitest-environment node
// #597 migration: retain both Fastify discovery forms and every registered API path.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { FO_API_PREFIX, realDevProxy } from './real-dev-proxy';
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const SERVER_TS = path.join(REPO_ROOT, 'apps/fo-backend/src/server.ts');
const MODULES_DIR = path.join(REPO_ROOT, 'apps/fo-backend/src/modules');
const ROUTE_URL_PATTERNS: readonly RegExp[] = [
  /url:\s*['"`](\/[A-Za-z0-9/_\-:]*)['"`]/g,
  /\b(?:app|fastify)\.(?:get|post|put|patch|delete|head|options|all)\(\s*['"`](\/[A-Za-z0-9/_\-:]*)['"`]/g,
];

function extractRouteUrls(source: string): string[] {
  const out: string[] = [];
  for (const re of ROUTE_URL_PATTERNS) {
    for (const m of source.matchAll(re)) {
      if (m[1]) out.push(m[1]);
    }
  }
  return out;
}

// Modules registered in server.ts as a Fastify plugin under a prefix declare their routes
// relative to it; prepend the prefix so the check sees the real root (#620, ADR-0069).
const PREFIXED_MODULES: Record<string, string> = { 'platform-port': '/api/v1/platform' };

function collectBackendRoutes(): string[] {
  const urls: string[] = [];
  urls.push(...extractRouteUrls(fs.readFileSync(SERVER_TS, 'utf8')));
  // Walk apps/fo-backend/src/modules/*/routes.ts AND *-routes.ts naming variants
  // (e.g. `auth/list-actors-routes.ts`), plus the direct `*.ts` children of
  // `modules/<name>/routes/` (e.g. `voc/routes/`) — no recursion, matching the
  // twin check's discovery.
  for (const entry of fs.readdirSync(MODULES_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const moduleDir = path.join(MODULES_DIR, entry.name);
    const prefix = PREFIXED_MODULES[entry.name] ?? '';
    for (const fileEntry of fs.readdirSync(moduleDir, { withFileTypes: true })) {
      if (!fileEntry.isFile() || !fileEntry.name.endsWith('routes.ts')) continue;
      urls.push(
        ...extractRouteUrls(fs.readFileSync(path.join(moduleDir, fileEntry.name), 'utf8')).map(
          (url) => `${prefix}${url}`,
        ),
      );
    }
    // Split modules keep their routes in a routes/ directory; read its direct
    // children only — do not recurse.
    const routesDir = path.join(moduleDir, 'routes');
    if (fs.existsSync(routesDir) && fs.statSync(routesDir).isDirectory()) {
      for (const routesEntry of fs.readdirSync(routesDir, { withFileTypes: true })) {
        if (!routesEntry.isFile() || !routesEntry.name.endsWith('.ts')) continue;
        urls.push(
          ...extractRouteUrls(fs.readFileSync(path.join(routesDir, routesEntry.name), 'utf8')),
        );
      }
    }
  }
  // This nested resource was explicitly protected by the retired Vite suggestions test.
  urls.push(...extractRouteUrls(fs.readFileSync(path.join(MODULES_DIR, 'voc/cluster-suggestions/routes.ts'), 'utf8')));
  return urls;
}


describe('FeedbackOps backend discovery through the platform proxy (#597)', () => {
 it('recognizes both Fastify registration forms', () => {
  expect(extractRouteUrls("app.route({url: '/one'}); app.get('/two', fn); fastify.post('/three', fn)")).toEqual(['/one','/two','/three']);
 });
 it('strips only /api/fo for every discovered backend route, including suggestions', () => {
  const routes = collectBackendRoutes();
  expect(routes.length).toBeGreaterThan(100);
  expect(routes.some(route => route.includes('suggestions'))).toBe(true);
  const rule = realDevProxy('http://127.0.0.1:3011')[`${FO_API_PREFIX}/`];
  for (const route of routes) expect(rule.rewrite(`${FO_API_PREFIX}${route}?q=123`)).toBe(`${route}?q=123`);
 });
});
