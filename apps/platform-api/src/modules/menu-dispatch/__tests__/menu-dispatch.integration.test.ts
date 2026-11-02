// #1193 (a) — `POST /api/v1/menu-query` and `POST /api/v1/menu-action` through the real `buildServer`
// with a TEST-ONLY endpoint + action pair (module `itest`). The pair keeps its state in memory and the
// state is asserted through the wire answers; what the engine stores is asserted in
// `core.idempotency_keys`. Route-level against a real Postgres (throwaway DB only; run through
// `pnpm --filter @ap/platform-api test:integration` as platform_app / platform_migrate).

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
import { MENU_ACTION_REPLAY_MAX_BYTES } from '../action.js';
import type {
  FieldError,
  MenuActionDeclaration,
  MenuDispatchContribution,
  MenuEndpointDeclaration,
} from '../types.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const PREFIX = uid('it-dispatch').replace(/[^a-z0-9]/gi, '');

type Person = { id: string; cookie: string; csrf: string };
type Answer = {
  outcome: string;
  data: unknown;
  version: string | null;
  fieldErrors: FieldError[];
  replayed: boolean;
  correlationId: string;
  message?: string;
};

describe.skipIf(!runIntegration)('menu dispatch: menu-query + menu-action (#1193)', () => {
  let dbHandle: DbHandle;
  let migrateHandle: DbHandle;
  let app: FastifyInstance;
  const actorIds: string[] = [];
  let n = 0;
  let writer: Person;
  let reader: Person;

  // ── the test-only module `itest`: an in-memory table whose rows are a name and a revision.
  const rows = new Map<string, { name: string; revision: number }>();
  const written: string[] = [];
  /** Actors that currently hold `itest:write`; revoking one is how a test loses permission. */
  const mayWrite = new Set<string>();
  const endpointId = `${PREFIX}.rows`;
  const setId = `${PREFIX}.set`;
  const noteId = `${PREFIX}.note`;
  const menuId = PREFIX;

  const endpoint: MenuEndpointDeclaration = {
    spec: {
      id: endpointId,
      menuId,
      paramKeys: ['prefix'],
      permission: 'itest:view',
      requiresScope: false,
      context: {},
      mergeTimeDomain: false,
    },
    authorize: async () => true,
    validate: (params) =>
      typeof params.prefix === 'string' ? { ok: true } : { ok: false, message: 'prefix must be a string' },
    handle: async ({ params }) => {
      const hits = [...rows].filter(([id]) => id.startsWith(params.prefix as string));
      return hits.length === 0
        ? { outcome: 'empty', data: null }
        : { outcome: 'ok', data: hits.map(([id, row]) => ({ id, ...row })) };
    },
  };

  const validateName = (input: Record<string, unknown>): FieldError[] =>
    typeof input.name === 'string' && input.name.length > 0
      ? []
      : [{ path: ['name'], code: 'required' }];

  const setAction: MenuActionDeclaration = {
    spec: {
      id: setId,
      menuId,
      inputKeys: ['id', 'name'],
      permission: 'itest:write',
      requiresScope: false,
      concurrency: 'version',
      invalidates: [endpointId],
    },
    authorize: async (actor) => mayWrite.has(actor.actor_id),
    validate: validateName,
    currentVersion: async (_tx, _actor, input) => {
      const row = rows.get(String(input.id));
      return row ? String(row.revision) : null;
    },
    handle: async (_tx, _actor, input) => {
      const row = rows.get(String(input.id));
      if (!row) throw new Error('currentVersion judged not_found first');
      row.name = String(input.name);
      row.revision += 1;
      written.push(`set:${String(input.id)}`);
      return { data: { id: input.id, name: row.name }, version: String(row.revision) };
    },
  };

  const noteAction: MenuActionDeclaration = {
    spec: {
      id: noteId,
      menuId,
      inputKeys: ['id', 'name'],
      permission: 'itest:write',
      requiresScope: false,
      concurrency: 'none',
      invalidates: [endpointId],
    },
    authorize: async (actor) => mayWrite.has(actor.actor_id),
    validate: validateName,
    handle: async (_tx, _actor, input) => {
      // A slow handler, so a concurrent same-key request would interleave here without the advisory lock.
      await new Promise((resolve) => setTimeout(resolve, 30));
      rows.set(String(input.id), { name: String(input.name), revision: 1 });
      written.push(`note:${String(input.id)}`);
      return { data: { id: input.id }, version: null };
    },
  };

  const bigId = `${PREFIX}.big`;
  let bigHandled = 0;
  /** Returns an answer over the replay bound: `ok` could never be replayed, so the engine must refuse it (F4). */
  const bigAction: MenuActionDeclaration = {
    spec: {
      id: bigId,
      menuId,
      inputKeys: ['id'],
      permission: 'itest:write',
      requiresScope: false,
      concurrency: 'none',
      invalidates: [endpointId],
    },
    authorize: async (actor) => mayWrite.has(actor.actor_id),
    validate: () => [],
    handle: async () => {
      bigHandled += 1;
      return { data: { text: 'x'.repeat(MENU_ACTION_REPLAY_MAX_BYTES + 1) }, version: null };
    },
  };

  const contribution: MenuDispatchContribution = {
    endpoints: [endpoint],
    actions: [setAction, noteAction, bigAction],
  };

  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function newPerson(roleLevel: 'admin' | 'user'): Promise<Person> {
    const externalId = `${PREFIX}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, {
      workspaceId: WORKSPACE_ID,
      externalId,
      displayName: `Dispatch ${roleLevel}`,
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

  async function act(
    body: Record<string, unknown>,
    opts: { who?: Person; key?: string | null; csrf?: string | null } = {},
  ) {
    const who = opts.who ?? writer;
    const key = opts.key === undefined ? randomUUID() : opts.key;
    const csrf = opts.csrf === undefined ? who.csrf : opts.csrf;
    const full = { context: {}, ...body, ...(key === null ? {} : { idempotencyKey: key }) };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: {
        'content-type': 'application/json',
        ...cookieHeader(who.cookie),
        ...(csrf ? { 'x-csrf-token': csrf } : {}),
        // The adapter also sends the key and version as headers; the body copy is what is judged.
        ...(key ? { 'idempotency-key': key } : {}),
        ...(typeof body.expectedVersion === 'string' ? { 'if-match': body.expectedVersion } : {}),
      },
      payload: JSON.stringify(full),
    });
    return { res, key, answer: res.json<Answer>() };
  }

  const query = (body: unknown, who: Person = reader) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify(body),
    });

  const storedRows = async (key: string, actorId: string) =>
    (
      await migrateHandle.pool.query(
        'select request_hash, response_status, response_body from core.idempotency_keys where actor_id = $1 and key = $2',
        [actorId, key],
      )
    ).rows;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrateHandle = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, menuDispatch: [contribution] });
    await app.ready();
    writer = await newPerson('user');
    reader = await newPerson('user');
    mayWrite.add(writer.id);
  });

  afterAll(async () => {
    const q = (text: string, params: unknown[]) => migrateHandle.pool.query(text, params);
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
    await app?.close();
    await dbHandle?.close();
    await migrateHandle?.close();
  });

  it('serves a contributed endpoint through menu-query, and still serves home.notices', async () => {
    rows.set(`${PREFIX}-seed`, { name: 'seed', revision: 1 });
    const hit = await query({ endpoint: endpointId, context: {}, params: { prefix: PREFIX } });
    expect(hit.statusCode).toBe(200);
    expect(hit.json()).toMatchObject({
      outcome: 'ok',
      data: [{ id: `${PREFIX}-seed`, name: 'seed', revision: 1 }],
      assessments: [],
      trust: null,
    });
    const miss = await query({ endpoint: endpointId, context: {}, params: { prefix: 'zzz-none' } });
    expect(miss.json()).toMatchObject({ outcome: 'empty', data: null });
    const bad = await query({ endpoint: endpointId, context: {}, params: { prefix: 3 } });
    expect(bad.json()).toMatchObject({ outcome: 'error', data: null });
    const home = await query({ endpoint: 'home.notices', context: {}, params: { targetScopeId: null } });
    expect(['ok', 'empty']).toContain(home.json().outcome);
  });

  it('refuses to boot a requiresScope registration, naming #1087', async () => {
    const scoped: MenuDispatchContribution = {
      endpoints: [{ ...endpoint, spec: { ...endpoint.spec, id: `${PREFIX}.scoped`, requiresScope: true } }],
    };
    await expect(
      buildServer({ config: loadConfig(), dbHandle, menuDispatch: [scoped] }),
    ).rejects.toThrow(/#1087/);
  });

  describe('menu-action', () => {
    it('writes once and replays the stored answer with replayed:true and an identical body', async () => {
      const id = `${PREFIX}-replay`;
      const first = await act({ action: noteId, input: { id, name: 'one' } });
      expect(first.answer).toMatchObject({ outcome: 'ok', replayed: false, version: null, fieldErrors: [] });
      const stored = await storedRows(first.key as string, writer.id);
      expect(stored).toHaveLength(1);
      expect(stored[0]).toMatchObject({ response_status: 200 });

      const before = written.length;
      const again = await act({ action: noteId, input: { id, name: 'one' } }, { key: first.key });
      expect(again.answer.replayed).toBe(true);
      expect({ ...again.answer, replayed: false, correlationId: '' }).toEqual({
        ...first.answer,
        correlationId: '',
      });
      expect(written.length).toBe(before);
      expect(await storedRows(first.key as string, writer.id)).toHaveLength(1);
    });

    it('answers error idempotency_key_reuse for the same key with another input, and for an extra key', async () => {
      const id = `${PREFIX}-reuse`;
      const first = await act({ action: noteId, input: { id, name: 'one' } });
      const before = written.length;
      for (const input of [
        { id, name: 'two' },
        { id, name: 'one', extra: 1 },
      ]) {
        const other = await act({ action: noteId, input }, { key: first.key });
        expect(other.answer).toMatchObject({
          outcome: 'error',
          message: 'idempotency_key_reuse',
          replayed: false,
          data: null,
        });
      }
      expect(written.length).toBe(before);
    });

    it('judges permission before replay: a stored key does not answer once the permission is gone', async () => {
      const lost = await newPerson('user');
      mayWrite.add(lost.id);
      const id = `${PREFIX}-lost`;
      const first = await act({ action: noteId, input: { id, name: 'one' } }, { who: lost });
      expect(first.answer.outcome).toBe('ok');
      expect(await storedRows(first.key as string, lost.id)).toHaveLength(1);
      mayWrite.delete(lost.id);
      const again = await act({ action: noteId, input: { id, name: 'one' } }, { who: lost, key: first.key });
      expect(again.answer).toMatchObject({ outcome: 'forbidden', data: null, replayed: false });
    });

    it('answers forbidden to an actor that never held the permission, writing nothing', async () => {
      const before = written.length;
      const denied = await act({ action: noteId, input: { id: `${PREFIX}-no`, name: 'x' } }, { who: reader });
      expect(denied.answer).toMatchObject({ outcome: 'forbidden', data: null, version: null });
      expect(written.length).toBe(before);
      expect(await storedRows(denied.key as string, reader.id)).toHaveLength(0);
    });

    it.each([
      ['missing', null, 'required'],
      ['malformed', 'not-a-uuid', 'malformed'],
    ])('answers invalid idempotencyKey/%s', async (_name, key, code) => {
      const res = await act({ action: noteId, input: { id: `${PREFIX}-k`, name: 'x' } }, { key });
      expect(res.answer).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['idempotencyKey'], code }] });
    });

    it('answers invalid unexpected_field per extra input key, and the action’s own field errors', async () => {
      const extra = await act({ action: noteId, input: { id: 'a', name: 'x', actorId: 'z', at: 'now' } });
      expect(extra.answer).toMatchObject({
        outcome: 'invalid',
        fieldErrors: [
          { path: ['actorId'], code: 'unexpected_field' },
          { path: ['at'], code: 'unexpected_field' },
        ],
      });
      const empty = await act({ action: noteId, input: { id: 'a', name: '' } });
      expect(empty.answer).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['name'], code: 'required' }] });
    });

    it('does not record non-ok answers: the same key then succeeds as a fresh write', async () => {
      const key = randomUUID();
      const id = `${PREFIX}-retry`;
      const bad = await act({ action: noteId, input: { id, name: '' } }, { key });
      expect(bad.answer.outcome).toBe('invalid');
      expect(await storedRows(key, writer.id)).toHaveLength(0);
      const good = await act({ action: noteId, input: { id, name: 'fine' } }, { key });
      expect(good.answer).toMatchObject({ outcome: 'ok', replayed: false });
      expect(await storedRows(key, writer.id)).toHaveLength(1);
    });

    it('judges version: not_found, conflict with the current version, then ok with the new version', async () => {
      const id = `${PREFIX}-version`;
      const gone = await act({ action: setId, input: { id, name: 'x' }, expectedVersion: '1' });
      expect(gone.answer).toMatchObject({ outcome: 'not_found', data: null, version: null });

      await act({ action: noteId, input: { id, name: 'v1' } });
      const stale = await act({ action: setId, input: { id, name: 'x' }, expectedVersion: '0' });
      expect(stale.answer).toMatchObject({ outcome: 'conflict', version: '1', data: null });
      expect(await storedRows(stale.key as string, writer.id)).toHaveLength(0);

      const ok = await act({ action: setId, input: { id, name: 'v2' }, expectedVersion: '1' });
      expect(ok.answer).toMatchObject({ outcome: 'ok', version: '2', data: { id, name: 'v2' } });
      const after = await query({ endpoint: endpointId, context: {}, params: { prefix: id } });
      expect(after.json().data).toEqual([{ id, name: 'v2', revision: 2 }]);

      // The replay of the ok answer keeps its version; the old version no longer applies to a new key.
      const replay = await act({ action: setId, input: { id, name: 'v2' }, expectedVersion: '1' }, { key: ok.key });
      expect(replay.answer).toMatchObject({ outcome: 'ok', version: '2', replayed: true });
    });

    it('serializes concurrent requests with the same key: one write, the other a replay', async () => {
      const id = `${PREFIX}-race`;
      const key = randomUUID();
      const before = written.length;
      const results = await Promise.all(
        [0, 1, 2].map(() => act({ action: noteId, input: { id, name: 'race' } }, { key })),
      );
      expect(results.map((r) => r.answer.outcome)).toEqual(['ok', 'ok', 'ok']);
      expect(results.filter((r) => r.answer.replayed)).toHaveLength(2);
      expect(written.length - before).toBe(1);
    });

    it('treats an upper- and lower-case spelling of one key as one key: one write, one replay (F2)', async () => {
      const id = `${PREFIX}-case`;
      const lower = randomUUID().toLowerCase();
      const before = written.length;
      const results = await Promise.all(
        [lower, lower.toUpperCase(), lower].map((key) =>
          act({ action: noteId, input: { id, name: 'case' } }, { key }),
        ),
      );
      expect(results.map((r) => r.answer.outcome)).toEqual(['ok', 'ok', 'ok']);
      expect(results.filter((r) => r.answer.replayed)).toHaveLength(2);
      expect(written.length - before).toBe(1);
      expect(await storedRows(lower, writer.id)).toHaveLength(1);
    });

    it('does not replay a request that differs only by an own "__proto__" member (F5)', async () => {
      const id = `${PREFIX}-proto`;
      const first = await act({ action: noteId, input: { id, name: 'one' } });
      expect(first.answer.outcome).toBe('ok');
      const input = JSON.parse(`{"id":"${id}","name":"one","__proto__":{"extra":true}}`) as Record<string, unknown>;
      expect(Object.hasOwn(input, '__proto__')).toBe(true);
      const other = await act({ action: noteId, input }, { key: first.key });
      expect(other.answer).toMatchObject({ outcome: 'error', message: 'idempotency_key_reuse', replayed: false });
    });

    it('answers error and records nothing when the ok answer cannot be stored whole (F4)', async () => {
      const key = randomUUID();
      const before = bigHandled;
      const first = await act({ action: bigId, input: {} }, { key });
      expect(first.answer).toMatchObject({
        outcome: 'error',
        message: 'response too large to record',
        data: null,
        replayed: false,
      });
      expect(bigHandled - before).toBe(1);
      expect(await storedRows(key, writer.id)).toHaveLength(0);
      // Never an ok that cannot replay: the retry is judged afresh, not answered from a marker row.
      const retry = await act({ action: bigId, input: {} }, { key });
      expect(retry.answer).toMatchObject({ outcome: 'error', message: 'response too large to record' });
    });

    it.each([
      ['unknown action', { action: `${PREFIX}.gone`, input: {} }],
      ['extra top-level key', { action: noteId, input: { id: 'a', name: 'x' }, actorId: 'z' }],
      ['context.scopeId', { action: noteId, input: { id: 'a', name: 'x' }, context: { scopeId: null } }],
      ['expectedVersion on a none action', { action: noteId, input: { id: 'a', name: 'x' }, expectedVersion: '1' }],
      ['a version action without expectedVersion', { action: setId, input: { id: 'a', name: 'x' } }],
    ])('judges %s as an error answer', async (_name, body) => {
      const res = await act(body);
      expect(res.res.statusCode).toBe(200);
      expect(res.answer).toMatchObject({ outcome: 'error', data: null });
    });

    it('rejects a write without a valid CSRF token or session', async () => {
      const noCsrf = await act({ action: noteId, input: { id: 'a', name: 'x' } }, { csrf: null });
      expect(noCsrf.res.statusCode).toBe(403);
      const noSession = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        payload: { action: noteId },
      });
      expect(noSession.statusCode).toBe(401);
    });
  });
});
