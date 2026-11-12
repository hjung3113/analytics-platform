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
import { uid } from '../../../test-support/ids.js';
import { MenuUpstreamError } from '../forwarder.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const externalId = uid('syn-fan-d2');

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE_ID)('coverage and paging through deployment setup and HTTP', () => {
  let db: DbHandle; let migrate: DbHandle; let app: FastifyInstance;
  let actorId: string | undefined; let dir: string; let cookie: string;
  let behavior: 'normal' | 'failure' = 'normal';
  const query = (endpoint = 'syn.partial', params: Record<string, unknown> = {}) => app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint, context: { scopeId: 'SITE-A' }, params } });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; db = createDb(APP_URL); migrate = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'syn-fan-d2-it-'));
    const secret = join(dir, 'secret'); const file = join(dir, 'bundle.json');
    await writeFile(secret, 'syn-private-secret');
    const call = { statement: 'SELECT :rooms', params: { rooms: 'scope.rooms' }, response: { fields: { id: { from: '/id', type: 'number' }, value: { from: '/value', type: 'string' } } } };
    const scopeCheck = { mode: 'verify-rows', roomField: '/room' };
    await writeFile(file, JSON.stringify({
      endpoints: [
        { id: 'syn.partial', menuId: 'syn', paramKeys: [], permission: 'syn:view', requiresScope: true, context: {}, limits: { maxRows: 4 }, kinds: ['coverage', 'collection'], mergeTimeDomain: false },
        { id: 'syn.page', menuId: 'syn', paramKeys: ['page', 'pageSize', 'sorting'], permission: 'syn:view', requiresScope: true, context: {}, kinds: [], mergeTimeDomain: false },
      ],
      actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }],
      targets: Object.fromEntries(['syn-1', 'syn-2'].map((id) => [id, { kind: 'sql', dialect: 'postgres', connectionFile: secret }])),
      endpointOwners: {
        'syn.partial': { routes: [{ sites: ['SITE-A'], targets: ['syn-1', 'syn-2'] }], call, scopeCheck, merge: { partial: 'coverage', sort: [{ field: 'id', direction: 'asc', unique: true }] } },
        'syn.page': { routes: [{ sites: ['SITE-A'], targets: ['syn-1', 'syn-2'] }], call, scopeCheck, merge: { maxWindow: 4, sort: [{ field: 'value', direction: 'asc' }, { field: 'id', direction: 'asc', unique: true }] } },
      },
    }));
    const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test', MENU_UPSTREAM_TIMEOUT_MS: 10000 };
    const setup = await loadMenuDeclarationSetup(config, {
      checkService: createCheckService({ db: db.db }),
      fetch: (async () => new Response(JSON.stringify([{ site: 'SITE-A', rooms: ['R1'] }]))) as typeof fetch,
      connectorFactories: { sql: () => ({ async *query(leg) {
        if (behavior === 'failure' && leg.targetId === 'syn-2') throw new MenuUpstreamError('unavailable');
        const id = leg.targetId === 'syn-1' ? 2 : 1;
        for (let index = 0; index < 2; index++) yield { room: 'R1', id: id + index * 2, value: 'syn-healthy-value', private: 'syn-source-only' };
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
  it('partial failure returns successful rows and confirmed coverage without private identifiers or text', async () => {
    behavior = 'failure'; const hit = await query();
    expect(hit.statusCode).toBe(200);
    expect(hit.json()).toMatchObject({ outcome: 'ok', data: [{ id: 2, value: 'syn-healthy-value' }, { id: 4, value: 'syn-healthy-value' }], assessments: [
      { kind: 'coverage', state: 'confirmed', statusSource: 'upstream-routing', detail: '1', observedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/) },
      { kind: 'collection', state: 'unknown', reason: 'source_unavailable' },
    ], trust: null });
    expect(hit.json().assessments).toHaveLength(2);
    for (const text of ['syn-1', 'syn-2', 'syn-source-only', 'syn-private-secret', 'menu-query upstream is unavailable']) expect(hit.body).not.toContain(text);
  });
  it('pages 0 and 1 are disjoint and complete, with total measured before slicing', async () => {
    const first = await query('syn.page', { page: 0, pageSize: 2, sorting: [{ id: 'value', desc: true }] });
    const second = await query('syn.page', { page: 1, pageSize: 2, sorting: [{ id: 'value', desc: true }] });
    expect(first.statusCode).toBe(200); expect(second.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ outcome: 'ok', data: { rows: [{ id: 1 }, { id: 2 }], total: 4 } });
    expect(second.json()).toMatchObject({ outcome: 'ok', data: { rows: [{ id: 3 }, { id: 4 }], total: 4 } });
    for (const hit of [first, second]) expect(hit.body).not.toContain('syn-source-only');
  });
});
