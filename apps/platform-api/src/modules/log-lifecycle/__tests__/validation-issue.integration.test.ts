// #1808 N1 storage services, real Postgres as platform_app. No transport is registered until N2.
import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type DbHandle } from '../../../db/client.js';
import { developmentProjects, validationRounds, executionRequests, executionAttempts, ruleResults, validationIssueOccurrences, validationIssueComments, roundComments, validationIssueEvents, validationIssues } from '../../../db/schema/log-lifecycle.js';
import { equipmentModels, vendors } from '../../../db/schema/knowledge.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { defined } from '../../../test-support/defined.js';
import { createValidationIssueService } from '../validation-issue-service.js';
import { createValidationIssueReader } from '../validation-issue-read.js';
import type { ValidationIssueAction } from '../domain/validation-issue-input.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE);
const TABLES = ['validation_issue_evidence_ref', 'validation_issue_occurrence', 'validation_issue_comment', 'round_comment', 'validation_issue_event', 'validation_issue'] as const;
const sha = 'a'.repeat(64);

describe.skipIf(!runIntegration)('human validation issue storage (#1808 N1; migration 0128)', () => {
  let app: DbHandle;
  let migrate: DbHandle;
  let service: ReturnType<typeof createValidationIssueService>;
  let reader: ReturnType<typeof createValidationIssueReader>;
  let caller: { workspace_id: string; actor_id: string };
  let other: typeof caller;
  let vendorId: string;
  let projectId: string;
  let roundId: string;
  let secondRoundId: string;
  let attemptId: string;
  let requestId: string;
  let ruleResultId: string;
  const actorIds: string[] = [];
  const tag = `VI${randomUUID().slice(0, 8)}`;
  const sampleSet = { files: [{ fileRef: 'synthetic.log', order: 1, sha256: sha }], sourceOwner: 'synthetic' };
  const run = (action: ValidationIssueAction, input: unknown, key = randomUUID()) => service.execute(caller, action, input, key);
  const create = (title = 'Synthetic observation') => run('create', { projectId, firstRoundId: roundId, title, body: 'Synthetic description' });
  const ref = (line: number) => ({ fileRef: 'synthetic.log', line, fileSha256: sha });
  const auditRows = async (id: string) => (await migrate.pool.query('select event_type, summary, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as { event_type: string; summary: string; detail: Record<string, unknown> }[];

  async function seedProject(hidden = false) {
    const code = `${tag}-${randomUUID().slice(0, 6)}`;
    const [model] = await migrate.db.insert(equipmentModels).values({ workspaceId: WORKSPACE, vendorId, code, codeKey: code.toLowerCase(), name: code, accessMode: hidden ? 'restricted' : 'internal', createdBy: caller.actor_id, updatedBy: caller.actor_id }).returning();
    const [project] = await migrate.db.insert(developmentProjects).values({ workspaceId: WORKSPACE, modelId: defined(model).id, kind: 'new', ownerActorId: caller.actor_id, createdBy: caller.actor_id, updatedBy: caller.actor_id }).returning();
    return defined(project).id;
  }
  async function seedRound(project: string, seq: number) {
    const [round] = await migrate.db.insert(validationRounds).values({ workspaceId: WORKSPACE, projectId: project, seq, stage: 'registered', status: 'closed', sampleSet, sampleManifestDigest: sha, createdBy: caller.actor_id, updatedBy: caller.actor_id, closedBy: caller.actor_id, closedAt: new Date() }).returning();
    return defined(round).id;
  }
  async function seedAttempt(round: string) {
    const [request] = await migrate.db.insert(executionRequests).values({ workspaceId: WORKSPACE, roundId: round, priority: 1, requestDigest: sha, requestedByActorId: caller.actor_id, idempotencyKey: randomUUID() }).returning();
    const [attempt] = await migrate.db.insert(executionAttempts).values({ workspaceId: WORKSPACE, requestId: defined(request).id, attemptNo: 1, workerActorId: caller.actor_id, inputManifestDigest: sha }).returning();
    const [result] = await migrate.db.insert(ruleResults).values({ workspaceId: WORKSPACE, attemptId: defined(attempt).id, ruleId: 'synthetic-rule', result: 'FAIL', required: true }).returning();
    return { requestId: defined(request).id, attemptId: defined(attempt).id, ruleResultId: defined(result).id };
  }
  beforeAll(async () => {
    app = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    caller = { workspace_id: WORKSPACE, actor_id: (await insertActorRow(app, { workspaceId: WORKSPACE, externalId: `${tag}-writer`, roleLevel: 'user' })).id };
    other = { workspace_id: WORKSPACE, actor_id: (await insertActorRow(app, { workspaceId: WORKSPACE, externalId: `${tag}-reader`, roleLevel: 'user' })).id };
    actorIds.push(caller.actor_id, other.actor_id);
    const [vendor] = await migrate.db.insert(vendors).values({ workspaceId: WORKSPACE, code: tag, codeKey: tag.toLowerCase(), name: tag, createdBy: caller.actor_id, updatedBy: caller.actor_id }).returning();
    vendorId = defined(vendor).id;
    projectId = await seedProject();
    roundId = await seedRound(projectId, 1);
    secondRoundId = await seedRound(projectId, 2);
    ({ requestId, attemptId, ruleResultId } = await seedAttempt(roundId));
    service = createValidationIssueService({ db: app.db });
    reader = createValidationIssueReader({ db: app.db });
    // One real row in every append-only table, for both grant and trigger assertions.
    const issue = await create();
    const occurrence = await run('linkOccurrence', { issueId: issue.id, roundId });
    await run('linkEvidence', { occurrenceId: occurrence.id, refs: [ref(1)] });
    await run('commentIssue', { issueId: issue.id, body: 'Synthetic comment' });
    await run('commentRound', { roundId, body: 'Synthetic round discussion' });
    await run('correctField', { issueId: issue.id, field: 'title', body: 'Synthetic corrected title' });
  });
  afterAll(async () => {
    if (!migrate) return;
    await migrate.db.transaction(async tx => {
      for (const table of TABLES) await tx.execute(sql.raw(`alter table log_lifecycle.${table} disable trigger ${table}_append_only`));
      for (const table of TABLES) {
        const owner = table === 'validation_issue' ? 'reporter_actor_id' : table === 'round_comment' || table === 'validation_issue_comment' ? 'author_actor_id' : table === 'validation_issue_event' ? 'actor_id' : 'linker_actor_id';
        await tx.execute(sql`delete from ${sql.raw(`log_lifecycle.${table}`)} where ${sql.raw(owner)} in (${sql.join(actorIds.map(id => sql`${id}::uuid`), sql`,`)})`);
      }
      for (const table of TABLES) await tx.execute(sql.raw(`alter table log_lifecycle.${table} enable trigger ${table}_append_only`));
      await tx.execute(sql`delete from log_lifecycle.rule_result where workspace_id = ${WORKSPACE}::uuid and attempt_id in (select id from log_lifecycle.execution_attempt where worker_actor_id = ${caller.actor_id}::uuid)`);
      await tx.execute(sql`delete from log_lifecycle.execution_attempt where worker_actor_id = ${caller.actor_id}::uuid`);
      await tx.execute(sql`delete from log_lifecycle.execution_request where requested_by_actor_id = ${caller.actor_id}::uuid`);
      await tx.execute(sql`delete from log_lifecycle.validation_round where created_by = ${caller.actor_id}::uuid`);
      await tx.execute(sql`delete from log_lifecycle.development_project where created_by = ${caller.actor_id}::uuid`);
      await tx.execute(sql`delete from knowledge.equipment_model where vendor_id = ${vendorId}::uuid`);
      await tx.execute(sql`delete from knowledge.vendor where id = ${vendorId}::uuid`);
      for (const actor of actorIds) {
        await tx.execute(sql`delete from core.audit_log where actor_id = ${actor}::uuid`);
        await tx.execute(sql`delete from core.idempotency_keys where actor_id = ${actor}::uuid`);
        await tx.execute(sql`delete from core.actors where id = ${actor}::uuid`);
      }
    });
    await Promise.all([app.close(), migrate.close()]);
  });

  it('creates without a rule, replays concurrent identical keys once, and conflicts on changed content', async () => {
    const key = randomUUID();
    const input = { projectId, firstRoundId: roundId, title: 'Free observation', body: 'No rule needed' };
    const [first, retry] = await Promise.all([run('create', input, key), run('create', input, key)]);
    expect(retry).toEqual(first);
    expect(await reader.detail(other, first.id)).toMatchObject({ title: input.title, body: input.body });
    expect(await auditRows(first.id)).toHaveLength(1);
    await expect(run('create', { ...input, body: 'Changed' }, key)).rejects.toMatchObject({ code: 'conflict.idempotency_key_reuse' });
  });
  it.each(TABLES)('%s rejects UPDATE/DELETE as app and enforces append-only as migrate', async table => {
    for (const verb of ['update', 'delete']) {
      const query = verb === 'update' ? `update log_lifecycle.${table} set id = id` : `delete from log_lifecycle.${table}`;
      await expect(app.pool.query(query)).rejects.toMatchObject({ code: '42501' });
      await expect(migrate.pool.query(query)).rejects.toMatchObject({ code: '23514' });
    }
  });
  it('enforces round/attempt/result ownership in services and composite FKs', async () => {
    const issue = await create();
    await expect(run('linkOccurrence', { issueId: issue.id, roundId: secondRoundId, attemptId, ruleResultId })).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(app.db.insert(validationIssueOccurrences).values({ workspaceId: WORKSPACE, projectId, issueId: issue.id, roundId: secondRoundId, requestId, attemptId, ruleResultId, linkerActorId: caller.actor_id })).rejects.toMatchObject({ code: '23503' });
    const different = await seedAttempt(secondRoundId);
    // The Round and request match, but the attempt belongs to another request: the (workspace, request, attempt) key refuses it.
    await expect(app.db.insert(validationIssueOccurrences).values({ workspaceId: WORKSPACE, projectId, issueId: issue.id, roundId, requestId, attemptId: different.attemptId, linkerActorId: caller.actor_id })).rejects.toMatchObject({ code: '23503' });
    await expect(run('linkOccurrence', { issueId: issue.id, roundId, attemptId, ruleResultId: different.ruleResultId })).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(app.db.insert(validationIssueOccurrences).values({ workspaceId: WORKSPACE, projectId, issueId: issue.id, roundId, requestId, attemptId, ruleResultId: different.ruleResultId, linkerActorId: caller.actor_id })).rejects.toMatchObject({ code: '23503' });
    await expect(run('create', { projectId: await seedProject(), firstRoundId: roundId, title: 'Cross project', body: 'Synthetic' })).rejects.toMatchObject({ code: 'not_found.record' });
    const valid = await run('linkOccurrence', { issueId: issue.id, roundId, attemptId, ruleResultId });
    expect(valid.added).toBe(true);
  });
  it('returns the existing NULL location and writes no duplicate audit for a new key', async () => {
    const issue = await create();
    const first = await run('linkOccurrence', { issueId: issue.id, roundId });
    const second = await run('linkOccurrence', { issueId: issue.id, roundId });
    expect(second).toMatchObject({ id: first.id, added: false });
    expect((await auditRows(issue.id)).filter(a => a.event_type.endsWith('occurrence_linked'))).toHaveLength(1);
  });
  it('serialises the evidence cap, deduplicates pointers, rejects out-of-sample refs and preserves mismatched hashes', async () => {
    const issue = await create();
    const occurrence = await run('linkOccurrence', { issueId: issue.id, roundId });
    const results = await Promise.allSettled([
      run('linkEvidence', { occurrenceId: occurrence.id, refs: Array.from({ length: 11 }, (_, i) => ref(i + 1)) }),
      run('linkEvidence', { occurrenceId: occurrence.id, refs: Array.from({ length: 10 }, (_, i) => ref(i + 12)) }),
    ]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    const stored = await app.pool.query<{ line: string }>('select line from log_lifecycle.validation_issue_evidence_ref where occurrence_id = $1', [occurrence.id]);
    expect([10, 11]).toContain(stored.rowCount);
    const existingLine = Number(defined(stored.rows[0]).line);
    expect(await run('linkEvidence', { occurrenceId: occurrence.id, refs: [ref(existingLine)] })).toMatchObject({ count: 0 });
    await expect(run('linkEvidence', { occurrenceId: occurrence.id, refs: [{ ...ref(100), fileRef: 'outside.log' }] })).rejects.toMatchObject({ code: 'validation.failed' });
    const remaining = 20 - stored.rows.length;
    await run('linkEvidence', { occurrenceId: occurrence.id, refs: Array.from({ length: remaining }, (_, i) => ({ ...ref(100 + i), fileSha256: 'b'.repeat(64) })) });
    await expect(run('linkEvidence', { occurrenceId: occurrence.id, refs: [ref(200)] })).rejects.toMatchObject({ code: 'validation.failed' });
    expect((await app.pool.query('select count(*)::int as n from log_lifecycle.validation_issue_evidence_ref where occurrence_id = $1', [occurrence.id])).rows[0]).toMatchObject({ n: 20 });
  });
  it('stores corrections as new comments in separate target threads and rejects cross-target provenance', async () => {
    const issue = await create();
    const original = await run('commentIssue', { issueId: issue.id, body: 'Original' });
    const corrected = await run('commentIssue', { issueId: issue.id, body: 'Correction', correctsCommentId: original.id });
    const comments = await reader.comments(other, { kind: 'issue', id: issue.id });
    expect(comments?.rows).toEqual(expect.arrayContaining([expect.objectContaining({ id: original.id, body: 'Original' }), expect.objectContaining({ id: corrected.id, body: 'Correction', correctsCommentId: original.id })]));
    const second = await create();
    await expect(run('commentIssue', { issueId: second.id, body: 'Wrong target', correctsCommentId: original.id })).rejects.toMatchObject({ code: 'validation.failed' });
    await expect(app.db.insert(validationIssueComments).values({ workspaceId: WORKSPACE, issueId: second.id, authorActorId: caller.actor_id, body: 'Wrong target', correctsCommentId: original.id })).rejects.toMatchObject({ code: '23503' });
    const discussion = await run('commentRound', { roundId, body: 'Round original' });
    await run('commentRound', { roundId, body: 'Round correction', correctsCommentId: discussion.id });
    await expect(app.db.insert(roundComments).values({ workspaceId: WORKSPACE, roundId: secondRoundId, authorActorId: caller.actor_id, body: 'Wrong round', correctsCommentId: discussion.id })).rejects.toMatchObject({ code: '23503' });
    expect((await reader.comments(other, { kind: 'issue', id: issue.id }))?.rows).toHaveLength(2);
  });
  it('projects field corrections while keeping originals and field-bound provenance', async () => {
    const issue = await create('Original title');
    const event = await run('correctField', { issueId: issue.id, field: 'title', body: 'Corrected title' });
    await run('correctField', { issueId: issue.id, field: 'title', body: 'Final title', correctsEventId: event.id });
    expect(await reader.detail(caller, issue.id)).toMatchObject({ title: 'Final title' });
    expect((await app.pool.query('select title from log_lifecycle.validation_issue where id = $1', [issue.id])).rows[0]).toMatchObject({ title: 'Original title' });
    await expect(app.db.insert(validationIssueEvents).values({ workspaceId: WORKSPACE, issueId: issue.id, actorId: caller.actor_id, kind: 'field_corrected', field: 'body', body: 'Wrong field', correctsEventId: event.id })).rejects.toMatchObject({ code: '23503' });
  });
  it('orders corrections by insertion time after an older transaction waited', async () => {
    const issue = await create();
    let notifyStarted: () => void = () => { throw new Error('start barrier not initialised'); };
    let release: () => void = () => { throw new Error('release barrier not initialised'); };
    const started = new Promise<void>(resolve => { notifyStarted = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const delayed = app.db.transaction(async tx => {
      await tx.execute(sql`select now()`);
      notifyStarted();
      await gate;
      return service.handle(tx, caller, 'correctField', { issueId: issue.id, field: 'title', body: 'Inserted last' });
    });
    try {
      await started;
      await run('correctField', { issueId: issue.id, field: 'title', body: 'Inserted first' });
    } finally { release(); }
    await delayed;
    expect(await reader.detail(caller, issue.id)).toMatchObject({ title: 'Inserted last' });
  });
  it('pages equal timestamps deterministically and binds cursors to actor, workspace, filters and target', async () => {
    const project = await seedProject();
    const round = await seedRound(project, 1);
    const ids = Array.from({ length: 3 }, () => randomUUID());
    const equalTime = new Date();
    await app.db.insert(validationIssues).values(ids.map((id, i) => ({ id, workspaceId: WORKSPACE, projectId: project, firstRoundId: round, title: `Equal ${i}`, body: 'Synthetic', reporterActorId: caller.actor_id, createdAt: equalTime })));
    const page1 = await reader.list(caller, { projectId: project }, { limit: 2 });
    const cursor = defined(page1.nextCursor);
    const page2 = await reader.list(caller, { projectId: project }, { limit: 2, cursor });
    expect([...page1.rows, ...page2.rows].map(r => r.id)).toEqual(ids.sort().reverse());
    await expect(reader.list(other, { projectId: project }, { limit: 2, cursor })).rejects.toThrow('cursor_invalid');
    await expect(reader.list({ ...caller, workspace_id: randomUUID() }, { projectId: project }, { limit: 2, cursor })).rejects.toThrow('cursor_invalid');
    await expect(reader.list(caller, { projectId }, { limit: 2, cursor })).rejects.toThrow('cursor_invalid');
    await expect(reader.list(caller, { projectId: project }, { limit: 2, cursor: `${cursor.slice(0, -3)}abc` })).rejects.toThrow('cursor_invalid');
    const issueId = defined(ids[0]);
    const commentIds = Array.from({ length: 3 }, () => randomUUID());
    const equalCommentTime = new Date();
    await app.db.insert(validationIssueComments).values(commentIds.map((id, i) => ({ id, workspaceId: WORKSPACE, issueId, body: `Equal comment ${i}`, authorActorId: caller.actor_id, createdAt: equalCommentTime })));
    const c1 = defined(await reader.comments(caller, { kind: 'issue', id: issueId }, { limit: 2 }));
    const c2 = defined(await reader.comments(caller, { kind: 'issue', id: issueId }, { limit: 2, cursor: defined(c1.nextCursor) }));
    expect([...c1.rows, ...c2.rows].map(r => r.id)).toEqual(commentIds.sort());
    await expect(reader.comments(caller, { kind: 'issue', id: defined(ids[1]) }, { limit: 2, cursor: c1.nextCursor })).rejects.toThrow('cursor_invalid');
  });
  it('treats a hidden project/round as missing and excludes its activity and counts after revocation', async () => {
    const project = await seedProject();
    const round = await seedRound(project, 1);
    const issue = await run('create', { projectId: project, firstRoundId: round, title: 'Hidden synthetic', body: 'Private description' });
    await run('linkOccurrence', { issueId: issue.id, roundId: round });
    await run('commentIssue', { issueId: issue.id, body: 'Hidden comment' });
    expect((await reader.list(other, { projectId: project })).rows).toMatchObject([{ id: issue.id, occurrenceCount: 1, roundCount: 1, commentCount: 1 }]);
    await migrate.pool.query("update knowledge.equipment_model set access_mode = 'restricted', row_version = row_version + 1 where id = (select model_id from log_lifecycle.development_project where id = $1)", [project]);
    expect((await reader.list(other, { projectId: project })).rows).toEqual([]);
    expect((await reader.list(other, { roundId: round })).rows).toEqual([]);
    expect(await reader.detail(other, issue.id)).toBeNull();
    expect(await reader.comments(other, { kind: 'issue', id: issue.id })).toBeNull();
    expect(await reader.occurrences(other, issue.id)).toBeNull();
    expect(await reader.history(other, issue.id)).toBeNull();
    expect(await reader.comments(other, { kind: 'round', id: round })).toBeNull();
    await expect(run('commentIssue', { issueId: issue.id, body: 'Refused after revocation' })).rejects.toMatchObject({ code: 'not_found.record' });
  });
  it('rolls rows and audits back together, emits body-free audits, and leaves machine rows unchanged', async () => {
    const before = (await app.pool.query('select row_to_json(a) as row from log_lifecycle.execution_attempt a where id = $1', [attemptId])).rows;
    const issue = await create('Private prose marker');
    await run('commentIssue', { issueId: issue.id, body: 'Private comment marker' });
    const audits = await auditRows(issue.id);
    expect(audits).toHaveLength(2);
    expect(audits.flatMap(a => Object.keys(a.detail)).sort()).toEqual(['commentId', 'correctsCommentId', 'firstRoundId', 'projectId']);
    expect(JSON.stringify(audits)).not.toMatch(/Private|synthetic\.log|fileRef|token|body|title|path/);
    const doomedId = randomUUID();
    await expect(app.db.transaction(async tx => {
      await tx.insert(validationIssues).values({ id: doomedId, workspaceId: WORKSPACE, projectId, firstRoundId: roundId, title: 'Rollback', body: 'Synthetic', reporterActorId: caller.actor_id });
      await service.handle(tx, caller, 'commentIssue', { issueId: doomedId, body: 'Rollback comment' });
      throw new Error('abort storage transaction');
    })).rejects.toThrow('abort storage transaction');
    expect(await reader.detail(caller, doomedId)).toBeNull();
    expect(await auditRows(doomedId)).toEqual([]);
    expect((await app.pool.query('select row_to_json(a) as row from log_lifecycle.execution_attempt a where id = $1', [attemptId])).rows).toEqual(before);
  });
});
