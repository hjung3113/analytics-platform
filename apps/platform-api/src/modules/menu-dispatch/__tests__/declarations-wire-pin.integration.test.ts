// String-owner compatibility pin: production setup + real authenticated server + external fetch boundary.
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { loadMenuDeclarationSetup } from '../../../menu-declarations.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { createCheckService } from '../../permissions/index.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { withMenuSnapshotFile } from '../../../test-support/menu-snapshot.js';
import { uid } from '../../../test-support/ids.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const externalId = uid('synwire');
const responseBytes = '{"outcome":"ok","data":{"rows":[{"id":"syn-1","value":7}]},"assessments":[],"trust":null,"correlationId":"syn-wire-1","message":"synthetic"}';

describe.skipIf(!runIntegration)('string-owner forwarding byte pin (ADR-0153 a1)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  let dir: string;
  let actorId: string | undefined;
  let cookie: string;
  const requests: { url: string; method: string | undefined; redirect: string | undefined; headers: Record<string, string>; body: unknown }[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'syn-wire-'));
    const bundleFile = join(dir, 'bundle.json');
    const keyFile = join(dir, 'identity.key');
    const { privateKey } = generateKeyPairSync('ed25519');
    await writeFile(keyFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
    await writeFile(bundleFile, JSON.stringify({
      endpoints: [{ id: 'syn.rows', menuId: 'syn', paramKeys: ['q'], permission: 'syn:view', requiresScope: false, context: { time: 'apply' }, mergeTimeDomain: false }],
      actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }], endpointOwners: { 'syn.rows': '/syn/rows' },
    }));
    const config = {
      ...loadConfig(), MENU_DECLARATIONS_FILE: bundleFile, MENU_UPSTREAM_BASE_URL: 'https://upstream.test/base/',
      MENU_IDENTITY_KEY_FILE: keyFile, MENU_IDENTITY_KEY_ID: 'syn-key', MENU_SCOPE_GRANT_SERVICE_URL: undefined,
    };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), {
      checkService: createCheckService({ db: dbHandle.db }),
      fetch: (async (input: unknown, init: RequestInit) => {
        requests.push({ url: String(input), method: init.method, redirect: init.redirect, headers: init.headers as Record<string, string>, body: init.body });
        return new Response(responseBytes, { status: 200 });
      }) as typeof globalThis.fetch,
    });
    if (!setup) throw new Error('declaration setup missing');
    app = await buildServer({ config, dbHandle, menuDispatch: setup.menuDispatch });
    await app.ready();
    const actor = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, displayName: 'Synthetic wire user', roleLevel: 'user' });
    actorId = actor.id;
    cookie = await loginAs(app, externalId);
  });

  afterAll(async () => {
    await app?.close();
    if (actorId) {
      for (const table of ['core.idempotency_keys', 'platform.usage_events', 'platform.client_errors', 'core.audit_log', 'permission.permission_grants', 'permission.permission_denies', 'core.sessions']) {
        await migrateHandle.pool.query(`delete from ${table} where actor_id = $1`, [actorId]);
      }
      await migrateHandle.pool.query('delete from core.actors where id = $1', [actorId]);
    }
    await dbHandle?.close();
    await migrateHandle?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('pins URL, non-token headers, method, request bytes and complete response bytes', async () => {
    const hit = await app.inject({
      method: 'POST', url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', 'x-correlation-id': 'syn-wire-1', cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      payload: '{"endpoint":"syn.rows","context":{"from":"2026-11-01T00:00:00","to":"2026-11-02T00:00:00"},"params":{"q":"synthetic"}}',
    });
    expect(hit.statusCode).toBe(200);
    expect(hit.body).toBe(responseBytes);
    expect(requests).toHaveLength(1);
    const request = requests[0];
    if (!request) throw new Error('no upstream request');
    const { 'x-internal-identity': token, ...headers } = request.headers;
    expect(typeof token).toBe('string');
    expect({ ...request, headers }).toEqual({
      url: 'https://upstream.test/base/syn/rows', method: 'POST', redirect: 'error',
      headers: { 'content-type': 'application/json', 'x-correlation-id': 'syn-wire-1' },
      body: '{"endpoint":"syn.rows","context":{"from":"2026-11-01T00:00:00","to":"2026-11-02T00:00:00"},"params":{"q":"synthetic"}}',
    });
  });
});
