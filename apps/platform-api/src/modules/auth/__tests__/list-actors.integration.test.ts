// Integration tests for GET /actors?workspace=current (post-#21 drift fix).
//
// Verifies the route closes the FE→BE drift exposed by Triage OwnerPicker:
// shape, auth gating, sort order, and workspace param sentinel.

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { defined } from '../../../test-support/defined.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && WORKSPACE_ID);

function extractSessionCookie(setCookie: string | string[] | undefined): string | null {
  if (!setCookie) return null;
  const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of arr) {
    const m = c.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
    if (m?.[1]) return m[1];
  }
  return null;
}

async function loginAs(app: FastifyInstance, externalId: string): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/mock-login',
    headers: { 'user-agent': 'integration-test' },
    payload: { external_id: externalId },
  });
  const cookie = extractSessionCookie(res.headers['set-cookie']);
  if (!cookie) throw new Error(`mock-login failed: ${res.statusCode} ${res.body}`);
  return cookie;
}

describe.skipIf(!runIntegration)('GET /actors?workspace=current', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    await dbHandle.pool.query(
      `delete from core.sessions where created_user_agent_summary = 'integration-test'`,
    );
    await app?.close();
    await dbHandle?.close();
  });

  it('200 returns the caller workspace actors sorted by display_name then id', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'GET',
      url: '/actors?workspace=current',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      actors: Array<{
        id: string;
        display_name: string;
        email: string;
        role_level: 'admin' | 'developer' | 'user';
      }>;
    };
    expect(Array.isArray(body.actors)).toBe(true);
    // Seed guarantees at least mock-admin-1, mock-user-1, system.
    expect(body.actors.length).toBeGreaterThanOrEqual(3);
    // Stable sort assertion: each pair must be (display_name, id) non-decreasing.
    for (let i = 1; i < body.actors.length; i += 1) {
      const a = defined(body.actors[i - 1]);
      const b = defined(body.actors[i]);
      const cmpName = a.display_name.localeCompare(b.display_name);
      expect(cmpName <= 0).toBe(true);
      if (cmpName === 0) {
        expect(a.id.localeCompare(b.id) <= 0).toBe(true);
      }
    }
    // Shape: every actor row has the four expected snake_case fields.
    for (const a of body.actors) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.display_name).toBe('string');
      expect(typeof a.email).toBe('string');
      expect(['admin', 'developer', 'user']).toContain(a.role_level);
    }
  });

  it('200 returns ONLY the caller workspace actors (no cross-workspace leakage)', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'GET',
      url: '/actors?workspace=current',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { actors: Array<{ id: string }> };
    // Count DB-side how many actor rows live in the caller's workspace, and
    // compare to the response length. If a future patch accidentally drops
    // the WHERE workspace_id filter, this row count diverges.
    const { rows } = await dbHandle.pool.query<{ n: string }>(
      `select count(*)::text as n from core.actors where workspace_id = $1`,
      [WORKSPACE_ID],
    );
    const expectedCount = Number(rows[0]?.n ?? '0');
    expect(body.actors.length).toBe(expectedCount);
  });

  it('401 auth.session_invalid without session cookie', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/actors?workspace=current',
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ code: 'auth.session_invalid' });
  });

  it('422 validation.failed when workspace param is anything other than "current"', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'GET',
      url: '/actors?workspace=other',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'validation.failed' });
  });

  it('422 validation.failed when workspace param is missing', async () => {
    const cookie = await loginAs(app, 'mock-admin-1');
    const res = await app.inject({
      method: 'GET',
      url: '/actors',
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: 'validation.failed' });
  });
});

// #1443: the system-actor picker must not mix human identities into service token issuance.
describe.skipIf(!runIntegration)('GET /actors actorType filter', () => {
  let dbHandle: DbHandle;
  let app: FastifyInstance;
  let cookie: string;
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    await dbHandle.pool.query("delete from core.rate_limits where key like '127.0.0.%'");
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    cookie = await loginAs(app, 'mock-admin-1');
  });
  afterAll(async () => { await app?.close(); await dbHandle?.close(); });
  it.each(['system', 'internal_member'])('returns only workspace actors of type %s', async actorType => {
    const response = await app.inject({ method: 'GET', url: `/actors?workspace=current&actorType=${actorType}`, headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { actors: { id: string; actor_type: string }[] };
    const expected = await dbHandle.pool.query<{ id: string }>('select id from core.actors where workspace_id = $1 and actor_type = $2 order by display_name, id', [WORKSPACE_ID, actorType]);
    expect(body.actors.map(actor => actor.id)).toEqual(expected.rows.map(actor => actor.id));
    expect(body.actors.length).toBeGreaterThan(0);
    expect(body.actors.every(actor => actor.actor_type === actorType)).toBe(true);
  });
  it('rejects an unknown actor type with validation fields', async () => {
    const response = await app.inject({ method: 'GET', url: '/actors?workspace=current&actorType=unknown', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    expect(response.statusCode).toBe(422);
    expect(response.json()).toMatchObject({ code: 'validation.failed', detail: { fields: expect.any(Array) } });
  });
  it('preserves ordinary-session read access when filtering', async () => {
    const userCookie = await loginAs(app, 'mock-user-1');
    const response = await app.inject({ method: 'GET', url: '/actors?workspace=current&actorType=system', headers: { cookie: `${SESSION_COOKIE_NAME}=${userCookie}` } });
    expect(response.statusCode).toBe(200);
    expect(response.json().actors.every((actor: { actor_type: string }) => actor.actor_type === 'system')).toBe(true);
  });
});
