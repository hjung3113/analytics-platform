import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

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
import { MenuUpstreamError } from '../forwarder.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const externalId = uid('syn-fan');

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE_ID)('fan-out through deployment setup and HTTP', () => {
  let db: DbHandle; let migrate: DbHandle; let app: FastifyInstance;
  let actorId: string | undefined; let dir: string; let cookie: string;
  let behavior: 'normal' | 'failure' | 'overflow' = 'normal';
  const query = (endpoint = 'syn.fan') => app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint, context: { scopeId: 'SITE-A' }, params: {} } });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; db = createDb(APP_URL); migrate = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'syn-fan-it-'));
    const secret = join(dir, 'secret'); const file = join(dir, 'bundle.json');
    await writeFile(secret, 'syn-private-secret');
    const call = { statement: 'SELECT :rooms', params: { rooms: 'scope.rooms' }, response: { fields: { id: { from: '/id', type: 'number' }, value: { from: '/value', type: 'string' } } } };
    const scopeCheck = { mode: 'verify-rows', roomField: '/room' };
    await writeFile(file, JSON.stringify({
      endpoints: ['syn.fan', 'syn.single'].map((id) => ({ id, menuId: 'syn', paramKeys: [], permission: 'syn:view', requiresScope: true, context: {}, limits: { maxRows: 2 }, mergeTimeDomain: false })),
      actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }],
      targets: Object.fromEntries(['syn-1', 'syn-2'].map((id) => [id, { kind: 'sql', dialect: 'postgres', connectionFile: secret }])),
      endpointOwners: {
        'syn.fan': { routes: [{ sites: ['SITE-A'], targets: ['syn-1', 'syn-2'] }], call, scopeCheck, merge: { sort: [{ field: 'id', direction: 'asc', unique: true }] } },
        'syn.single': { routes: [{ sites: ['SITE-A'], targets: ['syn-1'] }], call, scopeCheck },
      },
    }));
    const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test', MENU_UPSTREAM_TIMEOUT_MS: 10000 };
    const setup = await loadMenuDeclarationSetup(withMenuSnapshotFile(config), {
      checkService: createCheckService({ db: db.db }),
      fetch: (async () => new Response(JSON.stringify([{ site: 'SITE-A', rooms: ['R1'] }]))) as typeof fetch,
      connectorFactories: { sql: () => ({ async *query(leg) {
        if (behavior === 'failure' && leg.targetId === 'syn-2') throw new MenuUpstreamError('unavailable');
        const id = leg.targetId === 'syn-1' ? 2 : 1;
        for (let index = 0; index < (behavior === 'overflow' && leg.targetId === 'syn-2' ? 10 : 1); index++) yield { room: 'R1', id: id + index * 2, value: 'syn-healthy-value', private: 'syn-source-only' };
      } }) },
    });
    if (!setup) throw new Error('setup missing');
    app = await buildServer({ config, dbHandle: db, menuDispatch: setup.menuDispatch, ...(setup.scopeResolver ? { scopeResolver: setup.scopeResolver } : {}) });
    await app.ready();
    actorId = (await insertActorRow(db, { workspaceId: WORKSPACE_ID, externalId, displayName: 'Synthetic fan-out user', roleLevel: 'user' })).id;
    cookie = await loginAs(app, externalId);
  });
  beforeEach(() => { behavior = 'normal'; });
  afterAll(async () => {
    await app?.close();
    if (actorId) {
      for (const table of ['core.idempotency_keys', 'platform.usage_events', 'platform.client_errors', 'core.audit_log', 'permission.permission_grants', 'permission.permission_denies', 'core.sessions']) await migrate.pool.query(`delete from ${table} where actor_id = $1`, [actorId]);
      await migrate.pool.query('delete from core.actors where id = $1', [actorId]);
    }
    await db?.close(); await migrate?.close(); if (dir) await rm(dir, { recursive: true, force: true });
  });
  it('one site to N targets merges projected rows in core sort order', async () => {
    const hit = await query();
    expect(hit.statusCode).toBe(200);
    expect(hit.json()).toMatchObject({ outcome: 'ok', data: [{ id: 1, value: 'syn-healthy-value' }, { id: 2, value: 'syn-healthy-value' }], trust: null });
    expect(hit.body).not.toContain('syn-source-only');
  });
  it('a failed target returns 502 without healthy rows, target ids or source values', async () => {
    behavior = 'failure'; const hit = await query();
    expect(hit.statusCode).toBe(502); expect(hit.json()).toMatchObject({ code: 'upstream.unavailable' });
    for (const privateText of ['syn-healthy-value', 'syn-source-only', 'syn-private-secret', 'syn-1', 'syn-2']) expect(hit.body).not.toContain(privateText);
    expect(hit.json()).not.toHaveProperty('data');
  });
  it('one overflowing target returns too_large with data null', async () => {
    behavior = 'overflow'; const hit = await query();
    expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'too_large', data: null });
    expect(hit.body).not.toContain('syn-healthy-value');
  });
  it('a single target retains its existing projected result', async () => {
    const hit = await query('syn.single');
    expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'ok', data: [{ id: 2, value: 'syn-healthy-value' }] });
  });
});
