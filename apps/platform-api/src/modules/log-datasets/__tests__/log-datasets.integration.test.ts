// #1477 D-a — log test datasets: dataset / revision / candidate writes and the two reads, through the real `buildServer` over
// `menu-action` / `menu-query` against a real Postgres (throwaway DB only; app as platform_app, fixtures as platform_migrate).
// Needs the `log_datasets` migration. Two servers share the database: one with a mock Source port, one with none.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import type { DatasetSourceRead, DescribeFileResponse } from '../source-check.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LDS${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);

interface Person {
  id: string;
  cookie: string;
}
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  version?: string;
  fieldErrors: { path: string[]; code: string }[];
}

type PortMode = Record<string, DescribeFileResponse | 'throw'>;

describe.skipIf(!runIntegration)('log test datasets (#1477 D-a)', () => {
  let withPort: FastifyInstance;
  let noPort: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let admin2: Person;
  let user: Person;
  let developer: Person;
  let grantee: Person;
  let otherWorkspace = '';
  let foreignActor = '';
  let foreignDataset = '';
  let foreignCandidate = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const csrf = new Map<string, string>();
  let n = 0;
  const at = <T>(list: readonly T[], index: number): T => {
    const value = list[index];
    if (value === undefined) throw new Error(`no item ${index}`);
    return value;
  };
  // The mock Source port: the answer per fileRef; an absent key is `source_absent`.
  let portAnswers: PortMode = {};
  const portCalls: string[] = [];

  const mockPort: DatasetSourceRead = {
    describe: () => Promise.reject(new Error('unused')),
    searchRecords: () => Promise.reject(new Error('unused')),
    getWindow: () => Promise.reject(new Error('unused')),
    getParsed: () => Promise.reject(new Error('unused')),
    getPeriods: () => Promise.reject(new Error('unused')),
    getTopViewLink: () => Promise.reject(new Error('unused')),
    async describeFile(request) {
      portCalls.push(request.fileRef);
      const answer = portAnswers[request.fileRef];
      if (answer === 'throw') throw new Error('adapter body: SECRET-LINE-TEXT');
      return answer ?? { status: 'source_absent' };
    },
  };

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const appSql = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);
  const ref = (name: string) => `s3://${TAG}/${name}`;
  const files = (...names: string[]) => names.map((name, i) => ({ fileRef: ref(name), order: i + 1, sha256: H(String.fromCharCode(97 + (name.charCodeAt(0) % 6))) }));
  const sampleSet = (...names: string[]) => ({ sourceOwner: 'fab-team', files: files(...names) });

  async function person(roleLevel: 'admin' | 'developer' | 'user'): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    return { id, cookie: await loginAs(withPort, externalId) };
  }
  async function csrfOf(app: FastifyInstance, who: Person): Promise<string> {
    const key = `${app === withPort ? 'p' : 'n'}:${who.id}`;
    let token = csrf.get(key);
    if (!token) {
      const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(who.cookie) });
      token = boot.json<{ csrfToken: string }>().csrfToken;
      csrf.set(key, token);
    }
    return token;
  }
  async function actOn(app: FastifyInstance, action: string, input: Record<string, unknown>, who: Person, expectedVersion?: string): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': await csrfOf(app, who) },
      payload: JSON.stringify({
        action: `logDataset.${action}`,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const act = (action: string, input: Record<string, unknown>, who: Person, expectedVersion?: string) => actOn(withPort, action, input, who, expectedVersion);
  async function read(endpoint: string, params: Record<string, unknown>, who: Person): Promise<Answer> {
    const res = await withPort.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `logDataset.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const detail = (datasetId: string, who: Person) => read('datasetDetail', { datasetId }, who);

  async function makeDataset(who: Person, over: Record<string, unknown> = {}): Promise<{ id: string; version: string }> {
    const a = await act('datasetCreate', { name: `${TAG}-ds-${n++}`, purpose: `${TAG} purpose text`, ...over }, who);
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.datasetId, version: a.data.version };
  }
  const audit = async (subjectId: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [subjectId])).rows as {
      event_type: string;
      subject_type: string;
      actor_id: string;
      detail: Record<string, unknown>;
    }[];

  beforeEach(async () => {
    await sql('delete from core.rate_limits');
    portAnswers = {};
    portCalls.length = 0;
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    withPort = await buildServer({ config: loadConfig(), dbHandle, logDatasets: { sourceRead: mockPort } });
    noPort = await buildServer({ config: loadConfig(), dbHandle });
    await Promise.all([withPort.ready(), noPort.ready()]);
    admin = await person('admin');
    admin2 = await person('admin');
    user = await person('user');
    developer = await person('developer');
    grantee = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,'dataset.manage',null,$3)`,
      [WORKSPACE_ID, grantee.id, admin.id],
    );
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
    actorIds.push(foreignActor);
    foreignDataset = (
      await sql(
        `insert into log_datasets.dataset (workspace_id, name, owner_actor_id, share_scope, created_by, updated_by) values ($1,$2,$3,'workspace',$3,$3) returning id`,
        [otherWorkspace, `${TAG}-foreign-ds`, foreignActor],
      )
    ).rows[0].id as string;
    foreignCandidate = (
      await sql(
        `insert into log_datasets.dataset_candidate (workspace_id, origin, proposal, proposed_by) values ($1,'manual',$2::jsonb,$3) returning id`,
        [otherWorkspace, JSON.stringify({ name: 'x', purpose: '', modelIds: [], scenarioTags: [], sampleSet: sampleSet('f.log'), inputMeta: {}, note: null }), foreignActor],
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table log_datasets.dataset_revision disable trigger dataset_revision_immutable');
      await client.query('delete from log_datasets.dataset_revision where created_by = any($1) or workspace_id = any($2)', [actorIds, workspaceIds]);
      await client.query('alter table log_datasets.dataset_revision enable trigger dataset_revision_immutable');
      await client.query('delete from log_datasets.dataset_candidate where proposed_by = any($1)', [actorIds]);
      await client.query('delete from log_datasets.dataset where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
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
    await withPort?.close();
    await noPort?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('datasetCreate and the right', () => {
    it('refuses a User and a Developer without dataset.manage; Admin and a grantee may write', async () => {
      expect((await act('datasetCreate', { name: 'x' }, user)).outcome).toBe('forbidden');
      expect((await act('datasetCreate', { name: 'x' }, developer)).outcome).toBe('forbidden');
      expect((await act('datasetCreate', { name: `${TAG}-a` }, grantee)).outcome).toBe('ok');
      expect((await act('datasetCreate', { name: `${TAG}-b` }, admin)).outcome).toBe('ok');
    });

    it('creates a private dataset owned by the actor and audits ids, tag names and counts only', async () => {
      const ds = await makeDataset(admin, { scenarioTags: ['normal', 'carryover'], modelIds: [randomUUID()], synthetic: true });
      const row = (await sql('select * from log_datasets.dataset where id = $1', [ds.id])).rows[0];
      expect(row).toMatchObject({ workspace_id: WORKSPACE_ID, owner_actor_id: admin.id, share_scope: 'private', status: 'active', synthetic: true, row_version: 1 });
      expect(row.scenario_tags).toEqual(['normal', 'carryover']);
      const events = await audit(ds.id);
      expect(events).toEqual([
        { event_type: 'dataset.created', subject_type: 'dataset', actor_id: admin.id, detail: { shareScope: 'private', scenarioTags: ['normal', 'carryover'], modelCount: 1, synthetic: true } },
      ]);
      expect(JSON.stringify(events)).not.toContain('purpose text');
    });

    it.each([
      ['an unknown tag', { scenarioTags: ['smoke'] }, 'scenarioTags.0:malformed'],
      ['a blank name', { name: '   ' }, 'name:required'],
      ['an unknown share scope', { shareScope: 'world' }, 'shareScope:malformed'],
    ])('refuses %s', async (_label, over, expected) => {
      const a = await act('datasetCreate', { name: `${TAG}-v`, ...over }, admin);
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toContain(expected);
    });

    it('the database refuses a tag outside the closed set even past the service', async () => {
      await expect(
        sql(`insert into log_datasets.dataset (workspace_id, name, owner_actor_id, scenario_tags, created_by, updated_by) values ($1,'t',$2,'{smoke}',$2,$2)`, [WORKSPACE_ID, admin.id]),
      ).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('visibility: workspace and private', () => {
    it('a private dataset is visible to its owner only; another Admin gets null / not_found everywhere', async () => {
      const ds = await makeDataset(admin);
      expect((await detail(ds.id, admin)).data).toMatchObject({ id: ds.id, shareScope: 'private' });
      expect((await detail(ds.id, admin2)).data).toBeNull();
      expect((await detail(ds.id, user)).data).toBeNull();
      const listed = async (who: Person) => ((await read('datasets', { pageSize: 200 }, who)).data.rows as { id: string }[]).map((r) => r.id);
      expect(await listed(admin)).toContain(ds.id);
      expect(await listed(admin2)).not.toContain(ds.id);
      expect((await act('datasetUpdate', { id: ds.id, name: 'hijack' }, admin2, ds.version)).outcome).toBe('not_found');
      expect((await act('datasetArchive', { id: ds.id }, admin2, ds.version)).outcome).toBe('not_found');
      const rev = await act('revisionCreate', { datasetId: ds.id, sampleSet: sampleSet('p.log') }, admin2);
      expect(rev.outcome).toBe('invalid');
      expect(fe(rev)).toEqual(['datasetId:not_found']);
      expect(portCalls).toEqual([ref('p.log')]); // the file check ran, but nothing was stored
      expect((await sql('select count(*)::int as n from log_datasets.dataset_revision where dataset_id = $1', [ds.id])).rows[0].n).toBe(0);
    });

    it('a workspace dataset is visible to every member; only its owner changes the share scope', async () => {
      const ds = await makeDataset(admin, { shareScope: 'workspace' });
      expect((await detail(ds.id, user)).data).toMatchObject({ id: ds.id, shareScope: 'workspace' });
      expect((await detail(ds.id, admin2)).data).toMatchObject({ id: ds.id });
      const rename = await act('datasetUpdate', { id: ds.id, name: `${TAG}-renamed` }, admin2, ds.version);
      expect(rename.outcome, JSON.stringify(rename)).toBe('ok');
      const hide = await act('datasetUpdate', { id: ds.id, shareScope: 'private' }, admin2, rename.version);
      expect(hide.outcome).toBe('invalid');
      expect(fe(hide)).toEqual(['shareScope:owner_only']);
      const own = await act('datasetUpdate', { id: ds.id, shareScope: 'private' }, admin, rename.version);
      expect(own.outcome).toBe('ok');
      expect((await detail(ds.id, admin2)).data).toBeNull();
    });
  });

  describe('workspace isolation', () => {
    it('another workspace\'s dataset and candidate are not found; the list never shows them', async () => {
      expect((await detail(foreignDataset, admin)).data).toBeNull();
      const listed = (await read('datasets', { pageSize: 200 }, admin)).data.rows as { id: string }[];
      expect(listed.map((r) => r.id)).not.toContain(foreignDataset);
      expect((await act('datasetUpdate', { id: foreignDataset, name: 'x' }, admin, '1')).outcome).toBe('not_found');
      expect((await act('datasetArchive', { id: foreignDataset }, admin, '1')).outcome).toBe('not_found');
      const rev = await act('revisionCreate', { datasetId: foreignDataset, sampleSet: sampleSet('f.log') }, admin);
      expect(fe(rev)).toEqual(['datasetId:not_found']);
      expect((await act('candidateDecide', { id: foreignCandidate, decision: 'approve' }, admin, '1')).outcome).toBe('not_found');
      expect((await sql('select status from log_datasets.dataset_candidate where id = $1', [foreignCandidate])).rows[0].status).toBe('draft');
    });
  });

  describe('datasetUpdate / datasetArchive', () => {
    it('updates by version, writes audit with field names only, and a no-op save writes nothing', async () => {
      const ds = await makeDataset(admin);
      const same = await act('datasetUpdate', { id: ds.id, scenarioTags: [] }, admin, ds.version);
      expect(same.outcome).toBe('ok');
      expect(same.version).toBe('1');
      expect((await audit(ds.id)).map((e) => e.event_type)).toEqual(['dataset.created']);
      const upd = await act('datasetUpdate', { id: ds.id, name: `${TAG}-n2`, scenarioTags: ['boundary'], modelIds: [randomUUID()] }, admin, '1');
      expect(upd.outcome).toBe('ok');
      expect(upd.version).toBe('2');
      const events = await audit(ds.id);
      expect(events[1]).toMatchObject({ event_type: 'dataset.updated', detail: { changed: ['name', 'modelIds', 'scenarioTags'] } });
    });

    it('a stale expectedVersion is a conflict; archive is final and keeps its revisions', async () => {
      const ds = await makeDataset(admin);
      const ok = await act('datasetUpdate', { id: ds.id, purpose: 'v2' }, admin, ds.version);
      const stale = await act('datasetUpdate', { id: ds.id, purpose: 'v3' }, admin, ds.version);
      expect(stale.outcome).toBe('conflict');
      expect(stale.version).toBe(ok.version);
      const rev = await act('revisionCreate', { datasetId: ds.id, sampleSet: sampleSet('a.log') }, admin);
      expect(rev.outcome, JSON.stringify(rev)).toBe('ok');
      const arch = await act('datasetArchive', { id: ds.id }, admin, ok.version);
      expect(arch.outcome).toBe('ok');
      expect((await audit(ds.id)).at(-1)).toMatchObject({ event_type: 'dataset.archived', detail: { revisionCount: 1 } });
      expect((await act('datasetArchive', { id: ds.id }, admin, arch.version)).outcome).toBe('invalid');
      expect(fe(await act('datasetUpdate', { id: ds.id, name: 'z' }, admin, arch.version))).toEqual(['id:illegal_transition']);
      expect(fe(await act('revisionCreate', { datasetId: ds.id, sampleSet: sampleSet('b.log') }, admin))).toEqual(['datasetId:illegal_transition']);
      expect((await detail(ds.id, admin)).data.revisions).toHaveLength(1);
      // the guard trigger holds even for the migrate role
      await expect(sql(`update log_datasets.dataset set name = 'x', row_version = row_version + 1 where id = $1`, [ds.id])).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('revisionCreate: availability through the Source port', () => {
    const create = async (app: FastifyInstance, ds: string, names: string[]) => actOn(app, 'revisionCreate', { datasetId: ds, sampleSet: sampleSet(...names) }, admin);

    it('found with a matching hash: available (the port is asked once per file)', async () => {
      const ds = await makeDataset(admin);
      const set = sampleSet('m1.log', 'm2.log');
      for (const f of set.files) portAnswers[f.fileRef] = { status: 'ok', sha256: f.sha256 };
      const a = await actOn(withPort, 'revisionCreate', { datasetId: ds.id, sampleSet: set }, admin);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data).toMatchObject({ seq: 1, availability: 'available', availabilityChecked: true, fileCount: 2, counts: { match: 2 } });
      expect([...portCalls].sort()).toEqual(set.files.map((f) => f.fileRef).sort());
    });

    it('a changed hash is hash_mismatch; the revision is still created', async () => {
      const ds = await makeDataset(admin);
      const set = sampleSet('h1.log');
      portAnswers[at(set.files, 0).fileRef] = { status: 'ok', sha256: H('f') };
      const a = await actOn(withPort, 'revisionCreate', { datasetId: ds.id, sampleSet: set }, admin);
      expect(a.data).toMatchObject({ availability: 'hash_mismatch', counts: { hash_mismatch: 1 } });
      expect((await sql('select count(*)::int as n from log_datasets.dataset_revision where dataset_id = $1', [ds.id])).rows[0].n).toBe(1);
    });

    it.each([
      ['an absent source', { status: 'source_absent' } as DescribeFileResponse, 'unavailable'],
      ['no permission on the source', { status: 'permission_denied' } as DescribeFileResponse, 'unavailable'],
      ['an unsupported capability', { status: 'unsupported' } as DescribeFileResponse, 'unverified'],
      ['an adapter that throws (text never kept)', 'throw' as const, 'unverified'],
    ])('%s: revision created, availability %s', async (_label, answer, expected) => {
      const ds = await makeDataset(admin);
      const set = sampleSet(`x${n++}.log`);
      portAnswers[at(set.files, 0).fileRef] = answer;
      const a = await actOn(withPort, 'revisionCreate', { datasetId: ds.id, sampleSet: set }, admin);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data.availability).toBe(expected);
      expect(JSON.stringify(a)).not.toContain('SECRET-LINE-TEXT');
      expect((await audit(a.data.revisionId))[0]).toMatchObject({ event_type: 'dataset.revision_created', detail: { availability: expected } });
    });

    it('with no port the revision is created `unverified` and never shown as checked', async () => {
      const ds = await makeDataset(admin);
      const a = await create(noPort, ds.id, ['np.log']);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data).toMatchObject({ availability: 'unverified', availabilityChecked: false });
      const d = await read('datasetDetail', { datasetId: ds.id }, admin);
      expect(d.data.revisions[0]).toMatchObject({ availability: 'unverified', availabilityChecked: true });
    });

    it('availability is computed at read time for the latest revision; older ones are not checked', async () => {
      const ds = await makeDataset(admin);
      const first = sampleSet('r1.log');
      const second = sampleSet('r2.log');
      for (const f of [...first.files, ...second.files]) portAnswers[f.fileRef] = { status: 'ok', sha256: f.sha256 };
      await actOn(withPort, 'revisionCreate', { datasetId: ds.id, sampleSet: first }, admin);
      await actOn(withPort, 'revisionCreate', { datasetId: ds.id, sampleSet: second }, admin);
      const before = (await detail(ds.id, admin)).data.revisions;
      expect(before.map((r: { seq: number }) => r.seq)).toEqual([2, 1]);
      expect(before[0]).toMatchObject({ availability: 'available', availabilityChecked: true });
      expect(before[0].files[0]).toMatchObject({ fileRef: at(second.files, 0).fileRef, state: 'match' });
      expect(before[1]).toMatchObject({ availability: 'unverified', availabilityChecked: false });
      expect(before[1].files).toBeUndefined();
      portAnswers[at(second.files, 0).fileRef] = { status: 'source_absent' };
      expect((await detail(ds.id, admin)).data.revisions[0]).toMatchObject({ availability: 'unavailable' });
    });
  });

  describe('revision immutability and digest', () => {
    it('seq is 1..n; the same content twice in one dataset is refused, another dataset may hold it', async () => {
      const a = await makeDataset(admin);
      const b = await makeDataset(admin);
      const set = sampleSet('d1.log', 'd2.log');
      const first = await act('revisionCreate', { datasetId: a.id, sampleSet: set, inputMeta: { encoding: 'utf-8' }, note: 'first' }, admin);
      expect(first.data.seq).toBe(1);
      const dup = await act('revisionCreate', { datasetId: a.id, sampleSet: set }, admin);
      expect(dup.outcome).toBe('invalid');
      expect(fe(dup)).toEqual(['sampleSet:duplicate']);
      const swapped = { ...set, files: [{ ...at(set.files, 0), order: 2 }, { ...at(set.files, 1), order: 1 }] };
      expect((await act('revisionCreate', { datasetId: a.id, sampleSet: swapped }, admin)).data.seq).toBe(2);
      expect((await act('revisionCreate', { datasetId: b.id, sampleSet: set }, admin)).data.seq).toBe(1);
      expect((await sql('select input_meta, note from log_datasets.dataset_revision where id = $1', [first.data.revisionId])).rows[0]).toEqual({ input_meta: { encoding: 'utf-8' }, note: 'first' });
    });

    it('there is no action that edits or deletes a revision', async () => {
      const ds = await makeDataset(admin);
      const rev = await act('revisionCreate', { datasetId: ds.id, sampleSet: sampleSet('i.log') }, admin);
      for (const action of ['revisionUpdate', 'revisionDelete']) {
        const res = await withPort.inject({
          method: 'POST',
          url: '/api/v1/menu-action',
          headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie), 'x-csrf-token': await csrfOf(withPort, admin) },
          payload: JSON.stringify({ action: `logDataset.${action}`, context: {}, input: { id: rev.data.revisionId }, idempotencyKey: randomUUID() }),
        });
        expect(res.json<Answer>().outcome).not.toBe('ok');
      }
    });

    it('the database trigger refuses UPDATE and DELETE of a revision, even for the migrate role; platform_app holds no such grant', async () => {
      const ds = await makeDataset(admin);
      const rev = await act('revisionCreate', { datasetId: ds.id, sampleSet: sampleSet('t.log') }, admin);
      const id = rev.data.revisionId as string;
      await expect(sql(`update log_datasets.dataset_revision set note = 'x' where id = $1`, [id])).rejects.toMatchObject({ code: '23514' });
      await expect(sql('delete from log_datasets.dataset_revision where id = $1', [id])).rejects.toMatchObject({ code: '23514' });
      await expect(appSql(`update log_datasets.dataset_revision set note = 'x' where id = $1`, [id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('delete from log_datasets.dataset_revision where id = $1', [id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('delete from log_datasets.dataset where id = $1', [ds.id])).rejects.toMatchObject({ code: '42501' });
      expect((await sql('select note from log_datasets.dataset_revision where id = $1', [id])).rows[0].note).toBeNull();
    });

    it('audit of a revision carries the digest and counts, never a file location, a hash list or the note', async () => {
      const ds = await makeDataset(admin);
      const rev = await act('revisionCreate', { datasetId: ds.id, sampleSet: sampleSet('aud1.log', 'aud2.log'), note: 'NOTE-TEXT-SECRET' }, admin);
      const [event] = await audit(rev.data.revisionId);
      expect(event).toMatchObject({ event_type: 'dataset.revision_created', subject_type: 'dataset_revision' });
      expect(Object.keys(event?.detail ?? {}).sort()).toEqual(['availability', 'datasetId', 'digest', 'fileCount', 'seq']);
      expect(event?.detail.fileCount).toBe(2);
      const text = JSON.stringify(event);
      expect(text).not.toContain(TAG);
      expect(text).not.toContain('NOTE-TEXT-SECRET');
      expect(text).not.toContain(H('a'));
    });
  });

  describe('reads: datasets list', () => {
    it('filters by tag, model and status and pages on the server', async () => {
      const model = randomUUID();
      const a = await makeDataset(admin, { shareScope: 'workspace', scenarioTags: ['carryover', 'boundary'], modelIds: [model] });
      const b = await makeDataset(admin, { shareScope: 'workspace', scenarioTags: ['normal'] });
      const c = await makeDataset(admin, { shareScope: 'workspace', scenarioTags: [], modelIds: [model] });
      await act('datasetArchive', { id: c.id }, admin, c.version);
      const ids = async (params: Record<string, unknown>) => ((await read('datasets', { pageSize: 200, ...params }, admin)).data.rows as { id: string }[]).map((r) => r.id);
      const mine = [a.id, b.id, c.id];
      const only = async (params: Record<string, unknown>) => (await ids(params)).filter((id) => mine.includes(id));
      expect(await only({ filters: [{ id: 'tag', op: 'in', value: ['carryover'] }] })).toEqual([a.id]);
      expect(await only({ filters: [{ id: 'tag', op: 'isEmpty' }] })).toEqual([c.id]);
      expect((await only({ filters: [{ id: 'tag', op: 'notIn', value: ['carryover'] }] })).sort()).toEqual([b.id]);
      expect((await only({ filters: [{ id: 'model', op: 'in', value: [model] }] })).sort()).toEqual([a.id, c.id].sort());
      expect(await only({ filters: [{ id: 'status', op: 'in', value: ['archived'] }] })).toEqual([c.id]);
      expect((await only({ filters: [{ id: 'status', op: 'notIn', value: ['archived'] }] })).sort()).toEqual([a.id, b.id].sort());
      const paged = await read('datasets', { page: 0, pageSize: 1, sorting: [{ id: 'createdAt', desc: true }], filters: [{ id: 'model', op: 'in', value: [model] }] }, admin);
      expect(paged.data.rows).toHaveLength(1);
      expect(paged.data.total).toBe(2);
      expect(paged.data.rows[0]).not.toHaveProperty('stale');
    });

    it('refuses an unknown filter value, field or sort with an error, never an empty page', async () => {
      for (const params of [
        { filters: [{ id: 'tag', op: 'in', value: ['smoke'] }] },
        { filters: [{ id: 'owner', op: 'in', value: ['x'] }] },
        { sorting: [{ id: 'purpose', desc: false }] },
        { unknownParam: 1 },
      ]) {
        expect((await read('datasets', params, admin)).outcome).toBe('error');
      }
      expect((await read('datasetDetail', { datasetId: 'nope' }, admin)).outcome).toBe('error');
    });
  });

  describe('candidates', () => {
    const candidateInput = (over: Record<string, unknown> = {}) => ({
      origin: 'manual',
      name: `${TAG}-cand-${n++}`,
      sampleSet: sampleSet('c1.log', 'c2.log'),
      scenarioTags: ['regression'],
      ...over,
    });

    it('creates a draft with data references only and audits counts', async () => {
      const a = await act('candidateCreate', candidateInput({ note: 'why' }), grantee);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const row = (await sql('select * from log_datasets.dataset_candidate where id = $1', [a.data.candidateId])).rows[0];
      expect(row).toMatchObject({ origin: 'manual', status: 'draft', proposed_by: grantee.id, reviewer_actor_id: null, dataset_id: null });
      expect(row.proposal.sampleSet.files).toHaveLength(2);
      expect((await audit(a.data.candidateId))[0]).toMatchObject({ event_type: 'dataset.candidate_created', detail: { origin: 'manual', fileCount: 2, evidenceCount: 0 } });
      expect((await act('candidateCreate', candidateInput(), user)).outcome).toBe('forbidden');
    });

    it('a candidate takes no code, command or LLM origin', async () => {
      for (const extra of [{ command: 'rm -rf /' }, { script: 'x' }, { proposedBy: admin.id }, { origin: 'llm' }]) {
        const a = await act('candidateCreate', candidateInput(extra), admin);
        expect(a.outcome).toBe('invalid');
      }
      expect((await sql('select count(*)::int as n from log_datasets.dataset_candidate where proposed_by = $1 and origin not in (\'manual\',\'round_evidence\')', [admin.id])).rows[0].n).toBe(0);
      await expect(sql(`insert into log_datasets.dataset_candidate (workspace_id, origin, proposal, proposed_by) values ($1,'llm','{}'::jsonb,$2)`, [WORKSPACE_ID, admin.id])).rejects.toMatchObject({ code: '23514' });
    });

    it('a round-evidence candidate stores pointers (round id, locations), not line bodies', async () => {
      const roundId = randomUUID();
      const evidence = [{ fileRef: ref('c1.log'), line: 7, fileSha256: H('a'), note: 'check this' }];
      const a = await act('candidateCreate', candidateInput({ origin: 'round_evidence', roundId, evidenceRefs: evidence }), admin);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect((await sql('select source_ref from log_datasets.dataset_candidate where id = $1', [a.data.candidateId])).rows[0].source_ref).toEqual({ roundId, evidenceRefs: evidence });
      expect((await audit(a.data.candidateId))[0]?.detail).toEqual({ origin: 'round_evidence', fileCount: 2, evidenceCount: 1 });
      const withBody = await act('candidateCreate', candidateInput({ origin: 'round_evidence', roundId, evidenceRefs: [{ ...evidence[0], text: 'raw line' }] }), admin);
      expect(withBody.outcome).toBe('invalid');
    });

    it('approve creates the dataset and its first revision in one transaction and records the decision', async () => {
      const c = await act('candidateCreate', candidateInput({ scenarioTags: ['regression', 'file_boundary'], inputMeta: { format: 'csv' } }), grantee);
      const ok = await act('candidateDecide', { id: c.data.candidateId, decision: 'approve', reason: 'looks right' }, admin, c.data.version);
      expect(ok.outcome, JSON.stringify(ok)).toBe('ok');
      const { datasetId, revisionId } = ok.data;
      const ds = (await sql('select * from log_datasets.dataset where id = $1', [datasetId])).rows[0];
      expect(ds).toMatchObject({ owner_actor_id: grantee.id, share_scope: 'workspace', status: 'active', synthetic: false });
      expect(ds.scenario_tags).toEqual(['regression', 'file_boundary']);
      const rev = (await sql('select seq, input_meta, created_by from log_datasets.dataset_revision where dataset_id = $1', [datasetId])).rows;
      expect(rev).toEqual([{ seq: 1, input_meta: { format: 'csv' }, created_by: admin.id }]);
      expect((await sql('select status, reviewer_actor_id, dataset_id, reason, row_version from log_datasets.dataset_candidate where id = $1', [c.data.candidateId])).rows[0]).toEqual({
        status: 'approved',
        reviewer_actor_id: admin.id,
        dataset_id: datasetId,
        reason: 'looks right',
        row_version: 2,
      });
      expect((await audit(c.data.candidateId)).map((e) => e.event_type)).toEqual(['dataset.candidate_created', 'dataset.candidate_approved']);
      expect((await audit(datasetId))[0]).toMatchObject({ event_type: 'dataset.created' });
      expect((await audit(revisionId))[0]).toMatchObject({ event_type: 'dataset.revision_created' });
      expect((await detail(datasetId, user)).data.revisions).toHaveLength(1);
    });

    it('approve rolls back the dataset and the revision when a step fails', async () => {
      // A stored proposal whose input_meta is not an object passes the proposal check but fails the revision insert, after the dataset insert.
      const name = `${TAG}-rollback-${n++}`;
      const cand = (
        await sql(
          `insert into log_datasets.dataset_candidate (workspace_id, origin, proposal, proposed_by) values ($1,'manual',$2::jsonb,$3) returning id`,
          [WORKSPACE_ID, JSON.stringify({ name, purpose: '', modelIds: [], scenarioTags: [], sampleSet: sampleSet('rb.log'), inputMeta: 'not-an-object', note: null }), admin.id],
        )
      ).rows[0].id as string;
      const res = await withPort.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie), 'x-csrf-token': await csrfOf(withPort, admin) },
        payload: JSON.stringify({ action: 'logDataset.candidateDecide', context: {}, input: { id: cand, decision: 'approve' }, idempotencyKey: randomUUID(), expectedVersion: '1' }),
      });
      expect(res.statusCode === 200 ? res.json<Answer>().outcome : 'http-error').not.toBe('ok');
      expect((await sql('select count(*)::int as n from log_datasets.dataset where name = $1', [name])).rows[0].n).toBe(0);
      expect((await sql('select status, dataset_id, row_version from log_datasets.dataset_candidate where id = $1', [cand])).rows[0]).toEqual({ status: 'draft', dataset_id: null, row_version: 1 });
      expect((await audit(cand)).filter((e) => e.event_type !== 'dataset.candidate_created')).toEqual([]);
    });

    it('reject records the reason (audited by length only) and creates nothing; a rejection needs a reason', async () => {
      const c = await act('candidateCreate', candidateInput(), admin);
      const noReason = await act('candidateDecide', { id: c.data.candidateId, decision: 'reject' }, admin, c.data.version);
      expect(noReason.outcome).toBe('invalid');
      expect(fe(noReason)).toEqual(['reason:required']);
      const rej = await act('candidateDecide', { id: c.data.candidateId, decision: 'reject', reason: 'REASON-TEXT-SECRET' }, admin, c.data.version);
      expect(rej.outcome).toBe('ok');
      expect((await sql('select status, reason, dataset_id, reviewer_actor_id from log_datasets.dataset_candidate where id = $1', [c.data.candidateId])).rows[0]).toEqual({
        status: 'rejected',
        reason: 'REASON-TEXT-SECRET',
        dataset_id: null,
        reviewer_actor_id: admin.id,
      });
      const events = await audit(c.data.candidateId);
      expect(events.at(-1)).toMatchObject({ event_type: 'dataset.candidate_rejected', detail: { reasonLength: 18 } });
      expect(JSON.stringify(events)).not.toContain('REASON-TEXT-SECRET');
    });

    it('a stale version is a conflict, a decided candidate is final, and an unknown id is not_found', async () => {
      const c = await act('candidateCreate', candidateInput(), admin);
      expect((await act('candidateDecide', { id: c.data.candidateId, decision: 'approve' }, admin, '9')).outcome).toBe('conflict');
      const ok = await act('candidateDecide', { id: c.data.candidateId, decision: 'approve' }, admin, c.data.version);
      expect(ok.outcome).toBe('ok');
      const again = await act('candidateDecide', { id: c.data.candidateId, decision: 'reject', reason: 'late' }, admin, ok.version);
      expect(again.outcome).toBe('invalid');
      expect(fe(again)).toEqual(['id:illegal_transition']);
      expect((await act('candidateDecide', { id: randomUUID(), decision: 'approve' }, admin, '1')).outcome).toBe('not_found');
      await expect(sql(`update log_datasets.dataset_candidate set reason = 'x', row_version = row_version + 1 where id = $1`, [c.data.candidateId])).rejects.toMatchObject({ code: '23514' });
    });

    it('two parallel approvals holding the same version: one wins, one conflicts, one dataset exists', async () => {
      const c = await act('candidateCreate', candidateInput(), admin);
      const answers = await Promise.all([
        act('candidateDecide', { id: c.data.candidateId, decision: 'approve' }, admin, c.data.version),
        act('candidateDecide', { id: c.data.candidateId, decision: 'approve' }, admin2, c.data.version),
      ]);
      expect(answers.map((a) => a.outcome).sort()).toEqual(['conflict', 'ok']);
      expect((await sql('select count(*)::int as n from log_datasets.dataset where name = $1', [(await sql('select proposal->>\'name\' as name from log_datasets.dataset_candidate where id = $1', [c.data.candidateId])).rows[0].name])).rows[0].n).toBe(1);
    });
  });
});
