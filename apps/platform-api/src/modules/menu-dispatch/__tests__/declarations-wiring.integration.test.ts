// #1729 h — the production declaration path through the real `buildServer`: `loadMenuDeclarationSetup`
// loads a synthetic bundle (node a fixture shape) with an injected `fetch` seam, and the server
// serves it on `POST /api/v1/menu-query`. The fake fetch is both the upstream (owner-table paths) and
// the grant service (`/scopes/resolve`), so the production HTTP Scope resolver is exercised — no
// synthetic resolver enters. Pinned: `ok` passthrough with an identity token whose `sv` equals the
// `/bootstrap` sessionVersion; a permission denial stops before the upstream; `requiresScope` with an
// empty grant answers `forbidden` without calling the upstream. Route-level against a real Postgres
// (`pnpm --filter @ap/platform-api test:integration`).

import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { loadMenuDeclarationSetup } from '../../../menu-declarations.js';
import { createCheckService } from '../../../modules/permissions/index.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('itdecl').replace(/[^a-z0-9]/gi, '').slice(0, 24);

/** `user` holds `workspace.read` by role; `workspace.admin` is admin-only — the denial case's capability. */
const BUNDLE = {
  endpoints: [
    {
      id: `${PREFIX}.rows`,
      menuId: PREFIX,
      paramKeys: [],
      permission: `${PREFIX}:view`,
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    {
      id: `${PREFIX}.adminRows`,
      menuId: PREFIX,
      paramKeys: [],
      permission: `${PREFIX}:admin`,
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    {
      id: `${PREFIX}.scopedRows`,
      menuId: PREFIX,
      paramKeys: [],
      permission: `${PREFIX}:view`,
      requiresScope: true,
      context: {},
      mergeTimeDomain: false,
    },
  ],
  actions: [],
  permissions: [
    { permission: `${PREFIX}:view`, capability: 'workspace.read' },
    { permission: `${PREFIX}:admin`, capability: 'workspace.admin' },
  ],
  endpointOwners: {
    [`${PREFIX}.rows`]: '/upstream/rows',
    [`${PREFIX}.adminRows`]: '/upstream/admin-rows',
    [`${PREFIX}.scopedRows`]: '/upstream/scoped-rows',
  },
};

describe.skipIf(!runIntegration)('menu declarations through buildServer (#1729 h)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let dir: string;
  let cookie: string;
  let bootstrapSv: string;
  const actorIds: string[] = [];
  /** Upstream calls: `{url, token}`; the grant service is counted separately. */
  const upstreamCalls: { url: string; token: string | undefined }[] = [];
  let grantCalls = 0;

  const query = (body: unknown) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      payload: JSON.stringify(body),
    });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);

    dir = await mkdtemp(join(tmpdir(), 'menu-declarations-it-'));
    const { privateKey } = generateKeyPairSync('ed25519');
    const bundleFile = join(dir, 'bundle.json');
    const keyFile = join(dir, 'identity.key');
    await Promise.all([
      writeFile(bundleFile, JSON.stringify(BUNDLE)),
      writeFile(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' })),
    ]);

    // The one fetch seam the setup threads to the forwarder and the grant-service resolver.
    const fetchImpl = (async (input: unknown, init: RequestInit) => {
      const url = String(input);
      if (url.includes('/scopes/resolve')) {
        grantCalls += 1;
        return new Response('[]', { status: 200 });
      }
      const headers = init.headers as Record<string, string> | undefined;
      upstreamCalls.push({ url, token: headers?.['x-internal-identity'] });
      return new Response(
        JSON.stringify({
          outcome: 'ok',
          data: { passed: true },
          assessments: [],
          trust: null,
          correlationId: headers?.['x-correlation-id'],
        }),
        { status: 200 },
      );
    }) as unknown as typeof globalThis.fetch;

    const config = {
      ...loadConfig(),
      MENU_DECLARATIONS_FILE: bundleFile,
      MENU_UPSTREAM_BASE_URL: 'https://upstream.test',
      MENU_IDENTITY_KEY_FILE: keyFile,
      MENU_IDENTITY_KEY_ID: `${PREFIX}-key`,
      MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test',
    };
    const setup = await loadMenuDeclarationSetup(config, {
      checkService: createCheckService({ db: dbHandle.db }),
      fetch: fetchImpl,
    });
    if (!setup) throw new Error('setup must build when MENU_DECLARATIONS_FILE is set');
    app = await buildServer({
      config,
      dbHandle,
      ...(setup.scopeResolver ? { scopeResolver: setup.scopeResolver } : {}),
      menuDispatch: setup.menuDispatch,
    });
    await app.ready();

    const externalId = `${PREFIX}-user`;
    const { id } = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      displayName: 'Declarations user',
      roleLevel: 'user',
    });
    actorIds.push(id);
    cookie = await loginAs(app, externalId);
    const boot = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/bootstrap',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    bootstrapSv = boot.json<{ sessionVersion: string }>().sessionVersion;
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
    if (actorIds.length > 0) {
      // audit_log needs the migrate role; children before parents (apps/platform-api/AGENTS.md).
      for (const [table, column] of [
        ['core.idempotency_keys', 'actor_id'],
        ['platform.usage_events', 'actor_id'],
        ['platform.client_errors', 'actor_id'],
        ['core.audit_log', 'actor_id'],
        ['permission.permission_grants', 'actor_id'],
        ['permission.permission_denies', 'actor_id'],
        ['core.sessions', 'actor_id'],
        ['core.actors', 'id'],
      ]) {
        await migrateHandle.pool.query(`delete from ${table} where ${column} = any($1)`, [actorIds]);
      }
    }
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('passes a declared query through to the upstream with an identity token whose sv equals bootstrap', async () => {
    const hit = await query({ endpoint: `${PREFIX}.rows`, context: {}, params: {} });
    expect(hit.statusCode).toBe(200);
    expect(hit.json()).toMatchObject({ outcome: 'ok', data: { passed: true } });
    expect(upstreamCalls).toHaveLength(1);
    expect(upstreamCalls[0]?.url).toBe('https://upstream.test/upstream/rows');
    const token = upstreamCalls[0]?.token;
    expect(typeof token).toBe('string');
    const payload = JSON.parse(
      Buffer.from((token as string).split('.')[1] as string, 'base64url').toString(),
    );
    expect(payload).toMatchObject({ htu: '/upstream/rows', sv: bootstrapSv, wid: WORKSPACE_ID });
  });

  it('answers forbidden before the upstream when the permission is denied', async () => {
    const hit = await query({ endpoint: `${PREFIX}.adminRows`, context: {}, params: {} });
    expect(hit.statusCode).toBe(200);
    expect(hit.json()).toMatchObject({ outcome: 'forbidden' });
    expect(upstreamCalls).toHaveLength(1); // no new upstream call
  });

  it('answers forbidden for requiresScope when the grant service returns no grants', async () => {
    const hit = await query({ endpoint: `${PREFIX}.scopedRows`, context: { scopeId: 'site-a' }, params: {} });
    expect(hit.statusCode).toBe(200);
    expect(hit.json()).toMatchObject({ outcome: 'forbidden' });
    expect(grantCalls).toBe(1);
    expect(upstreamCalls).toHaveLength(1); // no new upstream call
  });
});
