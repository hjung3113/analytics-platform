// #1106 — notice persistence, the management routes and the `home.notices` menuQuery. Route-level against a real
// Postgres (throwaway DB only; run through `pnpm --filter @ap/platform-api test:integration` as platform_app /
// platform_migrate, never as a superuser): the actual `buildServer`, wire envelopes and DB state. Rows are tied to
// this suite's actors and workspace-scoped fixtures; other suites share the workspace.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import type { PoolClient as Holder } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';
import { createIdempotencyService } from '../../core/idempotency/idempotency-service.js';
import type { CheckService } from '../../permissions/check-service.js';
import { createPlatformNoticeService } from '../service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-notices');

type Role = 'admin' | 'user';
type Person = { id: string; cookie: string; csrf: string };
type Answer = {
  outcome: string;
  data: { id: string; version?: string; title?: { ko: string } } | null;
  version: string | null;
  fieldErrors: Array<{ path: string[]; code: string }>;
  replayed: boolean;
  correlationId: string;
};

const draft = (suffix: string, extra: Record<string, unknown> = {}) => ({
  title: { ko: `${PREFIX} ${suffix}`, en: `${PREFIX} ${suffix}` },
  content: { ko: '본문', en: 'body' },
  scopeId: null,
  until: '2099-01-01T00:00:00',
  ...extra,
});

describe.skipIf(!runIntegration)('platform notices and home.notices (#1106)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;
  let admin: Person;
  let admin2: Person;
  let user: Person;

  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function newPerson(roleLevel: Role): Promise<Person> {
    const externalId = `${PREFIX}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      displayName: `Notices ${roleLevel}`,
      roleLevel,
    });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({
      method: 'GET',
      url: '/api/v1/platform/bootstrap',
      headers: cookieHeader(cookie),
    });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  /** A write with the person's cookie and CSRF token; the key travels in header and body unless overridden. */
  async function write(
    path: 'save' | 'delete',
    body: Record<string, unknown>,
    opts: {
      who?: Person;
      key?: string | null;
      headerKey?: string | null;
      ifMatch?: string | null;
      csrf?: string | null;
      cookie?: string | null;
      raw?: string;
    } = {},
  ) {
    const who = opts.who ?? admin;
    const key = opts.key === undefined ? randomUUID() : opts.key;
    const headerKey = opts.headerKey === undefined ? key : opts.headerKey;
    const ifMatch =
      opts.ifMatch === undefined
        ? typeof body.expectedVersion === 'string'
          ? body.expectedVersion
          : null
        : opts.ifMatch;
    const csrf = opts.csrf === undefined ? who.csrf : opts.csrf;
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/platform/notices/${path}`,
      headers: {
        'content-type': 'application/json',
        ...(opts.cookie === null ? {} : cookieHeader(opts.cookie ?? who.cookie)),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        ...(headerKey ? { 'idempotency-key': headerKey } : {}),
        ...(ifMatch ? { 'if-match': ifMatch } : {}),
      },
      payload: opts.raw ?? JSON.stringify(key === null ? body : { ...body, idempotencyKey: key }),
    });
    return { res, key, answer: res.statusCode === 200 ? res.json<Answer>() : null };
  }

  type Written = { answer: Answer | null };
  const ans = (written: Written): Answer => {
    if (!written.answer) throw new Error('expected an HTTP 200 ActionResponse');
    return written.answer;
  };
  const dataOf = (written: Written) => {
    const data = ans(written).data;
    if (!data) throw new Error('expected an ok answer carrying data');
    return data;
  };
  const idOf = (written: Written) => dataOf(written).id;

  const rowsOf = async (titleLike = `${PREFIX}%`) =>
    (
      await migrateHandle.pool.query(
        'select * from platform.notices where title_ko like $1 order by created_at, id',
        [titleLike],
      )
    ).rows;
  const cacheRow = async (actorId: string, key: string) =>
    (
      await migrateHandle.pool.query(
        'select * from core.idempotency_keys where actor_id = $1 and key = $2',
        [actorId, key],
      )
    ).rows[0];
  const cacheCount = async (who: Person) =>
    (
      await migrateHandle.pool.query(
        'select count(*)::int as n from core.idempotency_keys where actor_id = $1',
        [who.id],
      )
    ).rows[0].n as number;
  const query = (targetScopeId: unknown, who: Person | null = admin, body: unknown = undefined) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...(who ? cookieHeader(who.cookie) : {}) },
      payload: JSON.stringify(
        body ?? { endpoint: 'home.notices', context: {}, params: { targetScopeId } },
      ),
    });
  const insertRow = async (
    workspaceId: string,
    suffix: string,
    scopeId: string | null,
    until: string,
  ) =>
    (
      await migrateHandle.pool.query(
        `insert into platform.notices (workspace_id, author_actor_id, title_ko, title_en, content_ko, content_en, scope_id, until)
         values ($1, $2, $3, $3, 'c', 'c', $4, $5) returning id`,
        [workspaceId, admin.id, `${PREFIX} ${suffix}`, scopeId, until],
      )
    ).rows[0].id as string;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    // The race tests below send up to 6 concurrent requests; a pool of one connection would serialize them and pass vacuously.
    expect((dbHandle.pool.options as { max?: number }).max ?? 0).toBeGreaterThanOrEqual(6);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await newPerson('admin');
    admin2 = await newPerson('admin');
    user = await newPerson('user');
  });

  afterAll(async () => {
    const q = (text: string, params: unknown[]) => migrateHandle.pool.query(text, params);
    await q('delete from platform.notices where title_ko like $1 or author_actor_id = any($2)', [
      `${PREFIX}%`,
      actorIds,
    ]);
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
        await q(`delete from ${table} where ${column} = any($1)`, [actorIds]);
      }
    }
    if (workspaceIds.length > 0)
      await q('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  describe('CRUD', () => {
    it('creates, lists, updates under the version, conflicts when stale, deletes, and deleting again is not_found', async () => {
      const created = await write('save', draft('crud'));
      expect(created.res.headers['cache-control']).toBe('no-store');
      expect(created.answer).toMatchObject({
        outcome: 'ok',
        version: 'v1',
        replayed: false,
        fieldErrors: [],
      });
      const notice = dataOf(created);
      expect(notice).toEqual({
        id: expect.any(String),
        title: draft('crud').title,
        content: draft('crud').content,
        scopeId: null,
        until: '2099-01-01T00:00:00',
        version: 'v1',
      });
      expect(JSON.stringify(created.answer)).not.toMatch(/author|createdAt|updatedAt|created_at/);

      const [row] = await rowsOf();
      expect(row.author_actor_id).toBe(admin.id);
      expect(row.workspace_id).toBe(WORKSPACE_ID);
      expect(row.created_at).toBeInstanceOf(Date);

      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/platform/notices',
        headers: cookieHeader(user.cookie),
      });
      const body = list.json<{
        outcome: string;
        data: { items: Array<{ id: string }> };
        assessments: unknown[];
        trust: unknown;
      }>();
      expect(body).toMatchObject({ outcome: 'ok', assessments: [], trust: null });
      expect(body.data.items.map((item) => item.id)).toContain(notice.id);

      const updated = await write('save', {
        ...draft('crud-2'),
        id: notice.id,
        expectedVersion: 'v1',
      });
      expect(updated.answer).toMatchObject({ outcome: 'ok', version: 'v2' });
      const stale = await write('save', {
        ...draft('crud-3'),
        id: notice.id,
        expectedVersion: 'v1',
      });
      expect(stale.answer).toMatchObject({ outcome: 'conflict', data: null, version: 'v2' });
      expect((await rowsOf()).map((r) => r.title_ko)).toEqual([`${PREFIX} crud-2`]);

      const removed = await write('delete', { id: notice.id, expectedVersion: 'v2' });
      expect(removed.answer).toMatchObject({
        outcome: 'ok',
        data: { id: notice.id },
        version: 'v2',
      });
      expect(await rowsOf()).toHaveLength(0);
      const again = await write('delete', { id: notice.id, expectedVersion: 'v2' });
      expect(again.answer).toMatchObject({ outcome: 'not_found', data: null });
    });

    it('answers not_found, not a 500, for a non-UUID object id', async () => {
      const result = await write('delete', { id: 'N-mock-1', expectedVersion: 'v1' });
      expect(result.res.statusCode).toBe(200);
      expect(result.answer).toMatchObject({ outcome: 'not_found' });
    });

    it('list is expired-inclusive; Home hides expired', async () => {
      const expired = await write('save', draft('expired', { until: '2000-01-01T00:00:00' }));
      expect(expired.answer?.outcome).toBe('ok');
      const list = await app.inject({
        method: 'GET',
        url: '/api/v1/platform/notices',
        headers: cookieHeader(user.cookie),
      });
      expect(
        list.json<{ data: { items: Array<{ id: string }> } }>().data.items.map((i) => i.id),
      ).toContain(idOf(expired));
      const home = (await query(null)).json<{ data: Array<{ id: string }> | null }>();
      expect((home.data ?? []).map((r) => r.id)).not.toContain(idOf(expired));
    });
  });

  describe('authorization and transport ordering', () => {
    it('a non-console user is forbidden and mutates nothing, before the body is judged', async () => {
      const denied = await write('save', draft('user-write'), { who: user });
      expect(denied.answer).toMatchObject({ outcome: 'forbidden', data: null });
      const malformed = await write('save', {}, { who: user, raw: '{nope' });
      expect(malformed.answer?.outcome).toBe('forbidden');
      expect(await rowsOf(`${PREFIX} user-write%`)).toHaveLength(0);
    });

    it('permission precedes replay: a replay of an admin write by a non-console user reveals nothing', async () => {
      const first = await write('save', draft('perm-first'));
      const replayByUser = await write('save', draft('perm-first'), { who: user, key: first.key });
      expect(replayByUser.answer).toMatchObject({
        outcome: 'forbidden',
        data: null,
        replayed: false,
      });
    });

    it('permission precedes version: a non-console user learns no current version from a stale update', async () => {
      const created = await write('save', draft('perm-version'));
      const probe = await write(
        'save',
        { ...draft('x'), id: idOf(created), expectedVersion: 'v9' },
        { who: user },
      );
      expect(probe.answer).toMatchObject({ outcome: 'forbidden', version: null });
    });

    it('keeps 401 without a session and 403 csrf.invalid without a token, with no mutation', async () => {
      const noSession = await app.inject({
        method: 'POST',
        url: '/api/v1/platform/notices/save',
        headers: { 'content-type': 'application/json' },
        payload: '{}',
      });
      expect(noSession.statusCode).toBe(401);
      const noCsrf = await write('save', draft('no-csrf'), { csrf: null });
      expect(noCsrf.res.statusCode).toBe(403);
      expect(noCsrf.res.json()).toMatchObject({ code: 'csrf.invalid' });
      expect(await rowsOf(`${PREFIX} no-csrf%`)).toHaveLength(0);
    });

    describe('the session is judged before CSRF on every notice write', () => {
      const sessionStates: Array<[string, (who: Person) => Promise<Parameters<typeof write>[2]>]> =
        [
          ['no cookie', async () => ({ cookie: null })],
          ['unknown cookie', async () => ({ cookie: 'not-a-session' })],
          [
            'revoked session',
            async (who) => {
              await migrateHandle.pool.query(
                'update core.sessions set revoked_at = now() where id = $1',
                [who.cookie],
              );
              return {};
            },
          ],
          [
            'expired session',
            async (who) => {
              await migrateHandle.pool.query(
                "update core.sessions set expires_at = now() - interval '1 second' where id = $1",
                [who.cookie],
              );
              return {};
            },
          ],
        ];

      it.each(sessionStates)(
        '%s: save and delete answer 401 whatever the CSRF token is, and write nothing',
        async (name, breakSession) => {
          const slug = name.replace(/\W/g, '-');
          const who = await newPerson('admin');
          const target = await write('save', draft(`auth-del-${slug}`));
          const opts = await breakSession(who);
          for (const csrf of [who.csrf, 'wrong', null]) {
            const saved = await write('save', draft(`auth-save-${slug}`), { ...opts, who, csrf });
            const deleted = await write(
              'delete',
              { id: idOf(target), expectedVersion: 'v1' },
              { ...opts, who, csrf },
            );
            for (const attempt of [saved, deleted]) {
              expect(attempt.res.statusCode).toBe(401);
              expect(attempt.res.json()).toMatchObject({ code: 'auth.session_invalid' });
              expect(attempt.res.headers['cache-control']).toBe('no-store');
            }
          }
          expect(await rowsOf(`${PREFIX} auth-save-${slug}%`)).toHaveLength(0);
          expect(await rowsOf(`${PREFIX} auth-del-${slug}%`)).toHaveLength(1);
          expect(await cacheCount(who)).toBe(0);
        },
      );

      it('a session bound to another workspace is refused before CSRF (403 workspace_mismatch), writing nothing', async () => {
        const other = (
          await migrateHandle.pool.query(
            'insert into core.workspaces (name) values ($1) returning id',
            [`${PREFIX}-ws-auth`],
          )
        ).rows[0].id as string;
        workspaceIds.push(other);
        const who = await newPerson('admin');
        await migrateHandle.pool.query('update core.sessions set workspace_id = $2 where id = $1', [
          who.cookie,
          other,
        ]);
        for (const csrf of [who.csrf, 'wrong', null]) {
          const attempt = await write('save', draft('auth-save-workspace'), { who, csrf });
          expect(attempt.res.statusCode).toBe(403);
          expect(attempt.res.json()).toMatchObject({ code: 'auth.workspace_mismatch' });
        }
        expect(await rowsOf(`${PREFIX} auth-save-workspace%`)).toHaveLength(0);
        expect(await cacheCount(who)).toBe(0);
      });

      it('an active session with a wrong or missing CSRF token gets 403 csrf.invalid and writes nothing; the right token is authorized', async () => {
        const who = await newPerson('admin');
        const target = await write('save', draft('auth-active-del'), { who });
        for (const csrf of ['wrong', null]) {
          const saved = await write('save', draft('auth-active-save'), { who, csrf });
          const deleted = await write(
            'delete',
            { id: idOf(target), expectedVersion: 'v1' },
            { who, csrf },
          );
          for (const attempt of [saved, deleted]) {
            expect(attempt.res.statusCode).toBe(403);
            expect(attempt.res.json()).toMatchObject({ code: 'csrf.invalid' });
          }
        }
        expect(await rowsOf(`${PREFIX} auth-active-save%`)).toHaveLength(0);
        expect(await rowsOf(`${PREFIX} auth-active-del%`)).toHaveLength(1);
        const ok = await write('save', draft('auth-active-save'), { who });
        expect(ok.answer).toMatchObject({ outcome: 'ok', replayed: false });
        const removed = await write('delete', { id: idOf(target), expectedVersion: 'v1' }, { who });
        expect(removed.answer).toMatchObject({ outcome: 'ok' });
      });
    });

    it('judges malformed JSON as an invalid ActionResponse', async () => {
      const result = await write('save', {}, { raw: '{nope' });
      expect(result.answer).toMatchObject({
        outcome: 'invalid',
        fieldErrors: [{ path: [], code: 'malformed' }],
      });
    });
  });

  describe('header and body', () => {
    it('mismatched or malformed key/If-Match headers mutate nothing', async () => {
      const key = randomUUID();
      const cases: Array<[string, Parameters<typeof write>[2], string]> = [
        ['header key differs', { key, headerKey: randomUUID() }, 'error'],
        ['header key absent', { key, headerKey: null }, 'invalid'],
        ['header key malformed', { key, headerKey: 'not-a-uuid' }, 'invalid'],
        ['body key absent', { key: null, headerKey: key }, 'invalid'],
        ['If-Match on a create', { key, ifMatch: 'v1' }, 'error'],
      ];
      for (const [label, opts, outcome] of cases) {
        const result = await write('save', draft(`hdr-${label}`), opts);
        expect(result.answer?.outcome, label).toBe(outcome);
      }
      expect(await rowsOf(`${PREFIX} hdr-%`)).toHaveLength(0);
      const created = await write('save', draft('hdr-update'));
      const id = idOf(created);
      const mismatchedVersion = await write(
        'save',
        { ...draft('hdr-update-2'), id, expectedVersion: 'v1' },
        { ifMatch: 'v2' },
      );
      const absentVersion = await write(
        'save',
        { ...draft('hdr-update-3'), id, expectedVersion: 'v1' },
        { ifMatch: null },
      );
      const deleteAbsent = await write('delete', { id, expectedVersion: 'v1' }, { ifMatch: null });
      expect([
        mismatchedVersion.answer?.outcome,
        absentVersion.answer?.outcome,
        deleteAbsent.answer?.outcome,
      ]).toEqual(['error', 'error', 'error']);
      expect((await rowsOf(`${PREFIX} hdr-update%`)).map((r) => [r.title_ko, r.revision])).toEqual([
        [`${PREFIX} hdr-update`, 1],
      ]);
    });

    it('rejects forged identity fields, NUL, impossible dates and site targets without writing', async () => {
      const bad: Array<[string, Record<string, unknown>, string]> = [
        ['author', { ...draft('forged'), author: 'x' }, 'author'],
        ['createdAt', { ...draft('forged'), createdAt: '2020-01-01T00:00:00Z' }, 'createdAt'],
        ['nul', draft('nul', { title: { ko: 'a\u0000b', en: 'ok' } }), 'title'],
        ['calendar', draft('calendar', { until: '2026-02-30T00:00:00' }), 'until'],
        ['site', draft('site', { scopeId: 'MEM' }), 'scopeId'],
      ];
      for (const [label, body, path] of bad) {
        const result = await write('save', body);
        expect(result.answer?.outcome, label).toBe('invalid');
        expect(
          result.answer?.fieldErrors.some((e) => e.path[0] === path),
          label,
        ).toBe(true);
      }
      expect(await rowsOf(`${PREFIX} forged%`)).toHaveLength(0);
      expect(await rowsOf(`${PREFIX} nul%`)).toHaveLength(0);
      expect(await rowsOf(`${PREFIX} calendar%`)).toHaveLength(0);
      expect(await rowsOf(`${PREFIX} site%`)).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('replays a same-key same-input write with replayed:true and one row', async () => {
      const key = randomUUID();
      const first = await write('save', draft('replay'), { key });
      const retry = await write('save', draft('replay'), { key });
      expect(first.answer).toMatchObject({ outcome: 'ok', replayed: false });
      expect(retry.answer).toMatchObject({
        outcome: 'ok',
        replayed: true,
        data: ans(first).data,
        version: 'v1',
      });
      expect(ans(retry).correlationId).not.toBe(ans(first).correlationId);
      expect(await rowsOf(`${PREFIX} replay%`)).toHaveLength(1);
      expect((await cacheRow(admin.id, key))?.response_status).toBe(200);
    });

    it('reusing a key with other input is invalid/reused and mutates nothing', async () => {
      const key = randomUUID();
      await write('save', draft('reuse'), { key });
      const reused = await write('save', draft('reuse-other'), { key });
      expect(reused.answer).toMatchObject({
        outcome: 'invalid',
        fieldErrors: [{ path: ['idempotencyKey'], code: 'reused' }],
      });
      const otherOperation = await write(
        'delete',
        { id: randomUUID(), expectedVersion: 'v1' },
        { key },
      );
      expect(otherOperation.answer).toMatchObject({
        outcome: 'invalid',
        fieldErrors: [{ path: ['idempotencyKey'], code: 'reused' }],
      });
      expect(await rowsOf(`${PREFIX} reuse%`)).toHaveLength(1);
    });

    it('replays a delete after the row is gone', async () => {
      const created = await write('save', draft('delete-replay'));
      const id = idOf(created);
      const key = randomUUID();
      const first = await write('delete', { id, expectedVersion: 'v1' }, { key });
      const retry = await write('delete', { id, expectedVersion: 'v1' }, { key });
      expect(first.answer).toMatchObject({ outcome: 'ok', replayed: false });
      expect(retry.answer).toMatchObject({ outcome: 'ok', replayed: true, data: { id } });
    });

    it('records only ok answers: conflict, not_found and invalid leave no cache row', async () => {
      const created = await write('save', draft('ok-only'));
      const id = idOf(created);
      const conflictKey = randomUUID();
      const notFoundKey = randomUUID();
      const invalidKey = randomUUID();
      expect(
        (
          await write(
            'save',
            { ...draft('stale'), id, expectedVersion: 'v7' },
            { key: conflictKey },
          )
        ).answer?.outcome,
      ).toBe('conflict');
      expect(
        (await write('delete', { id: randomUUID(), expectedVersion: 'v1' }, { key: notFoundKey }))
          .answer?.outcome,
      ).toBe('not_found');
      expect(
        (await write('save', draft('bad', { until: 'nope' }), { key: invalidKey })).answer?.outcome,
      ).toBe('invalid');
      for (const key of [conflictKey, notFoundKey, invalidKey])
        expect(await cacheRow(admin.id, key)).toBeUndefined();
    });

    it('replays a full legal answer above the 16 KiB Core default, including the worst-case escaping', async () => {
      const wide = (char: string) =>
        draft('wide', {
          title: { ko: char.repeat(200), en: char.repeat(200) },
          content: { ko: char.repeat(10_000), en: char.repeat(10_000) },
        });
      for (const char of ['가', '\u0001']) {
        const key = randomUUID();
        const input = {
          ...wide(char),
          title: { ko: `${PREFIX} wide${char === '가' ? '' : '2'}`, en: char.repeat(200) },
        };
        const first = await write('save', input, { key });
        expect(first.answer?.outcome).toBe('ok');
        const cached = await cacheRow(admin.id, key);
        expect(Buffer.byteLength(JSON.stringify(cached.response_body))).toBeGreaterThan(16 * 1024);
        expect(cached.request_hash.startsWith('response-body-skipped:')).toBe(false);
        const retry = await write('save', input, { key });
        expect(retry.answer).toMatchObject({
          outcome: 'ok',
          replayed: true,
          data: ans(first).data,
        });
        await write('delete', { id: idOf(first), expectedVersion: 'v1' });
      }
    });

    it('keeps the 16 KiB default for an unrelated Core caller', async () => {
      const key = randomUUID();
      await createIdempotencyService().record(dbHandle.db, admin.id, key, 'hash', 200, {
        text: 'x'.repeat(20_000),
      });
      const cached = await cacheRow(admin.id, key);
      expect(cached.request_hash).toBe('response-body-skipped:hash');
      expect(cached.response_body).toEqual({ skipped: true, reason: 'response_body_exceeds_16kb' });
    });
  });

  describe('races', () => {
    it('concurrent first requests with the same key and input create one row and replay the rest', async () => {
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 6 }, () => write('save', draft('race-same'), { key })),
      );
      expect(results.every((r) => r.answer?.outcome === 'ok')).toBe(true);
      expect(results.filter((r) => !ans(r).replayed)).toHaveLength(1);
      expect(new Set(results.map((r) => idOf(r))).size).toBe(1);
      expect(await rowsOf(`${PREFIX} race-same%`)).toHaveLength(1);
    });

    it('concurrent requests reusing one key with different input: one write, the rest invalid/reused', async () => {
      const key = randomUUID();
      const results = await Promise.all(
        Array.from({ length: 4 }, (_, i) => write('save', draft(`race-diff-${i}`), { key })),
      );
      expect(results.filter((r) => r.answer?.outcome === 'ok')).toHaveLength(1);
      expect(results.filter((r) => r.answer?.outcome === 'invalid')).toHaveLength(3);
      expect(await rowsOf(`${PREFIX} race-diff-%`)).toHaveLength(1);
    });

    it('the same key from two actors is independent', async () => {
      const key = randomUUID();
      const [a, b] = await Promise.all([
        write('save', draft('race-actor-a'), { key }),
        write('save', draft('race-actor-b'), { key, who: admin2 }),
      ]);
      expect([a.answer?.outcome, b.answer?.outcome]).toEqual(['ok', 'ok']);
      expect(await rowsOf(`${PREFIX} race-actor-%`)).toHaveLength(2);
    });

    it('concurrent updates under one version: one wins, the other conflicts', async () => {
      const created = await write('save', draft('race-version'));
      const id = idOf(created);
      const results = await Promise.all([
        write('save', { ...draft('race-version-a'), id, expectedVersion: 'v1' }),
        write('save', { ...draft('race-version-b'), id, expectedVersion: 'v1' }),
      ]);
      expect(results.map((r) => r.answer?.outcome).sort()).toEqual(['conflict', 'ok']);
      expect((await rowsOf(`${PREFIX} race-version%`))[0].revision).toBe(2);
    });
  });

  describe('workspace isolation and data range', () => {
    let otherWorkspace = '';
    beforeAll(async () => {
      otherWorkspace = (
        await migrateHandle.pool.query(
          'insert into core.workspaces (name) values ($1) returning id',
          [`${PREFIX}-ws`],
        )
      ).rows[0].id;
      workspaceIds.push(otherWorkspace);
    });

    it('lists and projects only the session workspace and only global notices (no invented site grants)', async () => {
      const mine = await insertRow(WORKSPACE_ID, 'ws-mine', null, '2099-01-01 00:00:00');
      const site = await insertRow(WORKSPACE_ID, 'ws-site', 'MEM', '2099-01-01 00:00:00');
      const foreign = await insertRow(otherWorkspace, 'ws-foreign', null, '2099-01-01 00:00:00');
      const listed = (
        await app.inject({
          method: 'GET',
          url: '/api/v1/platform/notices',
          headers: cookieHeader(user.cookie),
        })
      )
        .json<{ data: { items: Array<{ id: string }> } }>()
        .data.items.map((i) => i.id);
      expect(listed).toContain(mine);
      expect(listed).not.toContain(site);
      expect(listed).not.toContain(foreign);
      const home = (await query(null))
        .json<{ data: Array<{ id: string }> }>()
        .data.map((r) => r.id);
      expect(home).toContain(mine);
      expect(home).not.toContain(foreign);
      const mem = (await query('MEM'))
        .json<{ data: Array<{ id: string }> }>()
        .data.map((r) => r.id);
      expect(mem).toContain(site);
      expect(mem).not.toContain(mine);
    });

    it("cannot update or delete another workspace's notice", async () => {
      const foreign = await insertRow(
        otherWorkspace,
        'ws-foreign-write',
        null,
        '2099-01-01 00:00:00',
      );
      const result = await write('delete', { id: foreign, expectedVersion: 'v1' });
      expect(result.answer?.outcome).toBe('not_found');
      expect(await rowsOf(`${PREFIX} ws-foreign-write`)).toHaveLength(1);
    });
  });

  describe('POST /api/v1/menu-query home.notices', () => {
    it('projects only id/title/scopeId/until, exact target, unexpired, deterministic, no-store', async () => {
      const soon = await insertRow(WORKSPACE_ID, 'home-b', null, '2098-02-01 00:00:00');
      const sooner = await insertRow(WORKSPACE_ID, 'home-a', null, '2098-01-01 00:00:00');
      await insertRow(WORKSPACE_ID, 'home-past', null, '2000-01-01 00:00:00');
      const res = await query(null);
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('no-store');
      const body = res.json<{
        outcome: string;
        data: Array<Record<string, unknown>>;
        trust: unknown;
        assessments: unknown[];
      }>();
      expect(body).toMatchObject({ outcome: 'ok', trust: null, assessments: [] });
      for (const row of body.data)
        expect(Object.keys(row).sort()).toEqual(['id', 'scopeId', 'title', 'until']);
      const ids = body.data.map((r) => r.id);
      expect(ids.indexOf(sooner)).toBeLessThan(ids.indexOf(soon));
      expect(body.data.find((r) => r.id === soon)).toMatchObject({
        until: '2098-02-01T00:00:00',
        scopeId: null,
      });
    });

    it('is empty (not an error) for a target with no notices', async () => {
      const res = await query('NO-SUCH-SITE');
      expect(res.json()).toMatchObject({ outcome: 'empty', data: null });
    });

    it('expiry is strict at second precision against the Seoul wall clock', async () => {
      const at = new Date('2026-10-29T00:00:00Z'); // 2026-10-29T09:00:00 Seoul
      const equal = await insertRow(WORKSPACE_ID, 'edge-equal', 'EDGE', '2026-10-29 09:00:00');
      const after = await insertRow(WORKSPACE_ID, 'edge-after', 'EDGE', '2026-10-29 09:00:01');
      const service = createPlatformNoticeService({
        db: dbHandle.db,
        checkService: {} as CheckService,
        now: () => at,
      });
      const result = await service.homeNotices(
        { actor_id: admin.id, workspace_id: WORKSPACE_ID, role_level: 'admin' },
        'EDGE',
      );
      expect(result.outcome).toBe('ok');
      expect((result.data ?? []).map((r) => r.id)).toEqual([after]);
      expect((result.data ?? []).map((r) => r.id)).not.toContain(equal);
    });

    it('answers 401 without a session and HTTP 200 error envelopes for malformed requests', async () => {
      expect((await query(null, null)).statusCode).toBe(401);
      const cases: unknown[] = [
        { endpoint: 'home.notices', context: { scopeId: null }, params: { targetScopeId: null } },
        { endpoint: 'home.notices', context: {}, params: { targetScopeId: null, extra: 1 } },
        { endpoint: 'home.notices', context: {}, params: { targetScopeId: 5 } },
        { endpoint: 'home.notices', context: {}, params: { targetScopeId: null }, extra: true },
        { endpoint: 'productivity.summary', context: {}, params: {} },
      ];
      for (const body of cases) {
        const res = await query(null, admin, body);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({ outcome: 'error', data: null });
      }
      const malformed = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-query',
        headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie) },
        payload: '{nope',
      });
      expect(malformed.json()).toMatchObject({ outcome: 'error', data: null });
    });

    it('serves a non-console user the same Home projection (notice:view is granted to every session)', async () => {
      const res = await query(null, user);
      expect(['ok', 'empty']).toContain(res.json<{ outcome: string }>().outcome);
    });
  });

  describe('console:access is judged again after each lock wait', () => {
    // A grant-only user (not a global admin) holds `workspace.admin` through permission_grants, so the grant can be lost.
    const grantConsole = async (who: Person) => {
      await migrateHandle.pool.query(
        "insert into permission.permission_grants (workspace_id, actor_id, capability, granted_by_actor_id) values ($1, $2, 'workspace.admin', $3)",
        [WORKSPACE_ID, who.id, admin.id],
      );
    };
    const changes: Array<[string, (who: Person) => Promise<unknown>]> = [
      [
        'grant revoked',
        (who) =>
          migrateHandle.pool.query(
            "update permission.permission_grants set revoked_at = now(), revoked_by_actor_id = $2, revoked_reason = 'lock-wait' where actor_id = $1 and capability = 'workspace.admin'",
            [who.id, admin.id],
          ),
      ],
      [
        'explicit deny',
        (who) =>
          migrateHandle.pool.query(
            "insert into permission.permission_denies (workspace_id, actor_id, capability, reason, created_by_actor_id) values ($1, $2, 'workspace.admin', 'lock-wait', $3)",
            [WORKSPACE_ID, who.id, admin.id],
          ),
      ],
      [
        'grant expired',
        (who) =>
          migrateHandle.pool.query(
            "update permission.permission_grants set expires_at = now() - interval '1 second' where actor_id = $1 and capability = 'workspace.admin'",
            [who.id],
          ),
      ],
    ];

    /**
     * Lock barrier. A second connection (migrate pool; the app pool has max >= 6, so the request runs on another
     * connection) takes `hold`, `start` is issued, and `change` runs only once pg_locks shows an ungranted lock
     * request whose blocker is that very holder backend (and the request is unsettled). A request that never queues
     * fails the test instead of passing on a timeout.
     */
    async function afterLockWait<T>(
      hold: (c: Holder) => Promise<unknown>,
      start: () => Promise<T>,
      change: () => Promise<unknown>,
      queued = 1,
    ) {
      const holder = await migrateHandle.pool.connect();
      try {
        await holder.query('begin');
        await hold(holder);
        let settled = false;
        const pending = start().finally(() => {
          settled = true;
        });
        const deadline = Date.now() + 15_000;
        for (;;) {
          const { rows } = await holder.query(
            `select count(*)::int as n
               from pg_locks l join pg_stat_activity a on a.pid = l.pid
              where not l.granted and pg_backend_pid() = any(pg_blocking_pids(a.pid))`,
          );
          if (rows[0].n >= queued) break;
          if (Date.now() > deadline)
            throw new Error(`only ${rows[0].n} of ${queued} requests queued behind the holder`);
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
        expect(settled).toBe(false);
        await change();
        await holder.query('commit');
        return await pending;
      } catch (error) {
        await holder.query('rollback').catch(() => undefined);
        throw error;
      } finally {
        holder.release();
      }
    }

    // The same two-int key the service takes, so the request queues on (actor, idempotency key).
    const holdKey = (who: Person, key: string) => (c: Holder) =>
      c.query('select pg_advisory_xact_lock(hashtext($1), hashtext($2))', [who.id, key]);
    const holdRow = (id: string) => (c: Holder) =>
      c.query('select 1 from platform.notices where id = $1 for update', [id]);

    const noticeState = async (id: string) =>
      JSON.stringify(
        (await migrateHandle.pool.query('select * from platform.notices where id = $1', [id])).rows,
      );

    const grantedUser = async () => {
      const who = await newPerson('user');
      await grantConsole(who);
      return who;
    };

    it('control: with the grant intact a create queued on the (actor, key) lock commits', async () => {
      const who = await grantedUser();
      const key = randomUUID();
      const got = await afterLockWait(
        holdKey(who, key),
        () => write('save', draft('lock-ctl-create'), { who, key }),
        async () => undefined,
      );
      expect(got.answer, JSON.stringify(got.answer)).toMatchObject({
        outcome: 'ok',
        replayed: false,
      });
      expect(await rowsOf(`${PREFIX} lock-ctl-create%`)).toHaveLength(1);
      expect(await cacheCount(who)).toBe(1);
    });

    it('control: with the grant intact an update queued on the object row lock commits', async () => {
      const who = await grantedUser();
      const id = idOf(await write('save', draft('lock-ctl-update')));
      const got = await afterLockWait(
        holdRow(id),
        () => write('save', { ...draft('lock-ctl-updated'), id, expectedVersion: 'v1' }, { who }),
        async () => undefined,
      );
      expect(got.answer, JSON.stringify(got.answer)).toMatchObject({ outcome: 'ok' });
      expect((await rowsOf(`${PREFIX} lock-ctl-updated%`))[0].revision).toBe(2);
    });

    it.each(changes)(
      'create queued on the (actor, key) lock is forbidden when access is lost (%s); no row, no cache',
      async (_label, change) => {
        const who = await grantedUser();
        const key = randomUUID();
        const got = await afterLockWait(
          holdKey(who, key),
          () => write('save', draft('lock-create'), { who, key }),
          () => change(who),
        );
        expect(got.answer).toMatchObject({
          outcome: 'forbidden',
          data: null,
          version: null,
          replayed: false,
        });
        expect(await rowsOf(`${PREFIX} lock-create%`)).toHaveLength(0);
        expect(await cacheCount(who)).toBe(0);
      },
    );

    it.each(changes)(
      'replay queued on the (actor, key) lock reveals no cached body when access is lost (%s)',
      async (_label, change) => {
        const who = await grantedUser();
        const key = randomUUID();
        const first = await write('save', draft('lock-replay'), { who, key });
        expect(first.answer?.outcome).toBe('ok');
        const id = idOf(first);
        const stateBefore = await noticeState(id);
        const cacheBefore = JSON.stringify(await cacheRow(who.id, key));
        const got = await afterLockWait(
          holdKey(who, key),
          () => write('save', draft('lock-replay'), { who, key }),
          () => change(who),
        );
        expect(got.answer).toMatchObject({
          outcome: 'forbidden',
          data: null,
          version: null,
          replayed: false,
        });
        expect(await noticeState(id)).toBe(stateBefore);
        expect(JSON.stringify(await cacheRow(who.id, key))).toBe(cacheBefore);
        expect(await cacheCount(who)).toBe(1);
      },
    );

    it.each(changes)(
      'update queued on the object row lock is forbidden when access is lost (%s); row, revision and cache stay',
      async (_label, change) => {
        const who = await grantedUser();
        const id = idOf(await write('save', draft('lock-update')));
        const stateBefore = await noticeState(id);
        const got = await afterLockWait(
          holdRow(id),
          () =>
            write('save', { ...draft('lock-update-taken'), id, expectedVersion: 'v1' }, { who }),
          () => change(who),
        );
        expect(got.answer).toMatchObject({ outcome: 'forbidden', data: null, version: null });
        expect(await noticeState(id)).toBe(stateBefore);
        expect(await cacheCount(who)).toBe(0);
      },
    );

    it.each(changes)(
      'delete queued on the object row lock is forbidden when access is lost (%s), even with a stale version: no conflict version, row kept',
      async (_label, change) => {
        const who = await grantedUser();
        const id = idOf(await write('save', draft('lock-delete')));
        const stateBefore = await noticeState(id);
        const got = await afterLockWait(
          holdRow(id),
          () => write('delete', { id, expectedVersion: 'v9' }, { who }),
          () => change(who),
        );
        expect(got.answer).toMatchObject({ outcome: 'forbidden', data: null, version: null });
        expect(await noticeState(id)).toBe(stateBefore);
        expect(await cacheCount(who)).toBe(0);
      },
    );

    describe('upper- and lower-case spellings of one UUID key are one key', () => {
      const aliasWriter = async () => {
        const who = await newPerson('admin');
        const lower = randomUUID();
        return { who, lower, upper: lower.toUpperCase() };
      };

      // The holder takes the canonical (lower-case) advisory key. Both spellings must queue behind it (2 queued
      // requests observed in pg_locks) and then run one after the other; the app pool has room for both queued
      // writers while the migrate pool supplies the holder and the observer.
      const bothQueued = (
        who: Person,
        lower: string,
        a: () => Promise<unknown>,
        b: () => Promise<unknown>,
      ) =>
        afterLockWait(
          holdKey(who, lower),
          () => Promise.all([a(), b()]),
          async () => undefined,
          2,
        );

      it('same content: one notice, one receipt, the second request replays', async () => {
        const { who, lower, upper } = await aliasWriter();
        const results = (await bothQueued(
          who,
          lower,
          () => write('save', draft('alias-same'), { who, key: lower }),
          () => write('save', draft('alias-same'), { who, key: upper }),
        )) as Array<Awaited<ReturnType<typeof write>>>;
        expect(results.map((r) => ans(r).outcome)).toEqual(['ok', 'ok']);
        expect(results.map((r) => ans(r).replayed).sort()).toEqual([false, true]);
        expect(new Set(results.map((r) => idOf(r))).size).toBe(1);
        expect(await rowsOf(`${PREFIX} alias-same%`)).toHaveLength(1);
        expect(await cacheCount(who)).toBe(1);
        expect((await cacheRow(who.id, lower)).response_status).toBe(200);
      });

      it('different content: one notice, the other request is invalid/reused', async () => {
        const { who, lower, upper } = await aliasWriter();
        const results = (await bothQueued(
          who,
          lower,
          () => write('save', draft('alias-diff-a'), { who, key: lower }),
          () => write('save', draft('alias-diff-b'), { who, key: upper }),
        )) as Array<Awaited<ReturnType<typeof write>>>;
        expect(results.map((r) => ans(r).outcome).sort()).toEqual(['invalid', 'ok']);
        const rejected = results.map(ans).find((a) => a.outcome === 'invalid');
        expect(rejected).toMatchObject({
          data: null,
          fieldErrors: [{ path: ['idempotencyKey'], code: 'reused' }],
        });
        expect(await rowsOf(`${PREFIX} alias-diff-%`)).toHaveLength(1);
        expect(await cacheCount(who)).toBe(1);
      });

      it('a header and a body that differ only in case stay an error (exact equality), writing nothing', async () => {
        const { who, lower, upper } = await aliasWriter();
        const got = await write('save', draft('alias-raw'), { who, key: lower, headerKey: upper });
        expect(got.answer).toMatchObject({ outcome: 'error', data: null });
        expect(await rowsOf(`${PREFIX} alias-raw%`)).toHaveLength(0);
        expect(await cacheCount(who)).toBe(0);
      });
    });
  });

  describe('roles and teardown graph', () => {
    it('grants the app role DML only and the migrate role ownership of the table', async () => {
      const { rows } = await migrateHandle.pool.query(
        `select has_table_privilege('platform_app', 'platform.notices', 'SELECT') as sel,
                has_table_privilege('platform_app', 'platform.notices', 'INSERT') as ins,
                has_table_privilege('platform_app', 'platform.notices', 'UPDATE') as upd,
                has_table_privilege('platform_app', 'platform.notices', 'DELETE') as del,
                has_table_privilege('platform_app', 'platform.notices', 'TRUNCATE') as trunc,
                has_table_privilege('platform_migrate', 'platform.notices', 'TRUNCATE') as migrate`,
      );
      expect(rows[0]).toEqual({
        sel: true,
        ins: true,
        upd: true,
        del: true,
        trunc: false,
        migrate: true,
      });
    });
  });
});
