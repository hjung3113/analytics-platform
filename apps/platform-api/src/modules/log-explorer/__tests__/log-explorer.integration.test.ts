// #1468 b — log explorer investigations: schema, guard trigger, grants, the five actions and the two reads, through the
// real `buildServer` over `POST /api/v1/menu-action` / `menu-query` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`; app as platform_app, fixtures and cleanup as platform_migrate).
// Needs the log_explorer migration of #1468 b (0109).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LEX${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);

interface Person {
  id: string;
  cookie: string;
  csrf: string;
}
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  version: string | null;
  fieldErrors: { path: string[]; code: string }[];
  message?: string;
}
type Row = Record<string, unknown>;

const SAMPLE = (n = 2) => ({
  files: Array.from({ length: n }, (_v, i) => ({ fileRef: `s3://${TAG}/f${i + 1}.log`, order: i + 1, sha256: H('a') })),
  sourceOwner: 'fab-team',
});
const REF = (line: number, over: Record<string, unknown> = {}) => ({ fileRef: `s3://${TAG}/f1.log`, line, fileSha256: H('b'), ...over });

describe.skipIf(!runIntegration)('log explorer investigations (#1468 b)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let adminNoGrant: Person;
  let plain: Person;
  let developer: Person;
  let granted: Person;
  let granted2: Person;
  let otherWorkspace = '';
  let foreignActor = '';
  let foreignInvestigation = '';
  let foreignRound = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const projectIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const appSql = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }

  async function act(
    action: string,
    input: Record<string, unknown>,
    opts: { who?: Person; expectedVersion?: string } = {},
  ): Promise<Answer> {
    const who = opts.who ?? granted;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `logExplorer.${action}`,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = granted): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `logExplorer.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  async function create(over: Record<string, unknown> = {}, who: Person = granted) {
    const a = await act('investigationCreate', { title: `${TAG} inv`, origin: 'standalone', sampleSet: SAMPLE(), ...over }, { who });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.id as string, version: a.data.version as string };
  }

  /** A project and an open round of the session workspace, inserted directly (the lifecycle module owns the real path). */
  async function makeRound(workspace = WORKSPACE_ID, actor = admin.id): Promise<string> {
    const project = (
      await sql(
        `insert into log_lifecycle.development_project (workspace_id, model_id, kind, owner_actor_id, created_by, updated_by) values ($1,$2,'new',$3,$3,$3) returning id`,
        [workspace, randomUUID(), actor],
      )
    ).rows[0].id as string;
    projectIds.push(project);
    return (
      await sql(
        `insert into log_lifecycle.validation_round (workspace_id, project_id, seq, stage, sample_set, sample_manifest_digest, created_by, updated_by) values ($1,$2,1,'registered',$3::jsonb,$4,$5,$5) returning id`,
        [workspace, project, JSON.stringify(SAMPLE(3)), H('d'), actor],
      )
    ).rows[0].id as string;
  }

  const row = async (id: string) => (await sql('select * from log_explorer.investigation where id = $1', [id])).rows[0] as Row;
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as {
      event_type: string;
      subject_type: string;
      actor_id: string;
      detail: Row;
    }[];
  const grant = (actor: string) =>
    sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, 'explorer.investigate', null, $3)`,
      [WORKSPACE_ID, actor, admin.id],
    );

  beforeEach(async () => {
    await sql('delete from core.rate_limits');
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    adminNoGrant = await person('admin');
    plain = await person('user');
    developer = await person('developer');
    granted = await person('developer');
    granted2 = await person('developer');
    await grant(granted.id);
    await grant(granted2.id);
    await grant(admin.id);
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
    actorIds.push(foreignActor);
    foreignInvestigation = (
      await sql(
        `insert into log_explorer.investigation (workspace_id, title, owner_actor_id, origin, sample_set) values ($1,$2,$3,'standalone',$4::jsonb) returning id`,
        [otherWorkspace, `${TAG} foreign`, foreignActor, JSON.stringify(SAMPLE(1))],
      )
    ).rows[0].id as string;
    foreignRound = await makeRound(otherWorkspace, foreignActor);
  }, 60_000);

  afterAll(async () => {
    await sql('delete from log_explorer.investigation where owner_actor_id = any($1)', [actorIds]);
    await sql('delete from log_lifecycle.validation_round where project_id = any($1)', [projectIds]);
    await sql('delete from log_lifecycle.development_project where id = any($1)', [projectIds]);
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('permissions', () => {
    it.each([
      ['a user without the grant', () => plain],
      ['a developer without the grant', () => developer],
      ['an admin without the grant (no role bypass: the capability is sensitive)', () => adminNoGrant],
    ])('%s cannot create', async (_label, who) => {
      const a = await act('investigationCreate', { title: 't', origin: 'standalone', sampleSet: SAMPLE() }, { who: who() });
      expect(a.outcome).toBe('forbidden');
    });

    it('a granted developer and a granted admin can create', async () => {
      expect((await act('investigationCreate', { title: 't', origin: 'standalone', sampleSet: SAMPLE() }, { who: granted })).outcome).toBe('ok');
      expect((await act('investigationCreate', { title: 't', origin: 'standalone', sampleSet: SAMPLE() }, { who: admin })).outcome).toBe('ok');
    });

    it('every session with platform:view can read its own (empty) list', async () => {
      const a = await read('investigations', {}, plain);
      expect(a.outcome).toBe('ok');
      expect(a.data.rows).toEqual([]);
    });
  });

  describe('create', () => {
    it('stores a standalone investigation with its sample set, empty filters and evidence, version 1, and one body-free audit row', async () => {
      const { id, version } = await create({ title: '  First  ' });
      expect(version).toBe('1');
      const r = await row(id);
      expect(r).toMatchObject({ title: 'First', origin: 'standalone', round_id: null, status: 'open', row_version: 1, owner_actor_id: granted.id, workspace_id: WORKSPACE_ID });
      expect(r.filters).toEqual({});
      expect(r.evidence).toEqual([]);
      expect(r.sample_set).toEqual(SAMPLE());
      expect(await audit(id)).toEqual([
        expect.objectContaining({ event_type: 'explorer.investigation.created', subject_type: 'investigation', actor_id: granted.id, detail: { origin: 'standalone', roundId: null, fileCount: 2, filterKeys: [] } }),
      ]);
    });

    it('a round origin references the round by id and copies no sample set', async () => {
      const roundId = await makeRound();
      const { id } = await create({ origin: 'round', roundId, sampleSet: undefined });
      const r = await row(id);
      expect(r).toMatchObject({ origin: 'round', round_id: roundId, sample_set: null });
    });

    it('refuses an unknown round and another workspace\'s round (not_found on roundId) and creates nothing', async () => {
      const before = Number((await sql('select count(*)::int as n from log_explorer.investigation where owner_actor_id = $1', [granted.id])).rows[0].n);
      for (const roundId of [randomUUID(), foreignRound]) {
        const a = await act('investigationCreate', { title: 't', origin: 'round', roundId });
        expect(a.outcome).toBe('invalid');
        expect(fe(a)).toEqual(['roundId:not_found']);
      }
      const after = Number((await sql('select count(*)::int as n from log_explorer.investigation where owner_actor_id = $1', [granted.id])).rows[0].n);
      expect(after).toBe(before);
    });

    it.each([
      ['a body-shaped extra key', { extra: 'x' }],
    ])('refuses an unknown input key (%s)', async (_label, extra) => {
      const a = await act('investigationCreate', { title: 't', origin: 'standalone', sampleSet: SAMPLE(), ...extra });
      expect(a.outcome).not.toBe('ok');
    });

    it('the origin shape check refuses a round origin carrying a sample set (DB check, bypassing the service)', async () => {
      await expect(
        sql(`insert into log_explorer.investigation (workspace_id, title, owner_actor_id, origin, round_id, sample_set) values ($1,'t',$2,'round',$3,$4::jsonb)`, [WORKSPACE_ID, granted.id, randomUUID(), JSON.stringify(SAMPLE())]),
      ).rejects.toMatchObject({ constraint: 'investigation_origin_shape_check' });
      await expect(
        sql(`insert into log_explorer.investigation (workspace_id, title, owner_actor_id, origin, round_id) values ($1,'t',$2,'standalone',$3)`, [WORKSPACE_ID, granted.id, randomUUID()]),
      ).rejects.toMatchObject({ constraint: 'investigation_origin_shape_check' });
    });
  });

  describe('update and optimistic concurrency', () => {
    it('updates title and filters, bumps the version, and audits filter KEYS only', async () => {
      const { id, version } = await create();
      const a = await act('investigationUpdate', { id, title: 'Renamed', filters: { level: 'SECRETVALUE', lines: [7, 8] } }, { expectedVersion: version });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.version).toBe('2');
      expect(await row(id)).toMatchObject({ title: 'Renamed', row_version: 2, filters: { level: 'SECRETVALUE', lines: [7, 8] } });
      const events = await audit(id);
      const updated = events.find((e) => e.event_type === 'explorer.investigation.updated');
      expect(updated?.detail).toEqual({ changed: ['title', 'filters'], filterKeys: ['level', 'lines'] });
      expect(JSON.stringify(events)).not.toContain('SECRETVALUE');
    });

    it('a stale expectedVersion is a conflict and writes nothing', async () => {
      const { id, version } = await create();
      expect((await act('investigationUpdate', { id, title: 'A' }, { expectedVersion: version })).outcome).toBe('ok');
      const stale = await act('investigationUpdate', { id, title: 'B' }, { expectedVersion: version });
      expect(stale.outcome).toBe('conflict');
      expect(stale.version).toBe('2');
      expect((await row(id)).title).toBe('A');
    });

    it('two parallel updates holding the same version: one wins, one conflicts', async () => {
      const { id, version } = await create();
      const answers = await Promise.all([
        act('investigationUpdate', { id, title: 'P1' }, { expectedVersion: version }),
        act('investigationUpdate', { id, title: 'P2' }, { expectedVersion: version }),
      ]);
      expect(answers.map((a) => a.outcome).sort()).toEqual(['conflict', 'ok']);
      expect((await row(id)).row_version).toBe(2);
    });

    it('a missing expectedVersion on a version action is refused (never a silent overwrite)', async () => {
      const { id } = await create();
      const a = await act('investigationUpdate', { id, title: 'X' });
      expect(a.outcome).not.toBe('ok');
      expect((await row(id)).title).toBe(`${TAG} inv`);
    });

    it('an update with neither title nor filters is invalid', async () => {
      const { id, version } = await create();
      const a = await act('investigationUpdate', { id }, { expectedVersion: version });
      expect(a.outcome).toBe('invalid');
    });
  });

  describe('other workspace and other owner are not found', () => {
    it.each(['investigationUpdate', 'investigationArchive', 'evidenceAdd', 'evidenceRemove'])('%s on another workspace\'s investigation is not_found', async (action) => {
      const input: Record<string, unknown> = { id: foreignInvestigation };
      if (action === 'investigationUpdate') input.title = 'x';
      if (action === 'evidenceAdd') input.ref = REF(1);
      if (action === 'evidenceRemove') input.ref = { fileRef: `s3://${TAG}/f1.log`, line: 1 };
      const a = await act(action, input, { who: admin, expectedVersion: '1' });
      expect(a.outcome).toBe('not_found');
      expect((await row(foreignInvestigation)).row_version).toBe(1);
    });

    it('another owner of the same workspace (even an admin) gets not_found, never forbidden', async () => {
      const { id, version } = await create();
      for (const who of [granted2, admin]) {
        const a = await act('investigationUpdate', { id, title: 'hijack' }, { who, expectedVersion: version });
        expect(a.outcome).toBe('not_found');
      }
      expect((await row(id)).title).toBe(`${TAG} inv`);
    });

    it('the detail of another workspace\'s or another owner\'s investigation is null, like an unknown id', async () => {
      const { id } = await create();
      expect((await read('investigationDetail', { investigationId: foreignInvestigation }, admin)).data).toBeNull();
      expect((await read('investigationDetail', { investigationId: id }, granted2)).data).toBeNull();
      expect((await read('investigationDetail', { investigationId: randomUUID() })).data).toBeNull();
      expect((await read('investigationDetail', { investigationId: id })).data).not.toBeNull();
    });
  });

  describe('list scope', () => {
    it('lists only the caller\'s own investigations, newest first, with the status filter and paging', async () => {
      const a = await create({ title: `${TAG} list-a` }, granted2);
      const b = await create({ title: `${TAG} list-b` }, granted2);
      const mine = await read('investigations', {}, granted2);
      expect(mine.outcome).toBe('ok');
      expect(mine.data.rows.map((r: Row) => r.id)).toEqual([b.id, a.id]);
      expect(mine.data.total).toBe(2);
      expect(mine.data.rows.every((r: Row) => !('sampleSet' in r) && !('evidence' in r))).toBe(true);
      const theirs = await read('investigations', {}, granted);
      expect(theirs.data.rows.map((r: Row) => r.id)).not.toContain(a.id);
      expect(theirs.data.rows.map((r: Row) => r.id)).not.toContain(foreignInvestigation);

      const archived = await act('investigationArchive', { id: a.id }, { who: granted2, expectedVersion: a.version });
      expect(archived.outcome).toBe('ok');
      expect((await read('investigations', { status: 'open' }, granted2)).data.rows.map((r: Row) => r.id)).toEqual([b.id]);
      expect((await read('investigations', { status: 'archived' }, granted2)).data.rows.map((r: Row) => r.id)).toEqual([a.id]);
      const page = await read('investigations', { page: 1, pageSize: 1 }, granted2);
      expect(page.data.rows).toHaveLength(1);
      expect(page.data.total).toBe(2);
    });

    it.each([[{ status: 'x' }], [{ page: -1 }], [{ pageSize: 0 }], [{ other: 1 }]])('refuses bad params %j', async (params) => {
      expect((await read('investigations', params)).outcome).toBe('error');
    });
  });

  describe('evidence', () => {
    it('adds and removes locations by (fileRef, line); a note is stored, no body is', async () => {
      const { id, version } = await create();
      const added = await act('evidenceAdd', { id, ref: REF(10, { note: 'check this' }) }, { expectedVersion: version });
      expect(added.outcome, JSON.stringify(added)).toBe('ok');
      expect((await row(id)).evidence).toEqual([REF(10, { note: 'check this' })]);
      const second = await act('evidenceAdd', { id, ref: REF(11) }, { expectedVersion: added.version as string });
      expect(second.outcome).toBe('ok');
      const removed = await act('evidenceRemove', { id, ref: { fileRef: `s3://${TAG}/f1.log`, line: 10 } }, { expectedVersion: second.version as string });
      expect(removed.outcome).toBe('ok');
      expect((await row(id)).evidence).toEqual([REF(11)]);
      expect(removed.version).toBe('4');
    });

    it('refuses a body or excerpt key, a duplicate location and a location it does not hold', async () => {
      const { id, version } = await create();
      const body = await act('evidenceAdd', { id, ref: REF(1, { body: 'ERROR boom' }) }, { expectedVersion: version });
      expect(body.outcome).toBe('invalid');
      expect(fe(body)).toEqual(['ref.body:malformed']);
      const first = await act('evidenceAdd', { id, ref: REF(1) }, { expectedVersion: version });
      const dup = await act('evidenceAdd', { id, ref: REF(1, { note: 'again' }) }, { expectedVersion: first.version as string });
      expect(dup.outcome).toBe('invalid');
      expect(fe(dup)).toEqual(['ref:duplicate']);
      const missing = await act('evidenceRemove', { id, ref: { fileRef: `s3://${TAG}/f1.log`, line: 99 } }, { expectedVersion: first.version as string });
      expect(fe(missing)).toEqual(['ref:not_found']);
    });

    it('holds at most 100: the 101st is refused (too_many) and the stored list is unchanged', async () => {
      const { id } = await create();
      const ninetyNine = Array.from({ length: 99 }, (_v, i) => REF(i + 1));
      await sql(`update log_explorer.investigation set evidence = $2::jsonb, row_version = row_version + 1 where id = $1`, [id, JSON.stringify(ninetyNine)]);
      const v = String((await row(id)).row_version);
      const hundredth = await act('evidenceAdd', { id, ref: REF(100) }, { expectedVersion: v });
      expect(hundredth.outcome, JSON.stringify(hundredth)).toBe('ok');
      const over = await act('evidenceAdd', { id, ref: REF(101) }, { expectedVersion: hundredth.version as string });
      expect(over.outcome).toBe('invalid');
      expect(fe(over)).toEqual(['ref:too_many']);
      expect(((await row(id)).evidence as unknown[]).length).toBe(100);
    });

    it('the database also refuses a 101-entry evidence array (check constraint)', async () => {
      const { id } = await create();
      const tooMany = Array.from({ length: 101 }, (_v, i) => REF(i + 1));
      await expect(sql(`update log_explorer.investigation set evidence = $2::jsonb, row_version = row_version + 1 where id = $1`, [id, JSON.stringify(tooMany)])).rejects.toMatchObject({
        constraint: 'investigation_evidence_check',
      });
    });

    it('audits counts and the note LENGTH only: no location, hash, note text or filter value', async () => {
      const { id, version } = await create();
      const note = 'topsecretnote';
      const added = await act('evidenceAdd', { id, ref: REF(5, { note }) }, { expectedVersion: version });
      await act('evidenceRemove', { id, ref: { fileRef: `s3://${TAG}/f1.log`, line: 5 } }, { expectedVersion: added.version as string });
      const events = await audit(id);
      expect(events.find((e) => e.event_type === 'explorer.evidence.added')?.detail).toEqual({ evidenceCount: 1, noteLength: note.length });
      expect(events.find((e) => e.event_type === 'explorer.evidence.removed')?.detail).toEqual({ evidenceCount: 0 });
      const text = JSON.stringify(events);
      for (const secret of [note, H('b'), `s3://${TAG}/f1.log`]) expect(text).not.toContain(secret);
    });
  });

  describe('archive', () => {
    it('archives once; a stale version on the archived row answers conflict, a current version refuses every write (illegal_transition)', async () => {
      const { id, version } = await create();
      const archived = await act('investigationArchive', { id }, { expectedVersion: version });
      expect(archived.outcome).toBe('ok');
      expect((await row(id)).status).toBe('archived');
      expect((await audit(id)).map((e) => e.event_type)).toEqual(['explorer.investigation.created', 'explorer.investigation.archived']);
      const v = archived.version as string;
      // The engine compares expectedVersion before the row state: the pre-archive version is a `conflict`
      // naming the archived row's current version, for every action, evidenceRemove included.
      for (const [action, input] of [
        ['investigationUpdate', { id, title: 'x' }],
        ['evidenceRemove', { id, ref: { fileRef: `s3://${TAG}/f1.log`, line: 1 } }],
      ] as const) {
        const stale = await act(action, input, { expectedVersion: version });
        expect(stale.outcome, action).toBe('conflict');
        expect(stale.version).toBe(v);
      }
      // Only a current version reaches the row and meets finality.
      for (const [action, input] of [
        ['investigationArchive', { id }],
        ['investigationUpdate', { id, title: 'x' }],
        ['evidenceAdd', { id, ref: REF(1) }],
        ['evidenceRemove', { id, ref: { fileRef: `s3://${TAG}/f1.log`, line: 1 } }],
      ] as const) {
        const a = await act(action, input, { expectedVersion: v });
        expect(a.outcome, action).toBe('invalid');
        expect(fe(a)).toEqual(['id:illegal_transition']);
      }
    });
  });

  describe('detail and revoked access', () => {
    it('returns the head, filters, set and evidence refs with state available', async () => {
      const { id, version } = await create();
      await act('evidenceAdd', { id, ref: REF(3, { note: 'n' }) }, { expectedVersion: version });
      const d = (await read('investigationDetail', { investigationId: id })).data;
      expect(d).toMatchObject({ id, origin: 'standalone', status: 'open', sampleSetState: 'inline', canInvestigate: true, sampleSet: SAMPLE() });
      expect(d.evidence).toEqual([{ ref: REF(3, { note: 'n' }), state: { code: 'available' }, sourceAccess: 'unchecked' }]);
    });

    it('a round origin resolves the round\'s sample set through the lifecycle port', async () => {
      const roundId = await makeRound();
      const { id } = await create({ origin: 'round', roundId, sampleSet: undefined });
      const d = (await read('investigationDetail', { investigationId: id })).data;
      expect(d).toMatchObject({ origin: 'round', roundId, sampleSetState: 'round', sampleSet: SAMPLE(3) });
    });

    it('a round that can no longer be resolved keeps every ref, now no_access / round_not_visible, refuses every write, and the read still succeeds', async () => {
      const roundId = await makeRound();
      const { id, version } = await create({ origin: 'round', roundId, sampleSet: undefined });
      const added = await act('evidenceAdd', { id, ref: REF(2) }, { expectedVersion: version });
      await sql('delete from log_lifecycle.validation_round where id = $1', [roundId]);
      const a = await read('investigationDetail', { investigationId: id });
      expect(a.outcome).toBe('ok');
      expect(a.data).toMatchObject({ sampleSet: null, sampleSetState: 'round_unavailable' });
      expect(a.data.evidence).toEqual([{ ref: REF(2), state: { code: 'no_access', reason: 'round_not_visible' }, sourceAccess: 'unchecked' }]);
      expect((await row(id)).evidence).toEqual([REF(2)]);

      // Writes need the Round to resolve too (the same port and answer as create), judged on the write
      // transaction: every versioned action is refused `roundId: not_found` — nothing mutates, no version
      // bump, no audit row, the stored refs stay.
      const evidence = (await row(id)).evidence;
      const rowVersion = (await row(id)).row_version;
      const events = await audit(id);
      for (const [action, input] of [
        ['investigationUpdate', { id, title: 'x' }],
        ['evidenceAdd', { id, ref: REF(3) }],
        ['evidenceRemove', { id, ref: { fileRef: `s3://${TAG}/f1.log`, line: 2 } }],
        ['investigationArchive', { id }],
      ] as const) {
        const w = await act(action, input, { expectedVersion: added.version as string });
        expect(w.outcome, action).toBe('invalid');
        expect(fe(w)).toEqual(['roundId:not_found']);
      }
      expect((await row(id)).evidence).toEqual(evidence);
      expect((await row(id)).row_version).toBe(rowVersion);
      expect(await audit(id)).toEqual(events);
    });

    it('revoking explorer.investigate keeps the stored refs (never deleted) and shows them as no_access / capability_lost; writes are forbidden', async () => {
      const owner = await person('developer');
      await grant(owner.id);
      const { id, version } = await create({}, owner);
      const added = await act('evidenceAdd', { id, ref: REF(4) }, { who: owner, expectedVersion: version });
      expect(added.outcome).toBe('ok');

      await sql(`delete from permission.permission_grants where actor_id = $1 and capability = 'explorer.investigate'`, [owner.id]);

      const d = await read('investigationDetail', { investigationId: id }, owner);
      expect(d.outcome).toBe('ok');
      expect(d.data.canInvestigate).toBe(false);
      expect(d.data.evidence).toEqual([{ ref: REF(4), state: { code: 'no_access', reason: 'capability_lost' }, sourceAccess: 'unchecked' }]);
      expect((await row(id)).evidence).toEqual([REF(4)]);
      expect((await act('evidenceRemove', { id, ref: { fileRef: `s3://${TAG}/f1.log`, line: 4 } }, { who: owner, expectedVersion: added.version as string })).outcome).toBe('forbidden');
      expect((await row(id)).evidence).toEqual([REF(4)]);

      await grant(owner.id);
      const back = await read('investigationDetail', { investigationId: id }, owner);
      expect(back.data.evidence[0].state).toEqual({ code: 'available' });
    });

    it.each([[{}], [{ investigationId: 'x' }], [{ investigationId: randomUUID(), extra: 1 }]])('refuses bad detail params %j', async (params) => {
      expect((await read('investigationDetail', params)).outcome).toBe('error');
    });
  });

  describe('database walls', () => {
    it('platform_app cannot DELETE and cannot change identity or origin columns', async () => {
      const { id } = await create();
      await expect(appSql('delete from log_explorer.investigation where id = $1', [id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('update log_explorer.investigation set owner_actor_id = $2 where id = $1', [id, admin.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('update log_explorer.investigation set round_id = $2 where id = $1', [id, randomUUID()])).rejects.toMatchObject({ code: '42501' });
    });

    it('the guard trigger refuses what the column grant cannot (migrate role): identity change, a missing version bump, an edit of an archived row', async () => {
      const { id, version } = await create();
      await expect(sql('update log_explorer.investigation set owner_actor_id = $2, row_version = row_version + 1 where id = $1', [id, admin.id])).rejects.toMatchObject({ code: '23514' });
      await expect(sql(`update log_explorer.investigation set title = 'x' where id = $1`, [id])).rejects.toMatchObject({ code: '23514' });
      await act('investigationArchive', { id }, { expectedVersion: version });
      await expect(sql(`update log_explorer.investigation set title = 'x', row_version = row_version + 1 where id = $1`, [id])).rejects.toMatchObject({ code: '23514' });
    });
  });
});
