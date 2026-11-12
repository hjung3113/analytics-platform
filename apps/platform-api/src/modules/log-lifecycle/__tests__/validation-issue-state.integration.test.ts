// #1808 H3: issue states through the menu API. Needs migration 0130 (validation_issue_transition).
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
import type { IssueState } from '../domain/validation-issue-states.js';
import { createValidationIssueService } from '../validation-issue-service.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE = process.env.WORKSPACE_ID ?? '';
const tag = `H3${randomUUID().slice(0, 8)}`;
const id = () => randomUUID();
type Role = 'admin' | 'developer' | 'user';
interface Person { id: string; cookie: string; csrf: string }
interface Answer { outcome: string; data: unknown; version?: string | null; replayed?: boolean; fieldErrors?: { path: string[]; code: string }[] }
interface ListRow { id: string; state: string; assigneeActorId: string | null }
interface ListPage { rows: ListRow[]; nextCursor?: string; counts: { open: number; closed: number; byState: Record<string, number> } }
interface Transition { id: string; seq: number; fromState: string; toState: string; reason: string | null; occurrenceId: string | null; duplicateOfIssueId: string | null }
const tables = ['validation_issue_transition', 'validation_issue_evidence_ref', 'validation_issue_occurrence', 'validation_issue_comment', 'round_comment', 'validation_issue_event', 'validation_issue'];

describe.skipIf(!APP_URL || !MIGRATE_URL || !WORKSPACE)('human validation issue states (#1808 H3)', () => {
  let app: FastifyInstance;
  let db: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let viewer: Person;
  let contributor: Person;
  let linker: Person;
  let projectId: string;
  let otherProjectId: string;
  let firstRoundId: string;
  let modelId: string;
  let vendorId: string;
  let roundSeq = 1;
  let machineBefore: unknown;
  let service: ReturnType<typeof createValidationIssueService>;
  const people: string[] = [];
  const tokens: string[] = [];
  const query = (text: string, values: unknown[] = []) => migrate.pool.query(text, values);
  const cookie = (who: Person) => ({ cookie: `${SESSION_COOKIE_NAME}=${who.cookie}` });
  const headers = (who: Person | string, write = false) => typeof who === 'string' ? { authorization: `Bearer ${who}` } : { ...cookie(who), ...(write ? { 'x-csrf-token': who.csrf } : {}) };
  const caller = (who: Person) => ({ workspace_id: WORKSPACE, actor_id: who.id });
  async function read(name: string, params: Record<string, unknown>, who: Person = viewer) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: headers(who), payload: { endpoint: `logLifecycle.${name}`, context: {}, params } });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function change(input: Record<string, unknown>, expectedVersion: string, who: Person | string, key = id()) {
    const res = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: headers(who, true), payload: { action: 'logLifecycle.validationIssueChangeState', context: {}, input, idempotencyKey: key, expectedVersion } });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  async function person(roleLevel: Role = 'user') {
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
  async function triager(withGate = false) {
    const who = await person('developer');
    await grant(who, 'lifecycle.issue.triage');
    if (withGate) await grant(who, 'lifecycle.gate.decide');
    return who;
  }
  async function newRound(project = projectId) {
    roundSeq += 1;
    return String(defined((await query("insert into log_lifecycle.validation_round (workspace_id,project_id,seq,stage,status,sample_set,sample_manifest_digest,created_by,updated_by,closed_by,closed_at) values ($1,$2,$3,'registered','closed',$4,$5,$6,$6,$6,now()) returning id", [WORKSPACE, project, roundSeq, JSON.stringify({ files: [{ fileRef: 'synthetic.log', order: 1, sha256: 'a'.repeat(64) }], sourceOwner: 'synthetic' }), 'a'.repeat(64), admin.id])).rows[0]).id);
  }
  const newIssue = async (project = projectId, round = firstRoundId) => (await service.execute(caller(contributor), 'create', { projectId: project, firstRoundId: round, title: 'Synthetic observation', body: 'Synthetic body' }, id())).id;
  const comment = async (issueId: string) => (await service.execute(caller(contributor), 'commentIssue', { issueId, body: 'Synthetic vendor answer' }, id())).id;
  const occurrence = async (issueId: string, roundId: string) => (await service.execute(caller(linker), 'linkOccurrence', { issueId, roundId }, id())).id;
  /** A complete, valid input for one step of a walk. */
  async function stepInput(issueId: string, from: IssueState, to: IssueState, seq: number, who: Person): Promise<Record<string, unknown>> {
    const input: Record<string, unknown> = { issueId, toState: to, assigneeActorId: who.id };
    if (seq > 1 || to === 'dismissed') input.reason = `Synthetic reason ${seq}`;
    if (to === 'on_hold' || to === 'waived' || (to === 'by_design' && from === 'vendor_inquiry')) input.basisCommentId = await comment(issueId);
    if (to === 'fix_verified') input.occurrenceId = await occurrence(issueId, await newRound());
    return input;
  }
  async function walk(path: IssueState[], who: Person) {
    const issueId = await newIssue();
    let from: IssueState = 'reported';
    for (const [n, to] of path.entries()) {
      const answer = await change(await stepInput(issueId, from, to, n + 1, who), String(n), who);
      expect(answer, `${from} -> ${to}`).toMatchObject({ outcome: 'ok', version: String(n + 1), data: { seq: n + 1, state: to } });
      from = to;
    }
    return issueId;
  }
  const machineSnapshot = async () => (await query(`select
    (select jsonb_agg(to_jsonb(r)) from log_lifecycle.validation_round r where r.id=$2) as round,
    (select count(*) from log_lifecycle.gate_decision g join log_lifecycle.validation_round r on r.id=g.round_id where r.project_id=$1) as gate,
    (select jsonb_agg(to_jsonb(p)) from log_lifecycle.development_project p where p.id=$1) as project`, [projectId, firstRoundId])).rows;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    db = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle: db });
    await app.ready();
    admin = await person('admin');
    viewer = await person();
    contributor = await person();
    linker = await person();
    service = createValidationIssueService({ db: db.db });
    vendorId = String(defined((await query('insert into knowledge.vendor (workspace_id,code,code_key,name,created_by,updated_by) values ($1,$2,$3,$2,$4,$4) returning id', [WORKSPACE, tag, tag.toLowerCase(), admin.id])).rows[0]).id);
    modelId = String(defined((await query('insert into knowledge.equipment_model (workspace_id,vendor_id,code,code_key,name,created_by,updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id', [WORKSPACE, vendorId, tag, tag.toLowerCase(), admin.id])).rows[0]).id);
    projectId = String(defined((await query("insert into log_lifecycle.development_project (workspace_id,model_id,kind,owner_actor_id,created_by,updated_by) values ($1,$2,'new',$3,$3,$3) returning id", [WORKSPACE, modelId, admin.id])).rows[0]).id);
    // A second (cancelled) project of the same model, for the same-project duplicate rule.
    otherProjectId = String(defined((await query("insert into log_lifecycle.development_project (workspace_id,model_id,kind,stage,owner_actor_id,created_by,updated_by) values ($1,$2,'redevelopment','cancelled',$3,$3,$3) returning id", [WORKSPACE, modelId, admin.id])).rows[0]).id);
    firstRoundId = await newRound();
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
      const projects = [projectId, otherProjectId];
      for (const table of tables) await c.query(`alter table log_lifecycle.${table} disable trigger ${table}_append_only`);
      for (const table of tables) {
        const where = table === 'round_comment' ? 'round_id in (select id from log_lifecycle.validation_round where project_id=any($2))'
          : table === 'validation_issue' || table === 'validation_issue_occurrence' || table === 'validation_issue_transition' ? 'project_id=any($2)'
          : table === 'validation_issue_evidence_ref' ? 'occurrence_id in (select id from log_lifecycle.validation_issue_occurrence where project_id=any($2))'
          : 'issue_id in (select id from log_lifecycle.validation_issue where project_id=any($2))';
        await c.query(`delete from log_lifecycle.${table} where workspace_id=$1 and ${where}`, [WORKSPACE, projects]);
      }
      for (const table of tables) await c.query(`alter table log_lifecycle.${table} enable trigger ${table}_append_only`);
      await c.query('delete from log_lifecycle.validation_round where project_id=any($1)', [projects]);
      await c.query('delete from log_lifecycle.development_project where id=any($1)', [projects]);
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

  it('starts every issue in reported with no transition', async () => {
    await grant(contributor, 'lifecycle.issue.contribute');
    await grant(linker, 'lifecycle.issue.link');
    const issueId = await newIssue();
    expect(await read('validationIssueDetail', { issueId })).toMatchObject({ outcome: 'ok', data: { state: 'reported', assigneeActorId: null, lastTransition: null } });
    const row = (await read('validationIssues', { projectId })).data as ListPage;
    expect(defined(row.rows.find(r => r.id === issueId))).toMatchObject({ state: 'reported', assigneeActorId: null });
    expect((await read('validationIssueHistory', { issueId, of: 'transitions' })).data).toEqual({ rows: [] });
  });

  // Seven walks cover all 20 legal pairs; each walk uses a fresh actor to stay inside its request budget.
  it.each([
    [['investigating', 'fix_requested', 'investigating', 'vendor_inquiry', 'investigating', 'on_hold', 'investigating', 'by_design']],
    [['investigating', 'fix_requested', 'vendor_inquiry', 'fix_requested', 'on_hold', 'investigating', 'waived']],
    [['investigating', 'vendor_inquiry', 'on_hold', 'investigating', 'fix_requested', 'waived']],
    [['investigating', 'vendor_inquiry', 'by_design']],
    [['investigating', 'vendor_inquiry', 'waived']],
    [['investigating', 'fix_requested', 'fix_verified', 'investigating', 'dismissed']],
    [['dismissed']],
  ] as [IssueState[]][])('walks %j', async path => {
    const who = await triager(true);
    const issueId = await walk(path, who);
    const history = (await read('validationIssueHistory', { issueId, of: 'transitions', limit: 3 })).data as { rows: Transition[]; nextCursor?: string };
    expect(history.rows.map(r => r.seq)).toEqual([1, 2, 3].slice(0, path.length));
    if (history.nextCursor) {
      const next = (await read('validationIssueHistory', { issueId, of: 'transitions', limit: 3, cursor: history.nextCursor })).data as { rows: Transition[] };
      expect(next.rows[0]?.seq).toBe(4);
    }
    expect(await read('validationIssueDetail', { issueId })).toMatchObject({ data: { state: path.at(-1), lastTransition: { seq: path.length, toState: path.at(-1) } } });
  });

  it('refuses an illegal pair and missing reason, assignee and basis comment', async () => {
    const who = await triager();
    const issueId = await newIssue();
    expect(await change({ issueId, toState: 'fix_verified', reason: 'x' }, '0', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['toState'], code: 'illegal_transition' }] });
    expect(await change({ issueId, toState: 'investigating' }, '0', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['assigneeActorId'], code: 'required' }] });
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: who.id }, '0', who)).outcome).toBe('ok');
    expect(await change({ issueId, toState: 'fix_requested', assigneeActorId: who.id }, '1', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['reason'], code: 'required' }] });
    expect(await change({ issueId, toState: 'on_hold', assigneeActorId: who.id, reason: 'r' }, '1', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['basisCommentId'], code: 'required' }] });
    const foreignComment = await comment(await newIssue());
    expect(await change({ issueId, toState: 'on_hold', assigneeActorId: who.id, reason: 'r', basisCommentId: foreignComment }, '1', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['basisCommentId'], code: 'not_found' }] });
    expect(await change({ issueId, toState: 'investigating', assigneeActorId: who.id, reason: 'r', verdict: 'pass' }, '1', who)).toMatchObject({ outcome: 'invalid' });
    expect(await change({ issueId, toState: 'fix_requested', assigneeActorId: id(), reason: 'r' }, '1', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['assigneeActorId'], code: 'not_found' }] });
  });

  it('accepts fix_verified only with an occurrence of this issue from a Round opened after fix_requested', async () => {
    const who = await triager();
    const issueId = await newIssue();
    const early = await occurrence(issueId, firstRoundId);
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: who.id }, '0', who)).outcome).toBe('ok');
    expect((await change({ issueId, toState: 'fix_requested', assigneeActorId: who.id, reason: 'defect' }, '1', who)).outcome).toBe('ok');
    const base = { issueId, toState: 'fix_verified', assigneeActorId: who.id, reason: 'fixed log observed' };
    expect(await change({ ...base, occurrenceId: early }, '2', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['occurrenceId'], code: 'round_too_early' }] });
    const later = await newRound();
    const foreign = await occurrence(await newIssue(), later);
    expect(await change({ ...base, occurrenceId: foreign }, '2', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['occurrenceId'], code: 'not_found' }] });
    expect(await change(base, '2', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['occurrenceId'], code: 'required' }] });
    const fresh = await occurrence(issueId, later);
    expect(await change({ ...base, occurrenceId: fresh }, '2', who)).toMatchObject({ outcome: 'ok', data: { state: 'fix_verified' } });
    const rows = ((await read('validationIssueHistory', { issueId, of: 'transitions' })).data as { rows: Transition[] }).rows;
    expect(rows.at(-1)).toMatchObject({ seq: 3, fromState: 'fix_requested', toState: 'fix_verified', occurrenceId: fresh });
  });

  it('answers conflict on a stale seq (ABA too) and writes once for a repeated key', async () => {
    const who = await triager();
    const issueId = await newIssue();
    const key = id();
    const first = { issueId, toState: 'investigating', assigneeActorId: who.id };
    const [a, b] = await Promise.all([change(first, '0', who, key), change(first, '0', who, key)]);
    expect([a.outcome, b.outcome]).toEqual(['ok', 'ok']);
    expect([a.replayed ?? false, b.replayed ?? false].filter(Boolean)).toHaveLength(1);
    expect(await change(first, '0', who)).toMatchObject({ outcome: 'conflict', version: '1' });
    expect((await change({ issueId, toState: 'on_hold', assigneeActorId: who.id, reason: 'r', basisCommentId: await comment(issueId) }, '1', who)).outcome).toBe('ok');
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: who.id, reason: 'back' }, '2', who)).outcome).toBe('ok');
    // Same state as at seq 1, but the old version no longer matches.
    expect(await change({ issueId, toState: 'fix_requested', assigneeActorId: who.id, reason: 'r' }, '1', who)).toMatchObject({ outcome: 'conflict', version: '3' });
    expect(Number(defined((await query('select count(*)::int as n from log_lifecycle.validation_issue_transition where issue_id=$1', [issueId])).rows[0]).n)).toBe(3);
  });

  it.each([0, 1, 2])('refuses service token %i before any write', async n => {
    const issueId = await newIssue();
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: admin.id }, '0', defined(tokens[n]))).outcome).toBe('forbidden');
  });

  it('needs lifecycle.issue.triage; a User holding the grant row is still refused', async () => {
    const issueId = await newIssue();
    const plain = await person('developer');
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: plain.id }, '0', plain)).outcome).toBe('forbidden');
    const asAdmin = await person('admin');
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: asAdmin.id }, '0', asAdmin)).outcome).toBe('forbidden');
    const user = await person('user');
    await grant(user, 'lifecycle.issue.triage');
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: user.id }, '0', user)).outcome).toBe('forbidden');
  });

  it('refuses a User recipient of lifecycle.issue.triage through the direct-grant path and admits a Developer', async () => {
    const direct = async (who: Person) => app.inject({ method: 'POST', url: '/permissions/grants', headers: { ...cookie(admin), 'idempotency-key': id() }, payload: { actor_id: who.id, capability: 'lifecycle.issue.triage', reason: 'synthetic triage grant' } });
    const refused = await direct(await person('user'));
    expect(refused.json<{ code: string }>().code, refused.body).toBe('validation.failed');
    expect((await direct(await person('developer'))).statusCode).toBe(201);
  });

  it('needs lifecycle.gate.decide on waived only; on_hold passes with triage alone', async () => {
    const who = await triager();
    const issueId = await newIssue();
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: who.id }, '0', who)).outcome).toBe('ok');
    const basisCommentId = await comment(issueId);
    expect((await change({ issueId, toState: 'waived', assigneeActorId: who.id, reason: 'agreed', basisCommentId }, '1', who)).outcome).toBe('forbidden');
    expect((await change({ issueId, toState: 'on_hold', assigneeActorId: who.id, reason: 'vendor cannot fix', basisCommentId }, '1', who)).outcome).toBe('ok');
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: who.id, reason: 'resumed' }, '2', who)).outcome).toBe('ok');
    const decider = await triager(true);
    expect((await change({ issueId, toState: 'waived', assigneeActorId: who.id, reason: 'agreed', basisCommentId }, '3', decider)).outcome).toBe('ok');
  });

  it('dismisses only from reported/investigating, with a duplicate of another issue of the same project', async () => {
    const who = await triager();
    const issueId = await newIssue();
    const original = await newIssue();
    expect(await change({ issueId, toState: 'dismissed', reason: 'duplicate', duplicateOfIssueId: issueId }, '0', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['duplicateOfIssueId'], code: 'self' }] });
    const elsewhere = await newIssue(otherProjectId, await newRound(otherProjectId));
    expect(await change({ issueId, toState: 'dismissed', reason: 'duplicate', duplicateOfIssueId: elsewhere }, '0', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['duplicateOfIssueId'], code: 'other_project' }] });
    expect(await change({ issueId, toState: 'dismissed', reason: 'duplicate', duplicateOfIssueId: original }, '0', who)).toMatchObject({ outcome: 'ok', data: { state: 'dismissed' } });
    expect(await change({ issueId, toState: 'investigating', assigneeActorId: who.id, reason: 'reopen' }, '1', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['toState'], code: 'illegal_transition' }] });
    const late = await newIssue();
    expect((await change({ issueId: late, toState: 'investigating', assigneeActorId: who.id }, '0', who)).outcome).toBe('ok');
    expect((await change({ issueId: late, toState: 'fix_requested', assigneeActorId: who.id, reason: 'defect' }, '1', who)).outcome).toBe('ok');
    expect(await change({ issueId: late, toState: 'dismissed', assigneeActorId: who.id, reason: 'mistake' }, '2', who)).toMatchObject({ outcome: 'invalid', fieldErrors: [{ path: ['toState'], code: 'illegal_transition' }] });
  });

  it('filters and counts by state under the same visibility, binds the filter to the cursor and answers hidden ids as missing', async () => {
    const who = await triager();
    const held = await newIssue();
    expect((await change({ issueId: held, toState: 'investigating', assigneeActorId: who.id }, '0', who)).outcome).toBe('ok');
    const paused = await newIssue();
    expect((await change({ issueId: paused, toState: 'investigating', assigneeActorId: who.id }, '0', who)).outcome).toBe('ok');
    expect((await change({ issueId: paused, toState: 'on_hold', assigneeActorId: who.id, reason: 'hold', basisCommentId: await comment(paused) }, '1', who)).outcome).toBe('ok');
    const page = (await read('validationIssues', { projectId, states: ['investigating'] })).data as ListPage;
    expect(page.rows.map(r => r.id)).toContain(held);
    expect(page.rows.every(r => r.state === 'investigating')).toBe(true);
    expect(defined(page.rows.find(r => r.id === held)).assigneeActorId).toBe(who.id);
    const all = (await read('validationIssues', { projectId, limit: 1 })).data as ListPage;
    expect(all.counts.open + all.counts.closed).toBe(Object.values(all.counts.byState).reduce((a, b) => a + b, 0));
    expect(all.counts).toEqual(page.counts);
    expect(all.counts.byState.investigating).toBeGreaterThanOrEqual(1);
    expect(all.counts.byState.on_hold).toBeGreaterThanOrEqual(1);
    // A cursor minted without the state filter is refused with one.
    expect(await read('validationIssues', { projectId, limit: 1, states: ['reported'], cursor: all.nextCursor })).toMatchObject({ outcome: 'error' });
    // Round-level counts only count issues of that Round.
    const roundOnly = await newRound();
    const inRound = await newIssue(projectId, roundOnly);
    expect(((await read('validationIssues', { roundId: roundOnly })).data as ListPage).counts).toMatchObject({ open: 1, closed: 0, byState: { reported: 1 } });
    // Hidden model: no rows, zero counts, missing detail/history and a missing write target.
    await query("update knowledge.equipment_model set access_mode='restricted',row_version=row_version+1 where id=$1", [modelId]);
    try {
      expect(await read('validationIssues', { projectId })).toMatchObject({ outcome: 'ok', data: { rows: [], counts: { open: 0, closed: 0 } } });
      expect(await read('validationIssueDetail', { issueId: inRound })).toMatchObject({ outcome: 'ok', data: null });
      expect(await read('validationIssueHistory', { issueId: held, of: 'transitions' })).toMatchObject({ outcome: 'ok', data: null });
      const res = await app.inject({ method: 'POST', url: '/api/v1/menu-action', headers: headers(who, true), payload: { action: 'logLifecycle.validationIssueChangeState', context: {}, input: { issueId: held, toState: 'fix_requested', assigneeActorId: who.id, reason: 'r' }, idempotencyKey: id(), expectedVersion: '1' } });
      expect(res.statusCode === 404 || res.json<Answer>().outcome === 'not_found', res.body).toBe(true);
    } finally {
      await query("update knowledge.equipment_model set access_mode='internal',row_version=row_version+1 where id=$1", [modelId]);
    }
  });

  it('writes one body-free audit row per transition and leaves machine rows untouched', async () => {
    const who = await triager();
    const issueId = await newIssue();
    expect((await change({ issueId, toState: 'investigating', assigneeActorId: who.id }, '0', who)).outcome).toBe('ok');
    expect((await change({ issueId, toState: 'fix_requested', assigneeActorId: who.id, reason: 'Synthetic private reason' }, '1', who)).outcome).toBe('ok');
    const audits = (await query("select detail from core.audit_log where actor_id=$1 and event_type='lifecycle.validation_issue.state_changed' order by created_at", [who.id])).rows;
    expect(audits.map(a => a.detail)).toMatchObject([{ seq: 1, fromState: 'reported', toState: 'investigating' }, { seq: 2, fromState: 'investigating', toState: 'fix_requested' }]);
    expect(JSON.stringify(audits)).not.toMatch(/Synthetic|reason/);
    expect(await machineSnapshot()).toEqual(machineBefore);
  });

  it('keeps transitions append-only for the runtime role', async () => {
    await expect(db.pool.query('update log_lifecycle.validation_issue_transition set reason=$1 where project_id=$2', ['x', projectId])).rejects.toThrow();
    await expect(db.pool.query('delete from log_lifecycle.validation_issue_transition where project_id=$1', [projectId])).rejects.toThrow();
  });

  // The database walls on their own: direct INSERTs through the migrate role, bypassing the API checks. Every refused
  // row is otherwise valid, so exactly one guard (trigger or named CHECK/UNIQUE/FK) answers and its removal fails here.
  describe('SQL guards without the API', () => {
    const put = (row: Record<string, unknown>) => {
      const cols = Object.keys(row);
      return query(`insert into log_lifecycle.validation_issue_transition (${cols.join(',')}) values (${cols.map((_, n) => `$${n + 1}`).join(',')})`, Object.values(row));
    };
    const trigger = (message: RegExp) => ({ code: '23514', message: expect.stringMatching(message) as unknown });
    const check = (name: string) => ({ code: '23514', constraint: `validation_issue_transition_${name}_check` });
    /** A fresh issue with transitions inserted directly up to `fix_requested` (seq 2) or `investigating` (seq 1). */
    async function chain(upTo: 'investigating' | 'fix_requested') {
      const issueId = await newIssue();
      const base = { workspace_id: WORKSPACE, project_id: projectId, issue_id: issueId, actor_id: admin.id, assignee_actor_id: admin.id };
      await put({ ...base, seq: 1, from_state: 'reported', to_state: 'investigating' });
      if (upTo === 'fix_requested') await put({ ...base, seq: 2, from_state: 'investigating', to_state: 'fix_requested', reason: 'r' });
      return { issueId, base, next: upTo === 'fix_requested' ? 3 : 2 };
    }

    it('refuses an illegal pair and a broken chain in the trigger', async () => {
      const issueId = await newIssue();
      const base = { workspace_id: WORKSPACE, project_id: projectId, issue_id: issueId, actor_id: admin.id, assignee_actor_id: admin.id };
      await expect(put({ ...base, seq: 1, from_state: 'reported', to_state: 'fix_requested' })).rejects.toMatchObject(trigger(/cannot move/));
      await put({ ...base, seq: 1, from_state: 'reported', to_state: 'investigating' });
      // Gap: seq 3 after seq 1.
      await expect(put({ ...base, seq: 3, from_state: 'investigating', to_state: 'fix_requested', reason: 'r' })).rejects.toMatchObject(trigger(/does not continue/));
      // Mismatched from_state: the previous to_state is investigating.
      await expect(put({ ...base, seq: 2, from_state: 'vendor_inquiry', to_state: 'investigating', reason: 'r' })).rejects.toMatchObject(trigger(/does not continue/));
      await put({ ...base, seq: 2, from_state: 'investigating', to_state: 'fix_requested', reason: 'r' });
      await expect(put({ ...base, seq: 3, from_state: 'fix_requested', to_state: 'dismissed', reason: 'r' })).rejects.toMatchObject(trigger(/cannot move/));
    });

    it('refuses a duplicate seq and a first transition that does not leave reported', async () => {
      const { base } = await chain('investigating');
      await expect(put({ ...base, seq: 1, from_state: 'reported', to_state: 'dismissed', reason: 'r' })).rejects.toMatchObject({ code: '23505', constraint: 'validation_issue_transition_seq_uq' });
      const other = await newIssue();
      await expect(put({ ...base, issue_id: other, seq: 1, from_state: 'investigating', to_state: 'fix_requested' })).rejects.toMatchObject(check('seq'));
    });

    it('refuses missing reason, assignee and basis comment through their CHECKs', async () => {
      const { base, next, issueId } = await chain('investigating');
      const step = { ...base, seq: next, from_state: 'investigating' };
      await expect(put({ ...step, to_state: 'fix_requested' })).rejects.toMatchObject(check('reason'));
      await expect(put({ ...step, to_state: 'fix_requested', reason: 'r', assignee_actor_id: null })).rejects.toMatchObject(check('assignee'));
      await expect(put({ ...step, to_state: 'on_hold', reason: 'r' })).rejects.toMatchObject(check('basis'));
      // A basis comment of another issue fails the same-issue FK.
      await expect(put({ ...step, to_state: 'on_hold', reason: 'r', basis_comment_id: await comment(await newIssue()) })).rejects.toMatchObject({ code: '23503', constraint: 'validation_issue_transition_basis_fk' });
      await put({ ...step, to_state: 'on_hold', reason: 'r', basis_comment_id: await comment(issueId) });
    });

    it('refuses fix_verified without a later-Round occurrence and an occurrence on any other move', async () => {
      const { base, next, issueId } = await chain('fix_requested');
      const step = { ...base, seq: next, from_state: 'fix_requested', reason: 'r' };
      await expect(put({ ...step, to_state: 'fix_verified' })).rejects.toMatchObject(trigger(/needs an occurrence/));
      const early = await occurrence(issueId, firstRoundId);
      await expect(put({ ...step, to_state: 'fix_verified', occurrence_id: early })).rejects.toMatchObject(trigger(/needs an occurrence/));
      const later = await occurrence(issueId, await newRound());
      await expect(put({ ...step, to_state: 'investigating', occurrence_id: later })).rejects.toMatchObject(check('occurrence'));
      await put({ ...step, to_state: 'fix_verified', occurrence_id: later });
    });

    it('refuses duplicate_of_issue_id on a non-dismissed row, on itself and across projects', async () => {
      const { base, next, issueId } = await chain('investigating');
      const original = await newIssue();
      await expect(put({ ...base, seq: next, from_state: 'investigating', to_state: 'fix_requested', reason: 'r', duplicate_of_issue_id: original })).rejects.toMatchObject(check('duplicate'));
      await expect(put({ ...base, seq: next, from_state: 'investigating', to_state: 'dismissed', reason: 'r', duplicate_of_issue_id: issueId })).rejects.toMatchObject(check('duplicate'));
      const elsewhere = await newIssue(otherProjectId, await newRound(otherProjectId));
      await expect(put({ ...base, seq: next, from_state: 'investigating', to_state: 'dismissed', reason: 'r', duplicate_of_issue_id: elsewhere })).rejects.toMatchObject({ code: '23503', constraint: 'validation_issue_transition_duplicate_fk' });
      await put({ ...base, seq: next, from_state: 'investigating', to_state: 'dismissed', reason: 'r', duplicate_of_issue_id: original });
    });

    it('keeps transitions append-only for the migrate role through the trigger', async () => {
      const { issueId } = await chain('investigating');
      await expect(query('update log_lifecycle.validation_issue_transition set reason=$1 where issue_id=$2', ['x', issueId])).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/append-only/) as unknown });
      await expect(query('delete from log_lifecycle.validation_issue_transition where issue_id=$1', [issueId])).rejects.toMatchObject({ code: '23514', message: expect.stringMatching(/append-only/) as unknown });
    });
  });

  describe('replay rejudges the rights after the target lock', () => {
    const revoke = (who: Person) => query("update permission.permission_grants set revoked_at=now(),revoked_by_actor_id=$2 where actor_id=$1 and capability='lifecycle.issue.triage'", [who.id, admin.id]);

    it('refuses a replay after the triage grant is revoked', async () => {
      const who = await triager();
      const issueId = await newIssue();
      const key = id();
      const input = { issueId, toState: 'investigating', assigneeActorId: who.id };
      expect((await change(input, '0', who, key)).outcome).toBe('ok');
      await revoke(who);
      expect((await change(input, '0', who, key)).outcome).toBe('forbidden');
    });

    it('refuses a replay whose triage grant is revoked while it waits for the project lock', async () => {
      const who = await triager();
      const issueId = await newIssue();
      const key = id();
      const input = { issueId, toState: 'investigating', assigneeActorId: who.id };
      expect((await change(input, '0', who, key)).outcome).toBe('ok');
      const holder = await migrate.pool.connect();
      try {
        await holder.query('begin');
        await holder.query('select id from log_lifecycle.development_project where id=$1 for update', [projectId]);
        const pending = change(input, '0', who, key);
        // Wait until the replay is queued behind the held project row (pg_locks is readable by every role).
        const deadline = Date.now() + 10_000;
        for (;;) {
          const waiting = Number(defined((await query('select count(*)::int as n from pg_locks where not granted and pid <> $1', [defined((await holder.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]).pid])).rows[0]).n);
          if (waiting > 0) break;
          if (Date.now() > deadline) throw new Error('the replay never waited for the project lock');
          await new Promise(r => setTimeout(r, 50));
        }
        await revoke(who);
        await holder.query('commit');
        expect(await pending).toMatchObject({ outcome: 'forbidden' });
      } finally {
        await holder.query('rollback').catch(() => undefined);
        holder.release();
      }
      expect(Number(defined((await query('select count(*)::int as n from log_lifecycle.validation_issue_transition where issue_id=$1', [issueId])).rows[0]).n)).toBe(1);
    });
  });
});
