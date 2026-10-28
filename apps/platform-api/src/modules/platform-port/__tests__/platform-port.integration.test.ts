// #620 — platform port foundation: bootstrap, session-state, CSRF, Correlation ID.
// Route-level against a real Postgres (throwaway DB only, apps/platform-api/AGENTS.md → Verification).
// Log visibility of the request id is not asserted: the test harness logger is silent.

import cookiePlugin from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME, requireSession } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { insertMsDirectly } from '../../../test-support/core-fixtures.js';
import { uid } from '../../../test-support/ids.js';
import {
  denyCapability,
  expireCapabilityGrant,
  grantCapability,
  revokeCapabilityGrant,
} from '../../../test-support/permissions-fixtures.js';
import { createSessionService } from '../../auth/session-service.js';
import { requireCsrf } from '../index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-platform-port');

type Role = 'admin' | 'developer' | 'user';
type Bootstrap = {
  session: {
    user: { id: string; name: string; title: { ko: string; en: string }; permissions: string[] };
    scopes: unknown[];
  };
  publishedMetrics: unknown[];
  defaultRangeTo: string;
  sessionVersion: string;
  csrfToken: string;
};

function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)]);
  }
  return [];
}

describe.skipIf(!runIntegration)('platform port /api/v1/platform (#620)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  const msIds: string[] = [];
  let n = 0;

  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function newActor(roleLevel: Role) {
    const { id } = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId: `${PREFIX}-${roleLevel}-${n++}`,
      displayName: `Port ${roleLevel}`,
      roleLevel,
    });
    actorIds.push(id);
    const externalId = (
      await dbHandle.pool.query<{ external_id: string }>(
        'select external_id from core.actors where id = $1',
        [id],
      )
    ).rows[0]?.external_id as string;
    const cookie = await loginAs(app, externalId);
    return { id, cookie };
  }

  const platformGet = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
    app.inject({
      method: 'GET',
      url: `/api/v1/platform${path}`,
      headers: { ...(cookie ? cookieHeader(cookie) : {}), ...headers },
    });
  const bootstrap = async (cookie: string) => {
    const res = await platformGet('/bootstrap', cookie);
    expect(res.statusCode).toBe(200);
    return res.json<Bootstrap>();
  };
  const lastSeen = async (cookie: string) =>
    (
      await dbHandle.pool.query<{ last_seen_at: Date }>(
        'select last_seen_at from core.sessions where id = $1',
        [cookie],
      )
    ).rows[0]?.last_seen_at.getTime();

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    if (actorIds.length > 0) {
      // audit_log needs the migrate role; children before parents (apps/platform-api/AGENTS.md).
      for (const [table, column] of [
        ['core.audit_log', 'actor_id'],
        ['permission.permission_grants', 'actor_id'],
        ['permission.permission_denies', 'actor_id'],
        ['core.sessions', 'actor_id'],
        ['core.actors', 'id'],
      ]) {
        await migrateHandle.pool.query(`delete from ${table} where ${column} = any($1)`, [
          actorIds,
        ]);
      }
    }
    if (msIds.length > 0) {
      await migrateHandle.pool.query('delete from core.managed_systems where id = any($1)', [
        msIds,
      ]);
    }
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('an unknown path under the prefix 404s with no-store; outside the prefix is untouched', async () => {
    const inside = await platformGet('/does-not-exist');
    expect(inside.statusCode).toBe(404);
    expect(inside.headers['cache-control']).toBe('no-store');
    const outside = await app.inject({ method: 'GET', url: '/does-not-exist-outside' });
    expect(outside.statusCode).toBe(404);
    expect(outside.headers['cache-control']).toBeUndefined();
  });

  describe('GET /bootstrap', () => {
    it('401s without a session cookie, with no-store', async () => {
      const res = await platformGet('/bootstrap');
      expect(res.statusCode).toBe(401);
      expect(res.json().code).toBe('auth.session_invalid');
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it.each([
      [
        'admin',
        ['console:access', 'features:access', 'notice:view', 'platform:view', 'voc:view'],
        { ko: '관리자', en: 'Admin' },
      ],
      [
        'developer',
        ['features:access', 'notice:view', 'platform:view', 'voc:view'],
        { ko: '개발자', en: 'Developer' },
      ],
      ['user', ['notice:view', 'platform:view', 'voc:view'], { ko: '사용자', en: 'User' }],
    ] as const)('returns the %s session', async (role, permissions, title) => {
      const actor = await newActor(role);
      const res = await platformGet('/bootstrap', actor.cookie);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.json<Bootstrap>();
      expect(body.session.user).toEqual({
        id: actor.id,
        name: `Port ${role}`,
        title,
        permissions,
      });
      expect(body.session.scopes).toEqual([]);
      expect(body.publishedMetrics).toEqual([]);
      expect(body.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(body.sessionVersion).toMatch(/^[0-9a-f]{64}$/);
      expect(keysOf(body).filter((k) => !/^[a-z][A-Za-z0-9]*$/.test(k))).toEqual([]);
    });

    it('defaultRangeTo is the Asia/Seoul wall clock truncated to the minute', async () => {
      const actor = await newActor('user');
      const before = Date.now();
      const { defaultRangeTo } = await bootstrap(actor.cookie);
      expect(defaultRangeTo).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/);
      const asInstant = Date.parse(`${defaultRangeTo}Z`) - 9 * 3600 * 1000;
      expect(asInstant).toBeLessThanOrEqual(Date.now());
      expect(before - asInstant).toBeLessThan(61_000);
    });

    it('features:access follows grants, workspace denies, revocation and expiry for a user-level actor', async () => {
      const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-ms-${n++}`, 'Port MS');
      msIds.push(ms);
      const admin = await newActor('admin');
      const has = async (cookie: string) =>
        (await bootstrap(cookie)).session.user.permissions.includes('features:access');

      const scoped = await newActor('user');
      expect(await has(scoped.cookie)).toBe(false);
      await grantCapability(dbHandle, WORKSPACE_ID, scoped.id, 'voc.triage', ms, admin.id);
      expect(await has(scoped.cookie)).toBe(true);

      const denied = await newActor('user');
      await grantCapability(dbHandle, WORKSPACE_ID, denied.id, 'voc.triage', ms, admin.id);
      expect(await has(denied.cookie)).toBe(true);
      await denyCapability(dbHandle, WORKSPACE_ID, denied.id, 'voc.triage', null, admin.id);
      expect(await has(denied.cookie)).toBe(false);

      const revoked = await newActor('user');
      const revokedGrant = await grantCapability(
        dbHandle,
        WORKSPACE_ID,
        revoked.id,
        'finding.read',
        ms,
        admin.id,
      );
      expect(await has(revoked.cookie)).toBe(true);
      await revokeCapabilityGrant(dbHandle, revokedGrant, admin.id);
      expect(await has(revoked.cookie)).toBe(false);

      const expired = await newActor('user');
      const expiredGrant = await grantCapability(
        dbHandle,
        WORKSPACE_ID,
        expired.id,
        'survey.manage',
        null,
        admin.id,
      );
      expect(await has(expired.cookie)).toBe(true);
      await expireCapabilityGrant(dbHandle, expiredGrant);
      expect(await has(expired.cookie)).toBe(false);
    });
  });

  describe('sessionVersion', () => {
    it('is stable across calls, flips with a permission change, and ignores grants that flip none', async () => {
      const ms = await insertMsDirectly(dbHandle, WORKSPACE_ID, `${PREFIX}-ms-${n++}`, 'Port MS');
      msIds.push(ms);
      const admin = await newActor('admin');
      const actor = await newActor('user');
      const first = await bootstrap(actor.cookie);
      expect((await bootstrap(actor.cookie)).sessionVersion).toBe(first.sessionVersion);

      await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'voc.read', null, admin.id);
      expect((await bootstrap(actor.cookie)).sessionVersion).toBe(first.sessionVersion);

      await grantCapability(dbHandle, WORKSPACE_ID, actor.id, 'finding.read', ms, admin.id);
      const flipped = await bootstrap(actor.cookie);
      expect(flipped.session.user.permissions).toContain('features:access');
      expect(flipped.sessionVersion).not.toBe(first.sessionVersion);
    });
  });

  describe('GET /session-state', () => {
    it('401s without a session cookie', async () => {
      const res = await platformGet('/session-state');
      expect(res.statusCode).toBe(401);
      expect(res.headers['cache-control']).toBe('no-store');
    });

    it("returns bootstrap's sessionVersion and does not touch last_seen_at", async () => {
      const actor = await newActor('developer');
      const { sessionVersion } = await bootstrap(actor.cookie);
      const before = await lastSeen(actor.cookie);
      await new Promise((resolve) => setTimeout(resolve, 25));
      const res = await platformGet('/session-state', actor.cookie);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.json()).toEqual({ sessionVersion });
      expect(await lastSeen(actor.cookie)).toBe(before);

      // control: bootstrap is a real request and does touch it.
      await new Promise((resolve) => setTimeout(resolve, 25));
      await bootstrap(actor.cookie);
      expect(await lastSeen(actor.cookie)).toBeGreaterThan(before as number);
    });
  });

  describe('CSRF token', () => {
    const tokenInDb = async (cookie: string) =>
      (
        await dbHandle.pool.query<{ csrf_token: string | null }>(
          'select csrf_token from core.sessions where id = $1',
          [cookie],
        )
      ).rows[0]?.csrf_token;

    it('is issued at login, differs per session, and a NULL one is filled once on bootstrap', async () => {
      const a = await newActor('user');
      const b = await newActor('user');
      expect(await tokenInDb(a.cookie)).toBeTruthy();
      expect(await tokenInDb(a.cookie)).not.toBe(await tokenInDb(b.cookie));

      await dbHandle.pool.query('update core.sessions set csrf_token = null where id = $1', [
        a.cookie,
      ]);
      const filled = (await bootstrap(a.cookie)).csrfToken;
      expect(filled).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(await tokenInDb(a.cookie)).toBe(filled);
      expect((await bootstrap(a.cookie)).csrfToken).toBe(filled);
    });

    it('requireCsrf: missing and wrong token → 403 csrf.invalid, right token → 200', async () => {
      const actor = await newActor('user');
      const { csrfToken } = await bootstrap(actor.cookie);
      const sessionService = createSessionService({ db: dbHandle.db, workspaceId: WORKSPACE_ID });
      const probe = Fastify();
      await probe.register(cookiePlugin);
      probe.post(
        '/probe',
        { preHandler: [requireSession(sessionService), requireCsrf(sessionService)] },
        async () => ({ ok: true }),
      );
      await probe.ready();
      try {
        const post = (headers: Record<string, string>) =>
          probe.inject({
            method: 'POST',
            url: '/probe',
            headers: { ...cookieHeader(actor.cookie), ...headers },
          });
        const missing = await post({});
        expect(missing.statusCode).toBe(403);
        expect(missing.json()).toEqual({ code: 'csrf.invalid', message: 'csrf token mismatch' });
        expect((await post({ 'x-csrf-token': `${csrfToken}x` })).statusCode).toBe(403);
        expect((await post({ 'x-csrf-token': 'x'.repeat(43) })).statusCode).toBe(403);
        const ok = await post({ 'x-csrf-token': csrfToken });
        expect(ok.statusCode).toBe(200);
        expect(ok.json()).toEqual({ ok: true });
      } finally {
        await probe.close();
      }
    });
  });

  describe('Correlation ID', () => {
    it('echoes a valid X-Correlation-Id, also on error responses', async () => {
      const res = await platformGet('/bootstrap', undefined, { 'x-correlation-id': 'trace-1.a_B' });
      expect(res.statusCode).toBe(401);
      expect(res.headers['x-correlation-id']).toBe('trace-1.a_B');
    });

    it.each([['a b'], ['a'.repeat(129)]])(
      'replaces an invalid id (%j) with a generated srv- id',
      async (bad) => {
        const res = await platformGet('/session-state', undefined, { 'x-correlation-id': bad });
        expect(res.headers['x-correlation-id']).toMatch(/^srv-\d+-[0-9a-f]+$/);
      },
    );

    it('generates an id when absent, on routes outside the platform prefix too', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.headers['x-correlation-id']).toMatch(/^srv-\d+-[0-9a-f]+$/);
    });
  });
});
