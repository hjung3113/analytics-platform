// #606a — a VOC carries an optional client error trace id; the operational detail links it to the
// identity-only client error report. Real Postgres through buildServer + app.inject.
import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { buildServer } from '../../../server.js';
import { SESSION_COOKIE_NAME, loginAs } from '../../../test-support/auth.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);

const SLUG = 'it-voc-trace-id';
const TRACE = `client-${randomUUID()}`;
const OTHER_TRACE = `client-${randomUUID()}`;

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

describe.skipIf(!runIntegration)('VOC trace id (#606a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let adminCookie: string;
  let reporterCookie: string;
  let managedSystemId: string;
  let adminActorId: string;
  let otherWorkspaceId: string;

  const hdr = (cookie: string, extra: Record<string, string> = {}) => ({
    cookie: `${SESSION_COOKIE_NAME}=${cookie}`,
    'content-type': 'application/json',
    ...extra,
  });

  function postVoc(body: Record<string, unknown>, key: string = randomUUID()) {
    return app.inject({
      method: 'POST',
      url: '/vocs',
      headers: hdr(reporterCookie, { 'idempotency-key': key }),
      payload: {
        primary_managed_system_id: managedSystemId,
        title: `trace title ${randomUUID()}`,
        description_rich_content: doc(`trace body ${randomUUID()}`),
        ...body,
      },
    });
  }

  const get = (url: string, cookie: string) =>
    app.inject({ method: 'GET', url, headers: hdr(cookie) });

  async function insertClientError(
    workspaceId: string,
    correlationId: string,
    menuId: string,
    receivedAt: string,
  ) {
    await migrate.pool.query(
      `insert into platform.client_errors
         (workspace_id, actor_id, correlation_id, menu_id, path, name, request_id, received_at)
       values ($1, $2, $3, $4, '/vocs', 'TypeError', 'req-1', $5)`,
      [workspaceId, adminActorId, correlationId, menuId, receivedAt],
    );
  }

  async function cleanup() {
    await migrate.pool.query(
      `delete from voc.vocs where primary_managed_system_id in
         (select id from core.managed_systems where slug = $1)`,
      [SLUG],
    );
    await migrate.pool.query(`delete from platform.client_errors where request_id = 'req-1'`);
    await migrate.pool.query('delete from core.idempotency_keys');
    await migrate.pool.query('delete from core.rate_limits');
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    adminCookie = await loginAs(app, 'mock-admin-1');
    reporterCookie = await loginAs(app, 'mock-user-1');
    const a = await dbHandle.pool.query<{ id: string }>(
      `select id from core.actors where external_id = 'mock-admin-1' and workspace_id = $1`,
      [WORKSPACE_ID],
    );
    adminActorId = a.rows[0]?.id ?? '';
    const w = await migrate.pool.query<{ id: string }>(
      `select id from core.workspaces where id <> $1 limit 1`,
      [WORKSPACE_ID],
    );
    otherWorkspaceId = w.rows[0]?.id ?? '';
  });

  beforeEach(async () => {
    await cleanup();
    const found = await migrate.pool.query<{ id: string }>(
      `select id from core.managed_systems where slug = $1 and workspace_id = $2`,
      [SLUG, WORKSPACE_ID],
    );
    if (found.rows[0]) managedSystemId = found.rows[0].id;
    else {
      const res = await app.inject({
        method: 'POST',
        url: '/managed-systems',
        headers: hdr(adminCookie),
        payload: { slug: SLUG, name: SLUG },
      });
      expect(res.statusCode).toBe(201);
      managedSystemId = res.json().id;
    }
  });

  afterAll(async () => {
    await cleanup();
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  it('stores a valid trace id and echoes it', async () => {
    const res = await postVoc({ trace_id: TRACE });
    expect(res.statusCode).toBe(201);
    expect(res.json().trace_id).toBe(TRACE);
    const row = await migrate.pool.query(`select trace_id from voc.vocs where id = $1`, [
      res.json().id,
    ]);
    expect(row.rows[0]?.trace_id).toBe(TRACE);
  });

  it('stores null when absent', async () => {
    const res = await postVoc({});
    expect(res.statusCode).toBe(201);
    const row = await migrate.pool.query(`select trace_id from voc.vocs where id = $1`, [
      res.json().id,
    ]);
    expect(row.rows[0]?.trace_id).toBeNull();
  });

  it.each([
    ['no client- prefix', 'abc-123'],
    ['over 80 characters', `client-${'a'.repeat(74)}`],
    ['illegal characters', 'client-a b/c'],
    ['empty', ''],
  ])('rejects an invalid trace id: %s', async (_n, bad) => {
    const res = await postVoc({ trace_id: bad });
    expect(res.statusCode).toBe(422);
    expect(res.json().detail.fields[0].path).toEqual(['trace_id']);
  });

  it('replays the same key and trace id; a different trace id is a key-reuse conflict', async () => {
    const key = randomUUID();
    const fixed = { title: 'replay title', description_rich_content: doc('replay body') };
    const first = await postVoc({ ...fixed, trace_id: TRACE }, key);
    expect(first.statusCode, first.body).toBe(201);
    const replay = await postVoc({ ...fixed, trace_id: TRACE }, key);
    expect(replay.statusCode).toBe(first.statusCode);
    expect(replay.json().id).toBe(first.json().id);
    const other = await postVoc({ ...fixed, trace_id: OTHER_TRACE }, key);
    expect(other.statusCode).toBe(409);
    expect(other.json().code).toBe('conflict.idempotency_key_reuse');
  });

  it('exposes trace_id on detail and list rows, null when unset', async () => {
    const withTrace = (await postVoc({ trace_id: TRACE })).json().id;
    const without = (await postVoc({})).json().id;
    for (const cookie of [adminCookie, reporterCookie]) {
      const d = await get(`/vocs/${withTrace}`, cookie);
      expect(d.statusCode, d.body).toBe(200);
      expect(d.json().trace_id).toBe(TRACE);
      expect((await get(`/vocs/${without}`, cookie)).json().trace_id).toBeNull();
    }
    const list = await get(`/vocs?view=my&managed_system_id=${managedSystemId}&limit=100`, reporterCookie);
    const byId = new Map(list.json().items.map((i: { id: string }) => [i.id, i]));
    expect((byId.get(withTrace) as { trace_id: string }).trace_id).toBe(TRACE);
    expect((byId.get(without) as { trace_id: null }).trace_id).toBeNull();
  });

  it('filters the list by exact trace id', async () => {
    const created = await postVoc({ trace_id: TRACE });
    expect(created.statusCode, created.body).toBe(201);
    const hit = created.json().id;
    await postVoc({ trace_id: OTHER_TRACE });
    await postVoc({});
    const res = await get(`/vocs?view=my&managed_system_id=${managedSystemId}&filter.trace_id=${TRACE}`, reporterCookie);
    expect(res.statusCode).toBe(200);
    expect(res.json().items.map((i: { id: string }) => i.id)).toEqual([hit]);
    const prefix = await get(`/vocs?view=my&managed_system_id=${managedSystemId}&filter.trace_id=${TRACE.slice(0, -1)}`, reporterCookie);
    expect(prefix.json().items).toEqual([]);
  });

  it("another workspace's client error never matches", async () => {
    if (!otherWorkspaceId) return;
    const id = (await postVoc({ trace_id: TRACE })).json().id;
    await insertClientError(otherWorkspaceId, TRACE, 'foreign-menu', '2026-01-01T00:00:00Z');
    const body = (await get(`/vocs/${id}`, adminCookie)).json();
    expect(body.error_report).toEqual({
      reported: false,
      menu_id: null,
      path: null,
      name: null,
      reported_at: null,
    });
  });

  it('operational detail links the earliest same-workspace report; null without a trace id', async () => {
    const id = (await postVoc({ trace_id: TRACE })).json().id;
    const plain = (await postVoc({})).json().id;
    await insertClientError(WORKSPACE_ID, TRACE, 'later-menu', '2026-02-01T00:00:00Z');
    await insertClientError(WORKSPACE_ID, TRACE, 'first-menu', '2026-01-01T00:00:00Z');
    const body = (await get(`/vocs/${id}`, adminCookie)).json();
    expect(body.error_report).toEqual({
      reported: true,
      menu_id: 'first-menu',
      path: '/vocs',
      name: 'TypeError',
      reported_at: '2026-01-01T00:00:00.000Z',
    });
    expect(Object.keys(body.error_report).sort()).toEqual([
      'menu_id',
      'name',
      'path',
      'reported',
      'reported_at',
    ]);
    expect((await get(`/vocs/${plain}`, adminCookie)).json().error_report).toBeNull();
  });

  it('reports reported:false when no report matches', async () => {
    const id = (await postVoc({ trace_id: TRACE })).json().id;
    const body = (await get(`/vocs/${id}`, adminCookie)).json();
    expect(body.error_report.reported).toBe(false);
  });

  it('reporter and public views never contain error_report', async () => {
    const id = (await postVoc({ trace_id: TRACE })).json().id;
    await insertClientError(WORKSPACE_ID, TRACE, 'first-menu', '2026-01-01T00:00:00Z');
    const own = (await get(`/vocs/${id}`, reporterCookie)).json();
    expect(own.trace_id).toBe(TRACE);
    expect(own).not.toHaveProperty('error_report');
    const publicDetail = await get(`/vocs/public/${id}`, reporterCookie);
    if (publicDetail.statusCode === 200) {
      const text = publicDetail.body;
      expect(text).not.toContain(TRACE);
      expect(text).not.toContain('error_report');
      expect(text).not.toContain('trace_id');
    }
    const publicList = await get('/vocs/public?mine=true', reporterCookie);
    expect(publicList.body).not.toContain(TRACE);
    expect(publicList.body).not.toContain('trace_id');
  });
});
