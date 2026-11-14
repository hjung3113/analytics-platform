// Every route declares how it is authenticated when it is registered (#1972). A route passes the startup check when
// one of its own `onRequest` / `preParsing` / `preHandler` functions is a guard marked with `markAuthGuard`, or it
// sets `config.public` (no authentication on purpose) or `config.authInHandler` (the handler authenticates itself).
// Any other route makes `buildServer()` throw, so a forgotten guard fails at boot, not in production.

import type { FastifyInstance, RouteOptions } from 'fastify';

const guards = new WeakSet<object>();

/** Marks an authentication hook so the route check accepts a route that runs it. Returns the same function. */
export function markAuthGuard<T extends object>(fn: T): T {
  guards.add(fn);
  return fn;
}

function hasGuard(hook: unknown): boolean {
  if (Array.isArray(hook)) return hook.some(hasGuard);
  return typeof hook === 'function' && guards.has(hook);
}

type DeclaredRoute = Pick<RouteOptions, 'method' | 'url' | 'onRequest' | 'preParsing' | 'preHandler' | 'config'>;

export type RouteAuthMode = 'public' | 'authInHandler' | 'guard';

export interface DeclaredRouteAuth {
  method: string;
  url: string;
  mode: RouteAuthMode;
}

const declaredByApp = new WeakMap<object, DeclaredRouteAuth[]>();

/** Returns the route's auth mode; throws when it declares none. */
export function assertRouteAuthDeclared(route: DeclaredRoute): RouteAuthMode {
  const config = route.config as { public?: unknown; authInHandler?: unknown } | undefined;
  if (config?.public === true) return 'public';
  if (config?.authInHandler === true) return 'authInHandler';
  if (hasGuard(route.onRequest) || hasGuard(route.preParsing) || hasGuard(route.preHandler)) return 'guard';
  const method = Array.isArray(route.method) ? route.method.join(',') : route.method;
  throw new Error(
    `route ${method} ${route.url} declares no auth mode: add a marked guard hook, config.public or config.authInHandler`,
  );
}

/** Root `onRoute` hook: install before any route is registered. */
export function installRouteAuthCheck(app: FastifyInstance): void {
  const declared: DeclaredRouteAuth[] = [];
  declaredByApp.set(app, declared);
  app.addHook('onRoute', (route) => {
    const mode = assertRouteAuthDeclared(route);
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) declared.push({ method, url: route.url, mode });
  });
}

/** The auth mode of every route registered on `app` after `installRouteAuthCheck` (tests and diagnostics). */
export function declaredRouteAuth(app: FastifyInstance): readonly DeclaredRouteAuth[] {
  return declaredByApp.get(app) ?? [];
}
