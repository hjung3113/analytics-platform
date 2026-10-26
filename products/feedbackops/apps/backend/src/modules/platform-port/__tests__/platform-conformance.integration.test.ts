// #674 — the platform's server conformance kit (@ap/server-conformance) against this backend, through
// the real HTTP adapter (@ap/http-adapter) over `app.inject`. Test-only imports of both packages
// (ADR-0073; src imports no `@ap/*` but `@ap/ui`, scripts/check-boundaries.mjs). Route-level against a
// real Postgres (throwaway DB only, apps/backend/AGENTS.md → Verification).
//
// The run is the readiness table of the real server: every port this backend does not implement
// yet, and every check that needs a site grant (ADR-0069 decision 8: `scopes: []` until site·room
// grants exist), is a visible skipped test, never a pass. Annotations are a gate only (#622
// decision 6, .planning/backlog.md "주석 저장"), so they are declared not implemented.

import {
  ENTITY_AUDIT_PAGE_MAX as CONTRACT_ENTITY_AUDIT_PAGE_MAX,
  type PlatformAdapter,
  menuPermission,
  spaceId,
} from '@ap/contracts';
import { bootstrapHttpAdapter } from '@ap/http-adapter';
import { type PortMethod, describeServerConformance } from '@ap/server-conformance';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { insertFindingRow } from '../../../test-support/findings-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import { grantCapability } from '../../../test-support/permissions-fixtures.js';
import { insertVocDirectly } from '../../../test-support/voc-fixtures.js';
import { ENTITY_AUDIT_PAGE_MAX } from '../entity-audit-cursor.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-conformance');

type Account = 'granted' | 'plain' | 'console' | 'otherAnnotator';
type Role = 'admin' | 'developer' | 'user';

/** The `PlatformAdapter` members this backend serves under `/api/v1/platform` (routes.ts). */
const IMPLEMENTED: readonly PortMethod[] = [
  'session',
  'publishedMetrics',
  'defaultRangeTo',
  'subscribe',
  'getEntity',
  'entityAudit',
  'auditTrail',
  'accessDirectory',
  'usageSummary',
  'recordUsage',
  'reportClientError',
];

/**
 * Served only as a gate (#622 decision 6): the route exists and answers `forbidden` to everyone, so the
 * kit is told these are not implemented. The drift guard below asserts both halves.
 */
const GATE_ONLY: readonly PortMethod[] = ['listAnnotations', 'saveAnnotation', 'deleteAnnotation'];

/**
 * A browser-shaped `fetch` over `app.inject`: a per-account cookie jar sends the session cookie on
 * every request and keeps what `Set-Cookie` changes, so the adapter's own CSRF header (from
 * bootstrap) and cookies flow as they would in a browser. `init.signal` is honoured like fetch
 * (abort → reject with an `AbortError`). A cookie is deleted by `Max-Age=0` (or below) or an
 * `Expires` in the past. Not modelled: `Path`, `Domain`, `SameSite`, `Secure` — every request goes
 * to this one same-origin test server, so the jar holds exactly what a browser would send here.
 */
function injectFetch(app: FastifyInstance, jar: Map<string, string>): typeof fetch {
  return async (input, init = {}) => {
    const signal = init.signal ?? undefined;
    const aborted = () => new DOMException('The operation was aborted.', 'AbortError');
    if (signal?.aborted) throw aborted();
    const url = new URL(String(input), 'http://feedbackops.test');
    const headers = Object.fromEntries(new Headers(init.headers));
    const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
    if (cookie) headers.cookie = cookie;
    const injected = app.inject({
      method: (init.method ?? 'GET') as 'GET' | 'POST',
      url: `${url.pathname}${url.search}`,
      headers,
      ...(typeof init.body === 'string' ? { payload: init.body } : {}),
    });
    let onAbort = () => {};
    const res = await (signal
      ? Promise.race([
          injected,
          new Promise<never>((_resolve, reject) => {
            onAbort = () => reject(aborted());
            signal.addEventListener('abort', onAbort, { once: true });
          }),
        ]).finally(() => signal.removeEventListener('abort', onAbort))
      : injected);
    for (const line of [res.headers['set-cookie'] ?? []].flat()) {
      const [pair = '', ...attributes] = line.split(';');
      const eq = pair.indexOf('=');
      const name = pair.slice(0, eq).trim();
      const expired = attributes.some((attribute) => {
        const [key = '', ...rest] = attribute.split('=');
        const value = rest.join('=').trim();
        if (/^\s*max-age\s*$/i.test(key)) return Number(value) <= 0;
        if (/^\s*expires\s*$/i.test(key)) return Date.parse(value) <= Date.now();
        return false;
      });
      if (expired) jar.delete(name);
      else jar.set(name, pair.slice(eq + 1).trim());
    }
    const out = new Headers();
    for (const [name, value] of Object.entries(res.headers)) {
      if (value !== undefined && name !== 'set-cookie') out.set(name, String(value));
    }
    const noBody = [101, 204, 205, 304].includes(res.statusCode);
    return new Response(noBody ? null : res.body, { status: res.statusCode, headers: out });
  };
}

type RouteProbe = { method: 'GET' | 'POST'; url: string };

/**
 * The HTTP requests each `PlatformAdapter` member sends, read from the adapter itself (one source:
 * @ap/http-adapter's method → route map, contract §1) — no second hand list of routes. The members
 * that answer synchronously (`session`, `publishedMetrics`, `defaultRangeTo`) are served from the
 * bootstrap response; `subscribe` polls `session-state`. Nothing but bootstrap reaches the server.
 */
async function adapterRoutes(app: FastifyInstance, jar: Map<string, string>) {
  const real = injectFetch(app, jar);
  let log: RouteProbe[] = [];
  const recording: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input), 'http://feedbackops.test');
    const method = (init.method ?? 'GET') as 'GET' | 'POST';
    log.push({ method, url: `${url.pathname}${url.search}` });
    if (url.pathname === '/api/v1/platform/bootstrap') return real(input, init);
    return new Response(null, { status: 503 });
  };
  const boot = await bootstrapHttpAdapter({ fetch: recording, pollMs: 0 });
  if (boot.kind !== 'ready') throw new Error(`route probe bootstrap: ${boot.kind}`);
  const bootstrap = log;
  const routes = new Map<PortMethod, RouteProbe[]>();
  for (const method of Object.keys(boot.adapter) as PortMethod[]) {
    log = [];
    const member = boot.adapter[method] as (...args: unknown[]) => unknown;
    // Placeholder argument: the request only has to leave, its answer is never read. It reads as
    // `conformance-probe` where a method puts a string argument into the path or query.
    const placeholder = { toString: () => 'conformance-probe' };
    const result: unknown = member.call(
      boot.adapter,
      method === 'subscribe' ? () => {} : placeholder,
    );
    if (result instanceof Promise) {
      await result.catch(() => undefined);
      if (log.length === 0) throw new Error(`${method} sent no request`);
      routes.set(method, log);
    } else if (typeof result === 'function') {
      // subscribe: the poll timer (pollMs 0) fires on the next macrotask.
      await new Promise((resolve) => setTimeout(resolve, 20));
      (result as () => void)();
      if (log.length === 0) throw new Error(`${method} sent no request`);
      routes.set(method, log);
    } else {
      if (log.length > 0) throw new Error(`${method} answered synchronously yet sent a request`);
      routes.set(method, bootstrap);
    }
  }
  return routes;
}

/** True when the server has a route for the request: anything but 404 to a request with no session. */
async function served(app: FastifyInstance, probe: RouteProbe): Promise<boolean> {
  const res = await app.inject({
    method: probe.method,
    url: probe.url,
    ...(probe.method === 'POST'
      ? { payload: '{}', headers: { 'content-type': 'application/json' } }
      : {}),
  });
  return res.statusCode !== 404;
}

// Runs without a database: the FO source cannot import the contract constant (rule 11), so it mirrors it.
it('mirrors the contract entityAudit page size', () => {
  expect(ENTITY_AUDIT_PAGE_MAX).toBe(CONTRACT_ENTITY_AUDIT_PAGE_MAX);
});

describe.skipIf(!runIntegration)('platform port server conformance (#674)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  let msId = '';
  let n = 0;
  const adapters = new Map<Account, PlatformAdapter>();
  const jars = new Map<Account, Map<string, string>>();
  let current: PlatformAdapter | null = null;

  // The kit plans its checks when this file is collected, before beforeAll: the destination sample
  // is this object, and its id is filled in once the fixture Finding exists.
  const findingRef = { type: 'finding', id: '', scopeId: null };

  async function signIn(account: Account, roleLevel: Role): Promise<string> {
    const externalId = `${PREFIX}-${account}-${n++}`;
    const { id } = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      roleLevel,
      displayName: `Conformance ${account}`,
    });
    actorIds.push(id);
    const jar = new Map([[SESSION_COOKIE_NAME, await loginAs(app, externalId)]]);
    jars.set(account, jar);
    const boot = await bootstrapHttpAdapter({ fetch: injectFetch(app, jar) });
    if (boot.kind !== 'ready') throw new Error(`bootstrap as ${account}: ${boot.kind}`);
    adapters.set(account, boot.adapter);
    return id;
  }

  async function as<T>(account: Account, fn: () => Promise<T>): Promise<T> {
    const previous = current;
    const next = adapters.get(account);
    if (!next) throw new Error(`no adapter for ${account}`);
    current = next;
    try {
      return await fn();
    } finally {
      current = previous;
    }
  }

  // One adapter object for the kit; each call goes to the account the kit is acting as.
  const adapter = new Proxy({} as PlatformAdapter, {
    get(_target, key) {
      if (!current) throw new Error('conformance call outside an actor');
      const value = current[key as keyof PlatformAdapter];
      return typeof value === 'function' ? value.bind(current) : value;
    },
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    // The global limiter keys unauthenticated requests by req.ip (127.0.0.1 under app.inject) in
    // core.rate_limits, shared by every suite in the run. This file sends about 30 of them (route
    // probes without a session, mock-logins), so it clears the table on the way in and out; left
    // behind, they push a later suite's mock-login over the 50/min limit (#681).
    await migrateHandle.pool.query('delete from core.rate_limits');
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();

    msId = await insertMsDirectly(migrateHandle, WORKSPACE_ID, `${PREFIX}-ms`, 'Conformance MS');
    // granted: developer + finding.read → feedbackops:access and the Finding detail read.
    // plain: a user with no grant → no feedbackops:access, the Finding is not readable.
    // console: admin → workspace.admin → console:access.
    const grantedId = await signIn('granted', 'developer');
    await signIn('plain', 'user');
    const adminId = await signIn('console', 'admin');
    await signIn('otherAnnotator', 'developer');
    const voc = await insertVocDirectly(
      migrateHandle,
      WORKSPACE_ID,
      msId,
      grantedId,
      'Conformance voc',
    );
    const finding = await insertFindingRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      primaryManagedSystemId: msId,
      title: 'Conformance finding',
      sourceId: voc.id,
      severity: 'high',
      status: 'active',
      createdBy: adminId,
    });
    findingRef.id = finding.id;
    await grantCapability(migrateHandle, WORKSPACE_ID, grantedId, 'finding.read', msId, adminId);
    // More than one entityAudit page, so the kit's cursor checks run instead of skipping (#857).
    // Distinct instants plus a block of equal ones, to exercise the id tie-break.
    await migrateHandle.pool.query(
      `insert into core.audit_log
         (workspace_id, actor_id, event_type, subject_type, subject_id, summary, created_at)
       select $1, $2, 'finding_status_changed', 'finding', $3, 'conformance',
              case when g <= 40 then timestamptz '2026-03-01T00:00:00Z' + g * interval '1 hour'
                   else timestamptz '2026-03-01T00:00:00Z' end
       from generate_series(1, 53) g`,
      [WORKSPACE_ID, grantedId, finding.id],
    );
  });

  afterAll(async () => {
    const q = (text: string, params: unknown[]) => migrateHandle.pool.query(text, params);
    if (msId) {
      await q('delete from finding.findings where primary_managed_system_id = $1', [msId]);
      await q('delete from permission.permission_grants where managed_system_id = $1', [msId]);
      await q('delete from voc.vocs where primary_managed_system_id = $1', [msId]);
    }
    if (actorIds.length > 0) {
      // audit_log needs the migrate role; children before parents (apps/backend/AGENTS.md).
      for (const [table, column] of [
        ['platform.usage_events', 'actor_id'],
        ['platform.client_errors', 'actor_id'],
        ['core.audit_log', 'actor_id'],
        ['permission.permission_grants', 'actor_id'],
        ['permission.permission_denies', 'actor_id'],
        ['core.sessions', 'actor_id'],
        ['core.actors', 'id'],
      ]) {
        await q(`delete from ${table} where ${column} = any($1)`, [actorIds]);
      }
    }
    if (msId) await q('delete from core.managed_systems where id = $1', [msId]);
    await migrateHandle?.pool.query('delete from core.rate_limits');
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  // Drift guard for IMPLEMENTED: a port this backend starts serving without being listed (its run
  // would silently stay skipped), or a listed one whose route is gone, fails here.
  describe('implemented list matches the served routes', () => {
    it('every PlatformAdapter member is served exactly when it is listed', async () => {
      const jar = jars.get('granted');
      if (!jar) throw new Error('no granted session');
      const routes = await adapterRoutes(app, jar);
      for (const method of [...IMPLEMENTED, ...GATE_ONLY])
        expect([...routes.keys()]).toContain(method);
      const drift: string[] = [];
      for (const [method, probes] of routes) {
        const listed = IMPLEMENTED.includes(method) || GATE_ONLY.includes(method);
        for (const probe of probes) {
          const has = await served(app, probe);
          if (has !== listed) {
            drift.push(
              `${method}: ${probe.method} ${probe.url} ${has ? 'served but not listed' : 'listed but absent'}`,
            );
          }
        }
      }
      expect(drift).toEqual([]);
    });

    it('gate-only ports answer forbidden even to a granted account', async () => {
      const ref = { chartId: 'conformance-chart', scopeId: null };
      const granted = adapters.get('granted');
      if (!granted) throw new Error('no granted adapter');
      const range = { from: '2026-10-01T00:00:00', to: '2026-10-01T01:00:00' };
      const outcomes = {
        listAnnotations: (await granted.listAnnotations(ref)).outcome,
        saveAnnotation: (await granted.saveAnnotation({ ...ref, ...range, text: 'conformance' }))
          .outcome,
        deleteAnnotation: (await granted.deleteAnnotation({ ...ref, id: 'conformance-annotation' }))
          .outcome,
      };
      expect(Object.keys(outcomes).sort()).toEqual([...GATE_ONLY].sort());
      expect(outcomes).toEqual({
        listAnnotations: 'forbidden',
        saveAnnotation: 'forbidden',
        deleteAnnotation: 'forbidden',
      });
    });
  });

  describeServerConformance('FeedbackOps backend through @ap/http-adapter', {
    adapter,
    implemented: IMPLEMENTED,
    siteGrants: false,
    cases: [],
    // No site grants: placeholders no run check reads (siteGrants: false).
    context: { scopeId: 'no-site', from: '2026-10-01T00:00:00', to: '2026-10-02T00:00:00' },
    foreignScopeId: 'no-foreign-site',
    ports: {
      // FeedbackOps destinations are siteless (ADR-0069 decision 9). A Finding is read by the
      // Finding detail rule, which every holder of feedbackops:access with finding.read passes.
      entity: { ref: findingRef, permission: 'feedbackops:access' },
      annotation: {
        chartId: 'conformance-chart',
        from: '2026-10-01T00:00:00',
        to: '2026-10-01T01:00:00',
        permission: menuPermission('analytics:view'),
      },
      usage: {
        name: 'entry',
        menuId: `${PREFIX}-menu`,
        spaceId: spaceId('improvement'),
        path: '/fo-conformance',
        at: 0,
        sessionId: `${PREFIX}-tab`,
      },
      clientError: {
        correlationId: 'client-conformance',
        menuId: `${PREFIX}-menu`,
        spaceId: spaceId('improvement'),
        path: '/fo-conformance',
        name: 'TypeError',
      },
      otherGrantedScopeId: 'no-second-site',
    },
    asGranted: (fn) => as('granted', fn),
    // The kit removes the entity permission and console:access; the granted developer holds no
    // console:access, so that one is the granted account itself (checklist §4).
    withoutPermission: (permission, fn) => {
      if (permission === 'feedbackops:access') return as('plain', fn);
      if (permission === 'console:access') return as('granted', fn);
      throw new Error(`no account without ${permission}`);
    },
    asConsole: (fn) => as('console', fn),
    asOtherAnnotator: (fn) => as('otherAnnotator', fn),
  });
});
