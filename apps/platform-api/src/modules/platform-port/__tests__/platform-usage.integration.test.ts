// #622 — platform port `recordUsage`, `usageSummary`, `reportClientError` (own `platform.*` tables)
// and the annotation gate (ADR-0069 decisions 1, 2, 4, 8; ADR-0041). Route-level against a real
// Postgres (throwaway DB only). Rows are scoped to a per-run menu-id prefix and this suite's
// actors: other suites share the workspace.

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
const PREFIX = uid('it-usage');
const MENU = `${PREFIX}-menu`;

type Role = 'admin' | 'developer' | 'user';
type Person = { id: string; cookie: string; csrf: string };
type Envelope = {
  outcome: string;
  data: { preset: string; menus: Array<Record<string, unknown>> } | null;
  assessments: unknown[];
  trust: unknown;
  message?: string;
};

type Event = Record<string, unknown>;
const entry = (extra: Event = {}): Event => ({
  name: 'entry',
  menuId: MENU,
  spaceId: 'operations',
  path: '/operations/usage',
  at: 1_700_000_000_000,
  sessionId: 'tab-1',
  ...extra,
});
const dwell = (extra: Event = {}): Event => ({
  name: 'dwell',
  menuId: MENU,
  spaceId: 'operations',
  path: '/operations/usage',
  at: 1_700_000_005_000,
  sessionId: 'tab-1',
  dwellMs: 5000,
  enteredAt: 1_700_000_000_000,
  ...extra,
});
const report = (extra: Event = {}): Event => ({
  correlationId: 'client-abc-123',
  menuId: MENU,
  spaceId: 'operations',
  path: '/operations/usage',
  name: 'TypeError',
  ...extra,
});

describe.skipIf(!runIntegration)(
  'platform port usage, client errors, annotation gate (#622)',
  () => {
    let dbHandle: DbHandle;
    let migrateHandle: DbHandle;
    let app: FastifyInstance;
    const actorIds: string[] = [];
    let n = 0;
    let admin: Person;
    let user: Person;

    const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

    async function newPerson(roleLevel: Role): Promise<Person> {
      const externalId = `${PREFIX}-${roleLevel}-${n++}`;
      const { id } = await insertActorRow(dbHandle, {
        workspaceId: WORKSPACE_ID,
        externalId,
        displayName: `Usage ${roleLevel}`,
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

    /** Fresh people for tests that need several: the per-actor rate budget of `admin` and `user` is shared by the whole file. */
    const crew = async (count: number) => {
      const people: Person[] = [];
      for (let i = 0; i < count; i++) people.push(await newPerson('developer'));
      return people;
    };

    /** A POST with the person's cookie and CSRF token unless overridden. */
    const post = (
      path: string,
      body: unknown,
      who?: Person,
      opts: {
        csrf?: string | null;
        cookie?: string | null;
        raw?: boolean;
        headers?: Record<string, string>;
      } = {},
    ) => {
      const cookie = opts.cookie === undefined ? who?.cookie : (opts.cookie ?? undefined);
      const csrf = opts.csrf === undefined ? who?.csrf : (opts.csrf ?? undefined);
      return app.inject({
        method: 'POST',
        url: `/api/v1/platform${path}`,
        headers: {
          'content-type': 'application/json',
          ...(cookie ? cookieHeader(cookie) : {}),
          ...(csrf ? { 'x-csrf-token': csrf } : {}),
          ...opts.headers,
        },
        payload: opts.raw ? (body as string) : JSON.stringify(body),
      });
    };
    const record = (events: Event[], who: Person = user) => post('/usage-events', { events }, who);
    const summary = (query: string, who: Person = admin) =>
      app.inject({
        method: 'GET',
        url: `/api/v1/platform/usage-summary${query}`,
        headers: cookieHeader(who.cookie),
      });
    const mineOf = (envelopeBody: Envelope) =>
      (envelopeBody.data?.menus ?? []).filter((m) => String(m.menuId).startsWith(PREFIX));

    const usageRows = async (where = 'menu_id like $1', args: unknown[] = [`${PREFIX}%`]) =>
      (
        await dbHandle.pool.query(
          `select * from platform.usage_events where ${where} order by received_at, id`,
          args,
        )
      ).rows;
    const errorRows = async () =>
      // platform_app has INSERT only on client_errors (no read API), so the test reads as platform_migrate.
      (
        await migrateHandle.pool.query(
          'select * from platform.client_errors where menu_id like $1',
          [`${PREFIX}%`],
        )
      ).rows;
    const clearMine = async () => {
      await migrateHandle.pool.query('delete from platform.usage_events where menu_id like $1', [
        `${PREFIX}%`,
      ]);
      await migrateHandle.pool.query('delete from platform.client_errors where menu_id like $1', [
        `${PREFIX}%`,
      ]);
    };

    beforeAll(async () => {
      process.env.NODE_ENV = 'test';
      dbHandle = createDb(APP_URL);
      migrateHandle = createDb(MIGRATE_URL);
      app = await buildServer({ config: loadConfig(), dbHandle });
      await app.ready();
      admin = await newPerson('admin');
      user = await newPerson('user');
    });

    afterAll(async () => {
      if (actorIds.length > 0) {
        // audit_log needs the migrate role; children before parents (apps/platform-api/AGENTS.md).
        for (const [table, column] of [
          ['platform.usage_events', 'actor_id'],
          ['platform.client_errors', 'actor_id'],
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
      await app?.close();
      await dbHandle?.close();
      await migrateHandle?.close();
    });

    describe('POST /usage-events', () => {
      it('stores a main entry and dwell with the server actor and received_at', async () => {
        await clearMine();
        const res = await record([entry(), dwell()]);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ accepted: 2 });
        expect(res.headers['cache-control']).toBe('no-store');
        const rows = await usageRows();
        expect(rows).toHaveLength(2);
        for (const row of rows) {
          expect(row.actor_id).toBe(user.id);
          expect(row.workspace_id).toBe(WORKSPACE_ID);
          expect(row.received_at).toBeInstanceOf(Date);
          expect(Math.abs(row.received_at.getTime() - Date.now())).toBeLessThan(60_000);
          expect(row.source).toBe('main');
        }
        const stored = rows.find((r) => r.name === 'dwell');
        expect(stored).toMatchObject({
          client_at: '1700000005000',
          dwell_ms: 5000,
          entered_at: '1700000000000',
          space_id: 'operations',
          path: '/operations/usage',
          session_id: 'tab-1',
        });
      });

      it('stores board entry and dwell with source and stayId', async () => {
        await clearMine();
        const res = await record([
          entry({ source: 'board', stayId: 'stay-1' }),
          dwell({ source: 'board', stayId: 'stay-1' }),
        ]);
        expect(res.json()).toEqual({ accepted: 2 });
        const rows = await usageRows();
        expect(rows.map((r) => [r.name, r.source, r.stay_id])).toEqual(
          expect.arrayContaining([
            ['entry', 'board', 'stay-1'],
            ['dwell', 'board', 'stay-1'],
          ]),
        );
      });

      it('stores via and fromMenuId on a main entry, null fromMenuId included', async () => {
        await clearMine();
        const res = await record([
          entry({ via: 'sidebar', fromMenuId: 'platform.home' }),
          entry({ at: 1_700_000_000_001, via: 'direct', fromMenuId: null }),
        ]);
        expect(res.json()).toEqual({ accepted: 2 });
        const rows = await usageRows();
        expect(rows.map((r) => [r.via, r.from_menu_id]).sort()).toEqual([
          ['direct', null],
          ['sidebar', 'platform.home'],
        ]);
      });

      it('stores pane via and fromMenuId on board entries, each optional, and a Korean id on a main entry', async () => {
        await clearMine();
        const res = await record([
          entry({ source: 'board', stayId: 'stay-1', via: 'paneReplace', fromMenuId: 'platform.home' }),
          entry({ at: 1_700_000_000_001, source: 'board', stayId: 'stay-2', via: 'paneOpen', fromMenuId: null }),
          entry({ at: 1_700_000_000_002, source: 'board', stayId: 'stay-3' }),
          entry({ at: 1_700_000_000_003, via: 'sidebar', fromMenuId: '설비목록' }),
        ]);
        expect(res.json()).toEqual({ accepted: 4 });
        const rows = await usageRows();
        expect(rows.map((r) => [r.source, r.stay_id, r.via, r.from_menu_id]).sort()).toEqual([
          ['board', 'stay-1', 'paneReplace', 'platform.home'],
          ['board', 'stay-2', 'paneOpen', null],
          ['board', 'stay-3', null, null],
          ['main', null, 'sidebar', '설비목록'],
        ]);
      });

      it('accepts a null spaceId and a 20-event batch', async () => {
        await clearMine();
        const res = await record(
          Array.from({ length: 20 }, (_, i) => entry({ spaceId: null, at: 1_700_000_000_000 + i })),
        );
        expect(res.json()).toEqual({ accepted: 20 });
        expect(await usageRows()).toHaveLength(20);
      });

      it.each([
        ['via outside the closed set', [entry({ via: 'bookmark' })]],
        ['via on a dwell', [dwell({ via: 'sidebar' })]],
        ['fromMenuId on a dwell', [dwell({ fromMenuId: null })]],
        ['an old via on a board entry', [entry({ source: 'board', via: 'sidebar' })]],
        ['a pane via on a main entry', [entry({ via: 'paneOpen' })]],
        ['fromMenuId that is a number', [entry({ fromMenuId: 5 })]],
        ['fromMenuId that is not a menu id', [entry({ fromMenuId: 'a b' })]],
        [
          'fromMenuId that is a path on a board entry',
          [entry({ source: 'board', stayId: 'stay-1', via: 'paneReplace', fromMenuId: '/mars/item/SECRET' })],
        ],
        ['fromMenuId that is key=value on a main entry', [entry({ fromMenuId: 'lotId=SECRET' })]],
        ['stayId on a main event', [entry({ stayId: 'stay-1' })]],
        ['source outside main/board', [entry({ source: 'popup' })]],
        ['userId key', [entry({ userId: 'someone' })]],
        ['url key', [entry({ url: 'https://example.test/?q=1' })]],
        ['dwell keys on an entry', [entry({ dwellMs: 1, enteredAt: 1 })]],
        ['path with a query', [entry({ path: '/operations/usage?lot=A1' })]],
        ['menuId with whitespace', [entry({ menuId: 'a b' })]],
        ['malformed spaceId', [entry({ spaceId: 'my space' })]],
        ['missing spaceId key', [(({ spaceId: _s, ...rest }) => rest)(entry())]],
        ['negative dwellMs', [dwell({ dwellMs: -1 })]],
        ['fractional dwellMs', [dwell({ dwellMs: 1.5 })]],
        ['dwell without enteredAt', [(({ enteredAt: _e, ...rest }) => rest)(dwell())]],
        ['non-numeric at', [entry({ at: 'now' })]],
        ['unknown event name', [entry({ name: 'click' })]],
        ['21 events', Array.from({ length: 21 }, () => entry())],
        ['empty batch', []],
        ['one bad event among good ones', [entry(), entry({ url: '/x' }), entry()]],
      ])('rejects the whole batch and stores nothing: %s', async (_label, events) => {
        await clearMine();
        const res = await record(events as Event[]);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ accepted: 0 });
        expect(await usageRows()).toEqual([]);
      });

      it.each([
        ['a bare array', [entry()]],
        ['an extra body key', { events: [entry()], userId: 'x' }],
        ['events that is not an array', { events: entry() }],
        ['a null body', null],
      ])('answers accepted 0 for %s', async (_label, body) => {
        await clearMine();
        const res = await post('/usage-events', body, user);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ accepted: 0 });
        expect(await usageRows()).toEqual([]);
      });

      it('answers 200 accepted 0 for malformed JSON and an empty body', async () => {
        await clearMine();
        const malformed = await post('/usage-events', '{"events": [', user, { raw: true });
        expect(malformed.statusCode).toBe(200);
        expect(malformed.json()).toEqual({ accepted: 0 });
        const empty = await post('/usage-events', '', user, { raw: true });
        expect(empty.statusCode).toBe(200);
        expect(empty.json()).toEqual({ accepted: 0 });
        expect(await usageRows()).toEqual([]);
      });

      it('merges a repeated dwell on (session, menu, enteredAt): one row, the last dwellMs', async () => {
        await clearMine();
        await record([entry()]);
        await record([dwell({ dwellMs: 1000 })]);
        const before = (await usageRows("name = 'dwell' and menu_id like $1"))[0];
        await record([dwell({ dwellMs: 4000, at: 1_700_000_009_000 })]);
        const dwells = await usageRows("name = 'dwell' and menu_id like $1");
        expect(dwells).toHaveLength(1);
        expect(dwells[0]).toMatchObject({ dwell_ms: 4000, client_at: '1700000009000' });
        expect(dwells[0].received_at.getTime()).toBeGreaterThanOrEqual(
          before.received_at.getTime(),
        );
        // A different enteredAt is a different stay; a different session too.
        await record([dwell({ enteredAt: 1_700_000_100_000 })]);
        await record([dwell({ sessionId: 'tab-2' })]);
        expect(await usageRows("name = 'dwell' and menu_id like $1")).toHaveLength(3);
      });

      it('merges a repeated board dwell on stayId, even when enteredAt differs; entries stay plain inserts', async () => {
        await clearMine();
        await record([entry({ source: 'board', stayId: 'stay-1' })]);
        await record([entry({ source: 'board', stayId: 'stay-1' })]);
        await record([dwell({ source: 'board', stayId: 'stay-1', dwellMs: 100, enteredAt: 1 })]);
        await record([dwell({ source: 'board', stayId: 'stay-1', dwellMs: 900, enteredAt: 2 })]);
        await record([dwell({ source: 'board', stayId: 'stay-2', dwellMs: 50, enteredAt: 2 })]);
        const dwells = await usageRows("name = 'dwell' and menu_id like $1");
        expect(dwells.map((r) => [r.stay_id, r.dwell_ms]).sort()).toEqual([
          ['stay-1', 900],
          ['stay-2', 50],
        ]);
        expect(await usageRows("name = 'entry' and menu_id like $1")).toHaveLength(2);
      });

      it('merges a board dwell without stayId on enteredAt, like a main dwell', async () => {
        await clearMine();
        await record([dwell({ source: 'board', dwellMs: 10 })]);
        await record([dwell({ source: 'board', dwellMs: 20 })]);
        const dwells = await usageRows("name = 'dwell' and menu_id like $1");
        expect(dwells).toHaveLength(1);
        expect(dwells[0].dwell_ms).toBe(20);
      });

      it('does not merge dwells of two actors', async () => {
        await clearMine();
        await record([dwell()], user);
        await record([dwell()], admin);
        expect(await usageRows("name = 'dwell' and menu_id like $1")).toHaveLength(2);
      });

      it('403 csrf.invalid for a missing and a wrong token; nothing stored', async () => {
        await clearMine();
        const body = { events: [entry()] };
        const missing = await post('/usage-events', body, user, { csrf: null });
        expect(missing.statusCode).toBe(403);
        expect(missing.json()).toEqual({ code: 'csrf.invalid', message: 'csrf token mismatch' });
        const wrong = await post('/usage-events', body, user, { csrf: `${user.csrf}x` });
        expect(wrong.statusCode).toBe(403);
        expect(wrong.json().code).toBe('csrf.invalid');
        expect(await usageRows()).toEqual([]);
      });

      it('401 without a cookie; a present but dead cookie answers 403 csrf.invalid first', async () => {
        const body = { events: [entry()] };
        const none = await post('/usage-events', body, undefined, { csrf: user.csrf });
        expect(none.statusCode).toBe(401);
        expect(none.json().code).toBe('auth.session_invalid');
        const dead = await post('/usage-events', body, undefined, {
          cookie: 'not-a-live-session',
          csrf: user.csrf,
        });
        expect(dead.statusCode).toBe(403);
        expect(dead.json().code).toBe('csrf.invalid');
      });

      it('touches the session: navigation is activity', async () => {
        const person = await newPerson('user');
        await dbHandle.pool.query(
          "update core.sessions set last_seen_at = now() - interval '10 minutes' where id = $1",
          [person.cookie],
        );
        const read = async () =>
          (
            await dbHandle.pool.query<{ last_seen_at: Date }>(
              'select last_seen_at from core.sessions where id = $1',
              [person.cookie],
            )
          ).rows[0]?.last_seen_at.getTime() as number;
        const before = read();
        await record([entry()], person);
        expect(await read()).toBeGreaterThan(await before);
      });
    });

    describe('GET /usage-summary', () => {
      it('forbidden for a non-admin, also with a bad query', async () => {
        for (const query of ['?preset=all', '?preset=bogus', '']) {
          const res = await summary(query, user);
          expect(res.statusCode).toBe(200);
          const body = res.json<Envelope>();
          expect(body.outcome).toBe('forbidden');
          expect(body.message).toBe('No permission console:access');
          expect(body.data).toBeNull();
        }
      });

      it('preset=all counts entries only, per menu, with distinct users and received_at', async () => {
        await clearMine();
        const other = `${MENU}-other`;
        await record([entry(), entry({ at: 1 }), dwell()], user);
        await record([entry({ at: 2 }), entry({ menuId: other })], admin);
        const res = await summary('?preset=all');
        expect(res.statusCode).toBe(200);
        const body = res.json<Envelope>();
        expect(body.outcome).toBe('ok');
        expect(body.trust).toBeNull();
        expect(body.assessments).toEqual([]);
        expect(body.data?.preset).toBe('all');
        const last = async (menuId: string) =>
          (
            await dbHandle.pool.query<{ t: Date }>(
              "select max(received_at) as t from platform.usage_events where menu_id = $1 and name = 'entry'",
              [menuId],
            )
          ).rows[0]?.t.getTime();
        expect(mineOf(body)).toEqual([
          {
            menuId: MENU,
            visits: 3,
            distinctUsers: 2,
            lastUsedAt: await last(MENU),
            entries: 3,
            backRate: null,
            searchEntryRate: null,
          },
          {
            menuId: other,
            visits: 1,
            distinctUsers: 1,
            lastUsedAt: await last(other),
            entries: 1,
            backRate: null,
            searchEntryRate: null,
          },
        ]);
      });

      it('a range uses [from, to) on received_at, never the client at', async () => {
        await clearMine();
        await record([entry({ at: 1 })], user);
        const t = (await usageRows())[0].received_at.getTime();
        const inside = await summary(`?from=${t}&to=${t + 1}`);
        const insideBody = inside.json<Envelope>();
        expect(insideBody.outcome).toBe('ok');
        expect(insideBody.data?.preset).toBe('range');
        expect(mineOf(insideBody)).toEqual([
          {
            menuId: MENU,
            visits: 1,
            distinctUsers: 1,
            lastUsedAt: t,
            entries: 1,
            backRate: null,
            searchEntryRate: null,
          },
        ]);
        // `to` is exclusive.
        expect(mineOf((await summary(`?from=${t - 5}&to=${t}`)).json<Envelope>())).toEqual([]);
      });

      it('a range that excludes everything is ok with menus [], never empty', async () => {
        await clearMine();
        await record([entry()], user);
        const res = await summary('?from=0&to=1');
        expect(res.json()).toMatchObject({ outcome: 'ok', data: { preset: 'range', menus: [] } });
      });

      it('zero rows under preset=all is ok with no menus of this suite', async () => {
        await clearMine();
        const body = (await summary('?preset=all')).json<Envelope>();
        expect(body.outcome).toBe('ok');
        expect(mineOf(body)).toEqual([]);
      });

      it.each([
        ['from >= to', '?from=5&to=5'],
        ['from > to', '?from=9&to=5'],
        ['an extra key', '?preset=all&x=1'],
        ['preset with a range', '?preset=all&from=1&to=2'],
        ['a non-integer bound', '?from=1.5&to=3'],
        ['a negative bound', '?from=-1&to=3'],
        ['a hex bound', '?from=0x1&to=3'],
        ['an unsafe integer bound', '?from=1&to=9007199254740993'],
        ['a bound past the Date range', '?from=1&to=9000000000000000'],
        ['only from', '?from=1'],
        ['a repeated key', '?from=1&from=2&to=3'],
        ['an unknown preset', '?preset=week'],
        ['no query', ''],
      ])('error "Invalid usage range" for %s', async (_label, query) => {
        const res = await summary(query);
        expect(res.statusCode).toBe(200);
        expect(res.json<Envelope>()).toMatchObject({
          outcome: 'error',
          data: null,
          message: 'Invalid usage range',
        });
      });
    });

    describe('GET /usage-summary rates (#605)', () => {
      it('entries count main only; rates need 3 distinct main users and are null below it', async () => {
        await clearMine();
        const [a, b, c] = await crew(3);
        const viaEntry = (via: string, from: string | null) =>
          entry({ via, fromMenuId: from, source: 'main' });
        // MENU: 4 main entries by 3 people (1 palette), 1 board entry that must not count.
        await record([viaEntry('palette', null)], a);
        await record([viaEntry('sidebar', null)], b);
        await record([viaEntry('sidebar', null), viaEntry('sidebar', null)], c);
        await record(
          [entry({ source: 'board', stayId: 's1', via: 'paneOpen', fromMenuId: null })],
          a,
        );
        // Next entries elsewhere naming MENU as the previous screen: 1 of 2 went back (history), 1 moved on.
        const away = `${MENU}-away`;
        await record([entry({ menuId: away, via: 'history', fromMenuId: MENU })], a);
        await record([entry({ menuId: away, via: 'sidebar', fromMenuId: MENU })], b);
        const body = (await summary('?preset=all')).json<Envelope>();
        const row = mineOf(body).find((m) => m.menuId === MENU);
        expect(row).toMatchObject({ visits: 5, entries: 4, backRate: 0.25, searchEntryRate: 0.25 });
        const awayRow = mineOf(body).find((m) => m.menuId === away);
        // 2 entries by 2 people: under the mask.
        expect(awayRow).toMatchObject({ entries: 2, backRate: null, searchEntryRate: null });
      });

      it('a menu with only board entries has entries 0 and null rates', async () => {
        await clearMine();
        await record([entry({ source: 'board', stayId: 's1', via: 'paneOpen' })], user);
        const row = mineOf((await summary('?preset=all')).json<Envelope>())[0];
        expect(row).toMatchObject({ entries: 0, backRate: null, searchEntryRate: null });
      });

      it('backRate is capped at 1', async () => {
        await clearMine();
        const people = await crew(3);
        for (const p of people) await record([entry({ via: 'sidebar' })], p);
        const away = `${MENU}-away`;
        for (let i = 0; i < 2; i++) {
          for (const p of people)
            await record([entry({ menuId: away, via: 'return', fromMenuId: MENU })], p);
        }
        const row = mineOf((await summary('?preset=all')).json<Envelope>()).find(
          (m) => m.menuId === MENU,
        );
        expect(row).toMatchObject({ entries: 3, backRate: 1 });
      });
    });

    describe('POST /usage-next-screens (#605)', () => {
      type NextData = {
        menuId: string;
        entries: number;
        masked: boolean;
        summary: Record<string, number>;
        next: { menuId: string; count: number; distinctUsers: number; vias: Record<string, number> }[];
        hiddenDestinations: number;
      };
      const next = (body: unknown, who: Person = admin) =>
        post('/usage-next-screens', body, who, { csrf: null });
      const nextData = async (body: unknown) => {
        const res = await next(body);
        expect(res.statusCode).toBe(200);
        const env = res.json<{ outcome: string; data: NextData | null }>();
        expect(env.outcome).toBe('ok');
        return env.data as NextData;
      };

      /** 6 people each enter MENU twice; destinations d1 (6 users), d2 (4), d3 (3), tiny (2 users), solo (1). */
      async function seedTail() {
        await clearMine();
        const people: Person[] = [];
        for (let i = 0; i < 6; i++) people.push(await newPerson('developer'));
        for (const p of people) await record([entry({ via: 'sidebar' }), entry({ via: 'palette' })], p);
        const go = (to: string, who: Person[], via?: string) =>
          Promise.all(
            who.map((p) =>
              record([entry({ menuId: `${MENU}-${to}`, fromMenuId: MENU, ...(via ? { via } : {}) })], p),
            ),
          );
        await go('d1', people, 'sidebar');
        await go('d2', people.slice(0, 4), 'crossLink');
        await go('d3', people.slice(0, 3));
        await go('tiny', people.slice(0, 2), 'link');
        await go('solo', people.slice(0, 1), 'link');
        return people;
      }

      it('forbidden for a non-admin, also with a bad body; no CSRF is required', async () => {
        for (const body of [{ menuId: MENU }, { menuId: '' }, null]) {
          const res = await next(body, user);
          expect(res.statusCode).toBe(200);
          expect(res.json()).toMatchObject({ outcome: 'forbidden', data: null });
        }
      });

      it('a menu with fewer than 3 distinct users is masked with empty lists, a well-formed unknown menu too', async () => {
        await clearMine();
        await record([entry({ via: 'sidebar' })], admin);
        await record([entry({ via: 'sidebar' })], user);
        await record([entry({ menuId: `${MENU}-x`, via: 'link', fromMenuId: MENU })], user);
        const masked = {
          entries: 0,
          masked: true,
          summary: { moved: 0, sameMenu: 0, backOrReturn: 0, noMove: 0 },
          next: [],
          hiddenDestinations: 0,
        };
        expect(await nextData({ menuId: MENU })).toEqual({ menuId: MENU, ...masked });
        expect(await nextData({ menuId: `${MENU}-nothing` })).toEqual({
          menuId: `${MENU}-nothing`,
          ...masked,
        });
      });

      it('names destinations with >= 3 users, counts the rest, one consistent set per row', async () => {
        await seedTail();
        const data = await nextData({ menuId: MENU });
        expect(data.masked).toBe(false);
        expect(data.entries).toBe(12);
        expect(data.next).toEqual([
          { menuId: `${MENU}-d1`, count: 6, distinctUsers: 6, vias: { sidebar: 6 } },
          { menuId: `${MENU}-d2`, count: 4, distinctUsers: 4, vias: { crossLink: 4 } },
          // A via-less next entry counts as `link`.
          { menuId: `${MENU}-d3`, count: 3, distinctUsers: 3, vias: { link: 3 } },
        ]);
        expect(data.hiddenDestinations).toBe(2);
        // Hidden names never leave the server.
        expect(JSON.stringify(data)).not.toContain('tiny');
        expect(JSON.stringify(data)).not.toContain('solo');
        expect(data.summary).toEqual({ moved: 16, sameMenu: 0, backOrReturn: 0, noMove: 0 });
        for (const row of data.next)
          expect(Object.values(row.vias).reduce((x, y) => x + y, 0)).toBe(row.count);
      });

      it('count and users come from the same set when one person enters a destination twice', async () => {
        await clearMine();
        const people = await crew(3);
        for (const p of people) await record([entry({ via: 'sidebar' })], p);
        const to = `${MENU}-twice`;
        for (const p of people)
          await record(
            [
              entry({ menuId: to, via: 'link', fromMenuId: MENU }),
              entry({ menuId: to, via: 'drill', fromMenuId: MENU }),
            ],
            p,
          );
        const data = await nextData({ menuId: MENU });
        expect(data.next).toEqual([
          { menuId: to, count: 6, distinctUsers: 3, vias: { link: 3, drill: 3 } },
        ]);
        expect(data.summary.noMove).toBe(0);
      });

      it('back/return and same-menu entries are summarised, and only ranked with includeBack', async () => {
        await clearMine();
        const people = await crew(3);
        for (const p of people) await record([entry({ via: 'sidebar' })], p);
        const d1 = `${MENU}-d1`;
        const d2 = `${MENU}-d2`;
        for (const p of people) {
          await record(
            [
              entry({ menuId: d1, via: 'history', fromMenuId: MENU }),
              entry({ menuId: MENU, via: 'link', fromMenuId: MENU }),
              entry({ menuId: d2, via: 'sidebar', fromMenuId: MENU }),
            ],
            p,
          );
        }
        // MENU now has 6 main entries (3 + 3 self-loops).
        const plain = await nextData({ menuId: MENU });
        expect(plain.entries).toBe(6);
        expect(plain.summary).toEqual({ moved: 3, sameMenu: 3, backOrReturn: 3, noMove: 0 });
        expect(plain.next.map((r) => r.menuId)).toEqual([d2]);
        expect(plain.hiddenDestinations).toBe(0);
        const withBack = await nextData({ menuId: MENU, includeBack: true });
        expect(withBack.summary).toEqual(plain.summary);
        // Equal counts order by menu id (the menu itself sorts before its own prefixed ids).
        expect(withBack.next.map((r) => [r.menuId, r.count, r.vias])).toEqual([
          [MENU, 3, { link: 3 }],
          [d1, 3, { history: 3 }],
          [d2, 3, { sidebar: 3 }],
        ]);
      });

      it('noMove floors at 0 when next entries outnumber the menu entries', async () => {
        await clearMine();
        const people = await crew(3);
        for (const p of people) await record([entry({ via: 'sidebar' })], p);
        for (const p of people)
          await record(
            [
              entry({ menuId: `${MENU}-a`, via: 'link', fromMenuId: MENU }),
              entry({ menuId: `${MENU}-a`, via: 'link', fromMenuId: MENU }),
            ],
            p,
          );
        const data = await nextData({ menuId: MENU });
        expect(data.summary).toEqual({ moved: 6, sameMenu: 0, backOrReturn: 0, noMove: 0 });
      });

      it('board entries never count, neither as entries nor as next', async () => {
        await clearMine();
        const people = await crew(3);
        for (const p of people) {
          await record([entry({ via: 'sidebar' })], p);
          await record(
            [entry({ source: 'board', stayId: 'b1', via: 'paneOpen', menuId: `${MENU}-pane`, fromMenuId: MENU })],
            p,
          );
          await record([entry({ source: 'board', stayId: 'b2', via: 'paneOpen' })], p);
        }
        const data = await nextData({ menuId: MENU });
        expect(data.entries).toBe(3);
        expect(data.next).toEqual([]);
        expect(data.summary.noMove).toBe(3);
      });

      it('is capped at 20 rows, ties ordered by menu id', async () => {
        await clearMine();
        const people = await crew(3);
        for (const p of people) await record([entry({ via: 'sidebar' })], p);
        // One batch per person (the batch limit is 20, so 22 destinations take two requests): the per-actor rate budget is shared with the other tests.
        const toAll = Array.from({ length: 22 }, (_, i) =>
          entry({ menuId: `${MENU}-n${String(i).padStart(2, '0')}`, via: 'link', fromMenuId: MENU }),
        );
        for (const p of people)
          for (const part of [toAll.slice(0, 20), toAll.slice(20)])
            expect((await record(part, p)).statusCode).toBe(200);
        const data = await nextData({ menuId: MENU });
        expect(data.next).toHaveLength(20);
        expect(data.hiddenDestinations).toBe(0);
        // Ties on count order by menu id.
        expect(data.next[0]?.menuId).toBe(`${MENU}-n00`);
      });

      it.each([
        ['an empty menuId', { menuId: '' }],
        ['a menuId with a slash', { menuId: 'a/b' }],
        ['a non-boolean includeBack', { menuId: 'a', includeBack: 'yes' }],
        ['an extra key', { menuId: 'a', preset: 'all' }],
      ])('error "Invalid usage next-screens query" for %s', async (_label, body) => {
        const res = await next(body);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
          outcome: 'error',
          data: null,
          message: 'Invalid usage next-screens query',
        });
      });
    });

    describe('POST /client-errors', () => {
      it('stores exactly the 5 fields with the server actor and request id', async () => {
        await clearMine();
        const res = await post('/client-errors', report(), user, {
          headers: { 'x-correlation-id': 'client-abc-123' },
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ accepted: true });
        const rows = await errorRows();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
          workspace_id: WORKSPACE_ID,
          actor_id: user.id,
          correlation_id: 'client-abc-123',
          menu_id: MENU,
          space_id: 'operations',
          path: '/operations/usage',
          name: 'TypeError',
          request_id: 'client-abc-123',
        });
        expect(rows[0].received_at).toBeInstanceOf(Date);
        // Nothing beyond the declared columns: no message, stack or URL column exists.
        expect(Object.keys(rows[0]).sort()).toEqual(
          [
            'actor_id',
            'correlation_id',
            'id',
            'menu_id',
            'name',
            'path',
            'received_at',
            'request_id',
            'space_id',
            'workspace_id',
          ].sort(),
        );
      });

      it('accepts a null spaceId and a server-generated request id', async () => {
        await clearMine();
        const res = await post('/client-errors', report({ spaceId: null }), user);
        expect(res.json()).toEqual({ accepted: true });
        const rows = await errorRows();
        expect(rows[0].space_id).toBeNull();
        expect(rows[0].request_id).toMatch(/^srv-\d+-[0-9a-f]+$/);
      });

      it.each([
        ['a message key', report({ message: 'boom' })],
        ['a stack key', report({ stack: 'at x' })],
        ['an absolute URL path', report({ path: 'https://evil.test/x' })],
        ['a protocol-relative path', report({ path: '//evil.test/x' })],
        ['a relative path', report({ path: 'operations/usage' })],
        ['a query in the path', report({ path: '/operations/usage?lot=A1' })],
        ['a free-text name', report({ name: 'Cannot read properties of undefined' })],
        ['a name over 80 chars', report({ name: `E${'x'.repeat(80)}` })],
        ['a missing field', (({ name: _n, ...rest }) => rest)(report())],
        ['a correlationId without the client- prefix', report({ correlationId: 'srv-1' })],
        ['a correlationId over 80 chars', report({ correlationId: `client-${'x'.repeat(80)}` })],
        ['a malformed spaceId', report({ spaceId: 'my space' })],
        ['a numeric menuId', report({ menuId: 5 })],
        ['an array body', [report()]],
      ])('answers accepted false and stores nothing for %s', async (_label, body) => {
        await clearMine();
        const res = await post('/client-errors', body, user);
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ accepted: false });
        expect(await errorRows()).toEqual([]);
      });

      it('answers accepted false for malformed JSON', async () => {
        const res = await post('/client-errors', '{"name":', user, { raw: true });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ accepted: false });
      });

      it('403 csrf.invalid for a missing and a wrong token; 401 without a cookie', async () => {
        await clearMine();
        const missing = await post('/client-errors', report(), user, { csrf: null });
        expect(missing.statusCode).toBe(403);
        expect(missing.json().code).toBe('csrf.invalid');
        const wrong = await post('/client-errors', report(), user, { csrf: 'x'.repeat(43) });
        expect(wrong.statusCode).toBe(403);
        const none = await post('/client-errors', report(), undefined, { csrf: user.csrf });
        expect(none.statusCode).toBe(401);
        expect(await errorRows()).toEqual([]);
      });
    });

    describe('annotation gate (decision 6: no storage, always forbidden)', () => {
      const input = { chartId: 'c1', scopeId: 'site-1', from: 'a', to: 'b', text: 'note' };

      it.each([
        [
          'GET /annotations',
          () =>
            app.inject({
              method: 'GET',
              url: '/api/v1/platform/annotations?chartId=c1&scopeId=site-1',
              headers: cookieHeader(admin.cookie),
            }),
        ],
        ['POST /annotations', () => post('/annotations', input, admin)],
        [
          'POST /annotations/delete',
          () => post('/annotations/delete', { chartId: 'c1', scopeId: 'site-1', id: 'x' }, admin),
        ],
      ])('%s is forbidden even for an admin', async (_label, call) => {
        const res = await call();
        expect(res.statusCode).toBe(200);
        expect(res.json<Envelope>()).toMatchObject({
          outcome: 'forbidden',
          data: null,
          message: 'No permission analytics:view',
          trust: null,
          assessments: [],
        });
      });

      it.each(['/annotations', '/annotations/delete'])(
        'POST %s without CSRF is 403',
        async (path) => {
          const res = await post(path, input, admin, { csrf: null });
          expect(res.statusCode).toBe(403);
          expect(res.json().code).toBe('csrf.invalid');
        },
      );

      it('creates no annotation table', async () => {
        const { rows } = await dbHandle.pool.query(
          "select 1 from information_schema.tables where table_name ilike '%annotation%' and table_schema in ('platform', 'core')",
        );
        expect(rows).toEqual([]);
      });
    });

    describe('platform schema grants (decision 1)', () => {
      const PRIVILEGES = [
        'SELECT',
        'INSERT',
        'UPDATE',
        'DELETE',
        'TRUNCATE',
        'REFERENCES',
        'TRIGGER',
      ];
      const held = async (role: string, table: string) => {
        const out: string[] = [];
        for (const privilege of PRIVILEGES) {
          const { rows } = await migrateHandle.pool.query<{ ok: boolean }>(
            'select has_table_privilege($1, $2, $3) as ok',
            [role, table, privilege],
          );
          if (rows[0]?.ok) out.push(privilege);
        }
        return out;
      };

      it('platform_app: INSERT, SELECT, UPDATE on usage_events; INSERT only on client_errors', async () => {
        expect(await held('platform_app', 'platform.usage_events')).toEqual([
          'SELECT',
          'INSERT',
          'UPDATE',
        ]);
        expect(await held('platform_app', 'platform.client_errors')).toEqual(['INSERT']);
      });

      it('platform_app may use the schema but not create in it; no other grantee is widened', async () => {
        const { rows } = await migrateHandle.pool.query<{ usage: boolean; create: boolean }>(
          "select has_schema_privilege('platform_app', 'platform', 'USAGE') as usage, has_schema_privilege('platform_app', 'platform', 'CREATE') as create",
        );
        expect(rows[0]).toEqual({ usage: true, create: false });
        const grantees = await migrateHandle.pool.query<{ grantee: string }>(
          "select distinct grantee from information_schema.role_table_grants where table_schema = 'platform'",
        );
        expect(grantees.rows.map((r) => r.grantee).sort()).toEqual([
          'platform_app',
          'platform_migrate',
        ]);
      });
    });
  },
);
