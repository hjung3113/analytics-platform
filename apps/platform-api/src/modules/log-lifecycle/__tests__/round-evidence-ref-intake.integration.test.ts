// #1474 X-h — the round evidence-location intake (`roundEvidenceRefIntake`) against a real Postgres (throwaway DB only; app as
// platform_app, fixtures as platform_migrate). Needs migration 0116 (`log_lifecycle.round_evidence_ref`). The intake is a
// service the explorer's handoff action will call inside its own transaction, so every case opens a transaction itself and a
// refusal is a rollback. No server is built.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { toCodeKey } from '../../log-knowledge/index.js';
import { MenuActionInvalidError } from '../../menu-dispatch/types.js';
import { createCheckService } from '../../permissions/check-service.js';
import type { PlatformActor } from '../../platform-port/permissions.js';
import { getRoundDetail } from '../repositories/lifecycle-read.js';
import { roundEvidenceRefIntake } from '../round-evidence-ref-intake.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `RER${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);
const ORIGIN = { kind: 'log_explorer' as const, id: randomUUID() };
const FILE_A = `s3://${TAG}/a.log`;
const FILE_B = `s3://${TAG}/b.log`;

type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('round evidence-location intake (#1474 X-h)', () => {
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let intake: ReturnType<typeof roundEvidenceRefIntake>;
  let admin: PlatformActor;
  let grantee: PlatformActor; // Developer with lifecycle.round.manage
  let plain: PlatformActor; // Developer without it
  let vendorId = '';
  let foreignRound = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const run = <T>(work: (tx: Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0]) => Promise<T>) => dbHandle.db.transaction(work);
  const ref = (over: Row = {}) => ({ fileRef: FILE_A, line: 1, fileSha256: H('a'), sourceResolved: true, ...over });
  const attach = (actor: PlatformActor, roundId: string, refs: Row[]) =>
    run((tx) => intake.attach(tx, actor, { roundId, refs: refs as never, origin: ORIGIN }));
  const fieldErrors = async (work: Promise<unknown>): Promise<string[]> => {
    try {
      await work;
    } catch (error) {
      if (error instanceof MenuActionInvalidError) return error.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);
      throw error;
    }
    throw new Error('expected a MenuActionInvalidError');
  };
  // `line` is bigint: node-postgres returns it as a string on this raw read (the repository reads it through Drizzle `mode: 'number'`).
  const stored = async (roundId: string) =>
    ((await sql('select * from log_lifecycle.round_evidence_ref where round_id = $1 order by seq', [roundId])).rows as Row[]).map((r): Row => ({ ...r, line: Number(r.line) }));
  const audit = async (roundId: string) =>
    (await sql(`select actor_id, subject_type, detail from core.audit_log where subject_id = $1 and event_type = 'lifecycle.round.evidence_ref_attached' order by created_at, id`, [roundId])).rows as Row[];

  async function person(roleLevel: 'admin' | 'developer', capabilities: string[] = []): Promise<PlatformActor> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    for (const capability of capabilities) {
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,$3,null,$2)`,
        [WORKSPACE_ID, id, capability],
      );
    }
    return { actor_id: id, workspace_id: WORKSPACE_ID, role_level: roleLevel };
  }

  /** An open round whose sample set holds file A (sha a) and file B (sha b). */
  async function makeRound(): Promise<{ id: string; projectId: string; seq: number }> {
    const code = `${TAG}-m${n++}`;
    const modelId = (
      await sql(
        `insert into knowledge.equipment_model (workspace_id, code, code_key, name, created_by, updated_by, vendor_id) values ($1,$2,$3,$2,$4,$4,$5) returning id`,
        [WORKSPACE_ID, code, toCodeKey(code), admin.actor_id, vendorId],
      )
    ).rows[0].id as string;
    const projectId = (
      await sql(
        `insert into log_lifecycle.development_project (workspace_id, model_id, kind, owner_actor_id, created_by, updated_by) values ($1,$2,'new',$3,$3,$3) returning id`,
        [WORKSPACE_ID, modelId, admin.actor_id],
      )
    ).rows[0].id as string;
    const sampleSet = {
      files: [
        { fileRef: FILE_A, order: 1, sha256: H('a') },
        { fileRef: FILE_B, order: 2, sha256: H('b') },
      ],
      sourceOwner: 'fab-team',
    };
    const row = (
      await sql(
        `insert into log_lifecycle.validation_round (workspace_id, project_id, seq, stage, sample_set, sample_manifest_digest, created_by, updated_by) values ($1,$2,1,'registered',$3::jsonb,$4,$5,$5) returning id, seq`,
        [WORKSPACE_ID, projectId, JSON.stringify(sampleSet), H('d'), admin.actor_id],
      )
    ).rows[0];
    return { id: row.id as string, projectId, seq: row.seq as number };
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    intake = roundEvidenceRefIntake({ checkService: createCheckService({ db: dbHandle.db }) });
    admin = await person('admin');
    grantee = await person('developer', ['lifecycle.round.manage']);
    plain = await person('developer');
    vendorId = (
      await sql(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$2,$4,$4) returning id`, [
        WORKSPACE_ID,
        `${TAG}-v`,
        toCodeKey(`${TAG}-v`),
        admin.actor_id,
      ])
    ).rows[0].id as string;
    const otherWorkspace = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`])).rows[0].id as string;
    workspaceIds.push(otherWorkspace);
    const foreignActor = (await insertActorRow(dbHandle, { workspaceId: otherWorkspace, externalId: `${TAG}-foreign`, roleLevel: 'admin' })).id;
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
        [otherWorkspace, foreignProject, JSON.stringify({ files: [{ fileRef: FILE_A, order: 1, sha256: H('a') }], sourceOwner: 'o' }), H('d'), foreignActor],
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table log_lifecycle.round_evidence_ref disable trigger round_evidence_ref_append_only');
      await client.query('delete from log_lifecycle.round_evidence_ref where handed_off_by = any($1) or workspace_id = any($2)', [actorIds, workspaceIds]);
      await client.query('alter table log_lifecycle.round_evidence_ref enable trigger round_evidence_ref_append_only');
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
      await sql(`delete from knowledge.${table} where workspace_id = any($1) and created_by = any($2)`, [[WORKSPACE_ID, ...workspaceIds], actorIds]);
    }
    for (const [table, column] of [
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await dbHandle?.close();
    await migrate?.close();
  });

  it('attaches to an open round: rows with seq and the three statuses decided by the round, and one body-free audit row', async () => {
    const round = await makeRound();
    const result = await attach(grantee, round.id, [
      ref({ line: 1, note: 'first' }),
      ref({ line: 2, fileRef: FILE_B, fileSha256: H('c') }), // sha differs from the sample set's b
      ref({ line: 3, sourceResolved: false }),
    ]);
    expect(result).toEqual({ attached: 3, alreadyAttached: 0, byStatus: { match: 1, hash_mismatch: 1, unresolved: 1 } });
    const rows = await stored(round.id);
    expect(rows.map((r) => [r.seq, r.line, r.status])).toEqual([
      [1, 1, 'match'],
      [2, 2, 'hash_mismatch'],
      [3, 3, 'unresolved'],
    ]);
    expect(rows[0]).toMatchObject({ file_ref: FILE_A, file_sha256: H('a'), note: 'first', origin_kind: 'log_explorer', origin_id: ORIGIN.id, handed_off_by: grantee.actor_id });
    const log = await audit(round.id);
    expect(log).toEqual([
      {
        actor_id: grantee.actor_id,
        subject_type: 'validation_round',
        detail: { projectId: round.projectId, seq: round.seq, attached: 3, alreadyAttached: 0, match: 1, hashMismatch: 1, unresolved: 1, originKind: 'log_explorer', originId: ORIGIN.id },
      },
    ]);
    expect(JSON.stringify(log)).not.toContain('first');
    expect(JSON.stringify(log)).not.toContain(FILE_A);
  });

  it('a repeat is counted in alreadyAttached, writes nothing and adds no audit row; a mixed call attaches only the new pointer', async () => {
    const round = await makeRound();
    await attach(grantee, round.id, [ref({ line: 1 })]);
    expect(await attach(grantee, round.id, [ref({ line: 1, note: 'again' })])).toEqual({ attached: 0, alreadyAttached: 1, byStatus: { match: 0, hash_mismatch: 0, unresolved: 0 } });
    expect(await stored(round.id)).toHaveLength(1);
    expect(await audit(round.id)).toHaveLength(1);
    expect(await attach(grantee, round.id, [ref({ line: 1 }), ref({ line: 2 })])).toMatchObject({ attached: 1, alreadyAttached: 1 });
    expect((await stored(round.id)).map((r) => r.seq)).toEqual([1, 2]);
    expect((await audit(round.id))[1]).toMatchObject({ detail: { attached: 1, alreadyAttached: 1 } });
  });

  it('refuses a fileRef outside the sample set at its index and writes nothing', async () => {
    const round = await makeRound();
    expect(await fieldErrors(attach(grantee, round.id, [ref(), ref({ line: 2, fileRef: `s3://${TAG}/other.log` })]))).toEqual(['refs.1.fileRef:not_in_sample_set']);
    expect(await stored(round.id)).toHaveLength(0);
    expect(await audit(round.id)).toHaveLength(0);
  });

  it('refuses a closed round, an unknown round and another workspace’s round; and a bad round id or origin', async () => {
    const round = await makeRound();
    await sql(`update log_lifecycle.validation_round set status = 'closed', closed_at = now(), closed_by = $2, row_version = row_version + 1, updated_at = now() where id = $1`, [round.id, admin.actor_id]);
    expect(await fieldErrors(attach(grantee, round.id, [ref()]))).toEqual(['target.roundId:round_closed']);
    expect(await fieldErrors(attach(grantee, randomUUID(), [ref()]))).toEqual(['target.roundId:not_found']);
    expect(await fieldErrors(attach(grantee, foreignRound, [ref()]))).toEqual(['target.roundId:not_found']);
    expect(await fieldErrors(attach(grantee, 'nope', [ref()]))).toEqual(['target.roundId:malformed']);
    expect(await fieldErrors(run((tx) => intake.attach(tx, grantee, { roundId: round.id, refs: [ref()] as never, origin: { kind: 'voc', id: 'x' } as never })))).toEqual([
      'origin.kind:malformed',
      'origin.id:malformed',
    ]);
    expect(await stored(round.id)).toHaveLength(0);
    expect(await stored(foreignRound)).toHaveLength(0);
  });

  it('refuses an actor without lifecycle.round.manage with [target] forbidden; an Admin may attach', async () => {
    const round = await makeRound();
    expect(await fieldErrors(attach(plain, round.id, [ref()]))).toEqual(['target:forbidden']);
    expect(await stored(round.id)).toHaveLength(0);
    expect(await attach(admin, round.id, [ref()])).toMatchObject({ attached: 1 });
  });

  it('the table is append-only: platform_app has no UPDATE or DELETE (42501) and the trigger refuses both for the migrate role (23514)', async () => {
    const round = await makeRound();
    await attach(grantee, round.id, [ref()]);
    const code = async (handle: DbHandle, text: string) => {
      try {
        await handle.pool.query(text, [round.id]);
      } catch (error) {
        return (error as { code?: string }).code;
      }
      return 'no error';
    };
    expect(await code(dbHandle, `update log_lifecycle.round_evidence_ref set note = 'x' where round_id = $1`)).toBe('42501');
    expect(await code(dbHandle, 'delete from log_lifecycle.round_evidence_ref where round_id = $1')).toBe('42501');
    expect(await code(migrate, `update log_lifecycle.round_evidence_ref set note = 'x' where round_id = $1`)).toBe('23514');
    expect(await code(migrate, 'delete from log_lifecycle.round_evidence_ref where round_id = $1')).toBe('23514');
    expect(await stored(round.id)).toHaveLength(1);
  });

  it('two parallel attaches to one round leave a gapless seq 1..n and no duplicate', async () => {
    const round = await makeRound();
    const [first, second] = await Promise.all([
      attach(grantee, round.id, [ref({ line: 1 }), ref({ line: 2 }), ref({ line: 3 })]),
      attach(admin, round.id, [ref({ line: 3 }), ref({ line: 4 }), ref({ line: 5 })]),
    ]);
    expect(first.attached + second.attached).toBe(5);
    expect(first.alreadyAttached + second.alreadyAttached).toBe(1);
    const rows = await stored(round.id);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(rows.map((r) => r.line)).size).toBe(5);
  });

  it('a round holds at most 1000 pointers: a new one beyond is [refs] round_full, a stored one still counts as already attached', async () => {
    const round = await makeRound();
    await sql(
      `insert into log_lifecycle.round_evidence_ref (workspace_id, round_id, seq, file_ref, line, file_sha256, status, origin_kind, origin_id, handed_off_by)
       select $1, $2, g, $3, g, $4, 'match', 'log_explorer', $5, $6 from generate_series(1, 1000) g`,
      [WORKSPACE_ID, round.id, FILE_A, H('a'), ORIGIN.id, admin.actor_id],
    );
    expect(await fieldErrors(attach(grantee, round.id, [ref({ line: 1001 })]))).toEqual(['refs:round_full']);
    expect(await attach(grantee, round.id, [ref({ line: 7 })])).toMatchObject({ attached: 0, alreadyAttached: 1 });
    expect(await stored(round.id)).toHaveLength(1000);
  });

  it('roundDetail carries evidenceRefs, newest first, with status and origin; a round without any answers an empty list', async () => {
    const round = await makeRound();
    expect((await run((tx) => getRoundDetail(tx, WORKSPACE_ID, round.id)))?.evidenceRefs).toEqual([]);
    await attach(grantee, round.id, [ref({ line: 1, note: 'n1' }), ref({ line: 2, sourceResolved: false })]);
    const detail = await run((tx) => getRoundDetail(tx, WORKSPACE_ID, round.id));
    expect(detail?.evidenceRefs.map((r) => [r.seq, r.line, r.status])).toEqual([
      [2, 2, 'unresolved'],
      [1, 1, 'match'],
    ]);
    expect(detail?.evidenceRefs[1]).toMatchObject({
      fileRef: FILE_A,
      fileSha256: H('a'),
      note: 'n1',
      originKind: 'log_explorer',
      originId: ORIGIN.id,
      handedOffBy: grantee.actor_id,
    });
    expect(typeof detail?.evidenceRefs[1]?.at).toBe('string');
    expect((await run((tx) => getRoundDetail(tx, WORKSPACE_ID, foreignRound))) === null).toBe(true);
  });

  it('stores any positive safe-integer line (above 2^31 and the safe maximum) and roundDetail reads the same numbers back', async () => {
    const round = await makeRound();
    const lines = [2147483648, Number.MAX_SAFE_INTEGER];
    expect(await attach(grantee, round.id, lines.map((line) => ref({ line })))).toMatchObject({ attached: 2 });
    const detail = await run((tx) => getRoundDetail(tx, WORKSPACE_ID, round.id));
    expect(detail?.evidenceRefs.map((r) => r.line).sort((a, b) => a - b)).toEqual(lines);
    expect(detail?.evidenceRefs.every((r) => typeof r.line === 'number')).toBe(true);
  });
});
