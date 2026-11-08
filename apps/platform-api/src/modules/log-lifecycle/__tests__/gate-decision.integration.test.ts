// #1446 e — Gate decision (`logLifecycle.gateDecide`) through the real `buildServer` over menu-action / menu-query against a
// real Postgres (throwaway DB only; app as platform_app, fixtures as platform_migrate). Needs migration 0113.
// The attempts a decision rests on are seeded rows (the queue has its own suite); the Gate reads them, never writes them.

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

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LGD${randomUUID().slice(0, 6).toUpperCase()}`;
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
type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('log lifecycle Gate decision (#1446 e)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let admin2: Person;
  let decider: Person; // developer holding lifecycle.gate.decide + round/project manage
  let plain: Person; // developer with project/round manage but no Gate right
  let user: Person;
  let vendorId = '';
  let systemId = '';
  const actorIds: string[] = [];
  const attachmentIds: string[] = [];
  const tokens: string[] = [];
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
  const grant = (who: Person, capability: string) =>
    sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id) values ($1,$2,$3,null,$4)`, [WORKSPACE_ID, who.id, capability, admin.id]);

  async function act(action: string, input: Record<string, unknown>, who: Person | { token: string } = admin, expectedVersion?: string): Promise<Answer> {
    const headers =
      'token' in who
        ? { 'content-type': 'application/json', authorization: `Bearer ${who.token}` }
        : { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf };
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers,
      payload: JSON.stringify({ action: `logLifecycle.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(expectedVersion === undefined ? {} : { expectedVersion }) }),
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
  const catalog = async (table: string, code: string, extra: Record<string, unknown> = {}) => {
    const cols = { workspace_id: WORKSPACE_ID, code, code_key: toCodeKey(code), name: code, created_by: admin.id, updated_by: admin.id, ...extra };
    const { rows } = await sql(`insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, i) => `$${i + 1}`).join(',')}) returning id`, Object.values(cols));
    return rows[0].id as string;
  };

  /** A project at `stage` with an open Round (opened at that stage). Stages are reached with the legal one-step actions. */
  async function makeRound(stage: 'registered' | 'kickoff' | 'alpha' | 'beta' = 'registered', opts: { software?: boolean } = {}) {
    const modelId = await catalog('equipment_model', `${TAG}-m${n++}`, { vendor_id: vendorId });
    const softwareId = opts.software
      ? ((
          await sql(
            `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$3,$3,$4,$4) returning id`,
            [WORKSPACE_ID, modelId, `${TAG}-sw${n++}`, admin.id],
          )
        ).rows[0].id as string)
      : null;
    const p = await act('projectCreate', { modelId, kind: 'new', ownerActorId: plain.id, ...(softwareId ? { softwareId } : {}) });
    expect(p.outcome, JSON.stringify(p)).toBe('ok');
    let version = p.data.version as string;
    for (const to of ['kickoff', 'alpha', 'beta'] as const) {
      if (['registered', 'kickoff', 'alpha', 'beta'].indexOf(to) > ['registered', 'kickoff', 'alpha', 'beta'].indexOf(stage)) break;
      const s = await act('projectSetStage', { id: p.data.projectId, toStage: to }, admin, version);
      expect(s.outcome, JSON.stringify(s)).toBe('ok');
      version = s.data.version;
    }
    const sampleSet = { files: [{ fileRef: `s3://${TAG}/f${n}.log`, order: 1, sha256: H('a') }], sourceOwner: 'fab-team' };
    const r = await act('roundOpen', { projectId: p.data.projectId, sampleSet }, admin);
    expect(r.outcome, JSON.stringify(r)).toBe('ok');
    return { projectId: p.data.projectId as string, roundId: r.data.roundId as string, modelId, softwareId };
  }
  const projectRow = async (id: string) => (await sql('select stage, row_version from log_lifecycle.development_project where id = $1', [id])).rows[0] as { stage: string; row_version: number };
  const version = async (id: string) => String((await projectRow(id)).row_version);
  const decisions = async (roundId: string) => (await sql('select * from log_lifecycle.gate_decision where round_id = $1 order by at, id', [roundId])).rows as Row[];
  const events = async (projectId: string) => (await sql(`select kind, before, after, actor_id from log_lifecycle.development_event where project_id = $1 order by seq`, [projectId])).rows as Row[];
  const gateAudit = async (roundId: string) => (await sql(`select detail, actor_id, subject_type from core.audit_log where subject_id = $1 and event_type = 'lifecycle.gate.decided'`, [roundId])).rows as Row[];

  /** Seeds a succeeded attempt with `verdict` for the Round (a request in state succeeded + its attempt). */
  async function seedAttempt(roundId: string, verdict: 'pass' | 'fail' | 'incomplete', requester: Person = plain) {
    const requestId = (
      await sql(
        `insert into log_lifecycle.execution_request (workspace_id, round_id, priority, state, request_digest, requested_by_actor_id, idempotency_key, attempt_count, ended_at)
         values ($1,$2,1,'succeeded',$3,$4,$5,1,now()) returning id`,
        [WORKSPACE_ID, roundId, H('c'), requester.id, randomUUID()],
      )
    ).rows[0].id as string;
    const attemptId = (
      await sql(
        `insert into log_lifecycle.execution_attempt (workspace_id, request_id, attempt_no, worker_actor_id, ended_at, outcome, rule_set_revision, input_manifest_digest, result_digest, verdict)
         values ($1,$2,1,$3,now(),'succeeded','rs-1',$4,$5,$6) returning id`,
        [WORKSPACE_ID, requestId, systemId, H('a'), H('e'), verdict],
      )
    ).rows[0].id as string;
    return { requestId, attemptId };
  }
  const decide = (round: { projectId: string; roundId: string }, input: Record<string, unknown>, who: Person | { token: string } = decider, v?: string) =>
    version(round.projectId).then((cur) => act('gateDecide', { roundId: round.roundId, reason: 'reviewed', ...input }, who, v ?? cur));

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
    admin2 = await person('admin');
    decider = await person('developer');
    plain = await person('developer');
    user = await person('user');
    await grant(decider, 'lifecycle.gate.decide');
    for (const who of [decider, plain]) {
      await grant(who, 'lifecycle.round.manage');
      await grant(who, 'lifecycle.project.manage');
    }
    systemId = (await sql("select id from core.actors where workspace_id = $1 and external_id = 'system'", [WORKSPACE_ID])).rows[0].id as string;
    vendorId = await catalog('vendor', `${TAG}-v`);
  }, 60_000);

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      for (const table of ['log_lifecycle.gate_decision', 'log_lifecycle.development_event']) {
        const trigger = table.endsWith('gate_decision') ? 'gate_decision_append_only' : 'development_event_append_only';
        await client.query(`alter table ${table} disable trigger ${trigger}`);
      }
      await client.query('delete from log_lifecycle.gate_decision where actor_id = any($1)', [actorIds]);
      await client.query('delete from log_lifecycle.development_event where actor_id = any($1)', [actorIds]);
      await client.query('alter table log_lifecycle.gate_decision enable trigger gate_decision_append_only');
      await client.query('alter table log_lifecycle.development_event enable trigger development_event_append_only');
      await client.query('delete from log_lifecycle.execution_attempt where request_id in (select id from log_lifecycle.execution_request where requested_by_actor_id = any($1))', [actorIds]);
      await client.query('delete from log_lifecycle.execution_request where requested_by_actor_id = any($1)', [actorIds]);
      await client.query('delete from log_lifecycle.validation_round where created_by = any($1)', [actorIds]);
      await client.query('delete from log_lifecycle.development_project where created_by = any($1)', [actorIds]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    await sql('delete from core.entity_links where created_by = any($1)', [actorIds]);
    await sql('delete from voc.voc_attachments where id = any($1)', [attachmentIds]);
    await sql('delete from core.api_tokens where workspace_id = $1 and (created_by = any($2) or actor_id = any($2))', [WORKSPACE_ID, actorIds]);
    for (const table of ['software_version', 'equipment_model', 'vendor']) {
      await sql(`delete from knowledge.${table} where workspace_id = $1 and created_by = any($2)`, [WORKSPACE_ID, actorIds]).catch(() => undefined);
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
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('who may decide (capability lifecycle.gate.decide: workspace scope, sensitive, session-only)', () => {
    it('refuses a cookie session without the capability: forbidden, no row, no stage change', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'pass');
      for (const who of [plain, user]) {
        const a = await decide(round, { targetStage: 'kickoff', decision: 'approved' }, who);
        expect(a.outcome).toBe('forbidden');
      }
      expect(await decisions(round.roundId)).toHaveLength(0);
      expect((await projectRow(round.projectId)).stage).toBe('registered');
    });

    it('a personal token and a service token are refused before any write, whatever their scopes (session-only)', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'pass');
      const personal = await app.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(decider.cookie), payload: { name: `${TAG}-p`, scopes: ['workspace.read'] } });
      expect(personal.statusCode, personal.body).toBe(201);
      const service = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(admin.cookie), payload: { name: `${TAG}-s`, scopes: ['workspace.read'], actorId: systemId } });
      expect(service.statusCode, service.body).toBe(201);
      tokens.push(personal.json<{ token: string }>().token, service.json<{ token: string }>().token);
      const tokenIds = [personal.json<{ item: { id: string } }>().item.id, service.json<{ item: { id: string } }>().item.id];
      for (const token of tokens.slice(-2)) {
        const a = await decide(round, { targetStage: 'kickoff', decision: 'approved' }, { token });
        expect(a.outcome).toBe('forbidden');
      }
      // Each refused high-risk attempt leaves exactly one denial audit row (ADR-0116), beside zero business writes.
      for (const tokenId of tokenIds) {
        const denied = await sql(`select 1 from core.audit_log where event_type = 'api_token.session_required_denied' and detail::text like $1`, [`%${tokenId}%`]);
        expect(denied.rows, tokenId).toHaveLength(1);
      }
      expect(await decisions(round.roundId)).toHaveLength(0);
      expect((await projectRow(round.projectId)).stage).toBe('registered');
      expect(await events(round.projectId)).toHaveLength(1); // 'created' only
    });

    it('lifecycle.gate.decide cannot be a token scope, a personal one or a service one', async () => {
      const personal = await app.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(decider.cookie), payload: { name: `${TAG}-x`, scopes: ['lifecycle.gate.decide'] } });
      expect(personal.statusCode).toBe(422);
      expect(personal.json().detail.fields).toEqual([{ path: ['scopes', 0], code: 'session_only' }]);
      const service = await app.inject({ method: 'POST', url: '/api-tokens/service', headers: cookieHeader(admin.cookie), payload: { name: `${TAG}-y`, scopes: ['lifecycle.gate.decide'], actorId: systemId } });
      expect(service.statusCode).toBe(422);
    });

    it('a service (system) actor has no session and so can never decide; its token is refused (session-only)', async () => {
      // The action also refuses a non-`internal_member` actor (defence in depth, unreachable over HTTP while a system actor cannot log in).
      const ext = `${TAG}-sys-session`;
      const sys = await sql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$3,$2,'developer','system') returning id`, [WORKSPACE_ID, ext, `${ext}@local`]);
      actorIds.push(sys.rows[0].id as string);
      await expect(loginAs(app, ext)).rejects.toThrow(/system actor cannot log in/);
    });

    it('an Admin passes through the module bypass; a grant holder passes; the bootstrap lists lifecycle:gate-decide for both only', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'pass');
      const a = await decide(round, { targetStage: 'kickoff', decision: 'approved' }, admin);
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const has = async (who: Person) => (await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(who.cookie) })).json<{ session: { user: { permissions: string[] } } }>().session.user.permissions.includes('lifecycle:gate-decide');
      expect([await has(admin), await has(decider), await has(plain), await has(user)]).toEqual([true, true, false, false]);
    });
  });

  describe('approved / exception / rejected', () => {
    it('approved over a pass moves the stage atomically with the event, the audit row and a version bump; the basis freezes the evidence', async () => {
      const round = await makeRound('registered');
      const { attemptId, requestId } = await seedAttempt(round.roundId, 'pass');
      const before = await projectRow(round.projectId);
      const a = await decide(round, { targetStage: 'kickoff', decision: 'approved', reason: 'all rules pass' });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const after = await projectRow(round.projectId);
      expect(after.stage).toBe('kickoff');
      expect(after.row_version).toBe(before.row_version + 1);
      const [row] = await decisions(round.roundId);
      expect(row).toMatchObject({ decision: 'approved', target_stage: 'kickoff', from_stage: 'registered', reason: 'all rules pass', actor_id: decider.id, exception: null });
      const basis = row?.basis as { attempts: Row[]; decisiveAttemptId: string; decisiveVerdict: string; requestDigest: string; sampleManifestDigest: string };
      expect(basis.decisiveAttemptId).toBe(attemptId);
      expect(basis.decisiveVerdict).toBe('pass');
      expect(basis.attempts).toEqual([expect.objectContaining({ attemptId, requestId, verdict: 'pass', ruleSetRevision: 'rs-1', inputManifestDigest: H('a') })]);
      expect(basis.requestDigest).toBe(H('c'));
      const ev = await events(round.projectId);
      expect(ev.at(-1)).toMatchObject({ kind: 'gate_decided', actor_id: decider.id, before: { stage: 'registered' }, after: expect.objectContaining({ stage: 'kickoff', decision: 'approved', targetStage: 'kickoff' }) });
      const audit = await gateAudit(round.roundId);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ subject_type: 'validation_round', actor_id: decider.id, detail: expect.objectContaining({ decision: 'approved', from: 'registered', targetStage: 'kickoff', attemptCount: 1, evidenceLinkCount: 0 }) });
      expect(JSON.stringify(audit[0]?.detail)).not.toContain('all rules pass');
    });

    it.each(['fail', 'incomplete'] as const)('approved over %s is refused (verdict_not_pass); nothing is written', async (verdict) => {
      const round = await makeRound();
      await seedAttempt(round.roundId, verdict);
      const a = await decide(round, { targetStage: 'kickoff', decision: 'approved' });
      expect(a.outcome).toBe('invalid');
      expect(fe(a)).toEqual(['decision:verdict_not_pass']);
      expect(await decisions(round.roundId)).toHaveLength(0);
      expect((await projectRow(round.projectId)).stage).toBe('registered');
    });

    it('approved with no attempt at all is refused', async () => {
      const round = await makeRound();
      const a = await decide(round, { targetStage: 'kickoff', decision: 'approved' });
      expect(fe(a)).toEqual(['decision:verdict_not_pass']);
    });

    it('only the most recent succeeded attempt counts: a later fail blocks an earlier pass', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'pass');
      await new Promise((r) => setTimeout(r, 15));
      await seedAttempt(round.roundId, 'fail');
      const a = await decide(round, { targetStage: 'kickoff', decision: 'approved' });
      expect(fe(a)).toEqual(['decision:verdict_not_pass']);
    });

    it.each(['fail', 'incomplete', 'none'] as const)('an exception passes over %s with a reason and riskAcceptedBy, is marked, and leaves the verdict untouched', async (verdict) => {
      const round = await makeRound();
      const seeded = verdict === 'none' ? null : await seedAttempt(round.roundId, verdict);
      const exception = { riskAcceptedBy: admin2.id, scope: 'kickoff only', until: '2026-12-31' };
      const a = await decide(round, { targetStage: 'kickoff', decision: 'exception', reason: 'deadline', exception });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect((await projectRow(round.projectId)).stage).toBe('kickoff');
      const [row] = await decisions(round.roundId);
      expect(row).toMatchObject({ decision: 'exception', exception });
      if (seeded) {
        const attempt = (await sql('select verdict, outcome from log_lifecycle.execution_attempt where id = $1', [seeded.attemptId])).rows[0];
        expect(attempt).toEqual({ verdict, outcome: 'succeeded' });
      }
      expect((await gateAudit(round.roundId))[0]?.detail).toMatchObject({ decision: 'exception', riskAcceptedBy: admin2.id });
    });

    it('an exception without a reason or without riskAcceptedBy is refused; an unknown accepting actor is refused; an exception over a pass is refused', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'fail');
      const noReason = await decide(round, { targetStage: 'kickoff', decision: 'exception', reason: ' ', exception: { riskAcceptedBy: admin2.id, scope: 's' } });
      expect(noReason.outcome).toBe('invalid');
      expect(fe(noReason)).toContain('reason:required');
      const noAccepter = await decide(round, { targetStage: 'kickoff', decision: 'exception', exception: { scope: 's' } });
      expect(fe(noAccepter)).toContain('exception.riskAcceptedBy:required');
      const noObject = await decide(round, { targetStage: 'kickoff', decision: 'exception' });
      expect(fe(noObject)).toContain('exception:required');
      const stranger = await decide(round, { targetStage: 'kickoff', decision: 'exception', exception: { riskAcceptedBy: randomUUID(), scope: 's' } });
      expect(fe(stranger)).toEqual(['exception.riskAcceptedBy:not_found']);
      expect(await decisions(round.roundId)).toHaveLength(0);
      const passRound = await makeRound();
      await seedAttempt(passRound.roundId, 'pass');
      const needless = await decide(passRound, { targetStage: 'kickoff', decision: 'exception', exception: { riskAcceptedBy: admin2.id, scope: 's' } });
      expect(fe(needless)).toEqual(['decision:exception_not_needed']);
    });

    it('rejected is always allowed with a reason, keeps the stage, is recorded and bumps the version', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'pass');
      const before = await projectRow(round.projectId);
      const missing = await decide(round, { targetStage: 'kickoff', decision: 'rejected', reason: '' });
      expect(fe(missing)).toContain('reason:required');
      const a = await decide(round, { targetStage: 'kickoff', decision: 'rejected', reason: 'not yet' });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const after = await projectRow(round.projectId);
      expect(after.stage).toBe('registered');
      expect(after.row_version).toBe(before.row_version + 1);
      expect((await decisions(round.roundId))[0]).toMatchObject({ decision: 'rejected', reason: 'not yet' });
      expect((await events(round.projectId)).at(-1)).toMatchObject({ kind: 'gate_decided', after: expect.objectContaining({ stage: 'registered', decision: 'rejected' }) });
    });
  });

  describe('project and Round rules', () => {
    it('refuses a target that is not the next stage', async () => {
      const round = await makeRound('registered');
      await seedAttempt(round.roundId, 'pass');
      for (const targetStage of ['alpha', 'completed']) {
        const a = await decide(round, { targetStage, decision: 'approved' });
        expect(fe(a), targetStage).toEqual(['targetStage:illegal_transition']);
      }
      expect((await projectRow(round.projectId)).stage).toBe('registered');
    });

    it('beta -> completed needs the project software_id; with it the project completes', async () => {
      const without = await makeRound('beta');
      await seedAttempt(without.roundId, 'pass');
      const refused = await decide(without, { targetStage: 'completed', decision: 'approved' });
      expect(fe(refused)).toEqual(['targetStage:software_required']);
      expect((await projectRow(without.projectId)).stage).toBe('beta');
      const withSoftware = await makeRound('beta', { software: true });
      await seedAttempt(withSoftware.roundId, 'pass');
      const ok = await decide(withSoftware, { targetStage: 'completed', decision: 'approved' });
      expect(ok.outcome, JSON.stringify(ok)).toBe('ok');
      expect((await projectRow(withSoftware.projectId)).stage).toBe('completed');
    });

    it('a rejection into completed is recorded without the project software_id; approval and exception are still refused', async () => {
      const round = await makeRound('beta');
      await seedAttempt(round.roundId, 'fail');
      const before = Number(await version(round.projectId));
      const eventsBefore = (await events(round.projectId)).length;
      for (const extra of [{ decision: 'approved' }, { decision: 'exception', exception: { riskAcceptedBy: admin2.id, scope: 's' } }]) {
        const refused = await decide(round, { targetStage: 'completed', ...extra });
        expect(fe(refused)).toContain('targetStage:software_required');
      }
      const ok = await decide(round, { targetStage: 'completed', decision: 'rejected' });
      expect(ok.outcome, JSON.stringify(ok)).toBe('ok');
      expect(await decisions(round.roundId)).toHaveLength(1);
      expect(await gateAudit(round.roundId)).toHaveLength(1);
      expect((await events(round.projectId)).length).toBe(eventsBefore + 1);
      expect((await events(round.projectId)).at(-1)).toMatchObject({ kind: 'gate_decided', after: expect.objectContaining({ stage: 'beta', decision: 'rejected' }) });
      expect(Number(await version(round.projectId))).toBe(before + 1);
      expect((await projectRow(round.projectId)).stage).toBe('beta');
    });

    it('refuses a Round that is not the newest, a Round opened at another stage, and a cancelled or completed project', async () => {
      const round = await makeRound('registered');
      await seedAttempt(round.roundId, 'pass');
      // A Round opened at the old stage cannot carry the next stage's decision.
      const first = await decide(round, { targetStage: 'kickoff', decision: 'approved' });
      expect(first.outcome).toBe('ok');
      const stale = await decide(round, { targetStage: 'alpha', decision: 'approved' });
      expect(fe(stale)).toEqual(['roundId:round_stage_mismatch']);
      // Not the newest Round of the project.
      const close = await act('roundClose', { id: round.roundId }, admin, (await sql('select row_version from log_lifecycle.validation_round where id = $1', [round.roundId])).rows[0].row_version.toString());
      expect(close.outcome).toBe('ok');
      const second = await act('roundOpen', { projectId: round.projectId, sampleSet: { files: [{ fileRef: `s3://${TAG}/second.log`, order: 1, sha256: H('b') }], sourceOwner: 'fab-team' } });
      expect(second.outcome).toBe('ok');
      const old = await decide(round, { targetStage: 'alpha', decision: 'rejected' });
      expect(fe(old)).toEqual(['roundId:round_not_current']);
      // Cancelled project.
      const cancelled = await makeRound();
      await act('projectSetStage', { id: cancelled.projectId, toStage: 'cancelled', reason: 'stop' }, admin, await version(cancelled.projectId));
      const refused = await decide(cancelled, { targetStage: 'kickoff', decision: 'rejected' });
      expect(fe(refused)).toEqual(['roundId:project_not_open']);
    });

    it('an unknown or foreign Round answers invalid not_found-style (no write)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', ...cookieHeader(decider.cookie), 'x-csrf-token': decider.csrf },
        payload: JSON.stringify({ action: 'logLifecycle.gateDecide', context: {}, input: { roundId: randomUUID(), targetStage: 'kickoff', decision: 'rejected', reason: 'x' }, idempotencyKey: randomUUID(), expectedVersion: '1' }),
      });
      expect(res.statusCode).toBe(200);
      expect(res.json<Answer>().outcome).not.toBe('ok');
    });

    it('two concurrent decisions on one project with the same expectedVersion: exactly one wins', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'pass');
      const v = await version(round.projectId);
      const results = await Promise.all([
        act('gateDecide', { roundId: round.roundId, targetStage: 'kickoff', decision: 'approved', reason: 'a' }, decider, v),
        act('gateDecide', { roundId: round.roundId, targetStage: 'kickoff', decision: 'rejected', reason: 'b' }, admin, v),
      ]);
      expect(results.map((r) => r.outcome).sort()).toEqual(['conflict', 'ok']);
      expect(await decisions(round.roundId)).toHaveLength(1);
    });

    it('self approval is allowed and flagged: the requester of the latest request decides; a Round without request marks its opener', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'pass', decider);
      const a = await decide(round, { targetStage: 'kickoff', decision: 'approved' });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      expect(a.data.selfApproved).toBe(true);
      expect((await decisions(round.roundId))[0]).toMatchObject({ self_approved: true });
      expect((await gateAudit(round.roundId))[0]?.detail).toMatchObject({ selfApproved: true });
      const other = await makeRound();
      await seedAttempt(other.roundId, 'pass', plain);
      const b = await decide(other, { targetStage: 'kickoff', decision: 'approved' });
      expect(b.data.selfApproved).toBe(false);
      const opener = await makeRound(); // opened by admin, no request
      const c = await decide(opener, { targetStage: 'kickoff', decision: 'rejected' }, admin);
      expect(c.data.selfApproved).toBe(true);
    });
  });

  describe('append-only and the evidence snapshot', () => {
    it('gate_decision UPDATE and DELETE are refused by the database for the app role and the migrate role', async () => {
      const round = await makeRound();
      await decide(round, { targetStage: 'kickoff', decision: 'rejected' });
      const id = (await decisions(round.roundId))[0]?.id;
      await expect(dbHandle.pool.query(`update log_lifecycle.gate_decision set reason = 'x' where id = $1`, [id])).rejects.toThrow();
      await expect(dbHandle.pool.query('delete from log_lifecycle.gate_decision where id = $1', [id])).rejects.toThrow();
      await expect(sql(`update log_lifecycle.gate_decision set reason = 'x' where id = $1`, [id])).rejects.toThrow(/append-only/);
      await expect(sql('delete from log_lifecycle.gate_decision where id = $1', [id])).rejects.toThrow(/append-only/);
      expect((await decisions(round.roundId))[0]?.reason).toBe('reviewed');
    });

    it('the basis holds the 수동 검증 첨부 (ids and link times only) and later attachments or attempts never edit a past row', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'fail');
      const id = randomUUID();
      const key = `${WORKSPACE_ID}/${id}/secret-name.txt`;
      await sql(`insert into voc.voc_attachments (id, name, size_bytes, mime_type, storage_key, uploaded_by_actor_id) values ($1,'secret-name.txt',3,'text/plain',$2,$3)`, [id, key, decider.id]);
      attachmentIds.push(id);
      const attach = await act('roundEvidenceAttach', { roundId: round.roundId, attachmentIds: [id] }, decider);
      expect(attach.outcome, JSON.stringify(attach)).toBe('ok');
      const a = await decide(round, { targetStage: 'kickoff', decision: 'exception', exception: { riskAcceptedBy: admin2.id, scope: 's' } });
      expect(a.outcome, JSON.stringify(a)).toBe('ok');
      const [row] = await decisions(round.roundId);
      const basis = row?.basis as { evidenceLinks: { attachmentId: string; linkedAt: string }[] };
      expect(basis.evidenceLinks).toEqual([{ attachmentId: id, linkedAt: expect.any(String) }]);
      expect(JSON.stringify(row?.basis)).not.toContain('secret-name');
      const frozen = JSON.stringify(row?.basis);
      await seedAttempt(round.roundId, 'pass');
      expect(JSON.stringify((await decisions(round.roundId))[0]?.basis)).toBe(frozen);
    });
  });

  describe('reads', () => {
    it('a token can read a Round hint but cannot decide; a read adds no denied-mutation audit (#1447)', async () => {
      const round = await makeRound();
      const issued = await app.inject({ method: 'POST', url: '/api-tokens', headers: cookieHeader(admin.cookie), payload: { name: `${TAG}-hint`, scopes: ['workspace.read'] } });
      expect(issued.statusCode).toBe(201);
      const item = issued.json<{ token: string; item: { id: string } }>();
      const res = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { authorization: `Bearer ${item.token}` }, payload: { endpoint: 'logLifecycle.roundDetail', context: {}, params: { roundId: round.roundId } } });
      expect(res.statusCode).toBe(200);
      expect(res.json<Answer>().outcome, res.body).toBe('ok');
      expect(res.json<Answer>().data.gateAvailability.reasons).toContain('session_required');
      expect(res.json<Answer>().data.gateAvailability.decisions.rejected.allowed).toBe(false);
      expect((await sql("select id from core.audit_log where event_type = 'api_token.session_required_denied' and detail::text like $1", [`%${item.item.id}%`])).rows).toEqual([]);
      expect(await decisions(round.roundId)).toHaveLength(0);
    });

    it('roundDetail supplies human decision availability and server refusal reasons (#1447)', async () => {
      const round = await makeRound();
      const before = await read('roundDetail', { roundId: round.roundId }, decider);
      expect(before.data.gateAvailability).toMatchObject({ targetStage: 'kickoff', decisions: { approved: { allowed: false, reasons: ['verdict_not_pass'] }, rejected: { allowed: true }, exception: { allowed: true } } });
      const denied = await read('roundDetail', { roundId: round.roundId }, plain);
      expect(denied.data.gateAvailability.reasons).toContain('permission_denied');
      await seedAttempt(round.roundId, 'pass');
      const ready = await read('roundDetail', { roundId: round.roundId }, decider);
      expect(ready.data.gateAvailability.decisions.approved.allowed).toBe(true);
      expect(ready.data.gateAvailability.decisions.exception.reasons).toContain('exception_not_needed');
      expect(ready.data.gateAvailability.projectVersion).toBe(await version(round.projectId));
      expect(await decisions(round.roundId)).toHaveLength(0);
    });

    it('roundDetail carries the Gate history oldest first with selfApproved and the basis summary; projectDetail the current Gate state', async () => {
      const round = await makeRound();
      await seedAttempt(round.roundId, 'pass', decider);
      expect((await decide(round, { targetStage: 'kickoff', decision: 'rejected', reason: 'first look' })).outcome).toBe('ok');
      expect((await decide(round, { targetStage: 'kickoff', decision: 'approved', reason: 'second look' })).outcome).toBe('ok');
      const detail = await read('roundDetail', { roundId: round.roundId }, plain);
      expect(detail.outcome).toBe('ok');
      expect(detail.data.gateDecisions.map((d: Row) => d.decision)).toEqual(['rejected', 'approved']);
      expect(detail.data.gateDecisions[1]).toMatchObject({ targetStage: 'kickoff', reason: 'second look', selfApproved: true, decidedBy: { id: decider.id }, basisSummary: { attemptCount: 1, decisiveVerdict: 'pass', evidenceLinkCount: 0 } });
      const project = await read('projectDetail', { projectId: round.projectId }, user);
      expect(project.data.gateTarget).toBe('alpha');
      expect(project.data.gate).toMatchObject({ decisionCount: 2, latest: { decision: 'approved', targetStage: 'kickoff' } });
      expect(project.data.gate.latest.basis).toBeUndefined();
    });

    it('an unknown Round answers ok with null', async () => {
      const detail = await read('roundDetail', { roundId: randomUUID() });
      expect(detail).toMatchObject({ outcome: 'ok', data: null });
    });
  });
});
