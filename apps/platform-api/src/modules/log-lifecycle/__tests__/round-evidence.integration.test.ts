// #1451 c2 — manual validation attachment of a validation round: attachments linked to a round (parent kind `validation_round`),
// attached under `lifecycle.round.manage` and read under the round's own visibility (`platform:view`, same workspace),
// through the real `buildServer` over `menu-action` / `menu-query` / `GET /attachments/:id/download` against a real
// Postgres (throwaway DB only; app as platform_app, fixtures as platform_migrate). Needs migrations 0100 and 0101.
// Uploads are seeded rows plus bytes in a mock storage: the upload command has its own suites.

import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import type { StorageBackend } from '../../../lib/storage/index.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../../log-knowledge/index.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LLE${randomUUID().slice(0, 6).toUpperCase()}`;
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
  fieldErrors: { path: string[]; code: string }[];
}

describe.skipIf(!runIntegration)('log lifecycle manual validation attachment (#1451 c2)', () => {
  const objects = new Map<string, Buffer>();
  const storage: StorageBackend = {
    async put(input) {
      objects.set(input.key, Buffer.isBuffer(input.bytes) ? input.bytes : Buffer.from([]));
      return { key: input.key };
    },
    async get(key) {
      const bytes = objects.get(key);
      if (!bytes) throw Object.assign(new Error('no such key'), { name: 'NoSuchKey' });
      return { stream: Readable.from(bytes), mimeType: 'text/plain', size: bytes.byteLength };
    },
    async delete(key) {
      objects.delete(key);
    },
    async exists(key) {
      return objects.has(key);
    },
  };

  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let user: Person;
  let developer: Person;
  let grantee: Person;
  let otherWorkspace = '';
  let foreignActor = '';
  let foreignRound = '';
  let vendorId = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const attachmentIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
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
  async function act(action: string, input: Record<string, unknown>, who: Person, expectedVersion?: string): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({
        action: `logLifecycle.${action}`,
        context: {},
        input,
        idempotencyKey: randomUUID(),
        ...(expectedVersion === undefined ? {} : { expectedVersion }),
      }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function readEvidence(roundId: string, who: Person): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie) },
      payload: JSON.stringify({ endpoint: 'logLifecycle.roundEvidence', context: {}, params: { roundId } }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const download = (id: string, who: Person) =>
    app.inject({ method: 'GET', url: `/attachments/${id}/download`, headers: cookieHeader(who.cookie) });

  /** An uploaded, still unlinked attachment (what `POST /attachments` leaves) with bytes in storage. */
  async function upload(by: Person, workspace = WORKSPACE_ID): Promise<string> {
    const id = randomUUID();
    const key = `${workspace}/${id}/evidence.txt`;
    objects.set(key, Buffer.from('manual evidence'));
    await sql(
      `insert into voc.voc_attachments (id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id) values ($1,'evidence.txt',15,'text/plain',$2,$3)`,
      [id, key, by.id],
    );
    attachmentIds.push(id);
    return id;
  }
  const attachmentRow = async (id: string) =>
    (await sql('select voc_id, comment_id, parent_kind, parent_id, linked_at from voc.voc_attachments where id = $1', [id])).rows[0] as Record<string, unknown>;

  async function makeRound(): Promise<{ roundId: string; version: string; projectId: string; seq: number }> {
    const code = `${TAG}-m${n++}`;
    const modelId = (
      await sql(
        `insert into knowledge.equipment_model (workspace_id, code, code_key, name, created_by, updated_by, vendor_id) values ($1,$2,$3,$2,$4,$4,$5) returning id`,
        [WORKSPACE_ID, code, toCodeKey(code), admin.id, vendorId],
      )
    ).rows[0].id as string;
    const project = await act('projectCreate', { modelId, kind: 'new', ownerActorId: developer.id }, admin);
    expect(project.outcome, JSON.stringify(project)).toBe('ok');
    const sampleSet = { files: [{ fileRef: `s3://${TAG}/f.log`, order: 1, sha256: H('a') }], sourceOwner: 'fab-team' };
    const round = await act('roundOpen', { projectId: project.data.projectId, sampleSet }, admin);
    expect(round.outcome, JSON.stringify(round)).toBe('ok');
    return { roundId: round.data.roundId, version: round.data.version, projectId: project.data.projectId, seq: round.data.seq };
  }

  beforeEach(async () => {
    await sql('delete from core.rate_limits');
  });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle, storage });
    await app.ready();
    admin = await person('admin');
    user = await person('user');
    developer = await person('developer');
    grantee = await person('developer');
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,'lifecycle.round.manage',null,$3)`,
      [WORKSPACE_ID, grantee.id, admin.id],
    );
    vendorId = (
      await sql(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [
        WORKSPACE_ID,
        `${TAG}-v`,
        toCodeKey(`${TAG}-v`),
        admin.id,
      ])
    ).rows[0].id as string;
    otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
    actorIds.push(foreignActor);
    const foreignVendor = (
      await sql(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [
        otherWorkspace,
        `${TAG}-fv`,
        toCodeKey(`${TAG}-fv`),
        foreignActor,
      ])
    ).rows[0].id as string;
    const foreignModel = (
      await sql(
        `insert into knowledge.equipment_model (workspace_id, code, code_key, name, created_by, updated_by, vendor_id) values ($1,$2,$3,$2,$4,$4,$5) returning id`,
        [otherWorkspace, `${TAG}-fm`, toCodeKey(`${TAG}-fm`), foreignActor, foreignVendor],
      )
    ).rows[0].id as string;
    const foreignProject = (
      await sql(
        `insert into log_lifecycle.development_project (workspace_id, model_id, kind, owner_actor_id, created_by, updated_by) values ($1,$2,'new',$3,$3,$3) returning id`,
        [otherWorkspace, foreignModel, foreignActor],
      )
    ).rows[0].id as string;
    foreignRound = (
      await sql(
        `insert into log_lifecycle.validation_round (workspace_id, project_id, seq, stage, sample_set, sample_manifest_digest, created_by, updated_by) values ($1,$2,1,'registered',$3::jsonb,$4,$5,$5) returning id`,
        [otherWorkspace, foreignProject, JSON.stringify({ files: [{ fileRef: 'x', order: 1, sha256: H('d') }], sourceOwner: 'o' }), H('d'), foreignActor],
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    await sql('delete from voc.voc_attachments where id = any($1)', [attachmentIds]);
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
    for (const table of ['equipment_model', 'vendor']) {
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

  it('attaches uploaded files to an open round under lifecycle.round.manage; linked as parent kind validation_round and audited body-free', async () => {
    const round = await makeRound();
    const [a, b] = [await upload(grantee), await upload(grantee)];
    const res = await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [a, b] }, grantee);
    expect(res.outcome, JSON.stringify(res)).toBe('ok');
    for (const id of [a, b]) {
      expect(await attachmentRow(id)).toMatchObject({ voc_id: null, comment_id: null, parent_kind: 'validation_round', parent_id: round.roundId });
    }
    const { rows } = await sql(`select event_type, subject_type, actor_id, detail from core.audit_log where subject_id = $1 and event_type = 'lifecycle.round.evidence_attached'`, [round.roundId]);
    expect(rows).toEqual([
      { event_type: 'lifecycle.round.evidence_attached', subject_type: 'validation_round', actor_id: grantee.id, detail: { projectId: round.projectId, seq: round.seq, count: 2 } },
    ]);
  });

  it('refuses a User and a Developer without the round right; an Admin may attach', async () => {
    const round = await makeRound();
    for (const who of [user, developer]) {
      const id = await upload(who);
      expect((await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [id] }, who)).outcome).toBe('forbidden');
      expect((await attachmentRow(id)).parent_kind).toBeNull();
    }
    expect((await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [await upload(admin)] }, admin)).outcome).toBe('ok');
  });

  it('lists the Evidence for any workspace user, and answers null for an unknown or other-workspace round', async () => {
    const round = await makeRound();
    const id = await upload(grantee);
    await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [id] }, grantee);
    for (const who of [user, developer, admin]) {
      const a = await readEvidence(round.roundId, who);
      expect(a.outcome).toBe('ok');
      expect(a.data.rows).toMatchObject([{ id, name: 'evidence.txt', sizeBytes: 15, mimeType: 'text/plain', uploadedByActorId: grantee.id }]);
      expect(JSON.stringify(a.data)).not.toContain(WORKSPACE_ID); // no storage key
    }
    expect((await readEvidence(foreignRound, admin)).data).toBeNull();
    expect((await readEvidence(randomUUID(), admin)).data).toBeNull();
  });

  it('lets any workspace user download a round attachment (the round is visible to them); the bytes arrive', async () => {
    const round = await makeRound();
    const id = await upload(grantee);
    await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [id] }, grantee);
    for (const who of [user, developer, admin]) {
      const res = await download(id, who);
      expect(res.statusCode).toBe(200);
      expect(res.rawPayload.toString()).toBe('manual evidence');
    }
  });

  it('denies a round attachment whose round is in another workspace (403), and a key of another workspace is a 404', async () => {
    const id = await upload(admin);
    await sql(`update voc.voc_attachments set parent_kind = 'validation_round', parent_id = $2, linked_at = now() where id = $1`, [id, foreignRound]);
    expect((await download(id, admin)).statusCode).toBe(403);
    expect((await download(id, user)).statusCode).toBe(403);
    const foreignKey = await upload(admin, otherWorkspace);
    await sql(`update voc.voc_attachments set parent_kind = 'validation_round', parent_id = $2, linked_at = now() where id = $1`, [foreignKey, foreignRound]);
    expect((await download(foreignKey, admin)).statusCode).toBe(404);
  });

  it('keeps an unlinked upload readable by its uploader only', async () => {
    const id = await upload(grantee);
    expect((await download(id, grantee)).statusCode).toBe(200);
    expect((await download(id, user)).statusCode).toBe(403);
  });

  it('rejects another actor’s upload, a duplicate, an already linked row and an unknown id; nothing is linked (atomic)', async () => {
    const round = await makeRound();
    const mine = await upload(grantee);
    const theirs = await upload(user);
    const bad = await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [mine, theirs] }, grantee);
    expect(bad.outcome).toBe('invalid');
    expect(fe(bad)).toEqual(['attachmentIds.1:invalid']);
    expect((await attachmentRow(mine)).parent_kind).toBeNull();
    expect(fe(await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [mine, mine] }, grantee))).toEqual(['attachmentIds:duplicate']);
    expect(fe(await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [randomUUID()] }, grantee))).toEqual(['attachmentIds.0:invalid']);
    expect((await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [mine] }, grantee)).outcome).toBe('ok');
    const again = await makeRound();
    expect(fe(await act('roundEvidenceAttach', { roundId: again.roundId, attachmentIds: [mine] }, grantee))).toEqual(['attachmentIds.0:invalid']);
  });

  it('rejects an unknown round, another workspace’s round, a closed round, and bad input shapes', async () => {
    const round = await makeRound();
    const id = await upload(grantee);
    expect(fe(await act('roundEvidenceAttach', { roundId: randomUUID(), attachmentIds: [id] }, grantee))).toEqual(['roundId:not_found']);
    expect(fe(await act('roundEvidenceAttach', { roundId: foreignRound, attachmentIds: [id] }, grantee))).toEqual(['roundId:not_found']);
    expect(fe(await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [] }, grantee))).toEqual(['attachmentIds:required']);
    expect(fe(await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: Array.from({ length: 21 }, () => randomUUID()) }, grantee))).toEqual(['attachmentIds:too_many']);
    expect(fe(await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: ['nope'] }, grantee))).toEqual(['attachmentIds.0:malformed']);
    expect((await act('roundClose', { id: round.roundId }, admin, round.version)).outcome).toBe('ok');
    expect(fe(await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [id] }, grantee))).toEqual(['roundId:illegal_transition']);
    expect((await attachmentRow(id)).parent_kind).toBeNull();
  });
});
