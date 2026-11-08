// #1474 X-h — the knowledge-draft evidence intake (`draftEvidenceIntake`) against a real Postgres (throwaway DB only; app as
// platform_app, fixtures as platform_migrate). The intake is a service the explorer's handoff action will call inside its own
// transaction, so every case opens a transaction itself and a refusal is a rollback. No server is built.

import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { type DbHandle, createDb } from '../../../db/client.js';
import { runAsToken } from '../../../lib/auth-context.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { MenuActionInvalidError } from '../../menu-dispatch/types.js';
import { createCheckService } from '../../permissions/check-service.js';
import type { PlatformActor } from '../../platform-port/permissions.js';
import { toCodeKey } from '../domain/code-key.js';
import { HASH_MISMATCH_MARKER } from '../domain/evidence-intake.js';
import { draftEvidenceIntake } from '../draft-evidence-intake.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `DEI${randomUUID().slice(0, 6).toUpperCase()}`;
const H = (c: string) => c.repeat(64);
const ORIGIN = { kind: 'log_explorer' as const, id: randomUUID() };

type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('knowledge draft evidence intake (#1474 X-h)', () => {
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let intake: ReturnType<typeof draftEvidenceIntake>;
  let admin: PlatformActor;
  let author: PlatformActor; // Developer with knowledge.draft.create
  let stranger: PlatformActor; // Developer with knowledge.draft.create
  let reviewer: PlatformActor; // Developer with knowledge.draft.create + knowledge.item.publish
  let plain: PlatformActor; // Developer without any grant
  let modelId = '';
  const actorIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const run = <T>(work: (tx: Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0]) => Promise<T>) => dbHandle.db.transaction(work);
  const ref = (over: Row = {}) => ({ fileRef: `s3://${TAG}/a.log`, line: 1, fileSha256: H('a'), sourceResolved: true, ...over });
  const createInput = (over: Row = {}) => ({
    owner: { modelId },
    title: `${TAG} handoff`,
    observation: 'seen in the log',
    refs: [ref()],
    sourceOwner: 'fab-team',
    origin: ORIGIN,
    ...over,
  });

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
  const fieldErrors = async (work: Promise<unknown>): Promise<string[]> => {
    try {
      await work;
    } catch (error) {
      if (error instanceof MenuActionInvalidError) return error.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);
      throw error;
    }
    throw new Error('expected a MenuActionInvalidError');
  };
  const draftRow = async (id: string) => (await sql('select * from knowledge.draft where id = $1', [id])).rows[0] as Row;
  const revisions = async (id: string) => (await sql('select * from knowledge.draft_revision where draft_id = $1 order by draft_rev_no', [id])).rows as Row[];
  const audit = async (id: string) => (await sql('select event_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as Row[];
  const draftCount = async () => Number((await sql('select count(*) from knowledge.draft where created_by = any($1)', [actorIds])).rows[0].count);
  const own = (actor: PlatformActor, over: Row = {}) => run((tx) => intake.create(tx, actor, createInput(over) as never));

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    intake = draftEvidenceIntake({ checkService: createCheckService({ db: dbHandle.db }) });
    admin = await person('admin');
    author = await person('developer', ['knowledge.draft.create']);
    stranger = await person('developer', ['knowledge.draft.create']);
    reviewer = await person('developer', ['knowledge.draft.create', 'knowledge.item.publish']);
    plain = await person('developer');
    const vendor = (
      await sql('insert into knowledge.vendor (workspace_id, created_by, updated_by, name, code, code_key) values ($1,$2,$2,$3,$3,$4) returning id', [
        WORKSPACE_ID,
        admin.actor_id,
        `${TAG}-v`,
        toCodeKey(`${TAG}-v`),
      ])
    ).rows[0].id as string;
    modelId = (
      await sql(
        'insert into knowledge.equipment_model (workspace_id, created_by, updated_by, name, code, code_key, vendor_id, active) values ($1,$2,$2,$3,$3,$4,$5,true) returning id',
        [WORKSPACE_ID, admin.actor_id, `${TAG}-m`, toCodeKey(`${TAG}-m`), vendor],
      )
    ).rows[0].id as string;
  }, 60_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      await client.query('alter table knowledge.draft_revision disable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft_review where draft_id in (select id from knowledge.draft where created_by = any($1))', [actorIds]);
      await client.query('delete from knowledge.draft_revision where author_actor_id = any($1)', [actorIds]);
      await client.query('alter table knowledge.draft_revision enable trigger draft_revision_append_only');
      await client.query('delete from knowledge.draft where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql('delete from knowledge.equipment_model where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.vendor where created_by = any($1)', [actorIds]);
    for (const [table, column] of [
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await dbHandle?.close();
    await migrate?.close();
  });

  it('create: a draft in status draft with one revision, the pointers mapped, author_auth session, and the audit row with the handoff key', async () => {
    const r = await own(author, { refs: [ref({ line: 7, note: 'check this' }), ref({ line: 8 })] });
    const draft = await draftRow(r.draftId);
    expect(draft).toMatchObject({ status: 'draft', proposal_type: 'create', origin: 'human', owner_model_id: modelId, submitter_actor_id: author.actor_id, latest_draft_rev: 1 });
    expect(r.version).toBe(String(draft.row_version));
    const revs = await revisions(r.draftId);
    expect(revs).toHaveLength(1);
    expect(revs[0]).toMatchObject({ author_auth: 'session', payload_digest: r.payloadDigest });
    const proposal = revs[0]?.proposal_json as { typeCode: string; title: string; observation: string; evidence: Row[] };
    expect(proposal).toMatchObject({ typeCode: 'needs_check', title: `${TAG} handoff`, observation: 'seen in the log' });
    expect(proposal.evidence).toEqual([
      { sourceKind: 'log_file', sourceOwner: 'fab-team', sourceRef: `s3://${TAG}/a.log`, sourceVersion: null, contentHash: H('a'), locator: 'line:7', note: 'check this' },
      { sourceKind: 'log_file', sourceOwner: 'fab-team', sourceRef: `s3://${TAG}/a.log`, sourceVersion: null, contentHash: H('a'), locator: 'line:8', note: null },
    ]);
    const rows = await audit(r.draftId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event_type: 'knowledge.draft.created',
      actor_id: author.actor_id,
      detail: { draftId: r.draftId, handoff: { originKind: 'log_explorer', originId: ORIGIN.id, refCount: 2 } },
    });
    expect(JSON.stringify(rows[0]?.detail)).not.toContain('check this');
    expect(JSON.stringify(rows[0]?.detail)).not.toContain(`s3://${TAG}`);
  });

  it('create by an Admin passes the module bypass; a Developer without the right is refused with [target] forbidden and nothing is written', async () => {
    expect((await own(admin)).draftId).toBeTruthy();
    const before = await draftCount();
    expect(await fieldErrors(own(plain))).toEqual(['target:forbidden']);
    expect(await draftCount()).toBe(before);
  });

  it('create: a hash mismatch is stored with the fixed marker at the start of the note', async () => {
    const r = await own(author, { refs: [ref({ line: 1, hashMismatch: true, note: 'sha differs' }), ref({ line: 2, hashMismatch: true })] });
    const notes = ((await revisions(r.draftId))[0]?.proposal_json as { evidence: { note: string }[] }).evidence.map((e) => e.note);
    expect(notes).toEqual([`${HASH_MISMATCH_MARKER} sha differs`, HASH_MISMATCH_MARKER]);
  });

  it('create: an unresolved pointer is refused at its index and nothing is written (draft, revision, audit)', async () => {
    const before = await draftCount();
    const errors = await fieldErrors(own(author, { refs: [ref(), ref({ line: 2, sourceResolved: false })] }));
    expect(errors).toEqual(['refs.1:unresolved']);
    expect(await draftCount()).toBe(before);
  });

  it('create: a blank fileRef is refused at refs.0.fileRef as required and nothing is written', async () => {
    const before = await draftCount();
    expect(await fieldErrors(own(author, { refs: [ref({ fileRef: '   ' })] }))).toEqual(['refs.0.fileRef:required']);
    expect(await draftCount()).toBe(before);
  });

  it.each([
    ['more than 20 pointers', { refs: Array.from({ length: 21 }, (_, i) => ref({ line: i + 1 })) }, ['refs:too_many']],
    ['no title', { title: '  ' }, ['title:required']],
    ['no observation', { observation: null }, ['observation:required_one']],
    ['an unknown owner model', { owner: { modelId: randomUUID() } }, ['target.modelId:not_found']],
    ['both owners', () => ({ owner: { modelId, softwareId: randomUUID() } }), ['target:required_one']],
    ['no source owner', { sourceOwner: ' ' }, ['sourceOwner:required']],
  ] as const)('create refuses %s', async (_label, over, expected) => {
    expect(await fieldErrors(own(author, (typeof over === 'function' ? over() : over) as Row))).toEqual(expected);
  });

  it('create by a token caller stores author_auth token', async () => {
    const r = await runAsToken(randomUUID(), ['knowledge.draft.create'], () => own(author));
    expect((await revisions(r.draftId))[0]).toMatchObject({ author_auth: 'token' });
    expect(await draftRow(r.draftId)).toMatchObject({ origin: 'human' });
  });

  it('append: the caller’s own draft gets a new revision with the pointers merged and de-duplicated; version and audit follow', async () => {
    const first = await own(author, { refs: [ref({ line: 1 })] });
    const second = await run((tx) =>
      intake.append(tx, author, { draftId: first.draftId, expectedVersion: first.version, refs: [ref({ line: 1 }), ref({ line: 2, hashMismatch: true })] as never, sourceOwner: 'fab-team', origin: ORIGIN }),
    );
    expect(second.draftId).toBe(first.draftId);
    expect(second.version).not.toBe(first.version);
    const revs = await revisions(first.draftId);
    expect(revs).toHaveLength(2);
    const evidence = (revs[1]?.proposal_json as { evidence: { locator: string; note: string | null }[] }).evidence;
    expect(evidence.map((e) => e.locator)).toEqual(['line:1', 'line:2']);
    expect(evidence[1]?.note).toBe(HASH_MISMATCH_MARKER);
    const rows = await audit(first.draftId);
    expect(rows.map((r) => r.event_type)).toEqual(['knowledge.draft.created', 'knowledge.draft.updated']);
    expect(rows[1]).toMatchObject({ detail: { draftRevNo: 2, statusBefore: 'draft', handoff: { originKind: 'log_explorer', originId: ORIGIN.id, refCount: 2 } } });
  });

  it('append: pointers that are all stored already change and audit nothing (same version, same digest)', async () => {
    const first = await own(author);
    const again = await run((tx) =>
      intake.append(tx, author, { draftId: first.draftId, expectedVersion: first.version, refs: [ref()] as never, sourceOwner: 'fab-team', origin: ORIGIN }),
    );
    expect(again).toEqual(first);
    expect(await revisions(first.draftId)).toHaveLength(1);
    expect(await audit(first.draftId)).toHaveLength(1);
  });

  it('append: another author’s plain draft is not found; a submitted one is visible to a publisher but forbidden_not_author; an unknown id is not found', async () => {
    const first = await own(author);
    const input = (draftId: string, expectedVersion: string) => ({ draftId, expectedVersion, refs: [ref({ line: 9 })] as never, sourceOwner: 'fab-team', origin: ORIGIN });
    expect(await fieldErrors(run((tx) => intake.append(tx, stranger, input(first.draftId, first.version))))).toEqual(['target.draftId:not_found']);
    expect(await fieldErrors(run((tx) => intake.append(tx, author, input(randomUUID(), '1'))))).toEqual(['target.draftId:not_found']);
    await sql(`update knowledge.draft set status = 'submitted', submitted_at = now(), row_version = row_version + 1, updated_at = now() where id = $1`, [first.draftId]);
    const current = String((await draftRow(first.draftId)).row_version);
    expect(await fieldErrors(run((tx) => intake.append(tx, reviewer, input(first.draftId, current))))).toEqual(['target.draftId:forbidden_not_author']);
    expect(await fieldErrors(run((tx) => intake.append(tx, stranger, input(first.draftId, current))))).toEqual(['target.draftId:not_found']);
    expect(await revisions(first.draftId)).toHaveLength(1);
  });

  it('append: a stale version is refused as [expectedVersion] conflict; a withdrawn draft is illegal_transition; nothing is written', async () => {
    const first = await own(author);
    const input = (expectedVersion: string) => ({ draftId: first.draftId, expectedVersion, refs: [ref({ line: 5 })] as never, sourceOwner: 'fab-team', origin: ORIGIN });
    expect(await fieldErrors(run((tx) => intake.append(tx, author, input('999'))))).toEqual(['expectedVersion:conflict']);
    await sql(`update knowledge.draft set status = 'withdrawn', closed_at = now(), closed_by = $2, row_version = row_version + 1, updated_at = now() where id = $1`, [first.draftId, author.actor_id]);
    const current = String((await draftRow(first.draftId)).row_version);
    expect(await fieldErrors(run((tx) => intake.append(tx, author, input(current))))).toEqual(['target.draftId:illegal_transition']);
    expect(await revisions(first.draftId)).toHaveLength(1);
  });

  it('append: the same pointer with a padded fileRef is a no-op, also at 20 stored pointers (not too_many)', async () => {
    const first = await own(author, { refs: Array.from({ length: 20 }, (_, i) => ref({ line: i + 1 })) });
    const again = await run((tx) =>
      intake.append(tx, author, { draftId: first.draftId, expectedVersion: first.version, refs: [ref({ line: 5, fileRef: `  ${ref().fileRef} ` })] as never, sourceOwner: 'fab-team', origin: ORIGIN }),
    );
    expect(again).toEqual(first);
    expect(await revisions(first.draftId)).toHaveLength(1);
    expect(await audit(first.draftId)).toHaveLength(1);
  });

  it('append: more than 20 pointers in total are refused as [refs] too_many; unresolved is refused; a caller without the right is forbidden', async () => {
    const first = await own(author, { refs: Array.from({ length: 20 }, (_, i) => ref({ line: i + 1 })) });
    const input = (refs: Row[]) => ({ draftId: first.draftId, expectedVersion: first.version, refs: refs as never, sourceOwner: 'fab-team', origin: ORIGIN });
    expect(await fieldErrors(run((tx) => intake.append(tx, author, input([ref({ line: 21 })]))))).toEqual(['refs:too_many']);
    expect(await fieldErrors(run((tx) => intake.append(tx, author, input([ref({ line: 22, sourceResolved: false })]))))).toEqual(['refs.0:unresolved']);
    expect(await fieldErrors(run((tx) => intake.append(tx, plain, input([ref({ line: 23 })]))))).toEqual(['target:forbidden']);
    expect(await revisions(first.draftId)).toHaveLength(1);
  });

  it('append by a token caller stores author_auth token on the new revision', async () => {
    const first = await own(author);
    await runAsToken(randomUUID(), ['knowledge.draft.create'], () =>
      run((tx) => intake.append(tx, author, { draftId: first.draftId, expectedVersion: first.version, refs: [ref({ line: 3 })] as never, sourceOwner: 'fab-team', origin: ORIGIN })),
    );
    expect((await revisions(first.draftId)).map((r) => r.author_auth)).toEqual(['session', 'token']);
  });
});
