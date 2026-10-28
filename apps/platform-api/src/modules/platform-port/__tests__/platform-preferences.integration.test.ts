// #1104 (server step) — platform port `readPreferences`, `patchPreferences`, `importPreferences` (ADR-0098) against a real
// Postgres (throwaway DB only), through the real Fastify routes. Every person is a fresh actor, so rows never collide with
// other suites sharing the workspace and the global 100/min/actor rate limit stays out of the way.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { uid } from '../../../test-support/ids.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-prefs');

type Person = { id: string; cookie: string; csrf: string };
type Snapshot = { values: Record<string, unknown>; importedAt: string | null };
type Envelope = {
  outcome: string;
  data: Snapshot | null;
  assessments: unknown[];
  trust: unknown;
  correlationId: string;
  message?: string;
};

const key = (name: string) => `columns:${name}`;
const manyKeys = (prefix: string, count: number) =>
  Object.fromEntries(Array.from({ length: count }, (_, i) => [key(`${prefix}${i}`), i]));

describe.skipIf(!runIntegration)('platform port preferences (#1104)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;

  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function newPerson(): Promise<Person> {
    const externalId = `${PREFIX}-${n++}`;
    const { id } = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      displayName: 'Prefs user',
      roleLevel: 'user',
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

  const read = (who: Person) =>
    app.inject({
      method: 'GET',
      url: '/api/v1/platform/preferences',
      headers: cookieHeader(who.cookie),
    });
  const write = (
    path: 'patch' | 'import',
    body: unknown,
    who: Person,
    opts: { csrf?: string | null; raw?: boolean } = {},
  ) => {
    const csrf = opts.csrf === undefined ? who.csrf : opts.csrf;
    return app.inject({
      method: 'POST',
      url: `/api/v1/platform/preferences/${path}`,
      headers: {
        'content-type': 'application/json',
        ...cookieHeader(who.cookie),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
      },
      payload: opts.raw ? (body as string) : JSON.stringify(body),
    });
  };
  const patch = (who: Person, body: unknown) => write('patch', body, who);
  const importFrom = (who: Person, values: unknown) => write('import', { values }, who);
  const stored = async (who: Person) => {
    const res = await migrateHandle.pool.query(
      'select values, imported_at from platform.preferences where actor_id = $1',
      [who.id],
    );
    return res.rows;
  };
  const body = (res: { json<T>(): T }) => res.json<Envelope>();
  const ok = (res: { statusCode: number; json<T>(): T }) => {
    expect(res.statusCode).toBe(200);
    const env = body(res);
    expect(env.outcome).toBe('ok');
    return env.data as Snapshot;
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    // Mock-logins and unauthenticated probes count against the per-IP limit in core.rate_limits, shared by every suite in the
    // run (#681): clear it on the way in and out, as the conformance suite does.
    await migrateHandle.pool.query('delete from core.rate_limits');
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
  });

  afterAll(async () => {
    if (actorIds.length > 0) {
      // children before parents; audit_log needs the migrate role (apps/platform-api/AGENTS.md).
      for (const [table, column] of [
        ['platform.preferences', 'actor_id'],
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
    if (workspaceIds.length > 0) {
      await migrateHandle.pool.query('delete from core.workspaces where id = any($1)', [
        workspaceIds,
      ]);
    }
    await migrateHandle?.pool.query('delete from core.rate_limits');
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  describe('session and CSRF', () => {
    it('refuses a missing cookie and an expired session, with no-store', async () => {
      const none = await app.inject({ method: 'GET', url: '/api/v1/platform/preferences' });
      expect(none.statusCode).toBe(401);
      expect(none.headers['cache-control']).toBe('no-store');
      expect(none.json()).toMatchObject({ code: 'auth.session_invalid' });

      const who = await newPerson();
      await migrateHandle.pool.query(
        "update core.sessions set expires_at = now() - interval '1 minute' where id = $1",
        [who.cookie],
      );
      const expired = await read(who);
      expect(expired.statusCode).toBe(401);
      expect(expired.json()).toMatchObject({ code: 'auth.session_invalid' });
      expect(expired.headers['cache-control']).toBe('no-store');
    });

    it('refuses a session bound to another workspace on read and write, and stores nothing for it', async () => {
      const workspaceId = randomUUID();
      workspaceIds.push(workspaceId);
      await migrateHandle.pool.query('insert into core.workspaces (id, name) values ($1, $2)', [
        workspaceId,
        `${PREFIX}-other`,
      ]);
      const { id } = await insertActorRow(dbHandle, {
        workspaceId,
        externalId: `${PREFIX}-foreign`,
        roleLevel: 'user',
      });
      actorIds.push(id);
      const cookie = `${PREFIX}-foreign-session`;
      const csrf = `${PREFIX}-foreign-csrf`;
      await migrateHandle.pool.query(
        `insert into core.sessions (id, actor_id, workspace_id, expires_at, last_seen_at, created_at, csrf_token)
         values ($1, $2, $3, now() + interval '1 hour', now(), now(), $4)`,
        [cookie, id, workspaceId, csrf],
      );
      const foreign: Person = { id, cookie, csrf };
      for (const res of [
        await read(foreign),
        await patch(foreign, { set: { lang: 'ko' } }),
        await importFrom(foreign, { lang: 'ko' }),
      ]) {
        expect(res.json()).toMatchObject({ code: 'auth.workspace_mismatch' });
        expect(res.headers['cache-control']).toBe('no-store');
      }
      expect(await stored(foreign)).toEqual([]);
    });

    it.each([['patch'], ['import']] as const)(
      'POST %s needs the CSRF token and writes nothing without it',
      async (path) => {
        const who = await newPerson();
        const payload = path === 'patch' ? { set: { lang: 'ko' } } : { values: { lang: 'ko' } };
        for (const csrf of [null, `${who.csrf}x`]) {
          const res = await write(path, payload, who, { csrf });
          expect(res.statusCode).toBe(403);
          expect(res.json()).toEqual({ code: 'csrf.invalid', message: 'csrf token mismatch' });
          expect(res.headers['cache-control']).toBe('no-store');
        }
        expect(await stored(who)).toEqual([]);
      },
    );
  });

  describe('read and patch', () => {
    it('answers an empty snapshot in a safe envelope for a user that never wrote', async () => {
      const who = await newPerson();
      const res = await read(who);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(ok(res)).toEqual({ values: {}, importedAt: null });
      expect(body(res)).toMatchObject({ trust: null, assessments: [] });
      expect(body(res).correlationId).toEqual(expect.any(String));
      expect(await stored(who)).toEqual([]);
    });

    it('stores null as a value, merges by key, removes, and never stamps importedAt', async () => {
      const who = await newPerson();
      const [a, b] = [key('a'), key('b')];
      expect(ok(await patch(who, { set: { [a]: { n: [1, 'x', null] }, [b]: null } }))).toEqual({
        values: { [a]: { n: [1, 'x', null] }, [b]: null },
        importedAt: null,
      });
      const merged = ok(await patch(who, { remove: [b], set: { lang: 'ko' } }));
      expect(merged).toEqual({
        values: { [a]: { n: [1, 'x', null] }, lang: 'ko' },
        importedAt: null,
      });
      expect(ok(await patch(who, { set: { [b]: null } })).values[b]).toBeNull();
      expect(ok(await read(who)).values).toEqual({
        [a]: { n: [1, 'x', null] },
        lang: 'ko',
        [b]: null,
      });
      expect((await stored(who))[0]).toMatchObject({ imported_at: null });
    });

    it('rejects forged identity, bad keys, set/remove overlap, deep JSON and NUL as error, and writes nothing', async () => {
      const who = await newPerson();
      const attempts: unknown[] = [
        { userId: 'someone-else', set: { lang: 'ko' } },
        { set: { 'favorites:someone-else': 1 } },
        { set: { lang: 'ko' }, remove: ['lang'] },
        { set: { recents: Array.from({ length: 40 }).reduce<unknown>((inner) => [inner], 1) } },
        { set: { lang: 'a\u0000b' } },
        { set: { 'columns:probe': { 'bad\u0000key': 1 } } },
        { set: { 'columns:probe': [{ ok: [{ 'bad\u0000key': 1 }] }] } },
      ];
      for (const attempt of attempts) {
        const res = await patch(who, attempt);
        expect(res.statusCode).toBe(200);
        expect(body(res)).toMatchObject({ outcome: 'error', data: null });
      }
      const malformed = await write('patch', '{not json', who, { raw: true });
      expect(malformed.statusCode).toBe(200);
      expect(body(malformed)).toMatchObject({ outcome: 'error', data: null });
      expect(await stored(who)).toEqual([]);
    });

    it('answers too_large, not error, for a size limit, and keeps the previous values', async () => {
      const who = await newPerson();
      ok(await patch(who, { set: { lang: 'ko' } }));
      const tooBig = [
        { set: manyKeys('m', 201) },
        { set: { recents: 'x'.repeat(65_540) } },
        {
          set: Object.fromEntries(
            Array.from({ length: 5 }, (_, i) => [key(`b${i}`), 'y'.repeat(60_000)]),
          ),
        },
      ];
      for (const attempt of tooBig) {
        expect(body(await patch(who, attempt))).toMatchObject({ outcome: 'too_large', data: null });
      }
      expect(ok(await read(who))).toEqual({ values: { lang: 'ko' }, importedAt: null });
    });

    it('caps the account at 200 keys across existing keys and leaves a refused patch unapplied', async () => {
      const who = await newPerson();
      ok(await patch(who, { set: manyKeys('first', 150) }));
      const over = await patch(who, { set: manyKeys('second', 60) });
      expect(body(over)).toMatchObject({ outcome: 'too_large', data: null });
      expect(Object.keys(ok(await read(who)).values)).toHaveLength(150);
      // Replacing and removing keys at the cap still works.
      const swapped = ok(
        await patch(who, {
          set: manyKeys('first', 50),
          remove: [key('first100'), key('first101')],
        }),
      );
      expect(Object.keys(swapped.values)).toHaveLength(148);
      ok(await patch(who, { set: manyKeys('second', 52) }));
    });
  });

  describe('import', () => {
    it('keeps server values, saves missing keys once, stamps importedAt, and is a permanent no-op after removal', async () => {
      const who = await newPerson();
      const [held, missing, later] = [key('held'), key('missing'), key('later')];
      ok(await patch(who, { set: { [held]: 'server' } }));
      const done = ok(await importFrom(who, { [held]: 'browser', [missing]: 'browser' }));
      expect(done.values).toEqual({ [held]: 'server', [missing]: 'browser' });
      expect(done.importedAt).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);

      // A patch never moves the acknowledgement; removing an imported key does not reopen the import.
      expect(ok(await patch(who, { remove: [missing] })).importedAt).toBe(done.importedAt);
      const again = ok(await importFrom(who, { [missing]: 'browser', [later]: 'browser' }));
      expect(again).toEqual({ values: { [held]: 'server' }, importedAt: done.importedAt });
      expect(ok(await read(who))).toEqual(again);
    });

    it('rejects a forged identity and an oversized import without an acknowledgement or any key', async () => {
      const who = await newPerson();
      const forged = await write('import', { values: { lang: 'ko' }, actorId: 'x' }, who);
      expect(body(forged)).toMatchObject({ outcome: 'error', data: null });
      expect(body(await importFrom(who, manyKeys('big', 201)))).toMatchObject({
        outcome: 'too_large',
        data: null,
      });
      expect(ok(await read(who))).toEqual({ values: {}, importedAt: null });
      expect(await stored(who)).toEqual([]);
    });

    it('rejects a NUL in an object key, nested or in an array, without an acknowledgement or any key', async () => {
      const who = await newPerson();
      for (const values of [
        { [key('probe')]: { 'bad\u0000key': 1 } },
        { [key('probe')]: [{ deeper: { 'bad\u0000key': 1 } }] },
      ]) {
        const res = await importFrom(who, values);
        expect(res.statusCode).toBe(200);
        expect(body(res)).toMatchObject({ outcome: 'error', data: null });
      }
      expect(await stored(who)).toEqual([]);
      expect(ok(await read(who))).toEqual({ values: {}, importedAt: null });
    });

    it('rolls back an import that would pass the account cap: values and acknowledgement stay as they were', async () => {
      const who = await newPerson();
      ok(await patch(who, { set: manyKeys('held', 150) }));
      expect(body(await importFrom(who, manyKeys('extra', 60)))).toMatchObject({
        outcome: 'too_large',
        data: null,
      });
      const row = (await stored(who))[0];
      expect(Object.keys(row.values)).toHaveLength(150);
      expect(row.imported_at).toBeNull();
      // The import has not been used up: a smaller one still succeeds.
      expect(ok(await importFrom(who, manyKeys('extra', 50))).importedAt).not.toBeNull();
    });
  });

  describe('concurrency', () => {
    it('keeps every key of concurrent first patches', async () => {
      const who = await newPerson();
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) => patch(who, { set: { [key(`c${i}`)]: i } })),
      );
      for (const res of results) ok(res);
      expect(Object.keys(ok(await read(who)).values).sort()).toEqual(
        Array.from({ length: 8 }, (_, i) => key(`c${i}`)).sort(),
      );
      expect(await stored(who)).toHaveLength(1);
    });

    it('lets concurrent first patches never exceed the account cap', async () => {
      const who = await newPerson();
      const results = await Promise.all(
        ['p', 'q', 'r'].map((prefix) => patch(who, { set: manyKeys(prefix, 100) })),
      );
      const outcomes = results.map((res) => body(res).outcome).sort();
      expect(outcomes).toEqual(['ok', 'ok', 'too_large']);
      expect(Object.keys((await stored(who))[0].values)).toHaveLength(200);
    });

    it('serialises a first patch and a first import: both land, the acknowledgement is set once', async () => {
      const who = await newPerson();
      const [p, i] = await Promise.all([
        patch(who, { set: { [key('patched')]: 1 } }),
        importFrom(who, { [key('imported')]: 2 }),
      ]);
      ok(p);
      ok(i);
      const final = ok(await read(who));
      expect(final.values).toEqual({ [key('patched')]: 1, [key('imported')]: 2 });
      expect(final.importedAt).not.toBeNull();
    });

    it('lets exactly one of two concurrent imports win, whole', async () => {
      const who = await newPerson();
      const [x, y] = await Promise.all([
        importFrom(who, { [key('x1')]: 1, [key('x2')]: 2 }),
        importFrom(who, { [key('y1')]: 1, [key('y2')]: 2 }),
      ]);
      ok(x);
      ok(y);
      const final = ok(await read(who));
      const names = Object.keys(final.values).sort();
      expect([
        [key('x1'), key('x2')],
        [key('y1'), key('y2')],
      ]).toContainEqual(names);
      expect(ok(x).importedAt).toBe(ok(y).importedAt);
      expect(final.importedAt).toBe(ok(x).importedAt);
    });
  });

  describe('isolation and persistence', () => {
    it('keeps two actors apart: neither reads nor changes the other', async () => {
      const [first, second] = [await newPerson(), await newPerson()];
      const shared = key('shared');
      ok(await patch(first, { set: { [shared]: 'first' } }));
      expect(ok(await read(second))).toEqual({ values: {}, importedAt: null });
      ok(await patch(second, { set: { [shared]: 'second' } }));
      ok(await importFrom(second, { [key('only-second')]: 1 }));
      expect(ok(await read(first))).toEqual({ values: { [shared]: 'first' }, importedAt: null });
      const rows = await migrateHandle.pool.query(
        'select actor_id, workspace_id from platform.preferences where actor_id = any($1)',
        [[first.id, second.id]],
      );
      expect(rows.rows).toHaveLength(2);
      expect(rows.rows.every((r) => r.workspace_id === WORKSPACE_ID)).toBe(true);
    });

    it('reads the same values after the server restarts', async () => {
      const who = await newPerson();
      ok(await patch(who, { set: { lang: 'ko', [key('kept')]: { a: [1] } } }));
      const imported = ok(await importFrom(who, { [key('from-browser')]: true }));

      const restartedDb = createDb(APP_URL);
      const restarted = await buildServer({ config: loadConfig(), dbHandle: restartedDb });
      try {
        await restarted.ready();
        const res = await restarted.inject({
          method: 'GET',
          url: '/api/v1/platform/preferences',
          headers: cookieHeader(who.cookie),
        });
        expect(ok(res)).toEqual({
          values: { lang: 'ko', [key('kept')]: { a: [1] }, [key('from-browser')]: true },
          importedAt: imported.importedAt,
        });
      } finally {
        await restarted.close();
        await restartedDb.close();
      }
    });
  });

  describe('storage suitability, raw body size and combined key bound (final review C1-C3)', () => {
    const MAX = 262_144;
    const padded = (core: string, bytes: number) =>
      core + ' '.repeat(bytes - Buffer.byteLength(core));

    it.each([
      ['patch', '{"set":{"lang":"a\\ud800b"}}'],
      ['patch', '{"set":{"lang":"\\udc00"}}'],
      ['patch', '{"set":{"columns:probe":{"bad\\ud800key":1}}}'],
      ['patch', '{"set":{"columns:probe":[{"deep":{"\\udfffk":1}}]}}'],
      ['import', '{"values":{"lang":["\\ud800"]}}'],
      ['import', '{"values":{"columns:probe":{"bad\\udc00key":1}}}'],
    ] as const)(
      'POST %s with a lone surrogate (%s) is HTTP 200 error, with nothing stored or acknowledged',
      async (path, raw) => {
        const who = await newPerson();
        ok(await patch(who, { set: { lang: 'ko' } }));
        const before = await stored(who);
        const res = await write(path, raw, who, { raw: true });
        expect(res.statusCode).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(body(res)).toMatchObject({ outcome: 'error', data: null });
        expect(await stored(who)).toEqual(before);
      },
    );

    it('round-trips a valid surrogate pair (emoji) in a value and a nested key through patch and import', async () => {
      const who = await newPerson();
      const patched = ok(await patch(who, { set: { lang: '😀', [key('e')]: { '😀k': ['😀'] } } }));
      expect(patched.values).toEqual({ lang: '😀', [key('e')]: { '😀k': ['😀'] } });
      ok(await write('import', '{"values":{"columns:i":"\\ud83d\\ude00"}}', who, { raw: true }));
      expect(ok(await read(who)).values).toEqual({
        lang: '😀',
        [key('e')]: { '😀k': ['😀'] },
        [key('i')]: '😀',
      });
    });

    it.each([
      ['patch', '{"set":{"lang":"ko"}}'],
      ['import', '{"values":{"lang":"ko"}}'],
    ] as const)(
      'POST %s: a raw body over 262144 bytes of whitespace is too_large though its parsed value is tiny',
      async (path, core) => {
        const who = await newPerson();
        ok(await patch(who, { set: { [key('keep')]: 1 } }));
        const before = await stored(who);
        const res = await write(path, padded(core, MAX + 1), who, { raw: true });
        expect(res.statusCode).toBe(200);
        expect(res.headers['cache-control']).toBe('no-store');
        expect(body(res)).toMatchObject({ outcome: 'too_large', data: null });
        expect(await stored(who)).toEqual(before);
      },
    );

    it.each([
      ['patch', '{"set":{"lang":"%s"}}'],
      ['import', '{"values":{"lang":"%s"}}'],
    ] as const)(
      'POST %s: a raw body over the limit made of \\u escapes is too_large',
      async (path, template) => {
        const who = await newPerson();
        const res = await write(
          path,
          template.replace('%s', '\\u0041'.repeat(Math.ceil(MAX / 6) + 1)),
          who,
          { raw: true },
        );
        expect(res.statusCode).toBe(200);
        expect(body(res)).toMatchObject({ outcome: 'too_large', data: null });
        expect(await stored(who)).toEqual([]);
      },
    );

    it.each([
      ['patch', '{"set":{"lang":"ko"}}', { lang: 'ko' }],
      ['import', '{"values":{"lang":"ko"}}', { lang: 'ko' }],
    ] as const)(
      'POST %s: a raw body of exactly 262144 bytes is accepted',
      async (path, core, values) => {
        const who = await newPerson();
        expect(ok(await write(path, padded(core, MAX), who, { raw: true })).values).toEqual(values);
      },
    );

    it.each([['patch'], ['import']] as const)(
      'POST %s: an oversized body still needs the session and the CSRF token',
      async (path) => {
        const who = await newPerson();
        const raw = padded(
          path === 'patch' ? '{"set":{"lang":"ko"}}' : '{"values":{"lang":"ko"}}',
          MAX + 1,
        );
        const noCsrf = await write(path, raw, who, { raw: true, csrf: null });
        expect(noCsrf.statusCode).toBe(403);
        expect(noCsrf.json()).toEqual({ code: 'csrf.invalid', message: 'csrf token mismatch' });
        const noSession = await app.inject({
          method: 'POST',
          url: `/api/v1/platform/preferences/${path}`,
          headers: { 'content-type': 'application/json' },
          payload: raw,
        });
        expect(noSession.statusCode).toBe(401);
        expect(noSession.headers['cache-control']).toBe('no-store');
        expect(await stored(who)).toEqual([]);
      },
    );

    it('rejects 201 mixed set and remove keys without a mutation, and accepts exactly 200', async () => {
      const who = await newPerson();
      ok(await patch(who, { set: { lang: 'ko' } }));
      const before = await stored(who);
      const remove = (n: number) => Array.from({ length: n }, (_, i) => key(`r${i}`));
      const over = await patch(who, { set: manyKeys('s', 1), remove: remove(200) });
      expect(over.statusCode).toBe(200);
      expect(body(over)).toMatchObject({ outcome: 'too_large', data: null });
      expect(await stored(who)).toEqual(before);
      const exact = ok(await patch(who, { set: manyKeys('s', 100), remove: remove(100) }));
      expect(Object.keys(exact.values)).toHaveLength(101);
    });
  });
});
