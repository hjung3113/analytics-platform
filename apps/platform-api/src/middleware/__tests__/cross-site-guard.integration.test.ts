import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../config.js';
import { type DbHandle, createDb } from '../../db/client.js';
import { buildServer } from '../../server.js';
import { insertActorRow } from '../../test-support/actor-fixtures.js';
import { hashToken } from '../../modules/api-tokens/token-format.js';
import { SESSION_COOKIE_NAME } from '../require-session.js';

// #1674: a state-changing request that carries the session cookie and a `Sec-Fetch-Site` other than `same-origin` is refused
// before the body parsers and any handler. `text/plain` and `multipart/form-data` are the two encodings an HTML form can send.

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = `xsite-${randomUUID().slice(0, 8)}`;
const CROSS_SITE_CODE = 'permission.cross_site_request';

interface Person {
  id: string;
  sid: string;
  csrf: string;
}
interface Target {
  url: string;
  /** A value that changes if the handler ran (undefined: no row to watch, see `watched`). */
  probe?: () => Promise<string>;
}
interface RouteCase {
  name: string;
  as: 'user' | 'admin';
  make: () => Promise<Target>;
  /** Same-origin outcome that proves the handler was reached. */
  okStatus: number[];
}

describe.skipIf(!runIntegration)('cross-site guard (#1674)', () => {
  let app: FastifyInstance;
  let appDb: DbHandle;
  let migrateDb: DbHandle;
  let user: Person;
  let admin: Person;
  const actorIds: string[] = [];
  const systemIds: string[] = [];
  let ipCounter = 0;

  const one = async (sql: string, params: unknown[] = []) => (await migrateDb.pool.query(sql, params)).rows[0];

  async function person(role: 'user' | 'admin'): Promise<Person> {
    const { id } = await insertActorRow(migrateDb, { workspaceId: WORKSPACE_ID, externalId: `${PREFIX}-${role}`, roleLevel: role });
    actorIds.push(id);
    const sid = randomUUID();
    const csrf = `csrf-${randomUUID()}`;
    await migrateDb.pool.query(
      `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary, csrf_token)
       values ($1,$2,$3, now() + interval '1 hour', now(), now(), 'itest', $4)`,
      [sid, id, WORKSPACE_ID, csrf],
    );
    return { id, sid, csrf };
  }

  async function managedSystem(): Promise<string> {
    const r = await one('insert into core.managed_systems (workspace_id, slug, name) values ($1,$2,$2) returning id', [WORKSPACE_ID, `${PREFIX}-${randomUUID().slice(0, 8)}`]);
    systemIds.push(r.id);
    return r.id as string;
  }

  async function token(owner: Person, kind: 'personal' | 'service', value?: string): Promise<string> {
    const secret = value ?? `ap_${randomUUID().slice(0, 8)}_${randomUUID()}${randomUUID()}`.slice(0, 60);
    const r = await one(
      `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by)
       values ($1,$2,$3,'itest',$4,$5,$6,$2) returning id`,
      [WORKSPACE_ID, owner.id, kind, randomUUID().replace(/-/g, '').slice(0, 8), hashToken(secret), []],
    );
    return r.id as string;
  }

  const cases: RouteCase[] = [
    {
      name: 'POST /notifications/:id/read',
      as: 'user',
      okStatus: [200],
      make: async () => {
        const r = await one(
          `insert into core.notifications (id, workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail, correlation_id, created_at)
           values ($1,$2,$3,'voc.reporter_replied','voc',$4,'x','{}'::jsonb,$5, now()) returning id`,
          [randomUUID(), WORKSPACE_ID, user.id, randomUUID(), randomUUID()],
        );
        return { url: `/notifications/${r.id}/read`, probe: async () => String((await one('select read_at from core.notifications where id = $1', [r.id])).read_at) };
      },
    },
    {
      name: 'POST /notifications/:id/archive',
      as: 'user',
      okStatus: [200],
      make: async () => {
        const r = await one(
          `insert into core.notifications (id, workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail, correlation_id, created_at)
           values ($1,$2,$3,'voc.reporter_replied','voc',$4,'x','{}'::jsonb,$5, now()) returning id`,
          [randomUUID(), WORKSPACE_ID, user.id, randomUUID(), randomUUID()],
        );
        return { url: `/notifications/${r.id}/archive`, probe: async () => String((await one('select archived_at from core.notifications where id = $1', [r.id])).archived_at) };
      },
    },
    {
      name: 'POST /api-tokens/:id/revoke',
      as: 'user',
      okStatus: [200],
      make: async () => {
        const id = await token(user, 'personal');
        return { url: `/api-tokens/${id}/revoke`, probe: async () => String((await one('select revoked_at from core.api_tokens where id = $1', [id])).revoked_at) };
      },
    },
    {
      name: 'POST /api-tokens/service/:id/revoke',
      as: 'admin',
      okStatus: [200],
      make: async () => {
        const id = await token(admin, 'service');
        return { url: `/api-tokens/service/${id}/revoke`, probe: async () => String((await one('select revoked_at from core.api_tokens where id = $1', [id])).revoked_at) };
      },
    },
    {
      name: 'POST /managed-systems/:id/archive',
      as: 'admin',
      okStatus: [200],
      make: async () => {
        const id = await managedSystem();
        return { url: `/managed-systems/${id}/archive`, probe: async () => String((await one('select archived_at from core.managed_systems where id = $1', [id])).archived_at) };
      },
    },
    {
      name: 'POST /analytics-areas/:id/archive',
      as: 'admin',
      okStatus: [200],
      make: async () => {
        const ms = await managedSystem();
        const r = await one('insert into core.analytics_areas (workspace_id, managed_system_id, slug, name) values ($1,$2,$3,$3) returning id', [WORKSPACE_ID, ms, `${PREFIX}-aa-${randomUUID().slice(0, 6)}`]);
        return { url: `/analytics-areas/${r.id}/archive`, probe: async () => String((await one('select archived_at from core.analytics_areas where id = $1', [r.id])).archived_at) };
      },
    },
    // The VOC recommendation fixtures need a clustering run; a random id still reaches the handler on a same-origin call (non-403 cross-site answer).
    ...(['dismiss', 'confirm'] as const).map<RouteCase>((action) => ({
      name: `POST /vocs/:id/recommendations/:candidate_id/${action}`,
      as: 'user',
      okStatus: [403, 404, 422],
      make: async () => ({ url: `/vocs/${randomUUID()}/recommendations/${randomUUID()}/${action}` }),
    })),
    {
      name: 'POST /auth/logout',
      as: 'user',
      okStatus: [204],
      make: async () => {
        // A throwaway session of the same actor, so logging out does not end the shared one.
        return { url: '/auth/logout', probe: async () => '' };
      },
    },
  ];

  const encodings: Array<{ name: string; headers: Record<string, string>; payload: string }> = [
    { name: 'text/plain', headers: { 'content-type': 'text/plain' }, payload: 'a=b' },
    {
      name: 'multipart/form-data',
      headers: { 'content-type': 'multipart/form-data; boundary=xsite' },
      payload: '--xsite\r\nContent-Disposition: form-data; name="a"\r\n\r\nb\r\n--xsite--\r\n',
    },
  ];

  /** Each call gets its own client address so the per-IP buckets of unrelated calls never interact. */
  const send = (p: Person, target: Target, extra: Record<string, string>, body?: { headers: Record<string, string>; payload: string }, cookie?: string) =>
    app.inject({
      method: 'POST',
      url: target.url,
      remoteAddress: `10.77.${(ipCounter >> 8) & 255}.${(++ipCounter & 255) || 1}`,
      headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie ?? p.sid}`, ...(body?.headers ?? {}), ...extra },
      ...(body ? { payload: body.payload } : {}),
    });

  const person_ = (as: 'user' | 'admin') => (as === 'admin' ? admin : user);

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    appDb = createDb(APP_URL);
    migrateDb = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: appDb });
    await app.ready();
    user = await person('user');
    admin = await person('admin');
  });

  afterAll(async () => {
    await app?.close();
    await migrateDb.pool.query('delete from core.api_tokens where actor_id = any($1::uuid[])', [actorIds]);
    await migrateDb.pool.query('delete from core.notifications where actor_id = any($1::uuid[])', [actorIds]);
    await migrateDb.pool.query('delete from core.analytics_areas where managed_system_id = any($1::uuid[])', [systemIds]);
    await migrateDb.pool.query('delete from core.audit_log where actor_id = any($1::uuid[])', [actorIds]);
    await migrateDb.pool.query('delete from core.managed_systems where id = any($1::uuid[])', [systemIds]);
    await migrateDb.pool.query('delete from core.rate_limits where key like any($1::text[])', [actorIds.map((id) => `%${id}%`)]);
    await migrateDb.pool.query('delete from core.sessions where actor_id = any($1::uuid[])', [actorIds]);
    await migrateDb.pool.query('delete from core.actors where id = any($1::uuid[])', [actorIds]);
    await appDb?.close();
    await migrateDb?.close();
  });

  describe.each(cases)('$name', (c) => {
    it.each(['cross-site', 'same-site', 'none'])('refuses Sec-Fetch-Site %s with text/plain and multipart bodies before the handler', async (site) => {
      for (const enc of encodings) {
        const p = person_(c.as);
        // logout: a dedicated session per call so a missed guard would visibly end it
        const sid = c.name.endsWith('/auth/logout') ? randomUUID() : undefined;
        if (sid) {
          await migrateDb.pool.query(
            `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
             values ($1,$2,$3, now() + interval '1 hour', now(), now(), 'itest')`,
            [sid, p.id, WORKSPACE_ID],
          );
        }
        const target = await c.make();
        const before = await target.probe?.();
        const res = await send(p, target, { 'sec-fetch-site': site }, enc, sid);
        expect(res.json().code, `${enc.name}: ${res.body}`).toBe(CROSS_SITE_CODE);
        expect(res.statusCode).toBe(403);
        expect(await target.probe?.()).toBe(before);
        if (sid) {
          const row = await one('select revoked_at from core.sessions where id = $1', [sid]);
          expect(row.revoked_at).toBeNull();
        }
      }
    });

    it.each([{ name: 'same-origin', headers: { 'sec-fetch-site': 'same-origin' } }, { name: 'no header', headers: {} }])(
      'still reaches the handler with $name',
      async ({ headers }) => {
        const p = person_(c.as);
        const sid = c.name.endsWith('/auth/logout') ? randomUUID() : undefined;
        if (sid) {
          await migrateDb.pool.query(
            `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, created_user_agent_summary)
             values ($1,$2,$3, now() + interval '1 hour', now(), now(), 'itest')`,
            [sid, p.id, WORKSPACE_ID],
          );
        }
        const target = await c.make();
        const res = await send(p, target, headers, undefined, sid);
        expect(c.okStatus, res.body).toContain(res.statusCode);
        if (res.body) expect(res.json().code).not.toBe(CROSS_SITE_CODE);
      },
    );
  });

  describe('requests the guard leaves alone', () => {
    it('a Bearer API-token call is not refused as cross-site (the token gate answers)', async () => {
      const value = `ap_${randomUUID().slice(0, 8)}_${randomUUID()}${randomUUID()}`.slice(0, 60);
      await token(user, 'personal', value);
      const revokeCase = cases.find((c) => c.name === 'POST /api-tokens/:id/revoke');
      if (!revokeCase) throw new Error('revoke case missing');
      const target = await revokeCase.make();
      const res = await app.inject({
        method: 'POST',
        url: target.url,
        remoteAddress: `10.78.0.${(++ipCounter & 255) || 1}`,
        headers: { authorization: `Bearer ${value}`, 'sec-fetch-site': 'cross-site' },
      });
      expect(res.json().code).toBe('permission.session_required');
      expect(res.statusCode).toBe(403);
    });

    it('a request without the session cookie is not refused as cross-site', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/notifications/${randomUUID()}/read`,
        remoteAddress: `10.79.0.${(++ipCounter & 255) || 1}`,
        headers: { 'sec-fetch-site': 'cross-site' },
      });
      expect(res.json().code).toBe('auth.session_invalid');
    });

    it('a safe method with a cross-site header is not refused', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/notifications',
        remoteAddress: `10.80.0.${(++ipCounter & 255) || 1}`,
        headers: { cookie: `${SESSION_COOKIE_NAME}=${user.sid}`, 'sec-fetch-site': 'cross-site' },
      });
      expect(res.statusCode).toBe(200);
    });

    it('an X-CSRF-Token route behaves as before for a same-origin call, and cross-site is refused earlier', async () => {
      const url = '/api/v1/platform/saved-views/commands';
      const base = { cookie: `${SESSION_COOKIE_NAME}=${user.sid}`, 'content-type': 'application/json' };
      const ip = () => `10.81.0.${(++ipCounter & 255) || 1}`;
      const noToken = await app.inject({ method: 'POST', url, remoteAddress: ip(), headers: { ...base, 'sec-fetch-site': 'same-origin' }, payload: '{}' });
      expect(noToken.json().code).toBe('csrf.invalid');
      const cross = await app.inject({ method: 'POST', url, remoteAddress: ip(), headers: { ...base, 'x-csrf-token': user.csrf, 'sec-fetch-site': 'cross-site' }, payload: '{}' });
      expect(cross.json().code).toBe(CROSS_SITE_CODE);
      const ok = await app.inject({ method: 'POST', url, remoteAddress: ip(), headers: { ...base, 'x-csrf-token': user.csrf, 'sec-fetch-site': 'same-origin' }, payload: '{}' });
      expect(ok.json().code).not.toBe('csrf.invalid');
      expect(ok.json().code).not.toBe(CROSS_SITE_CODE);
    });
  });
});
