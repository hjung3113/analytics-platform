// #1444 c — log lifecycle: schema, guard triggers, grants, the project/round actions and the five reads, through the real
// `buildServer` over `POST /api/v1/menu-action` / `menu-query` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`; app as platform_app, fixtures and cleanup as platform_migrate).
// Needs the log_lifecycle migration of #1444 c.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../../log-knowledge/index.js';
import { sampleManifestDigest } from '../domain/sample-set.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LLC${randomUUID().slice(0, 6).toUpperCase()}`;
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

describe.skipIf(!runIntegration)('log lifecycle (#1444 c)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let developerGranted: Person;
  let owner: Person;
  let otherWorkspace = '';
  let foreignActor = '';
  let foreignModel = '';
  let foreignProject = '';
  let foreignRound = '';
  let vendorId = '';
  let vendorOther = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
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
    opts: { who?: Person; expectedVersion?: string; key?: string } = {},
  ): Promise<Answer> {
    const who = opts.who ?? admin;
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `logLifecycle.${action}`,
        context: {},
        input,
        idempotencyKey: opts.key ?? randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  async function read(endpoint: string, params: Record<string, unknown>, who: Person = admin): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: `logLifecycle.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  const catalog = async (table: string, workspace: string, code: string, extra: Record<string, unknown> = {}) => {
    const cols = { workspace_id: workspace, code, code_key: toCodeKey(code), name: code, created_by: admin.id, updated_by: admin.id, ...extra };
    const { rows } = await sql(
      `insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`,
      Object.values(cols),
    );
    return rows[0].id as string;
  };
  const newModel = (extra: Record<string, unknown> = {}) => catalog('equipment_model', WORKSPACE_ID, `${TAG}-m${n++}`, { vendor_id: vendorId, ...extra });
  const newSoftware = async (model: string, label = `sw${n++}`) =>
    (
      await sql(
        `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`,
        [WORKSPACE_ID, model, label, toCodeKey(`${TAG}${label}`), admin.id],
      )
    ).rows[0].id as string;
  const publishSpec = async (model: string, revisionNo = 1) => {
    const rev = (
      await sql(
        `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,$3,'draft','{"docLabel":"s","docVersion":"v1"}'::jsonb,1,$4) returning id`,
        [WORKSPACE_ID, model, revisionNo, admin.id],
      )
    ).rows[0].id as string;
    await sql(`update knowledge.model_spec_revision set state = 'published', content_sha256 = $2, published_by = $3, published_at = now() where id = $1`, [rev, H('c'), admin.id]);
    return rev;
  };

  /** Creates a project on a fresh model; returns ids and its version. */
  async function makeProject(over: Record<string, unknown> = {}, who: Person = admin) {
    const modelId = (over.modelId as string | undefined) ?? (await newModel());
    const a = await act('projectCreate', { modelId, kind: 'new', ownerActorId: owner.id, ...over }, { who });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return { id: a.data.projectId as string, modelId, version: a.data.version as string };
  }
  async function setStage(id: string, version: string, toStage: string, reason?: string) {
    const a = await act('projectSetStage', { id, toStage, ...(reason ? { reason } : {}) }, { expectedVersion: version });
    expect(a.outcome, JSON.stringify(a)).toBe('ok');
    return a.version as string;
  }
  /** Walks a fresh project to `beta` through the legal steps (the guard trigger refuses a jump). */
  async function toBeta(project: { id: string; version: string }) {
    let v = await setStage(project.id, project.version, 'kickoff');
    v = await setStage(project.id, v, 'alpha');
    return setStage(project.id, v, 'beta');
  }
  const openRound = (projectId: string, over: Record<string, unknown> = {}, who: Person = admin) =>
    act('roundOpen', { projectId, sampleSet: SAMPLE(), ...over }, { who });

  const projectRow = async (id: string) => (await sql('select *, target_date::text as target_date from log_lifecycle.development_project where id = $1', [id])).rows[0] as Row;
  const events = async (id: string) =>
    (await sql('select seq, kind, before, after, reason, actor_id from log_lifecycle.development_event where project_id = $1 order by seq', [id])).rows as {
      seq: number;
      kind: string;
      before: Row;
      after: Row;
      reason: string | null;
      actor_id: string;
    }[];
  const rounds = async (projectId: string) => (await sql('select * from log_lifecycle.validation_round where project_id = $1 order by seq', [projectId])).rows as Row[];
  const audit = async (id: string) =>
    (await sql('select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as {
      event_type: string;
      subject_type: string;
      actor_id: string;
      detail: Row;
    }[];

  // The suite sends more writes than one actor's rate window allows; a 429 would hide the real assertion.
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
    user = await person('user');
    developer = await person('developer');
    developerGranted = await person('developer');
    owner = await person('developer');
    for (const capability of ['lifecycle.project.manage', 'lifecycle.round.manage']) {
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1, $2, $3, null, $4)`,
        [WORKSPACE_ID, developerGranted.id, capability, admin.id],
      );
    }
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
    actorIds.push(foreignActor);
    vendorId = await catalog('vendor', WORKSPACE_ID, `${TAG}-v`);
    vendorOther = await catalog('vendor', otherWorkspace, `${TAG}-vo`);
    foreignModel = await catalog('equipment_model', otherWorkspace, `${TAG}-fm`, { vendor_id: vendorOther });
    foreignProject = (
      await sql(
        `insert into log_lifecycle.development_project (workspace_id, model_id, kind, owner_actor_id, created_by, updated_by) values ($1,$2,'new',$3,$3,$3) returning id`,
        [otherWorkspace, foreignModel, foreignActor],
      )
    ).rows[0].id as string;
    foreignRound = (
      await sql(
        `insert into log_lifecycle.validation_round (workspace_id, project_id, seq, stage, sample_set, sample_manifest_digest, created_by, updated_by) values ($1,$2,1,'registered',$3::jsonb,$4,$5,$5) returning id`,
        [otherWorkspace, foreignProject, JSON.stringify(SAMPLE(1)), H('d'), foreignActor],
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    // The event table refuses DELETE for every role: lift its trigger inside the cleanup transaction (the migrate role owns it).
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table log_lifecycle.development_event disable trigger development_event_append_only');
      await client.query('delete from log_lifecycle.development_event where actor_id = any($1)', [actorIds]);
      await client.query('alter table log_lifecycle.development_event enable trigger development_event_append_only');
      await client.query('delete from log_lifecycle.validation_round where created_by = any($1)', [actorIds]);
      await client.query('delete from log_lifecycle.development_project where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    for (const table of ['software_version', 'equipment_model', 'vendor']) {
      await sql(`delete from knowledge.${table} where workspace_id = any($1) and created_by = any($2)`, [[WORKSPACE_ID, otherWorkspace], actorIds]);
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
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('permissions', () => {
    it('a User and a plain Developer are refused; a Developer with the workspace grants and an Admin write; reads stay open', async () => {
      const make = (who: Person) => act('projectCreate', { modelId: randomUUID(), kind: 'new', ownerActorId: owner.id }, { who });
      expect((await make(user)).outcome).toBe('forbidden');
      expect((await make(developer)).outcome).toBe('forbidden');
      expect((await make(developerGranted)).outcome).toBe('invalid'); // past the right: the model is unknown
      expect((await make(admin)).outcome).toBe('invalid');
      const open = (who: Person) => act('roundOpen', { projectId: randomUUID(), sampleSet: SAMPLE() }, { who });
      expect((await open(user)).outcome).toBe('forbidden');
      expect((await open(developer)).outcome).toBe('forbidden');
      expect((await open(developerGranted)).outcome).toBe('invalid');
      expect((await read('models', {}, user)).outcome).toBe('ok');
    });

    it('a project right alone does not open the round actions, and the round right alone does not open the project actions', async () => {
      const onlyProject = await person('developer');
      const onlyRound = await person('developer');
      await sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,'lifecycle.project.manage',null,$3), ($1,$4,'lifecycle.round.manage',null,$3)`, [WORKSPACE_ID, onlyProject.id, admin.id, onlyRound.id]);
      const project = await makeProject();
      expect((await openRound(project.id, {}, onlyProject)).outcome).toBe('forbidden');
      expect((await openRound(project.id, {}, onlyRound)).outcome).toBe('ok');
      const second = await act('projectSetStage', { id: project.id, toStage: 'kickoff' }, { who: onlyRound, expectedVersion: project.version });
      expect(second.outcome).toBe('forbidden');
    });
  });

  describe('projectCreate', () => {
    it('creates a registered project with a created event and an audit row in one write', async () => {
      const softwareModel = await newModel();
      const software = await newSoftware(softwareModel);
      const project = await makeProject({ modelId: softwareModel, softwareId: software, targetDate: '2027-03-01' });
      const row = await projectRow(project.id);
      expect(row).toMatchObject({ stage: 'registered', kind: 'new', software_id: software, owner_actor_id: owner.id, target_date: '2027-03-01', row_version: 1, created_by: admin.id });
      const ev = await events(project.id);
      expect(ev.map((e) => [e.seq, e.kind])).toEqual([[1, 'created']]);
      expect(ev[0]?.before).toEqual({});
      expect(ev[0]?.after).toMatchObject({ stage: 'registered', modelId: softwareModel, ownerActorId: owner.id });
      const rows = await audit(project.id);
      expect(rows.map((r) => [r.event_type, r.subject_type, r.actor_id])).toEqual([['lifecycle.project.created', 'development_project', admin.id]]);
      expect(rows[0]?.detail).toEqual({ modelId: softwareModel, softwareId: software, kind: 'new', ownerActorId: owner.id });
    });

    it('replays the same idempotency key to the same project and refuses a changed body under that key', async () => {
      const modelId = await newModel();
      const key = randomUUID();
      const a = await act('projectCreate', { modelId, kind: 'new', ownerActorId: owner.id }, { key });
      const b = await act('projectCreate', { modelId, kind: 'new', ownerActorId: owner.id }, { key });
      expect(b.data.projectId).toBe(a.data.projectId);
      expect((await sql('select count(*)::int as n from log_lifecycle.development_project where model_id = $1', [modelId])).rows[0].n).toBe(1);
      const c = await act('projectCreate', { modelId, kind: 'redevelopment', ownerActorId: owner.id }, { key });
      expect(c.outcome).toBe('error');
      expect(fe(c)).toEqual(['idempotencyKey:idempotency_key_reuse']);
    });

    it.each([
      ['an unknown model', () => ({ modelId: randomUUID() }), 'modelId:not_found'],
      ['a model of another workspace', () => ({ modelId: foreignModel }), 'modelId:not_found'],
      ['an owner of another workspace', () => ({ ownerActorId: foreignActor }), 'ownerActorId:not_found'],
      ['an unknown owner', () => ({ ownerActorId: randomUUID() }), 'ownerActorId:not_found'],
      ['a bad kind', () => ({ kind: 'old' }), 'kind:malformed'],
      ['a bad target date', () => ({ targetDate: '2027-02-30' }), 'targetDate:malformed'],
    ])('refuses %s', async (_name, over, expected) => {
      const modelId = await newModel();
      const a = await act('projectCreate', { modelId, kind: 'new', ownerActorId: owner.id, ...over() });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual([expected]);
    });

    it('refuses an inactive model and a software version of another model', async () => {
      const inactive = await newModel({ active: false });
      expect(fe(await act('projectCreate', { modelId: inactive, kind: 'new', ownerActorId: owner.id }))).toEqual(['modelId:inactive']);
      const modelA = await newModel();
      const modelB = await newModel();
      const swB = await newSoftware(modelB);
      expect(fe(await act('projectCreate', { modelId: modelA, softwareId: swB, kind: 'new', ownerActorId: owner.id }))).toEqual(['softwareId:not_found']);
      expect((await sql('select 1 from log_lifecycle.development_project where model_id = $1', [modelA])).rowCount).toBe(0);
    });

    it('allows one open project per model: a second create is refused while the first is open, allowed after a cancel', async () => {
      const first = await makeProject();
      const again = await act('projectCreate', { modelId: first.modelId, kind: 'redevelopment', ownerActorId: owner.id });
      expect(again.outcome).toBe('invalid');
      expect(fe(again)).toEqual(['modelId:open_project_exists']);
      await setStage(first.id, first.version, 'cancelled', 'dropped');
      const next = await act('projectCreate', { modelId: first.modelId, kind: 'redevelopment', ownerActorId: owner.id });
      expect(next.outcome).toBe('ok');
    });

    it('two parallel creates for one model: exactly one wins', async () => {
      const modelId = await newModel();
      const answers = await Promise.all([1, 2].map(() => act('projectCreate', { modelId, kind: 'new', ownerActorId: owner.id })));
      expect(answers.map((a) => a.outcome).sort()).toEqual(['invalid', 'ok']);
      expect((await sql('select count(*)::int as n from log_lifecycle.development_project where model_id = $1', [modelId])).rows[0].n).toBe(1);
    });
  });

  describe('stages, cancel and reopen', () => {
    it('walks registered → kickoff → alpha → beta, cancels, reopens to the stage before the cancel; events are 1..n and audited', async () => {
      const project = await makeProject();
      let v = await setStage(project.id, project.version, 'kickoff');
      v = await setStage(project.id, v, 'alpha');
      v = await setStage(project.id, v, 'cancelled', 'budget');
      const reopened = await act('projectReopen', { id: project.id, reason: 'funded again' }, { expectedVersion: v });
      expect(reopened.outcome, JSON.stringify(reopened)).toBe('ok');
      expect((await projectRow(project.id)).stage).toBe('alpha');
      v = await setStage(project.id, reopened.version as string, 'beta');
      const ev = await events(project.id);
      expect(ev.map((e) => [e.seq, e.kind])).toEqual([[1, 'created'], [2, 'stage_changed'], [3, 'stage_changed'], [4, 'cancelled'], [5, 'reopened'], [6, 'stage_changed']]);
      expect(ev[3]).toMatchObject({ before: { stage: 'alpha' }, after: { stage: 'cancelled' }, reason: 'budget' });
      expect(ev[4]).toMatchObject({ before: { stage: 'cancelled' }, after: { stage: 'alpha' }, reason: 'funded again' });
      expect(ev[1]?.reason).toBeNull();
      expect((await projectRow(project.id)).row_version).toBe(6);
      const types = (await audit(project.id)).map((r) => r.event_type);
      expect(types).toEqual(['lifecycle.project.created', 'lifecycle.project.stage_changed', 'lifecycle.project.stage_changed', 'lifecycle.project.cancelled', 'lifecycle.project.reopened', 'lifecycle.project.stage_changed']);
    });

    it.each([
      ['a skipped step', 'alpha', 'toStage:illegal_transition'],
      ['the same stage', 'registered', 'toStage:illegal_transition'],
      ['completed (the Gate\'s)', 'completed', 'toStage:gate_required'],
      ['an unknown stage', 'shipped', 'toStage:malformed'],
    ])('projectSetStage refuses %s', async (_name, toStage, expected) => {
      const project = await makeProject();
      const a = await act('projectSetStage', { id: project.id, toStage }, { expectedVersion: project.version });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual([expected]);
      expect((await projectRow(project.id)).stage).toBe('registered');
      expect(await events(project.id)).toHaveLength(1);
    });

    it('refuses a backward move, completed from beta, and a cancel without a reason', async () => {
      const project = await makeProject();
      let v = await setStage(project.id, project.version, 'kickoff');
      expect(fe(await act('projectSetStage', { id: project.id, toStage: 'registered' }, { expectedVersion: v }))).toEqual(['toStage:illegal_transition']);
      v = await setStage(project.id, await setStage(project.id, v, 'alpha'), 'beta');
      expect(fe(await act('projectSetStage', { id: project.id, toStage: 'completed' }, { expectedVersion: v }))).toEqual(['toStage:gate_required']);
      const noReason = await act('projectSetStage', { id: project.id, toStage: 'cancelled' }, { expectedVersion: v });
      expect(fe(noReason)).toEqual(['reason:required']);
      expect((await projectRow(project.id)).stage).toBe('beta');
    });

    it('reopens only cancelled and completed; other stages are illegal, a reason is required', async () => {
      const project = await makeProject();
      const open = await act('projectReopen', { id: project.id, reason: 'x' }, { expectedVersion: project.version });
      expect(fe(open)).toEqual(['id:illegal_transition']);
      const noReason = await act('projectReopen', { id: project.id }, { expectedVersion: project.version });
      expect(fe(noReason)).toEqual(['reason:required']);
    });

    it('reopens a completed project to beta (completed is set directly as the Gate will, node e)', async () => {
      const project = await makeProject();
      await toBeta(project);
      await sql(`update log_lifecycle.development_project set stage = 'completed', row_version = row_version + 1 where id = $1`, [project.id]);
      const row = await projectRow(project.id);
      const a = await act('projectReopen', { id: project.id, reason: 'regression' }, { expectedVersion: String(row.row_version) });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect((await projectRow(project.id)).stage).toBe('beta');
    });

    it('refuses reopening a cancelled project when another open project of the model exists', async () => {
      const first = await makeProject();
      const v = await setStage(first.id, first.version, 'cancelled', 'stop');
      const second = await act('projectCreate', { modelId: first.modelId, kind: 'redevelopment', ownerActorId: owner.id });
      expect(second.outcome).toBe('ok');
      const reopen = await act('projectReopen', { id: first.id, reason: 'back' }, { expectedVersion: v });
      expect(reopen.outcome).toBe('invalid');
      expect(fe(reopen)).toEqual(['id:open_project_exists']);
      expect((await projectRow(first.id)).stage).toBe('cancelled');
      expect((await events(first.id)).map((e) => e.kind)).toEqual(['created', 'cancelled']);
    });

    it('a stale expectedVersion is a conflict with the current version; an unknown or foreign id is not_found', async () => {
      const project = await makeProject();
      await setStage(project.id, project.version, 'kickoff');
      const stale = await act('projectSetStage', { id: project.id, toStage: 'alpha' }, { expectedVersion: project.version });
      expect(stale.outcome).toBe('conflict');
      expect(stale.version).toBe('2');
      expect((await projectRow(project.id)).stage).toBe('kickoff');
      expect((await act('projectSetStage', { id: randomUUID(), toStage: 'kickoff' }, { expectedVersion: '1' })).outcome).toBe('not_found');
      expect((await act('projectSetStage', { id: foreignProject, toStage: 'kickoff' }, { expectedVersion: '1' })).outcome).toBe('not_found');
      expect((await act('projectReopen', { id: foreignProject, reason: 'x' }, { expectedVersion: '1' })).outcome).toBe('not_found');
    });
  });

  describe('projectUpdate', () => {
    it('is refused on a cancelled project', async () => {
      const project = await makeProject();
      const v = await setStage(project.id, project.version, 'cancelled', 'stop');
      expect(fe(await act('projectUpdate', { id: project.id, targetDate: '2027-01-01' }, { expectedVersion: v }))).toEqual(['id:project_not_open']);
    });
    it('writes owner_changed and target_changed events with only the changed fields, and nothing for a no-op', async () => {
      const model = await newModel();
      const sw = await newSoftware(model);
      const project = await makeProject({ modelId: model });
      const newOwner = await person('developer');
      const a = await act('projectUpdate', { id: project.id, ownerActorId: newOwner.id, targetDate: '2027-05-05', softwareId: sw }, { expectedVersion: project.version });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const ev = await events(project.id);
      expect(ev.map((e) => [e.seq, e.kind])).toEqual([[1, 'created'], [2, 'owner_changed'], [3, 'target_changed']]);
      expect(ev[1]).toMatchObject({ before: { ownerActorId: owner.id }, after: { ownerActorId: newOwner.id } });
      expect(ev[2]).toMatchObject({ before: { targetDate: null, softwareId: null }, after: { targetDate: '2027-05-05', softwareId: sw } });
      expect(await audit(project.id).then((r) => r.at(-1))).toMatchObject({ event_type: 'lifecycle.project.updated', detail: { changed: ['ownerActorId', 'targetDate', 'softwareId'] } });
      const noop = await act('projectUpdate', { id: project.id, ownerActorId: newOwner.id, targetDate: '2027-05-05' }, { expectedVersion: a.version as string });
      expect(noop.outcome).toBe('ok');
      expect(noop.version).toBe(a.version);
      expect(await events(project.id)).toHaveLength(3);
      const cleared = await act('projectUpdate', { id: project.id, targetDate: null, softwareId: null }, { expectedVersion: a.version as string });
      expect(cleared.outcome).toBe('ok');
      expect(await projectRow(project.id)).toMatchObject({ target_date: null, software_id: null });
    });

    it('refuses a foreign owner and a software version of another model', async () => {
      const project = await makeProject();
      const otherModel = await newModel();
      const sw = await newSoftware(otherModel);
      expect(fe(await act('projectUpdate', { id: project.id, ownerActorId: foreignActor }, { expectedVersion: project.version }))).toEqual(['ownerActorId:not_found']);
      expect(fe(await act('projectUpdate', { id: project.id, softwareId: sw }, { expectedVersion: project.version }))).toEqual(['softwareId:not_found']);
      expect(await events(project.id)).toHaveLength(1);
    });

    it('event seq stays 1..n under two parallel updates holding the same version (one wins, one conflicts)', async () => {
      const project = await makeProject();
      const answers = await Promise.all([
        act('projectUpdate', { id: project.id, targetDate: '2027-01-01' }, { expectedVersion: project.version }),
        act('projectUpdate', { id: project.id, targetDate: '2027-02-02' }, { expectedVersion: project.version }),
      ]);
      expect(answers.map((a) => a.outcome).sort()).toEqual(['conflict', 'ok']);
      expect((await events(project.id)).map((e) => e.seq)).toEqual([1, 2]);
    });
  });

  describe('rounds', () => {
    it('opens round 1 on the project stage with the digest and no pin when the model has no published revision; audited', async () => {
      const project = await makeProject();
      const v = await setStage(project.id, project.version, 'kickoff');
      expect(v).toBe('2');
      const a = await openRound(project.id, { note: 'first pass' });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const [row] = await rounds(project.id);
      expect(row).toMatchObject({ seq: 1, stage: 'kickoff', status: 'open', spec_pin: null, note: 'first pass', row_version: 1, created_by: admin.id });
      expect(row?.sample_manifest_digest).toBe(sampleManifestDigest(SAMPLE() as never));
      expect(row?.sample_set).toEqual(SAMPLE());
      expect((await audit(a.data.roundId as string)).map((r) => [r.event_type, r.subject_type])).toEqual([['lifecycle.round.opened', 'validation_round']]);
      expect(await events(project.id)).toHaveLength(2); // rounds write no development_event
    });

    it('pins the published revision and the digest of the applicable changes; a client specPin is not an input', async () => {
      const model = await newModel();
      const rev = await publishSpec(model);
      const sw = await newSoftware(model);
      const withSw = await makeProject({ modelId: model, softwareId: sw });
      const a = await openRound(withSw.id);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const [row] = await rounds(withSw.id);
      expect(row?.spec_pin).toMatchObject({ revisionId: rev });
      const empty = (row?.spec_pin as { changeSetDigest: string }).changeSetDigest;
      expect(empty).toMatch(/^[0-9a-f]{64}$/);
      // The strict input: the key is not on the allow-list.
      const sneaky = await act('roundOpen', { projectId: withSw.id, sampleSet: SAMPLE(), specPin: { revisionId: rev, changeSetDigest: H('f') } });
      expect(sneaky.outcome).toBe('invalid');
      // An applicable change moves the digest for a new round.
      await sql(`insert into knowledge.spec_sw_change (workspace_id, model_id, software_id, target_kind, target_key, change_kind, change_json, note, based_on_rev_no, created_by) values ($1,$2,$3,'event','X/Y','behavior','{}','n',1,$4)`, [WORKSPACE_ID, model, sw, admin.id]);
      await act('roundClose', { id: a.data.roundId }, { expectedVersion: a.data.version });
      const b = await openRound(withSw.id);
      expect(b.outcome).toBe('ok');
      const second = (await rounds(withSw.id))[1];
      expect((second?.spec_pin as { revisionId: string; changeSetDigest: string }).revisionId).toBe(rev);
      expect((second?.spec_pin as { changeSetDigest: string }).changeSetDigest).not.toBe(empty);
      await sql('delete from knowledge.spec_sw_change where model_id = $1', [model]);
    });

    it('allows at most one open round; a closed round frees the slot; seq is 1..n without gaps', async () => {
      const project = await makeProject();
      const first = await openRound(project.id);
      const second = await openRound(project.id);
      expect(second.outcome).toBe('invalid');
      expect(fe(second)).toEqual(['projectId:open_round_exists']);
      const closed = await act('roundClose', { id: first.data.roundId }, { expectedVersion: first.data.version });
      expect(closed.outcome).toBe('ok');
      expect((await openRound(project.id)).outcome).toBe('ok');
      expect((await rounds(project.id)).map((r) => [r.seq, r.status])).toEqual([[1, 'closed'], [2, 'open']]);
    });

    it('two parallel opens: one round, seq 1; after a close two parallel opens give exactly seq 2 and no gap', async () => {
      const project = await makeProject();
      const first = await Promise.all([openRound(project.id), openRound(project.id)]);
      expect(first.map((a) => a.outcome).sort()).toEqual(['invalid', 'ok']);
      const win = first.find((a) => a.outcome === 'ok');
      expect(await act('roundClose', { id: win?.data.roundId }, { expectedVersion: win?.data.version }).then((a) => a.outcome)).toBe('ok');
      const again = await Promise.all([openRound(project.id), openRound(project.id)]);
      expect(again.map((a) => a.outcome).sort()).toEqual(['invalid', 'ok']);
      expect((await rounds(project.id)).map((r) => r.seq)).toEqual([1, 2]);
    });

    it.each([
      ['a cancelled project', 'cancelled'],
      ['a completed project', 'completed'],
    ])('refuses to open on %s', async (_name, stage) => {
      const project = await makeProject();
      if (stage === 'cancelled') await setStage(project.id, project.version, 'cancelled', 'stop');
      else {
        await toBeta(project);
        await sql(`update log_lifecycle.development_project set stage = 'completed', row_version = row_version + 1 where id = $1`, [project.id]);
      }
      const a = await openRound(project.id);
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['projectId:project_not_open']);
      expect(await rounds(project.id)).toHaveLength(0);
    });

    it('an unknown or foreign project is not_found at the field; a bad sample set names its path', async () => {
      expect(fe(await openRound(randomUUID()))).toEqual(['projectId:not_found']);
      expect(fe(await openRound(foreignProject))).toEqual(['projectId:not_found']);
      const project = await makeProject();
      const dup = SAMPLE(2);
      dup.files[1] = { ...dup.files[1], fileRef: dup.files[0]?.fileRef ?? '' } as (typeof dup.files)[number];
      expect(fe(await openRound(project.id, { sampleSet: dup }))).toEqual(['sampleSet.files.1.fileRef:duplicate']);
      expect(fe(await openRound(project.id, { sampleSet: { ...SAMPLE(), extra: 1 } }))).toEqual(['sampleSet.extra:malformed']);
      expect(await rounds(project.id)).toHaveLength(0);
    });

    it('roundClose is versioned and final: a stale version conflicts, a closed round cannot be closed again', async () => {
      const project = await makeProject();
      const a = await openRound(project.id);
      const stale = await act('roundClose', { id: a.data.roundId }, { expectedVersion: '9' });
      expect(stale.outcome).toBe('conflict');
      expect(stale.version).toBe('1');
      const closed = await act('roundClose', { id: a.data.roundId }, { expectedVersion: '1' });
      expect(closed.outcome).toBe('ok');
      expect(await rounds(project.id).then(([r]) => r)).toMatchObject({ status: 'closed', closed_by: admin.id, row_version: 2 });
      const twice = await act('roundClose', { id: a.data.roundId }, { expectedVersion: '2' });
      expect(fe(twice)).toEqual(['id:illegal_transition']);
      expect((await audit(a.data.roundId as string)).map((r) => r.event_type)).toEqual(['lifecycle.round.opened', 'lifecycle.round.closed']);
      expect((await act('roundClose', { id: foreignRound }, { expectedVersion: '1' })).outcome).toBe('not_found');
    });
  });

  describe('walls (platform_app grants, guard triggers)', () => {
    it('platform_app cannot UPDATE or DELETE a development_event (no grant)', async () => {
      const project = await makeProject();
      await expect(appSql(`update log_lifecycle.development_event set reason = 'x' where project_id = $1`, [project.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('delete from log_lifecycle.development_event where project_id = $1', [project.id])).rejects.toMatchObject({ code: '42501' });
    });

    it('the append-only trigger stops the migrate role from updating or deleting an event', async () => {
      const project = await makeProject();
      await expect(sql(`update log_lifecycle.development_event set reason = 'x' where project_id = $1`, [project.id])).rejects.toMatchObject({ code: '23514' });
      await expect(sql('delete from log_lifecycle.development_event where project_id = $1', [project.id])).rejects.toMatchObject({ code: '23514' });
      expect(await events(project.id)).toHaveLength(1);
    });

    it.each([
      ['sample_set', `sample_set = '{}'::jsonb`],
      ['spec_pin', `spec_pin = '{}'::jsonb`],
      ['sample_manifest_digest', `sample_manifest_digest = '${'e'.repeat(64)}'`],
      ['seq', 'seq = seq + 1'],
      ['project_id', `project_id = '${randomUUID()}'`],
    ])('platform_app cannot UPDATE round %s (no grant); the trigger stops the migrate role', async (_col, set) => {
      const project = await makeProject();
      const a = await openRound(project.id);
      await expect(appSql(`update log_lifecycle.validation_round set ${set}, row_version = row_version + 1 where id = $1`, [a.data.roundId])).rejects.toMatchObject({ code: '42501' });
      await expect(sql(`update log_lifecycle.validation_round set ${set}, row_version = row_version + 1 where id = $1`, [a.data.roundId])).rejects.toMatchObject({ code: '23514' });
    });

    it('the round guard refuses a missing row_version bump and any edit of a closed round', async () => {
      const project = await makeProject();
      const a = await openRound(project.id);
      await expect(appSql(`update log_lifecycle.validation_round set status = 'closed', closed_at = now(), closed_by = $2 where id = $1`, [a.data.roundId, admin.id])).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('row_version') });
      await act('roundClose', { id: a.data.roundId }, { expectedVersion: '1' });
      await expect(appSql(`update log_lifecycle.validation_round set updated_by = $2, row_version = row_version + 1 where id = $1`, [a.data.roundId, admin.id])).rejects.toMatchObject({ code: '23514' });
      await expect(sql(`update log_lifecycle.validation_round set status = 'open', closed_at = null, closed_by = null, row_version = row_version + 1 where id = $1`, [a.data.roundId])).rejects.toMatchObject({ code: '23514' });
    });

    it('platform_app cannot DELETE a project or round and cannot UPDATE project identity columns', async () => {
      const project = await makeProject();
      await expect(appSql('delete from log_lifecycle.development_project where id = $1', [project.id])).rejects.toMatchObject({ code: '42501' });
      await expect(appSql('delete from log_lifecycle.validation_round where project_id = $1', [project.id])).rejects.toMatchObject({ code: '42501' });
      for (const set of ['model_id = gen_random_uuid()', `kind = 'redevelopment'`, 'workspace_id = gen_random_uuid()', 'created_by = updated_by']) {
        await expect(appSql(`update log_lifecycle.development_project set ${set}, row_version = row_version + 1 where id = $1`, [project.id])).rejects.toMatchObject({ code: '42501' });
      }
    });

    it('the project guard: a missing row_version bump, a jump, and an illegal stage pair are refused as platform_app', async () => {
      const project = await makeProject();
      await expect(appSql(`update log_lifecycle.development_project set target_date = '2027-01-01' where id = $1`, [project.id])).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('row_version') });
      await expect(appSql(`update log_lifecycle.development_project set target_date = '2027-01-01', row_version = row_version + 2 where id = $1`, [project.id])).rejects.toMatchObject({ code: '23514' });
      await expect(appSql(`update log_lifecycle.development_project set stage = 'beta', row_version = row_version + 1 where id = $1`, [project.id])).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('cannot move') });
      await expect(appSql(`update log_lifecycle.development_project set target_date = '2027-01-01', row_version = row_version + 1 where id = $1`, [project.id])).resolves.toMatchObject({ rowCount: 1 });
    });

    it('the project guard also stops the migrate role from changing identity columns', async () => {
      const project = await makeProject();
      await expect(sql(`update log_lifecycle.development_project set kind = 'redevelopment', row_version = row_version + 1 where id = $1`, [project.id])).rejects.toMatchObject({ code: '23514' });
    });
  });

  describe('reads', () => {
    it('models lists models without a project (project: null) and the open project with its latest round', async () => {
      const bare = await newModel();
      const project = await makeProject();
      const round = await openRound(project.id);
      const page = await read('models', { filters: [{ id: 'id', op: 'in', value: [bare, project.modelId] }] });
      expect(page.outcome).toBe('ok');
      expect(page.data.total).toBe(2);
      const byId = Object.fromEntries((page.data.rows as { id: string; project: unknown }[]).map((r) => [r.id, r.project]));
      expect(byId[bare]).toBeNull();
      expect(byId[project.modelId]).toEqual({
        projectId: project.id,
        stage: 'registered',
        kind: 'new',
        ownerActorId: owner.id,
        latestRound: { id: round.data.roundId, seq: 1, status: 'open' },
      });
    });

    it('models filters by stage (in / notIn / isEmpty / isNotEmpty), vendor, process and active', async () => {
      const vendor2 = await catalog('vendor', WORKSPACE_ID, `${TAG}-v2`);
      const processId = await catalog('process_category', WORKSPACE_ID, `${TAG}-p${n++}`);
      const none = await newModel({ vendor_id: vendor2 });
      const reg = await makeProject({ modelId: await newModel({ vendor_id: vendor2 }) });
      const kick = await makeProject({ modelId: await newModel({ vendor_id: vendor2 }) });
      await setStage(kick.id, kick.version, 'kickoff');
      const inactive = await newModel({ vendor_id: vendor2, active: false });
      await sql('insert into knowledge.model_process (workspace_id, model_id, process_id, assigned_by) values ($1,$2,$3,$4)', [WORKSPACE_ID, kick.modelId, processId, admin.id]);
      const ids = async (filters: unknown[]) =>
        ((await read('models', { filters: [{ id: 'vendorId', op: 'in', value: [vendor2] }, ...filters], pageSize: 100 })).data.rows as { id: string }[]).map((r) => r.id).sort();
      expect(await ids([])).toEqual([none, reg.modelId, kick.modelId, inactive].sort());
      expect(await ids([{ id: 'stage', op: 'in', value: ['kickoff'] }])).toEqual([kick.modelId]);
      expect(await ids([{ id: 'stage', op: 'in', value: ['registered', 'kickoff'] }])).toEqual([reg.modelId, kick.modelId].sort());
      expect(await ids([{ id: 'stage', op: 'notIn', value: ['kickoff'] }])).toEqual([none, reg.modelId, inactive].sort());
      expect(await ids([{ id: 'stage', op: 'isEmpty' }])).toEqual([none, inactive].sort());
      expect(await ids([{ id: 'stage', op: 'isNotEmpty' }])).toEqual([reg.modelId, kick.modelId].sort());
      expect(await ids([{ id: 'processes', op: 'in', value: [processId] }])).toEqual([kick.modelId]);
      expect(await ids([{ id: 'active', op: 'in', value: ['false'] }])).toEqual([inactive]);
      const sorted = await read('models', { filters: [{ id: 'vendorId', op: 'in', value: [vendor2] }], sorting: [{ id: 'stage', desc: false }] });
      expect(sorted.outcome).toBe('ok');
      await sql('delete from knowledge.model_process where process_id = $1', [processId]);
      await sql('delete from knowledge.process_category where id = $1', [processId]);
    });

    it('models refuses unknown params, unknown filter fields, a completed stage value and does not show another workspace\'s models', async () => {
      expect((await read('models', { nope: 1 })).outcome).toBe('error');
      expect((await read('models', { filters: [{ id: 'validation', op: 'in', value: ['x'] }] })).outcome).toBe('error');
      expect((await read('models', { filters: [{ id: 'stage', op: 'in', value: ['completed'] }] })).outcome).toBe('error');
      expect((await read('models', { sorting: [{ id: 'nope', desc: false }] })).outcome).toBe('error');
      const page = await read('models', { filters: [{ id: 'id', op: 'in', value: [foreignModel] }] });
      expect(page.data.total).toBe(0);
    });

    it('projectDetail, projectEvents, rounds and roundDetail answer the project, newest-first history, rounds and the ordered sample list', async () => {
      const project = await makeProject();
      await setStage(project.id, project.version, 'kickoff');
      const set = { files: [{ fileRef: 'b', order: 2, sha256: H('b') }, { fileRef: 'a', order: 1, sha256: H('a') }], sourceOwner: 'o' };
      const round = await openRound(project.id, { sampleSet: set });
      const detail = await read('projectDetail', { projectId: project.id });
      expect(detail.data).toMatchObject({ id: project.id, stage: 'kickoff', kind: 'new', owner: { id: owner.id }, nextStages: ['alpha', 'cancelled'], reopenTo: null, openRound: { id: round.data.roundId, seq: 1 }, version: '2' });
      const ev = await read('projectEvents', { projectId: project.id });
      expect(ev.data.total).toBe(2);
      expect((ev.data.rows as { seq: number }[]).map((e) => e.seq)).toEqual([2, 1]);
      const paged = await read('projectEvents', { projectId: project.id, page: 1, pageSize: 1 });
      expect((paged.data.rows as { seq: number }[]).map((e) => e.seq)).toEqual([1]);
      const list = await read('rounds', { projectId: project.id });
      expect(list.data.rows).toHaveLength(1);
      expect(list.data.rows[0]).toMatchObject({ id: round.data.roundId, seq: 1, stage: 'kickoff', status: 'open', sampleCount: 2, specPin: null });
      const rd = await read('roundDetail', { roundId: round.data.roundId });
      expect(rd.data.sampleSet.files.map((f: { order: number }) => f.order)).toEqual([1, 2]);
      expect(rd.data).toMatchObject({ sampleSet: { sourceOwner: 'o' }, specPin: null, sampleManifestDigest: sampleManifestDigest(set as never) });
      expect(Object.keys(rd.data)).not.toEqual(expect.arrayContaining(['requests', 'attempts', 'gate']));
    });

    it('a cancelled project shows its reopen target in the detail', async () => {
      const project = await makeProject();
      const v = await setStage(project.id, project.version, 'kickoff');
      await setStage(project.id, v, 'cancelled', 'stop');
      const detail = await read('projectDetail', { projectId: project.id });
      expect(detail.data).toMatchObject({ stage: 'cancelled', reopenTo: 'kickoff', nextStages: [] });
    });

    it('foreign and unknown ids read as null / empty; bad params are errors', async () => {
      expect((await read('projectDetail', { projectId: foreignProject })).data).toBeNull();
      expect((await read('roundDetail', { roundId: foreignRound })).data).toBeNull();
      expect((await read('projectEvents', { projectId: foreignProject })).data).toEqual({ rows: [], total: 0 });
      expect((await read('rounds', { projectId: foreignProject })).data).toEqual({ rows: [] });
      expect((await read('projectDetail', { projectId: 'nope' })).outcome).toBe('error');
      expect((await read('projectDetail', { projectId: randomUUID(), extra: 1 })).outcome).toBe('error');
      expect((await read('rounds', {})).outcome).toBe('error');
      expect((await read('projectEvents', { projectId: randomUUID(), pageSize: 0 })).outcome).toBe('error');
    });
  });

  describe('audit projection', () => {
    it('lists the lifecycle events with their platform actions and subject types, and still lists a lifecycle capability grant', async () => {
      const project = await makeProject();
      const round = await openRound(project.id);
      const probe = randomUUID();
      await sql(
        `insert into core.audit_log (workspace_id, actor_id, event_type, subject_type, subject_id, summary, detail) values ($1,$2,'permission_granted','permission_grant',$3,'probe',$4::jsonb)`,
        [WORKSPACE_ID, admin.id, probe, JSON.stringify({ capability: 'lifecycle.round.manage' })],
      );
      const actions = { 'lifecycle.project.created': 'create', 'lifecycle.round.opened': 'create', permission_granted: 'create' };
      const { rows } = await dbHandle.pool.query(
        `select event_type, subject_type, subject_id from core.platform_audit_events($1, null, null, null, null, null, null, null, $2::jsonb, 'at', true, 200, 0) where subject_id = any($3)`,
        [WORKSPACE_ID, JSON.stringify(actions), [project.id, round.data.roundId, probe]],
      );
      expect(rows.map((r) => [r.subject_type, r.event_type]).sort()).toEqual(
        [['development_project', 'lifecycle.project.created'], ['permission_grant', 'permission_granted'], ['validation_round', 'lifecycle.round.opened']].sort(),
      );
    });
  });
});
