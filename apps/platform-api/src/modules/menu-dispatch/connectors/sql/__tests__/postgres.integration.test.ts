import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../../../config.js';
import { createDb, type DbHandle } from '../../../../../db/client.js';
import { loadMenuDeclarationSetup } from '../../../../../menu-declarations.js';
import { SESSION_COOKIE_NAME } from '../../../../../middleware/require-session.js';
import { createCheckService } from '../../../../permissions/index.js';
import { buildServer } from '../../../../../server.js';
import { insertActorRow } from '../../../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../../../test-support/auth.js';
import { uid } from '../../../../../test-support/ids.js';
import { createSyntheticSqlTarget, syntheticRows, type SyntheticSqlTarget } from '../../../../../test-support/synthetic-targets.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const applicationName = `syn-sql-${process.pid}`;
const externalId = uid('syn-sql');
const endpoint = (id: string, maxRows = 20) => ({ id: `syn.${id}`, menuId: 'syn', paramKeys: [], permission: 'syn:view', requiresScope: true, context: { roomNames: 'apply' }, limits: { maxRows }, kinds: ['collection'], mergeTimeDomain: false });

describe.skipIf(!runIntegration)('postgres connector through production setup and HTTP', () => {
  let db: DbHandle; let migrate: DbHandle; let app: FastifyInstance;
  let actorId: string | undefined; let dir: string; let cookie: string;
  const sources: SyntheticSqlTarget[] = [];
  let grants: { site: string; rooms: string[] }[];
  const logs: unknown[] = [];
  const query = (id: string, site = 'SITE-A', rooms: string[] | null = ['RA1']) => app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` }, payload: { endpoint: `syn.${id}`, context: { scopeId: site, roomNames: rooms }, params: {} } });
  const activity = () => migrate.pool.query('SELECT pid, state, xact_start, query FROM pg_stat_activity WHERE application_name = $1', [applicationName]);
  beforeAll(async () => {
    process.env.NODE_ENV = 'test'; db = createDb(APP_URL); migrate = createDb(MIGRATE_URL);
    dir = await mkdtemp(join(tmpdir(), 'syn-postgres-it-'));
    for (const shard of [1, 2]) {
      sources.push(await createSyntheticSqlTarget({ migrateUrl: MIGRATE_URL, schema: `syn_sql_${process.pid}_${shard}`, appUrl: APP_URL, rows: shard === 1 ? [...syntheticRows('SITE-A', 'RA1', 3), ...syntheticRows('SITE-A', 'RA2', 1, 10), ...syntheticRows('SITE-B', 'RB1', 1, 20), ...syntheticRows('SITE-C', 'RC1', 1, 30)] : syntheticRows('SITE-C', 'RC2', 1, 40) }));
    }
    const targets: Record<string, unknown> = {};
    for (const [index, source] of sources.entries()) {
      const file = join(dir, `secret-${index}`); await writeFile(file, source.connectionString, { mode: 0o600 });
      targets[`tgt-${index + 1}`] = { kind: 'sql', dialect: 'postgres', connectionFile: file, applicationName };
    }
    const table = sources[0]?.table; if (!table) throw new Error('missing synthetic table');
    // A data-modifying CTE cannot be DECLAREd as a cursor in PostgreSQL. A volatile invoker
    // function makes the same writing SELECT cursor-valid, so READ ONLY is the decisive guard.
    const writer = table.replace(/\.rows$/, '.delete_rows');
    await migrate.pool.query(`CREATE FUNCTION ${writer}(wanted_site text, wanted_rooms text[]) RETURNS SETOF ${table} LANGUAGE sql VOLATILE SECURITY INVOKER AS $$ DELETE FROM ${table} WHERE site = wanted_site AND room = ANY(wanted_rooms) RETURNING * $$`);
    const call = (statement: string) => ({ statement, params: { site: 'scope.site', rooms: 'scope.rooms' } });
    const check = (mode = 'verify-rows') => ({ mode, siteField: '/site', roomField: '/room' });
    const sharedRoute = [{ sites: ['SITE-A', 'SITE-B'], targets: ['tgt-1'] }];
    const filtered = `SELECT *, 9007199254740993::int8 AS precise, 1.234567890123456789::numeric AS decimal, '2026-11-01'::date AS day FROM ${table} WHERE site = :site AND room = ANY(:rooms::text[]) ORDER BY seq`;
    const unfiltered = `SELECT * FROM ${table} WHERE :site::text IS NOT NULL AND cardinality(:rooms::text[]) > 0 ORDER BY seq`;
    const file = join(dir, 'bundle.json');
    await writeFile(file, JSON.stringify({ endpoints: [endpoint('shared'), endpoint('split'), endpoint('verify'), endpoint('drop'), endpoint('overflow', 2), endpoint('slow'), endpoint('write')], actions: [], permissions: [{ permission: 'syn:view', capability: 'workspace.read' }], targets,
      endpointOwners: {
        'syn.shared': { routes: sharedRoute, call: call(filtered), scopeCheck: check() },
        'syn.split': { routes: sources.map((source, i) => ({ sites: ['SITE-C'], rooms: [`RC${i + 1}`], targets: [`tgt-${i + 1}`], call: call(`SELECT * FROM ${source.table} WHERE site = :site AND room = ANY(:rooms::text[])`) })), scopeCheck: check() },
        'syn.verify': { routes: sharedRoute, call: call(unfiltered), scopeCheck: check() },
        'syn.drop': { routes: sharedRoute, call: call(unfiltered), scopeCheck: check('drop-rows') },
        'syn.overflow': { routes: sharedRoute, call: call(filtered), scopeCheck: check() },
        'syn.slow': { routes: sharedRoute, call: call(`SELECT *, pg_sleep(5) FROM ${table} WHERE site = :site AND room = ANY(:rooms::text[])`), scopeCheck: check() },
        'syn.write': { routes: sharedRoute, call: call(`SELECT * FROM ${writer}(:site, :rooms::text[])`), scopeCheck: check() },
      },
    }));
    const config = { ...loadConfig(), MENU_DECLARATIONS_FILE: file, MENU_SCOPE_GRANT_SERVICE_URL: 'https://grants.test', MENU_UPSTREAM_TIMEOUT_MS: 2400 };
    const setup = await loadMenuDeclarationSetup(config, { checkService: createCheckService({ db: db.db }), fetch: (async () => new Response(JSON.stringify(grants))) as typeof fetch, log: (entry) => logs.push(entry) });
    if (!setup) throw new Error('missing setup');
    app = await buildServer({ config, dbHandle: db, menuDispatch: setup.menuDispatch, ...(setup.scopeResolver ? { scopeResolver: setup.scopeResolver } : {}) }); await app.ready();
    actorId = (await insertActorRow(db, { workspaceId: WORKSPACE_ID, externalId, displayName: 'Synthetic SQL user', roleLevel: 'user' })).id;
    cookie = await loginAs(app, externalId);
  });
  beforeEach(() => { logs.length = 0; grants = [{ site: 'SITE-A', rooms: ['RA1', 'RA2'] }, { site: 'SITE-B', rooms: ['RB1'] }, { site: 'SITE-C', rooms: ['RC1', 'RC2'] }]; });
  afterAll(async () => {
    await app?.close();
    // Close synthetic upstream connections before dropping schemas and their grants.
    if (migrate) {
      await db.pool.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name = $1', [applicationName]);
      for (const source of sources) await source.drop();
      if (actorId) {
        for (const table of ['core.idempotency_keys', 'platform.usage_events', 'platform.client_errors', 'core.audit_log', 'permission.permission_grants', 'permission.permission_denies', 'core.sessions']) await migrate.pool.query(`delete from ${table} where actor_id = $1`, [actorId]);
        await migrate.pool.query('delete from core.actors where id = $1', [actorId]);
      }
    }
    await db?.close(); await migrate?.close(); if (dir) await rm(dir, { recursive: true, force: true });
  });
  it('no grant is forbidden without opening any upstream connection', async () => {
    grants = []; const before = (await activity()).rows;
    const hit = await query('shared'); expect(hit.json()).toMatchObject({ outcome: 'forbidden', data: null });
    expect((await activity()).rows).toEqual(before); expect(logs).toEqual([]);
  });
  it.each([['SITE-A', 'RA1', 3], ['SITE-B', 'RB1', 1]])('shared target reads only %s', async (site, room, count) => {
    const hit = await query('shared', site, [room]); expect(hit.statusCode).toBe(200); expect(hit.json().outcome).toBe('ok');
    expect(hit.json().data).toHaveLength(count); for (const row of hit.json().data) expect(row).toMatchObject({ site, room, precise: '9007199254740993', decimal: '1.234567890123456789', day: '2026-11-01' });
    expect(hit.json().data[0].at).toBe('2026-11-01 00:00:00');
  });
  it.each(['RC1', 'RC2'])('split site reads the declared room shard %s', async (room) => {
    const hit = await query('split', 'SITE-C', [room]); expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'ok', data: [{ site: 'SITE-C', room }] });
  });
  it('null roomNames reads exactly granted rooms', async () => {
    grants = [{ site: 'SITE-A', rooms: ['RA2'] }];
    expect((await query('shared', 'SITE-A', null)).json()).toMatchObject({ outcome: 'ok', data: [{ site: 'SITE-A', room: 'RA2' }] });
  });
  it('verify violation fails closed with no source row in body or logs', async () => {
    const hit = await query('verify'); expect(hit.statusCode).toBe(502); expect(hit.body + JSON.stringify(logs)).not.toContain('SITE-B'); expect(hit.body).not.toContain('9007199254740993');
  });
  it('drop-rows removes other rooms and sites from response and logs', async () => {
    const hit = await query('drop'); expect(hit.statusCode).toBe(200); expect(hit.json().data).toHaveLength(3);
    expect(hit.body + JSON.stringify(logs)).not.toContain('RB1'); expect(hit.body + JSON.stringify(logs)).not.toContain('RA2');
  });
  it('overflow returns data null and closes its transaction/cursor', async () => {
    expect((await query('overflow')).json()).toMatchObject({ outcome: 'too_large', data: null });
    await expect.poll(async () => (await activity()).rows.filter((row) => row.xact_start !== null)).toEqual([]);
  });
  it('statement judgment timeout is a 200 timeout envelope', async () => {
    const hit = await query('slow'); expect(hit.statusCode).toBe(200); expect(hit.json()).toMatchObject({ outcome: 'timeout', data: null });
  });
  it('SELECT-only table grant refuses the writing statement and rows remain', async () => {
    const table = sources[0]?.table;
    if (!table) throw new Error('missing synthetic table');
    const writer = table.replace(/\.rows$/, '.delete_rows');
    const before = await migrate.pool.query(`SELECT * FROM ${table} ORDER BY seq`);
    expect((await db.pool.query('SELECT has_table_privilege(current_user, $1, $2) AS allowed', [table, 'DELETE'])).rows).toEqual([{ allowed: false }]);
    await expect(db.pool.query(`SELECT * FROM ${writer}($1, $2)`, ['SITE-A', ['RA1']])).rejects.toMatchObject({ code: '42501' });
    const hit = await query('write'); expect(hit.statusCode).toBe(502);
    expect((await migrate.pool.query(`SELECT * FROM ${table} ORDER BY seq`)).rows).toEqual(before.rows);
  });
  it('READ ONLY refuses the same writing statement even with DELETE granted and rows remain', async () => {
    const table = sources[0]?.table;
    if (!table) throw new Error('missing synthetic table');
    const reader = decodeURIComponent(new URL(APP_URL).username);
    if (!/^[a-z_][a-z0-9_]{0,62}$/.test(reader)) throw new Error('invalid synthetic reader');
    const writer = table.replace(/\.rows$/, '.delete_rows');
    const before = await migrate.pool.query(`SELECT * FROM ${table} ORDER BY seq`);
    await migrate.pool.query(`GRANT DELETE ON ${table} TO ${reader}`);
    try {
      expect((await db.pool.query('SELECT has_table_privilege(current_user, $1, $2) AS allowed', [table, 'DELETE'])).rows).toEqual([{ allowed: true }]);
      // Positive control: this exact statement can write in a normal transaction. Roll it back.
      const client = await db.pool.connect();
      try {
        await client.query('BEGIN');
        expect((await client.query(`SELECT * FROM ${writer}($1, $2)`, ['SITE-A', ['RA1']])).rows).toHaveLength(3);
      } finally { await client.query('ROLLBACK'); client.release(); }
      const hit = await query('write'); expect(hit.statusCode).toBe(502);
      expect((await migrate.pool.query(`SELECT * FROM ${table} ORDER BY seq`)).rows).toEqual(before.rows);
    } finally { await migrate.pool.query(`REVOKE DELETE ON ${table} FROM ${reader}`); }
  });
});
