// #674 — the platform's server conformance kit (@ap/server-conformance) against this backend, through
// the real HTTP adapter (@ap/http-adapter) over `app.inject`. Test-only imports of both packages
// (ADR-0073; src imports no `@ap/*` but `@ap/ui`, scripts/check-boundaries.mjs). Route-level against a
// real Postgres (throwaway DB only, apps/platform-api/AGENTS.md → Verification).
//
// The run is the readiness table of the real server: every port this backend does not implement
// yet (menuQuery counts as implemented for the Scope-less endpoints, #1669), and every check that needs a site grant (platform ADR-0069 decision 8: `scopes: []` until site·room
// grants exist), is a visible skipped test, never a pass. Annotations are a gate only (#622
// decision 6, .planning/backlog.md "주석 저장"), so they are declared not implemented.

import {
  ENTITY_AUDIT_PAGE_MAX as CONTRACT_ENTITY_AUDIT_PAGE_MAX,
  type AnyActionSpec,
  type AnyEndpointSpec,
  type PlatformAdapter,
  type SavedViewStore,
  menuPermission,
  spaceId,
} from '@ap/contracts';
import { bootstrapHttpAdapter } from '@ap/http-adapter';
import {
  type ConformanceCase,
  type PortMethod,
  type ServerConformanceHarness,
  describeServerConformance,
} from '@ap/server-conformance';
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
import { hashToken } from '../../api-tokens/token-format.js';
import type { MenuDispatchRegistry } from '../../menu-dispatch/registry.js';
import type { MenuActionDeclaration } from '../../menu-dispatch/types.js';
import { ENTITY_AUDIT_PAGE_MAX } from '../entity-audit-cursor.js';

// The registry `buildServer` builds, captured as it is built (the defining module is wrapped, not the barrel): the one list of the
// endpoints this server registers, which the coverage test below compares with the cases (#1669 fix round).
const built = vi.hoisted(() => ({ registry: null as MenuDispatchRegistry | null }));
vi.mock('../../menu-dispatch/registry.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../menu-dispatch/registry.js')>();
  return {
    ...actual,
    createMenuDispatchRegistry: (...args: Parameters<typeof actual.createMenuDispatchRegistry>) => {
      built.registry = actual.createMenuDispatchRegistry(...args);
      return built.registry;
    },
  };
});

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-conformance');

/** The test-only write pair the kit's menuAction checks run against (#1193 F7). In-memory state; permission is a set of actor ids. */
const ACTION_PERMISSION = menuPermission(`${PREFIX}:write`);
const mayWriteActions = new Set<string>();
const actionState = { name: 'initial', revision: 1 };
const noneSpec: AnyActionSpec = {
  id: `${PREFIX}.note`,
  menuId: `${PREFIX}-menu`,
  inputKeys: { name: true },
  permission: ACTION_PERMISSION,
  requiresScope: false,
  concurrency: 'none',
  invalidates: [],
};
const versionSpec: AnyActionSpec = { ...noneSpec, id: `${PREFIX}.rename`, concurrency: 'version' };
const actionDeclaration = (spec: AnyActionSpec): MenuActionDeclaration => ({
  spec: {
    id: spec.id,
    menuId: spec.menuId,
    inputKeys: Object.keys(spec.inputKeys),
    permission: spec.permission,
    requiresScope: false,
    concurrency: spec.concurrency,
    invalidates: [],
  },
  authorize: async (actor) => mayWriteActions.has(actor.actor_id),
  validate: (input) =>
    typeof input.name === 'string' && input.name.length > 0
      ? []
      : [{ path: ['name'], code: 'required' }],
  currentVersion: async () => String(actionState.revision),
  handle: async (_tx, _actor, input) => {
    actionState.name = String(input.name);
    actionState.revision += 1;
    return {
      data: { name: actionState.name },
      version: spec.concurrency === 'version' ? String(actionState.revision) : null,
    };
  },
});
const testActionPair = { actions: [actionDeclaration(noneSpec), actionDeclaration(versionSpec)] };

/**
 * The Scope-less menu reads the production run judges (#1669). The declarations come from the contract snapshot
 * `@ap/contract-schemas/endpoints.json` (the one place `kinds` of a menu endpoint is written; the server's own
 * declarations carry no `kinds`), narrowed to `requiresScope: false` — the server refuses a Scope-requiring
 * endpoint at registration (#1087). The Studio `eqv.*` reads come from the snapshot through the Studio Layouts menu (#1654);
 * `eqv.equipment-options` belongs to the app's module, outside that snapshot (`endpoints.json` covers `menus/` and
 * `platform/` only), so its spec is written here, as the server declares it (no assessment kinds).
 */
const SNAPSHOT = JSON.parse(
  readFileSync(
    new URL('../../../../../../packages/sdk/contract-schemas/endpoints.json', import.meta.url),
    'utf8',
  ),
) as Array<Omit<AnyEndpointSpec, 'paramKeys' | 'permission'> & { paramKeys: string[]; permission: string }>;
const keysOf = (keys: readonly string[]) => Object.fromEntries(keys.map((key) => [key, true as const]));
const snapshotSpec = (entry: (typeof SNAPSHOT)[number]): AnyEndpointSpec => ({
  ...entry,
  paramKeys: keysOf(entry.paramKeys),
  permission: menuPermission(entry.permission),
});
const eqvSpec = (id: string, paramKeys: readonly string[]): AnyEndpointSpec => ({
  id,
  menuId: id === 'eqv.equipment-options' ? 'eqv' : 'eqv-studio',
  paramKeys: keysOf(paramKeys),
  permission: menuPermission('eqv:view'),
  requiresScope: false,
  context: {},
  kinds: [],
  mergeTimeDomain: false,
});

/**
 * Registered Scope-less reads that are not in the contract snapshot (no menu declares them yet), written here as the server declares
 * them (no assessment kinds). The coverage test compares each with the registered declaration.
 */
const serverSpec = (id: string, menuId: string, permission: string, paramKeys: readonly string[]): AnyEndpointSpec => ({
  id,
  menuId,
  paramKeys: keysOf(paramKeys),
  permission: menuPermission(permission),
  requiresScope: false,
  context: {},
  kinds: [],
  mergeTimeDomain: false,
});
const INLINE_SPECS: AnyEndpointSpec[] = [
  serverSpec('logKnowledge.drafts', 'log-knowledge-items', 'platform:view', ['q', 'page', 'pageSize', 'sorting', 'filters']),
  serverSpec('logKnowledge.draftDetail', 'log-knowledge-items', 'platform:view', ['draftId']),
  serverSpec('logKnowledge.accessRules', 'log-knowledge-access', 'knowledge:access-manage', ['targetKind', 'targetId', 'page', 'pageSize']),
  serverSpec('logKnowledge.searchIndexStatus', 'log-knowledge-access', 'knowledge:access-manage', []),
  serverSpec('logExplorer.evidenceLinks', 'log-explorer', 'platform:view', ['fileRef', 'line', 'fileSha256', 'page', 'pageSize']),
  serverSpec('logExplorer.usage', 'log-explorer', 'console:access', ['day']),
];
/** Reads only an admin session passes (`console:access` is the workspace-admin rule); the pool's developers cannot. */
const ADMIN_ONLY_ENDPOINTS: readonly string[] = ['logExplorer.usage'];

/** In the snapshot (the mock serves them) but answered `Unknown endpoint` by this server: no module contributes them yet. */
const NOT_REGISTERED: readonly string[] = [
  'improvement.quest',
  'improvement.questSearch',
  'metrics.catalog.export',
  'metrics.catalog.list',
  'metrics.catalog.page',
  'metrics.definition',
  'metrics.pair',
  'metrics.usage',
];

/** An id no row has; the detail reads answer `empty` for it. */
const NO_ROW = '16690000-0000-4000-8000-000000000001';
const NO_ROW_2 = '16690000-0000-4000-8000-000000000002';
const listPage = { page: 0, pageSize: 10, sorting: [] as never[] };
const pagedList = { page: 0, pageSize: 10 };
const nilEqvLayout = 'conformance-layout';

/** Params the granted actor's request succeeds with (`ok` or `empty`) on a database with no domain rows. */
const MENU_PARAMS: Record<string, Record<string, unknown>> = {
  'home.notices': { targetScopeId: null },
  'improvement.items': { q: null, ...listPage },
  'improvement.itemDetail': { itemId: NO_ROW },
  'improvement.itemEvents': { itemId: NO_ROW, ...pagedList },
  'logDataset.datasets': { ...listPage },
  'logDataset.datasetDetail': { datasetId: NO_ROW },
  'logDataset.baselines': { datasetRevisionId: NO_ROW },
  'logDataset.baselineDetail': { baselineId: NO_ROW },
  'logDataset.suites': { datasetId: NO_ROW, ...listPage },
  'logDataset.suiteDetail': { suiteId: NO_ROW },
  'logDataset.suiteRuns': { suiteId: NO_ROW, ...pagedList },
  'logDataset.comparison': { suiteRunId: NO_ROW, ...listPage },
  'logDataset.rerunDiff': { fromRunId: NO_ROW, toRunId: NO_ROW_2 },
  'logExplorer.investigations': { status: 'open', ...pagedList },
  'logExplorer.investigationDetail': { investigationId: NO_ROW },
  'logExplorer.handoffCheck': { investigationId: NO_ROW },
  'logExplorer.handoffDrafts': {},
  'logExplorer.handoffModels': { q: null, ...pagedList },
  'logExplorer.handoffSoftware': { modelId: NO_ROW },
  'logKnowledge.vendors': { q: null, ...listPage },
  'logKnowledge.processes': { q: null, ...listPage },
  'logKnowledge.models': { q: null, ...listPage },
  'logKnowledge.softwareVersions': { q: null, ...listPage },
  'logKnowledge.exploreModels': { q: null, ...listPage },
  'logKnowledge.modelProfile': { modelId: NO_ROW },
  'logKnowledge.items': { q: null, ...listPage },
  'logKnowledge.search': { q: 'STEP_PROCESS', limit: 10 },
  'logKnowledge.searchSuggest': { q: 'STEP' },
  'logKnowledge.itemDetail': { itemId: NO_ROW },
  'logKnowledge.modelSpec': { modelId: NO_ROW },
  'logKnowledge.specCoverage': { modelId: NO_ROW },
  'logKnowledge.modelSpecRevisions': { modelId: NO_ROW, ...pagedList },
  'logKnowledge.specDraft': { revisionId: NO_ROW },
  'logKnowledge.specChanges': { modelId: NO_ROW, status: 'all', ...pagedList },
  'logKnowledge.importDetail': { jobId: NO_ROW, ...listPage },
  'logKnowledge.modelTopView': { modelId: NO_ROW },
  'logKnowledge.conceptMappings': { modelId: NO_ROW, ...pagedList },
  'logKnowledge.conceptSuggestions': { modelId: NO_ROW, ...pagedList },
  'logKnowledge.specSubjectItems': { modelId: NO_ROW, targetKey: 'CHAMBER/START', ...pagedList },
  'logLifecycle.models': { q: null, ...listPage },
  'logLifecycle.projectDetail': { projectId: NO_ROW },
  'logLifecycle.projectEvents': { projectId: NO_ROW, page: 0, pageSize: 25 },
  'logLifecycle.rounds': { projectId: NO_ROW },
  'logLifecycle.roundDetail': { roundId: NO_ROW },
  'logLifecycle.roundEvidence': { roundId: NO_ROW },
  'logLifecycle.requests': { page: 0, pageSize: 25 },
  'logLifecycle.requestDetail': { requestId: NO_ROW },
  'logLifecycle.ruleResults': { attemptId: NO_ROW, page: 0, pageSize: 25 },
  'logLifecycle.hierarchy': { op: 'children', parentId: null, limit: 50 },
  'logLifecycle.excerpt': { ruleResultId: NO_ROW, evidenceIndex: 0 },
  'logLifecycle.queueStatus': {},
  'logRules.catalogStatus': {},
  'logRules.ruleSets': { q: null, ...listPage },
  'logRules.ruleSetDetail': { ruleSetKey: 'conformance-no-rule-set' },
  'logRules.rules': { q: null, targetQ: null, ...listPage },
  'logRules.ruleDetail': { ruleSetKey: 'conformance-no-rule-set', ruleKey: 'R-0' },
  'logRules.coverage': { modelId: NO_ROW, ...pagedList },
  'logRules.coverageSummary': { modelIds: [NO_ROW] },
  'logRules.modelOptions': { q: null, ...pagedList },
  'logRules.softwareOptions': { modelId: NO_ROW },
  'logKnowledge.drafts': { q: null, ...listPage },
  'logKnowledge.draftDetail': { draftId: NO_ROW },
  'logKnowledge.accessRules': { targetKind: 'model', targetId: NO_ROW, ...pagedList },
  'logKnowledge.searchIndexStatus': {},
  'logExplorer.evidenceLinks': { fileRef: 'conformance/none.log', line: 1, fileSha256: '0'.repeat(64), ...pagedList },
  'logExplorer.usage': {},
  'eqv.layouts': {},
  'eqv.layoutDraft': { layoutId: nilEqvLayout },
  'eqv.layoutRevisions': { layoutId: nilEqvLayout },
  'eqv.layoutRevision': { layoutId: nilEqvLayout, revision: `sha256:${'0'.repeat(64)}` },
  'eqv.templates': {},
  'eqv.template': { templateId: nilEqvLayout },
  'eqv.equipment-options': {},
};

/**
 * Registered and Scope-less, but left out of the production run. Each is a visible, named gap:
 * .planning/backlog.md "실서버 적합성 묶음의 제외 엔드포인트".
 */
const EXPLORER_PERMISSION_GAP =
  'every other check passes with a bare server (stateOnly, outcome ok), but the entry gate admits any token regardless of platform:view and answers an audited ok with a permission_denied state, so the kit\'s "without platform:view → forbidden" cannot hold';
const MENU_LEFT_OUT: Readonly<Record<string, string>> = {
  'logExplorer.records': EXPLORER_PERMISSION_GAP,
  'logExplorer.periods': EXPLORER_PERMISSION_GAP,
  'logExplorer.parsed': EXPLORER_PERMISSION_GAP,
  'logExplorer.window': EXPLORER_PERMISSION_GAP,
  // The entry check is the declared platform:view; the handler then judges `knowledge.catalog.import` separately and answers `error` (not_found)
  // for a job that does not exist, where the kit expects `ok` or `empty`: a succeeding sample needs a staged import job.
  // The picker is judged by `knowledge.catalog.manage` (it lists Revisions only for a catalog manager); the kit's granted account holds
  // platform:view only and is answered `forbidden`, where the kit expects `ok` or `empty`.
  'logKnowledge.topViewRevisionOptions': 'the picker needs knowledge.catalog.manage; the kit\'s platform:view-only granted account answers forbidden, the kit wants ok or empty',
  'logKnowledge.importDetail': 'a succeeding sample needs a staged import job (an unknown job answers error not_found, the kit wants ok or empty)',
};

const menuSpecs: AnyEndpointSpec[] = [
  ...SNAPSHOT.filter((entry) => !entry.requiresScope && !NOT_REGISTERED.includes(entry.id)).map(snapshotSpec),
  eqvSpec('eqv.equipment-options', []),
  ...INLINE_SPECS,
];
const menuCases: ConformanceCase[] = menuSpecs
  .filter((spec) => !(spec.id in MENU_LEFT_OUT))
  .map((spec) => {
    const params = MENU_PARAMS[spec.id];
    if (!params) throw new Error(`no conformance params for ${spec.id}`);
    return { spec, params };
  });

type Account =
  | 'granted'
  | 'grantedNoConsole'
  | 'plain'
  | 'noRead'
  | 'console'
  | 'otherAnnotator'
  | 'svUser'
  | 'svAdmin';

/**
 * The menu reads of the production run (about 17 checks each) would spend far more than one actor's budget of 100 a
 * minute (the global per-actor limit, never changed), so the `granted` account's menuQuery calls rotate over a pool
 * of twins with the same grants. `MENU_POOL` twins serve about 1,200 calls with room to spare.
 */
const MENU_POOL = 16;
/** Menu permissions every session holds (`every-session` in `PLATFORM_PERMISSION_TABLE`): only an API token without `workspace.read` lacks them. */
const EVERY_SESSION_PERMISSIONS: readonly string[] = ['platform:view', 'notice:view', 'metrics:view'];
/** Menu permissions a capability opens; a developer without the grant lacks them. */
const CAPABILITY_PERMISSIONS: Readonly<Record<string, string>> = {
  'knowledge:spec-publish': 'knowledge.spec.publish',
  'explorer:handoff': 'explorer.handoff',
  'eqv:view': 'eqv.view',
  'knowledge:access-manage': 'knowledge.access.manage',
};
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
  'usageNextScreens',
  'recordUsage',
  'reportClientError',
  'readPreferences',
  'patchPreferences',
  'importPreferences',
  'lookupPeople',
  'listNotices',
  'saveNotice',
  'deleteNotice',
];

/**
 * Served in part (#1106 menu-query, #1193 menu-action; ADR-0095 §1). `POST /api/v1/menu-query` answers the Scope-less endpoints
 * that the modules register in `createMenuDispatchRegistry` (server.ts: notices, log knowledge, improvement items, log lifecycle,
 * log explorer, log rules, investigation, eqv, log datasets). The Scope-requiring analytical endpoints are refused at registration
 * (#1087), so the port is not complete. The production run judges every Scope-less endpoint listed in `MENU_PARAMS` as executed
 * `menuQuery` checks (`implemented` below adds `menuQuery` to IMPLEMENTED for the run only); the checks that need a site stay
 * skipped through `siteGrants: false`. The drift guard only recognizes the route as served; it never lists the port as implemented.
 *
 * `menuAction` is served by the generic dispatch (#1193, `POST /api/v1/menu-action`) but this server
 * registers no real write the kit can run with a production sample, so the production readiness run has no action sample and keeps a
 * visible `actions: no sample` skip. The kit's action checks do run, in the second run below, against a test-only
 * action pair registered through `buildServer({ menuDispatch })` (the harness accepts a server-provided
 * `actions` sample). Add it to IMPLEMENTED with a production sample once a module registers its first real action.
 */
const SERVED_PARTIAL: readonly PortMethod[] = ['menuQuery', 'menuAction'];

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
    const url = new URL(String(input), 'http://platform-api.test');
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
    const url = new URL(String(input), 'http://platform-api.test');
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

/** The «Method support» table of the platform-port document (#1682): method → support word. */
function documentedSupport(): Map<string, string> {
  const doc = readFileSync(
    new URL('../../../../../../docs/architecture/platform-api/api/platform-port.md', import.meta.url),
    'utf8',
  );
  const rows = [...doc.matchAll(/^\| `(\w+)` \| (implemented|partial|gate-only|none) \|$/gm)];
  return new Map(rows.map((row) => [row[1] as string, row[2] as string]));
}

// Runs without a database: the document table and the constants are one list (one source: the constants; the table is checked, not generated).
it('lists in platform-port.md exactly the methods the conformance constants declare', () => {
  const documented = documentedSupport();
  const withSupport = (support: string) =>
    [...documented].filter(([, value]) => value === support).map(([method]) => method).sort();
  expect(withSupport('implemented')).toEqual([...IMPLEMENTED].sort());
  expect(withSupport('partial')).toEqual([...SERVED_PARTIAL].sort());
  expect(withSupport('gate-only')).toEqual([...GATE_ONLY].sort());
});

// Runs without a database: the screen source cannot import the contract constant (rule 11), so it mirrors it.
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
  let currentAccount: Account | null = null;
  const noReadPrefix = randomUUID().replace(/-/g, '').slice(0, 8);
  const noReadToken = `ap_${noReadPrefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
  /** The twins of `granted` that carry its menuQuery calls (see `MENU_POOL`). */
  const menuPool: PlatformAdapter[] = [];
  let menuTurn = 0;
  /** An admin session for the reads only an admin passes (`ADMIN_ONLY_ENDPOINTS`). */
  let menuAdmin: PlatformAdapter | null = null;
  /** The HTTP SavedViewStore of each signed-in account (ADR-0099; #1131 saved-view conformance sample). */
  const savedViewStores = new Map<Account, SavedViewStore>();

  // The kit plans its checks when this file is collected, before beforeAll: the destination sample
  // is this object, and its id is filled in once the fixture Finding exists.
  const findingRef = { type: 'finding', id: '', scopeId: null };
  // The granted actor's id, set once it is signed in; ports.visiblePersonId reads it at run time.
  let grantedPersonId: string | undefined;

  /** A fresh actor with a session and an HTTP adapter; not registered under an account name. */
  async function openSession(label: string, roleLevel: Role) {
    const externalId = `${PREFIX}-${label}-${n++}`;
    const { id } = await insertActorRow(migrateHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      roleLevel,
      displayName: `Conformance ${label}`,
    });
    actorIds.push(id);
    const jar = new Map([[SESSION_COOKIE_NAME, await loginAs(app, externalId)]]);
    const boot = await bootstrapHttpAdapter({ fetch: injectFetch(app, jar) });
    if (boot.kind !== 'ready') throw new Error(`bootstrap as ${label}: ${boot.kind}`);
    return { id, jar, adapter: boot.adapter, store: boot.store };
  }

  async function signIn(account: Account, roleLevel: Role): Promise<string> {
    const session = await openSession(account, roleLevel);
    jars.set(account, session.jar);
    adapters.set(account, session.adapter);
    savedViewStores.set(account, session.store);
    return session.id;
  }

  async function as<T>(account: Account, fn: () => Promise<T>): Promise<T> {
    const previous = current;
    const previousAccount = currentAccount;
    const next = adapters.get(account);
    if (!next) throw new Error(`no adapter for ${account}`);
    current = next;
    currentAccount = account;
    try {
      return await fn();
    } finally {
      current = previous;
      currentAccount = previousAccount;
    }
  }

  // One adapter object for the kit; each call goes to the account the kit is acting as.
  const adapter = new Proxy({} as PlatformAdapter, {
    get(_target, key) {
      if (!current) throw new Error('conformance call outside an actor');
      if (key === 'menuQuery' && currentAccount === 'granted' && menuPool.length > 0) {
        return (req: Parameters<PlatformAdapter['menuQuery']>[0]) => {
          const reader =
            ADMIN_ONLY_ENDPOINTS.includes(req.endpoint) && menuAdmin
              ? menuAdmin
              : (menuPool[menuTurn++ % menuPool.length] as PlatformAdapter);
          return reader.menuQuery(req);
        };
      }
      const target = current;
      const value = target[key as keyof PlatformAdapter];
      return typeof value === 'function' ? value.bind(target) : value;
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
    app = await buildServer({ config: loadConfig(), dbHandle, menuDispatch: [testActionPair] });
    await app.ready();

    msId = await insertMsDirectly(migrateHandle, WORKSPACE_ID, `${PREFIX}-ms`, 'Conformance MS');
    // granted: developer + finding.read → features:access and the Finding detail read.
    // plain: a user with no grant → no features:access, the Finding is not readable.
    // console: admin → workspace.admin → console:access.
    const grantedId = await signIn('granted', 'developer');
    grantedPersonId = grantedId;
    mayWriteActions.add(grantedId);
    await signIn('plain', 'user');
    // The granted actor minus console:access (the granted developer holds none, so this is its twin): the console reads without the
    // permission keep the harness contract and spend a fresh account's rate budget, not the granted one's.
    const twinId = await signIn('grantedNoConsole', 'developer');
    mayWriteActions.add(twinId);
    const adminId = await signIn('console', 'admin');
    await signIn('otherAnnotator', 'developer');
    // The saved-view conformance actors (#1131): a dedicated pair keeps the suite's command volume off the other
    // accounts' global per-actor rate limit. svUser: developer → no console:access; svAdmin: admin → console:access.
    await signIn('svUser', 'developer');
    await signIn('svAdmin', 'admin');
    // noRead: a developer whose menu reads go out with an API token holding no scope. A token call holds a session-wide menu
    // permission (platform:view ...) only through `workspace.read` (ADR-0116), so this is the account without it.
    const noReadId = await signIn('noRead', 'developer');
    await migrateHandle.pool.query(
      `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by)
       values ($1, $2, 'personal', 'conformance no scope', $3, $4, '{}', $2)`,
      [WORKSPACE_ID, noReadId, noReadPrefix, hashToken(noReadToken)],
    );
    const noReadJar = jars.get('noRead');
    if (!noReadJar) throw new Error('no noRead session');
    const sessionFetch = injectFetch(app, noReadJar);
    const noReadBoot = await bootstrapHttpAdapter({
      fetch: (input, init = {}) =>
        sessionFetch(
          input,
          String(input).startsWith('/api/v1/menu-query')
            ? { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), authorization: `Bearer ${noReadToken}` } }
            : init,
        ),
    });
    if (noReadBoot.kind !== 'ready') throw new Error(`bootstrap as noRead: ${noReadBoot.kind}`);
    adapters.set('noRead', noReadBoot.adapter);
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
    await grantCapability(migrateHandle, WORKSPACE_ID, twinId, 'finding.read', msId, adminId);
    // The menu pool: twins of the granted developer for its menuQuery calls, holding the capabilities the capability-bound
    // menu permissions open (knowledge:spec-publish, explorer:handoff). The granted developer itself holds them too.
    for (const capability of Object.values(CAPABILITY_PERMISSIONS)) {
      await grantCapability(migrateHandle, WORKSPACE_ID, grantedId, capability, null, adminId);
    }
    for (let i = 0; i < MENU_POOL; i++) {
      const twin = await openSession('menu-pool', 'developer');
      for (const capability of Object.values(CAPABILITY_PERMISSIONS)) {
        await grantCapability(migrateHandle, WORKSPACE_ID, twin.id, capability, null, adminId);
      }
      menuPool.push(twin.adapter);
    }
    menuAdmin = (await openSession('menu-admin', 'admin')).adapter;
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
      // audit_log needs the migrate role; children before parents (apps/platform-api/AGENTS.md).
      for (const [table, column] of [
        // Saved-view rows first: their FKs to core.actors have no cascade (#1131 suite writes them).
        ['platform.saved_view_defaults', 'actor_id'],
        ['platform.saved_view_group_members', 'actor_id'],
        ['platform.saved_view_people', 'actor_id'],
        ['platform.saved_views', 'owner_id'],
        ['platform.saved_view_groups', 'created_by'],
        ['platform.usage_events', 'actor_id'],
        ['platform.client_errors', 'actor_id'],
        ['platform.preferences', 'actor_id'],
        ['platform.notices', 'author_actor_id'],
        ['core.api_tokens', 'actor_id'],
        ['core.idempotency_keys', 'actor_id'],
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
      for (const method of [...IMPLEMENTED, ...GATE_ONLY, ...SERVED_PARTIAL])
        expect([...routes.keys()]).toContain(method);
      // The table of platform-port.md names every PlatformAdapter member once; its `none` rows are the members with no handler.
      expect([...documentedSupport().keys()].sort()).toEqual([...routes.keys()].sort());
      const drift: string[] = [];
      for (const [method, probes] of routes) {
        const listed =
          IMPLEMENTED.includes(method) ||
          GATE_ONLY.includes(method) ||
          SERVED_PARTIAL.includes(method);
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

    it('every endpoint the server registers is covered, explicitly left out, or (in the snapshot) not registered', () => {
      const registry = built.registry;
      if (!registry) throw new Error('no menu dispatch registry was built');
      const registered = [...registry.endpointIds].sort();
      const covered = menuCases.map((c) => c.spec.id);
      // A registered endpoint outside both lists (a module added a read, or the snapshot lags) fails here by name.
      expect(registered).toEqual([...covered, ...Object.keys(MENU_LEFT_OUT)].sort());
      // A snapshot endpoint no module registers is answered `Unknown endpoint`; once one is registered it needs a case.
      expect(registered.filter((id) => NOT_REGISTERED.includes(id))).toEqual([]);
      expect(registered.filter((id) => registry.endpoint(id)?.spec.requiresScope)).toEqual([]);
      // The inline specs carry what the server declares (the snapshot rows are the contract's, not compared here).
      for (const spec of [...INLINE_SPECS, ...menuSpecs.filter((s) => s.id.startsWith('eqv.'))]) {
        const declared = registry.endpoint(spec.id)?.spec;
        expect({ id: spec.id, permission: declared?.permission, paramKeys: [...(declared?.paramKeys ?? [])].sort() }).toEqual({
          id: spec.id,
          permission: spec.permission,
          paramKeys: Object.keys(spec.paramKeys).sort(),
        });
      }
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

  const harness: ServerConformanceHarness = {
    adapter,
    // `menuQuery` is served for the Scope-less endpoints only (SERVED_PARTIAL): the kit runs the checks of every case below
    // and the checks that need a site stay skipped through `siteGrants: false`.
    implemented: [...IMPLEMENTED, 'menuQuery'],
    siteGrants: false,
    cases: menuCases,
    // No site grants: placeholders no run check reads (siteGrants: false).
    context: { scopeId: 'no-site', from: '2026-10-01T00:00:00', to: '2026-10-02T00:00:00' },
    foreignScopeId: 'no-foreign-site',
    ports: {
      // Feature destinations are siteless (platform ADR-0069 decision 9). A Finding is read by the
      // Finding detail rule, which every holder of features:access with finding.read passes.
      entity: { ref: findingRef, permission: 'features:access' },
      annotation: {
        chartId: 'conformance-chart',
        from: '2026-10-01T00:00:00',
        to: '2026-10-01T01:00:00',
        permission: menuPermission('analytics:view'),
      },
      usage: {
        name: 'entry',
        menuId: `${PREFIX}-menu`,
        spaceId: spaceId('log-dev'),
        path: '/fo-conformance',
        at: 0,
        sessionId: `${PREFIX}-tab`,
      },
      clientError: {
        correlationId: 'client-conformance',
        menuId: `${PREFIX}-menu`,
        spaceId: spaceId('log-dev'),
        path: '/fo-conformance',
        name: 'TypeError',
      },
      otherGrantedScopeId: 'no-second-site',
      // The granted session's own person: visible to itself (the kit allows it), a real actor row in
      // its workspace. A getter, because the kit plans checks before beforeAll signs the actor in.
      get visiblePersonId() {
        return grantedPersonId;
      },
      // Getters: the kit plans before beforeAll signs the actors in and reads the stores at run time (#1131).
      get savedViews() {
        // Nested getters: the outer object exists at plan time (the kit reads the stores at run time only).
        const storeOf = (account: Account) => {
          const store = savedViewStores.get(account);
          if (!store) throw new Error(`no saved-view store for ${account}`);
          return store;
        };
        return {
          get user() { return storeOf('svUser'); },
          get admin() { return storeOf('svAdmin'); },
          menuId: `${PREFIX}-menu`,
        };
      },
    },
    asGranted: (fn) => as('granted', fn),
    // The kit removes the entity permission and console:access. `console:access` is the granted actor minus that permission, as the
    // harness contract says: a twin of the granted developer (same grants), so the console reads without it do not spend the granted
    // account's per-actor rate budget (the production run and the menuAction run share one budget of 100 a minute; checklist §4).
    withoutPermission: (permission, fn) => {
      if (permission === 'features:access') return as('plain', fn);
      if (permission === 'console:access') return as('grantedNoConsole', fn);
      if (permission === ACTION_PERMISSION) return as('plain', fn);
      if (EVERY_SESSION_PERMISSIONS.includes(permission)) return as('noRead', fn);
      if (permission in CAPABILITY_PERMISSIONS) return as('plain', fn);
      throw new Error(`no account without ${permission}`);
    },
    asConsole: (fn) => as('console', fn),
    asOtherAnnotator: (fn) => as('otherAnnotator', fn),
  };

  describeServerConformance('Platform API through @ap/http-adapter', harness);

  // The menuAction checks against the test-only pair. Only `menuAction` is declared implemented here, so every
  // other check is a skip (it ran, or was skipped, in the production run above); production readiness is unchanged.
  describeServerConformance('menuAction through @ap/http-adapter (test-only pair, #1193)', {
    ...harness,
    implemented: ['menuAction'],
    cases: [],
    actions: [
      { spec: noneSpec, input: { name: 'conformance' } },
      {
        spec: versionSpec,
        input: { name: 'conformance' },
        currentVersion: async () => String(actionState.revision),
      },
    ],
  });
});
