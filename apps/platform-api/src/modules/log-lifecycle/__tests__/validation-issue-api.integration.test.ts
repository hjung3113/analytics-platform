import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../../../config.js';
import { createDb, type DbHandle } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { defined } from '../../../test-support/defined.js';
import { createValidationIssueService } from '../validation-issue-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const tag = `N2${randomUUID().slice(0, 8)}`;
const id = () => randomUUID();
const reads = ['validationIssues', 'validationIssueDetail', 'validationIssueThread', 'validationIssueHistory', 'roundDiscussion'];
const actions = ['validationIssueRegister', 'validationIssueComment', 'validationIssueCorrect', 'validationIssueLinkOccurrence', 'validationIssueLinkEvidence', 'roundDiscussionComment'];
interface Person { id: string; cookie: string; csrf: string }
interface Answer {
  outcome: string;
  data: unknown;
  replayed?: boolean;
  fieldErrors?: { path: string[]; code: string }[];
}
interface Page { rows: { id: string; body?: string; commentCount?: number }[]; nextCursor?: string }
const pageOf = (answer: Answer) => answer.data as Page;
const idOf = (answer: Answer) => (answer.data as { id: string }).id;
const detailOf = (answer: Answer) => answer.data as { occurrences: { rows: unknown[] } };
const tables = ['validation_issue_evidence_ref', 'validation_issue_occurrence', 'validation_issue_comment', 'round_comment', 'validation_issue_event', 'validation_issue'];

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE)('human validation issue menu API (#1808 N2)', () => {
  let app: FastifyInstance;
  let db: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let viewer: Person;
  let writer: Person;
  let linker: Person;
  let projectId: string;
  let roundId: string;
  let issueId: string;
  let occurrenceId: string;
  let modelId: string;
  let vendorId: string;
  let requestId: string;
  let machineBefore: unknown;
  let service: ReturnType<typeof createValidationIssueService>;
  const people: string[] = [];
  const tokens: string[] = [];
  const query = (text: string, values: unknown[] = []) => migrate.pool.query(text, values);
  const cookie = (who: Person) => ({ cookie: `${SESSION_COOKIE_NAME}=${who.cookie}` });
  const headers = (who: Person | string, write = false) => typeof who === 'string' ? { authorization: `Bearer ${who}` } : { ...cookie(who), ...(write ? { 'x-csrf-token': who.csrf } : {}) };
  const params = (name: string) => name === 'validationIssues' ? { projectId } : name === 'roundDiscussion' ? { roundId } : { issueId };
  const input = (name: string): Record<string, unknown> => ({
    validationIssueRegister: { projectId, firstRoundId: roundId, title: 'Synthetic observation', body: 'Synthetic body' },
    validationIssueComment: { issueId, body: 'Synthetic comment' },
    validationIssueCorrect: { issueId, field: 'title', body: 'Synthetic correction' },
    validationIssueLinkOccurrence: { issueId, roundId },
    validationIssueLinkEvidence: { occurrenceId, refs: [{ fileRef: 'synthetic.log', line: 1, fileSha256: 'b'.repeat(64) }] },
    roundDiscussionComment: { roundId, body: 'Synthetic discussion' },
  })[name] ?? {};
  async function read(name: string, value: Record<string, unknown> = params(name), who: Person | string = viewer) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: headers(who), payload: { endpoint: `logLifecycle.${name}`, context: {}, params: value } });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function act(name: string, value = input(name), who: Person | string = writer, key = id()) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: headers(who, true), payload: { action: `logLifecycle.${name}`, context: {}, input: value, idempotencyKey: key } });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function person(roleLevel: 'admin' | 'user' = 'user') {
    const externalId = `${tag}-${people.length}`;
    const row = await insertActorRow(db, { workspaceId: WORKSPACE, externalId, roleLevel });
    people.push(row.id);
    const session = await loginAs(app, externalId);
    const who = { id: row.id, cookie: session, csrf: '' };
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookie(who) });
    who.csrf = boot.json<{ csrfToken: string }>().csrfToken;
    return who;
  }
  async function grant(who: Person, capability: string) {
    await query('insert into permission.permission_grants (workspace_id,actor_id,capability,granted_by_actor_id) values ($1,$2,$3,$4)', [WORKSPACE, who.id, capability, admin.id]);
  }
  const machineSnapshot = async () => (await query(`select
    (select jsonb_agg(to_jsonb(r)) from log_lifecycle.validation_round r where r.id=$1) as round,
    (select jsonb_agg(to_jsonb(q)) from log_lifecycle.execution_request q where q.round_id=$1) as requests,
    (select jsonb_agg(to_jsonb(a)) from log_lifecycle.execution_attempt a where a.request_id=$2) as attempts,
    (select jsonb_agg(to_jsonb(r)) from log_lifecycle.rule_result r join log_lifecycle.execution_attempt a on a.id=r.attempt_id where a.request_id=$2) as results,
    (select jsonb_agg(to_jsonb(o)) from log_lifecycle.attempt_opinion o join log_lifecycle.execution_attempt a on a.id=o.attempt_id where a.request_id=$2) as opinions,
    (select jsonb_agg(to_jsonb(g)) from log_lifecycle.gate_decision g where g.round_id=$1) as gate`, [roundId, requestId])).rows;
  const caller = (who: Person) => ({ workspace_id: WORKSPACE, actor_id: who.id });
  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    admin = await person('admin');
    viewer = await person();
    writer = await person();
    linker = await person();
    await grant(writer, 'lifecycle.issue.contribute');
    await grant(linker, 'lifecycle.issue.link');
    service = createValidationIssueService({ db: db.db });
    vendorId = String(defined((await query('insert into knowledge.vendor (workspace_id,code,code_key,name,created_by,updated_by) values ($1,$2,$3,$2,$4,$4) returning id', [WORKSPACE, tag, tag.toLowerCase(), writer.id])).rows[0]).id);
    modelId = String(defined((await query('insert into knowledge.equipment_model (workspace_id,vendor_id,code,code_key,name,created_by,updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id', [WORKSPACE, vendorId, tag, tag.toLowerCase(), writer.id])).rows[0]).id);
    projectId = String(defined((await query("insert into log_lifecycle.development_project (workspace_id,model_id,kind,owner_actor_id,created_by,updated_by) values ($1,$2,'new',$3,$3,$3) returning id", [WORKSPACE, modelId, writer.id])).rows[0]).id);
    roundId = String(defined((await query("insert into log_lifecycle.validation_round (workspace_id,project_id,seq,stage,status,sample_set,sample_manifest_digest,created_by,updated_by,closed_by,closed_at) values ($1,$2,1,'registered','closed',$3,$4,$5,$5,$5,now()) returning id", [WORKSPACE, projectId, JSON.stringify({ files: [{ fileRef: 'synthetic.log', order: 1, sha256: 'a'.repeat(64) }], sourceOwner: 'synthetic' }), 'a'.repeat(64), writer.id])).rows[0]).id);
    issueId = (await service.execute(caller(writer), 'create', input('validationIssueRegister'), id())).id;
    occurrenceId = (await service.execute(caller(linker), 'linkOccurrence', { issueId, roundId }, id())).id;
    requestId = String(defined((await query('insert into log_lifecycle.execution_request (workspace_id,round_id,priority,request_digest,requested_by_actor_id,idempotency_key) values ($1,$2,1,$3,$4,$5) returning id', [WORKSPACE, roundId, 'a'.repeat(64), writer.id, id()])).rows[0]).id);
    const attemptId = String(defined((await query('insert into log_lifecycle.execution_attempt (workspace_id,request_id,attempt_no,worker_actor_id,input_manifest_digest) values ($1,$2,1,$3,$4) returning id', [WORKSPACE, requestId, writer.id, 'a'.repeat(64)])).rows[0]).id);
    await query("insert into log_lifecycle.rule_result (workspace_id,attempt_id,rule_id,result,required) values ($1,$2,'synthetic-rule','FAIL',true)", [WORKSPACE, attemptId]);
    machineBefore = await machineSnapshot();
    const system = String(defined((await query("select id from core.actors where workspace_id=$1 and external_id='system'", [WORKSPACE])).rows[0]).id);
    for (const scopes of [['validation.worker'], ['workspace.read'], []]) {
      const res = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookie(admin), payload: { actorId: system, name: `${tag}-${tokens.length}`, scopes } });
      expect(res.statusCode, res.body).toBe(201);
      tokens.push(res.json<{ token: string }>().token);
    }
  }, 60_000);
  afterAll(async () => {
    if (!migrate) return;
    const c = await migrate.pool.connect();
    try {
      await c.query('begin');
      for (const table of tables) await c.query(`alter table log_lifecycle.${table} disable trigger ${table}_append_only`);
      for (const table of tables) await c.query(`delete from log_lifecycle.${table} where workspace_id=$1 and ${table === 'round_comment' ? 'round_id=$2' : table === 'validation_issue' ? 'project_id=$3' : table === 'validation_issue_evidence_ref' ? 'occurrence_id in (select id from log_lifecycle.validation_issue_occurrence where project_id=$3)' : 'issue_id in (select id from log_lifecycle.validation_issue where project_id=$3)'} and $2::uuid is not null and $3::uuid is not null`, [WORKSPACE, roundId, projectId]);
      for (const table of tables) await c.query(`alter table log_lifecycle.${table} enable trigger ${table}_append_only`);
      await c.query('delete from log_lifecycle.rule_result where attempt_id in (select id from log_lifecycle.execution_attempt where request_id=$1)', [requestId]);
      await c.query('delete from log_lifecycle.execution_attempt where request_id=$1', [requestId]);
      await c.query('delete from log_lifecycle.execution_request where id=$1', [requestId]);
      await c.query('delete from log_lifecycle.validation_round where project_id=$1', [projectId]);
      await c.query('delete from log_lifecycle.development_project where id=$1', [projectId]);
      await c.query('delete from knowledge.equipment_model where id=$1', [modelId]);
      await c.query('delete from knowledge.vendor where id=$1', [vendorId]);
      await c.query('delete from core.api_tokens where created_by=any($1)', [people]);
      for (const [table, column] of [['permission.permission_grants', 'actor_id'], ['core.idempotency_keys', 'actor_id'], ['core.audit_log', 'actor_id'], ['core.sessions', 'actor_id'], ['core.actors', 'id']]) await c.query(`delete from ${table} where ${column}=any($1)`, [people]);
      await c.query('commit');
    } catch (e) { await c.query('rollback'); throw e; } finally { c.release(); }
    await app?.close();
    await db?.close();
    await migrate.close();
  });

  it.each(reads)('%s refuses every service token scope', async name => {
    for (const token of tokens) expect((await read(name, params(name), token)).outcome).toBe('forbidden');
  });
  it.each(actions)('%s refuses every service token scope', async name => {
    for (const token of tokens) expect((await act(name, input(name), token)).outcome).toBe('forbidden');
  });
  it.each(reads)('%s admits a read-only viewer and rejects unknown keys', async name => {
    expect((await read(name)).outcome).toBe('ok');
    expect((await read(name, { ...params(name), unknown: true })).outcome).toBe('error');
  });
  it.each(actions)('%s requires its narrow capability for visible targets', async name => {
    // Fresh actors keep each mutation bucket within its real limit.
    const without = await person();
    if (name !== 'validationIssueCorrect') {
      expect((await act(name, input(name), without)).outcome).toBe('forbidden');
      return;
    }
    // The caller reports the issue itself, so only the capability (not the reporter guard) can refuse.
    const own = { ...input(name), issueId: (await service.execute(caller(without), 'create', input('validationIssueRegister'), id())).id };
    expect((await act(name, own, without)).outcome).toBe('forbidden');
    await grant(without, 'lifecycle.issue.contribute');
    const key = id();
    expect((await act(name, own, without, key)).outcome).toBe('ok');
    await query('update permission.permission_grants set revoked_at=now(),revoked_by_actor_id=$2 where actor_id=$1', [without.id, admin.id]);
    expect((await act(name, own, without, key)).outcome).toBe('forbidden');
    expect((await act(name, { ...own, body: 'Synthetic second correction' }, without)).outcome).toBe('forbidden');
  });
  it.each(actions)('%s replays exactly once with a body-free audit and rejects unknown input', async name => {
    const who = await person();
    await grant(who, 'lifecycle.issue.contribute');
    await grant(who, 'lifecycle.issue.link');
    const target = await service.execute(caller(who), 'create', input('validationIssueRegister'), id());
    const value = { ...input(name) };
    if ('issueId' in value) value.issueId = target.id;
    if (name === 'validationIssueLinkEvidence') value.occurrenceId = (await service.execute(caller(who), 'linkOccurrence', { issueId: target.id, roundId }, id())).id;
    const count = async () => Number(defined((await query('select count(*)::int as n from core.audit_log where actor_id=$1', [who.id])).rows[0]).n);
    const before = await count();
    const key = id();
    const first = await act(name, value, who, key);
    expect(first.outcome).toBe('ok');
    expect(await act(name, value, who, key)).toMatchObject({ outcome: 'ok', data: first.data, replayed: true });
    expect(await count()).toBe(before + 1);
    const audits = (await query('select summary,detail from core.audit_log where actor_id=$1', [who.id])).rows;
    expect(JSON.stringify(audits)).not.toMatch(/Synthetic|synthetic\.log|fileRef|"title":|"body":/);
    expect((await act(name, { ...value, unknown: true }, who)).outcome).toBe('invalid');
  });
  it('accepts UUID letter case when checking registration ownership', async () => {
    const who = await person();
    await grant(who, 'lifecycle.issue.contribute');
    expect((await act('validationIssueRegister', { ...input('validationIssueRegister'), projectId: projectId.toUpperCase(), firstRoundId: roundId.toUpperCase() }, who)).outcome).toBe('ok');
  });
  it('keeps the session CSRF guard on human writes', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: cookie(writer), payload: { action: 'logLifecycle.validationIssueComment', context: {}, input: input('validationIssueComment'), idempotencyKey: id() } });
    expect(res.statusCode).toBe(403);
  });
  it('registers on a closed Round, replays once, refuses changed content and emits body-free audit', async () => {
    const who = await person();
    await grant(who, 'lifecycle.issue.contribute');
    const key = id();
    const value = input('validationIssueRegister');
    const first = await act('validationIssueRegister', value, who, key);
    expect(first.outcome).toBe('ok');
    expect(await act('validationIssueRegister', value, who, key)).toMatchObject({ outcome: 'ok', replayed: true, data: first.data });
    expect(await act('validationIssueRegister', { ...value, body: 'Changed' }, who, key)).toMatchObject({ outcome: 'error', fieldErrors: [{ path: ['idempotencyKey'], code: 'idempotency_key_reuse' }] });
    const audit = (await query('select detail from core.audit_log where subject_id=$1', [idOf(first)])).rows;
    expect(audit).toHaveLength(1);
    expect(audit[0]?.detail).toEqual({ projectId, firstRoundId: roundId });
    expect((await act('validationIssueRegister', { ...value, verdict: 'pass' }, who)).outcome).toBe('invalid');
  });
  it('keeps Round discussion and issue thread/counts separate and accepts closed-Round comments', async () => {
    const who = await person();
    await grant(who, 'lifecycle.issue.contribute');
    const comment = await act('validationIssueComment', { issueId, body: 'Issue only' }, who);
    expect(comment.outcome).toBe('ok');
    expect((await act('roundDiscussionComment', { roundId, body: 'Round only' }, who)).outcome).toBe('ok');
    expect(pageOf(await read('validationIssueThread')).rows.map(r => r.body)).toContain('Issue only');
    expect(pageOf(await read('validationIssueThread')).rows.map(r => r.body)).not.toContain('Round only');
    expect(pageOf(await read('roundDiscussion')).rows.map(r => r.body)).toContain('Round only');
    expect(defined(pageOf(await read('validationIssues')).rows.find(r => r.id === issueId)).commentCount).toBe(1);
    expect((await act('validationIssueComment', { issueId, body: 'Own correction', correctsCommentId: idOf(comment) }, who)).outcome).toBe('ok');
    expect((await act('validationIssueComment', { issueId, body: 'Foreign correction', correctsCommentId: idOf(comment) }, writer)).outcome).toBe('forbidden');
  });
  it('links occurrences and evidence without Source rights and corrects only own text', async () => {
    expect((await act('validationIssueLinkOccurrence', input('validationIssueLinkOccurrence'), linker)).outcome).toBe('ok');
    expect((await act('validationIssueLinkEvidence', input('validationIssueLinkEvidence'), linker)).outcome).toBe('ok');
    expect((await act('validationIssueCorrect')).outcome).toBe('ok');
    const other = await person();
    await grant(other, 'lifecycle.issue.contribute');
    expect((await act('validationIssueCorrect', input('validationIssueCorrect'), other)).outcome).toBe('forbidden');
    expect(detailOf(await read('validationIssueDetail')).occurrences.rows).toMatchObject([{ id: occurrenceId, evidence: [{ fileRef: 'synthetic.log', fileSha256: 'b'.repeat(64) }] }]);
  });
  it('revokes a capability in the same session before replay and the next write', async () => {
    const who = await person();
    await grant(who, 'lifecycle.issue.contribute');
    const key = id();
    const value = input('roundDiscussionComment');
    expect((await act('roundDiscussionComment', value, who, key)).outcome).toBe('ok');
    await query('update permission.permission_grants set revoked_at=now(),revoked_by_actor_id=$2 where actor_id=$1', [who.id, admin.id]);
    expect((await act('roundDiscussionComment', value, who, key)).outcome).toBe('forbidden');
    expect((await act('roundDiscussionComment', value, who)).outcome).toBe('forbidden');
  });
  it('keeps the pinned Round, request, attempt, result, opinion and Gate rows unchanged', async () => {
    expect(await machineSnapshot()).toEqual(machineBefore);
  });
  it.each(reads)('%s treats an unknown direct id as missing', async name => {
    const unknown = name === 'validationIssues' ? { projectId: id() } : name === 'roundDiscussion' ? { roundId: id() } : { issueId: id() };
    expect(await read(name, unknown)).toMatchObject({ outcome: 'ok', data: name === 'validationIssues' ? { rows: [] } : null });
  });
  it('hides direct ids, counts and cursor continuations after object access is revoked', async () => {
    for (let n = 0; n < 2; n++) await service.execute(caller(writer), 'create', input('validationIssueRegister'), id());
    const page = await read('validationIssues', { projectId, limit: 1 });
    expect(pageOf(page).nextCursor).toBeTypeOf('string');
    const key = id();
    const who = await person();
    await grant(who, 'lifecycle.issue.contribute');
    const value = input('validationIssueComment');
    expect((await act('validationIssueComment', value, who, key)).outcome).toBe('ok');
    await query("update knowledge.equipment_model set access_mode='restricted',row_version=row_version+1 where id=$1", [modelId]);
    for (const name of reads) expect(await read(name)).toMatchObject({ outcome: 'ok', data: name === 'validationIssues' ? { rows: [] } : null });
    expect(await read('validationIssues', { projectId, limit: 1, cursor: pageOf(page).nextCursor })).toMatchObject({ outcome: 'ok', data: { rows: [] } });
    expect(await read('validationIssues', { roundId })).toMatchObject({ outcome: 'ok', data: { rows: [] } });
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: headers(who, true), payload: { action: 'logLifecycle.validationIssueComment', context: {}, input: value, idempotencyKey: key } });
    expect(res.statusCode === 404 || res.json<Answer>().outcome === 'not_found', res.body).toBe(true);
  });
});
