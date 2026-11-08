// #1198 (c) — Agent / Validator draft submission over API tokens, through the real `buildServer` and a real Postgres
// (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`). Needs migration 0104 (validator ref columns) on top
// of 0101 (api tokens) and 0102/0103 (drafts, review). Tokens are inserted directly (like api-tokens.integration.test.ts).

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { hashToken } from '../../api-tokens/token-format.js';
import { toCodeKey } from '../domain/code-key.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `DTK${randomUUID().slice(0, 6).toUpperCase()}`;

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
  replayed: boolean;
}
type Row = Record<string, unknown>;
interface Token {
  value: string;
  id: string;
}

describe.skipIf(!runIntegration)('knowledge draft submission over API tokens (#1198 c)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: Person;
  let human: Person; // Developer: knowledge.draft.create + knowledge.item.publish
  let sysActorId: string;
  let modelId = '';
  const actorIds: string[] = [];
  const tokenIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const fe = (a: Answer) => a.fieldErrors.map((e) => `${e.path.join('.')}:${e.code}`);
  const title = (label: string) => `${TAG} ${label}`;
  const proposal = (label: string, extra: Row = {}) => ({ ownerModelId: modelId, typeCode: 'anomaly', title: title(label), observation: `o ${label}`, ...extra });

  async function person(roleLevel: 'admin' | 'developer' | 'user', capabilities: string[] = []): Promise<Person> {
    const externalId = `${TAG}-${roleLevel}-${n++}`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
    actorIds.push(id);
    await grant(id, capabilities);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    return { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
  }
  async function grant(actorId: string, capabilities: string[]) {
    for (const capability of capabilities) {
      await sql(
        `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
         values ($1, $2, $3, null, $4)`,
        [WORKSPACE_ID, actorId, capability, admin?.id ?? actorId],
      );
    }
  }
  async function systemActor(capabilities: string[]): Promise<string> {
    const externalId = `${TAG}-sys-${n++}`;
    const res = await sql(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, 'user', 'system') returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@local`],
    );
    const id = res.rows[0].id as string;
    actorIds.push(id);
    await grant(id, capabilities);
    return id;
  }

  /** A token row inserted directly (the only way to get a session-only scope, an expired or a revoked token). */
  async function rawToken(over: { actorId: string; scopes: string[]; kind?: 'personal' | 'service'; expiresAt?: string | null; revoked?: boolean }): Promise<Token> {
    const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
    const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
    const res = await sql(
      `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, expires_at, revoked_at, created_by)
       values ($1,$2,$3,'raw',$4,$5,$6,$7,$8,$9) returning id`,
      [WORKSPACE_ID, over.actorId, over.kind ?? 'service', prefix, hashToken(value), over.scopes, over.expiresAt ?? null, over.revoked ? new Date() : null, over.kind === 'personal' ? over.actorId : admin.id],
    );
    const id = res.rows[0].id as string;
    tokenIds.push(id);
    return { value, id };
  }

  async function tokenAct(token: Token, action: string, input: Record<string, unknown>, opts: { expectedVersion?: string; key?: string } = {}): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.value}` },
      payload: JSON.stringify({
        action: `logKnowledge.${action}`,
        context: {},
        input,
        idempotencyKey: opts.key ?? randomUUID(),
        ...(opts.expectedVersion === undefined ? {} : { expectedVersion: opts.expectedVersion }),
      }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }
  async function sessionAct(who: Person, action: string, input: Record<string, unknown>, expectedVersion?: string): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-action',
      headers: { 'content-type': 'application/json', ...cookieHeader(who.cookie), 'x-csrf-token': who.csrf },
      payload: JSON.stringify({ action: `logKnowledge.${action}`, context: {}, input, idempotencyKey: randomUUID(), ...(expectedVersion === undefined ? {} : { expectedVersion }) }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  }
  const tokenRead = async (token: Token, endpoint: string, params: Record<string, unknown>) => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token.value}` },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ outcome: string; data: { rows: { id: string }[] } }>();
  };

  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0] as Row | undefined;
  const draftRow = (id: string) => one('select * from knowledge.draft where id = $1', [id]);
  const draftRevs = async (id: string) => (await sql('select * from knowledge.draft_revision where draft_id = $1 order by draft_rev_no', [id])).rows as Row[];
  const audit = async (id: string) => (await sql('select event_type, actor_id, detail from core.audit_log where subject_id = $1 order by created_at, id', [id])).rows as Row[];
  const counts = async () => (await one('select (select count(*) from knowledge.draft)::int as drafts, (select count(*) from knowledge.draft_revision)::int as revs, (select count(*) from knowledge.knowledge_item)::int as items', [])) as Row;
  const ref = (over: Row = {}) => ({ sourceSystem: `${TAG}-val`, runId: `run-${randomUUID().slice(0, 8)}`, findingId: 'f-1', ...over });

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    admin = await person('admin');
    human = await person('developer', ['knowledge.draft.create', 'knowledge.item.publish']);
    sysActorId = await systemActor(['knowledge.draft.create']);
    const common = { workspace_id: WORKSPACE_ID, created_by: admin.id, updated_by: admin.id };
    const vendor = (await sql('insert into knowledge.vendor (workspace_id, created_by, updated_by, name, code, code_key) values ($1,$2,$3,$4,$4,$5) returning id', [WORKSPACE_ID, common.created_by, common.updated_by, `${TAG}-v`, toCodeKey(`${TAG}-v`)])).rows[0].id as string;
    modelId = (
      await sql('insert into knowledge.equipment_model (workspace_id, created_by, updated_by, name, code, code_key, vendor_id, active) values ($1,$2,$3,$4,$4,$5,$6,true) returning id', [WORKSPACE_ID, common.created_by, common.updated_by, `${TAG}-m`, toCodeKey(`${TAG}-m`), vendor])
    ).rows[0].id as string;
  });

  // Token calls are rate limited per token (10/min): clear this file's token buckets before each test.
  beforeEach(async () => {
    if (tokenIds.length > 0) await sql('delete from core.rate_limits where key like any($1)', [tokenIds.map((id) => `${WORKSPACE_ID}:token:${id}%`)]);
    if (actorIds.length > 0) await sql('delete from core.rate_limits where key like any($1)', [actorIds.map((id) => `${WORKSPACE_ID}:${id}%`)]);
  });

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
    await sql('delete from core.audit_log where detail::text like any($1)', [tokenIds.map((id) => `%${id}%`)]);
    await sql('delete from knowledge.equipment_model where created_by = any($1)', [actorIds]);
    await sql('delete from knowledge.vendor where created_by = any($1)', [actorIds]);
    await sql('delete from core.api_tokens where workspace_id = $1 and (created_by = any($2) or actor_id = any($2))', [WORKSPACE_ID, actorIds]);
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

  const serviceToken = (scopes = ['knowledge.draft.create', 'workspace.read']) => rawToken({ actorId: sysActorId, scopes });

  describe('service token create', () => {
    it('writes an ai draft with a token revision and an audit row carrying the token id', async () => {
      const t = await serviceToken();
      const a = await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('ai-1') });
      expect(a.outcome).toBe('ok');
      const id = a.data.id as string;
      expect(await draftRow(id)).toMatchObject({ origin: 'ai', submitter_actor_id: sysActorId, validator_source_system: null, validator_run_id: null, validator_finding_id: null });
      expect((await draftRevs(id))[0]).toMatchObject({ author_actor_id: sysActorId, author_auth: 'token' });
      const log = await audit(id);
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ event_type: 'knowledge.draft.created', actor_id: sysActorId });
      expect(JSON.stringify(log[0]?.detail)).toContain(t.id);
    });

    it('a token update and submit append token revisions too, and the token may withdraw its own draft', async () => {
      const t = await serviceToken();
      const a = await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('ai-upd') });
      const u = await tokenAct(t, 'draftUpdate', { id: a.data.id, proposal: proposal('ai-upd', { observation: 'changed' }) }, { expectedVersion: a.version as string });
      expect(u.outcome).toBe('ok');
      expect((await draftRevs(a.data.id)).map((r) => r.author_auth)).toEqual(['token', 'token']);
      const s = await tokenAct(t, 'draftSubmit', { id: a.data.id }, { expectedVersion: u.version as string });
      expect(s.outcome).toBe('ok');
      expect(await draftRow(a.data.id)).toMatchObject({ status: 'submitted', origin: 'ai' });
    });

    it('with a validatorRef the draft is a validator draft with the ref stored', async () => {
      const t = await serviceToken();
      const r = ref();
      const a = await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('val-1'), validatorRef: { sourceSystem: ` ${r.sourceSystem} `, runId: r.runId, findingId: r.findingId } });
      expect(a.outcome).toBe('ok');
      expect(await draftRow(a.data.id)).toMatchObject({ origin: 'validator', validator_source_system: r.sourceSystem, validator_run_id: r.runId, validator_finding_id: r.findingId });
    });

    it('resending the same ref with a new idempotency key answers the same draft: 1 draft, 1 revision, 1 create audit', async () => {
      const t = await serviceToken();
      const r = ref();
      const first = await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('val-replay'), validatorRef: r });
      const before = await counts();
      const second = await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('val-replay'), validatorRef: r });
      expect(second.outcome).toBe('ok');
      expect(second.data).toEqual(first.data);
      expect(await counts()).toEqual(before);
      expect(await draftRevs(first.data.id)).toHaveLength(1);
      expect((await audit(first.data.id)).filter((e) => e.event_type === 'knowledge.draft.created')).toHaveLength(1);
      // even a different payload for the same finding is the same draft (one draft per finding)
      const third = await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('val-replay-other') , validatorRef: r });
      expect(third.data.id).toBe(first.data.id);
      expect(await counts()).toEqual(before);
    });

    it('another system actor resending a taken ref learns only that it is taken, never the draft (review C3)', async () => {
      const t = await serviceToken();
      const r = ref();
      const first = await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('val-taken'), validatorRef: r });
      expect(first.outcome).toBe('ok');
      const otherActor = await systemActor(['knowledge.draft.create']);
      const other = await rawToken({ actorId: otherActor, scopes: ['knowledge.draft.create', 'workspace.read'] });
      const before = await counts();
      const stolen = await tokenAct(other, 'draftCreate', { proposalType: 'create', proposal: proposal('val-taken'), validatorRef: r });
      expect(stolen.outcome).toBe('invalid');
      expect(stolen.fieldErrors).toEqual([{ path: ['validatorRef'], code: 'taken' }]);
      expect(stolen.data).toBeNull();
      expect(stolen.version).toBeNull();
      expect(JSON.stringify(stolen)).not.toContain(first.data.id);
      expect(await counts()).toEqual(before);
    });

    it('the ref index is workspace-scoped and unique only where set (DB-enforced)', async () => {
      const idx = await one(`select indexdef from pg_indexes where schemaname = 'knowledge' and indexname = 'draft_validator_ref_uq'`, []);
      expect(String(idx?.indexdef)).toMatch(/UNIQUE.*\(workspace_id, validator_source_system, validator_run_id, validator_finding_id\)/);
      expect(String(idx?.indexdef)).toMatch(/WHERE/);
      await expect(
        sql(`update knowledge.draft set validator_run_id = 'x' where id = (select id from knowledge.draft where created_by = $1 limit 1)`, [sysActorId]),
      ).rejects.toThrow();
    });
  });

  describe('validatorRef is for service tokens only', () => {
    it('a session call and a personal token call get [validatorRef] not_allowed', async () => {
      const s = await sessionAct(human, 'draftCreate', { proposalType: 'create', proposal: proposal('ref-session'), validatorRef: ref() });
      expect(s.outcome).toBe('invalid');
      expect(fe(s)).toEqual(['validatorRef:not_allowed']);
      const personal = await rawToken({ actorId: human.id, scopes: ['knowledge.draft.create'], kind: 'personal' });
      const p = await tokenAct(personal, 'draftCreate', { proposalType: 'create', proposal: proposal('ref-personal'), validatorRef: ref() });
      expect(p.outcome).toBe('invalid');
      expect(fe(p)).toEqual(['validatorRef:not_allowed']);
    });
  });

  describe('personal token', () => {
    it('keeps human provenance with a token revision, and the same human cannot approve it from a session', async () => {
      const personal = await rawToken({ actorId: human.id, scopes: ['knowledge.draft.create'], kind: 'personal' });
      const a = await tokenAct(personal, 'draftCreate', { proposalType: 'create', proposal: proposal('personal-1') });
      expect(a.outcome).toBe('ok');
      expect(await draftRow(a.data.id)).toMatchObject({ origin: 'human', submitter_actor_id: human.id });
      expect((await draftRevs(a.data.id))[0]).toMatchObject({ author_actor_id: human.id, author_auth: 'token' });
      const s = await tokenAct(personal, 'draftSubmit', { id: a.data.id }, { expectedVersion: a.version as string });
      expect(s.outcome).toBe('ok');
      const before = await counts();
      const approve = await sessionAct(human, 'draftApprove', { id: a.data.id, approvedDigest: a.data.payloadDigest }, s.version as string);
      expect(fe(approve)).toEqual(['id:self_approval_via_token']);
      expect(await counts()).toEqual(before);
    });
  });

  describe('a token never reviews or publishes', () => {
    it.each([
      ['draftApprove', { id: randomUUID(), approvedDigest: 'a'.repeat(64) }, '1'],
      ['draftReject', { id: randomUUID(), rationale: 'no' }, '1'],
      ['draftRequestChanges', { id: randomUUID(), rationale: 'fix' }, '1'],
      ['itemRevise', { id: randomUUID(), typeCode: 'anomaly', title: 't', changeNote: 'c' }, '1'],
      ['itemCreate', { ownerModelId: randomUUID(), typeCode: 'anomaly', title: 't', observation: 'o' }, undefined],
    ] as const)('%s is forbidden and audited as session_required_denied, even with the scope named and the right held', async (action, input, expectedVersion) => {
      const t = await rawToken({ actorId: human.id, kind: 'personal', scopes: ['knowledge.item.publish', 'knowledge.draft.create', 'workspace.read'] });
      const before = await counts();
      const a = await tokenAct(t, action, input, expectedVersion ? { expectedVersion } : {});
      expect(a.outcome).toBe('forbidden');
      const denied = await sql("select 1 from core.audit_log where event_type = 'api_token.session_required_denied' and actor_id = $1 and detail::text like $2", [human.id, `%${t.id}%`]);
      expect(denied.rows.length).toBeGreaterThan(0);
      expect(await counts()).toEqual(before);
    });
  });

  describe('refused before dispatch or at authorize', () => {
    it.each([
      ['revoked', { revoked: true }],
      ['expired', { expiresAt: new Date(Date.now() - 1000).toISOString() }],
    ])('a %s token is 401 and creates nothing', async (_label, over) => {
      const t = await rawToken({ actorId: sysActorId, scopes: ['knowledge.draft.create'], ...over });
      const before = await counts();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${t.value}` },
        payload: JSON.stringify({ action: 'logKnowledge.draftCreate', context: {}, input: { proposalType: 'create', proposal: proposal('dead') }, idempotencyKey: randomUUID() }),
      });
      expect(res.statusCode).toBe(401);
      expect(await counts()).toEqual(before);
    });

    it('a token without the knowledge.draft.create scope is forbidden', async () => {
      const t = await rawToken({ actorId: sysActorId, scopes: ['workspace.read'] });
      const before = await counts();
      expect((await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('no-scope') })).outcome).toBe('forbidden');
      expect(await counts()).toEqual(before);
    });

    it('a service actor without the grant is forbidden even with the scope', async () => {
      const bare = await systemActor([]);
      const t = await rawToken({ actorId: bare, scopes: ['knowledge.draft.create'] });
      expect((await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('no-grant') })).outcome).toBe('forbidden');
    });
  });

  describe('identity never comes from the input', () => {
    it.each([
      ['top-level origin', { origin: 'human' }, false, 'origin'],
      ['top-level authorActorId', { authorActorId: randomUUID() }, false, 'authorActorId'],
      ['top-level submitterActorId', { submitterActorId: randomUUID() }, false, 'submitterActorId'],
      ['proposal origin', { origin: 'human' }, true, 'proposal.origin'],
      ['proposal authorActorId', { authorActorId: randomUUID() }, true, 'proposal.authorActorId'],
      ['proposal submitterActorId', { submitterActorId: randomUUID() }, true, 'proposal.submitterActorId'],
    ])('%s is refused', async (_label, injected, inProposal, path) => {
      const t = await serviceToken();
      const before = await counts();
      const input = inProposal ? { proposalType: 'create', proposal: proposal('inject', injected) } : { proposalType: 'create', proposal: proposal('inject'), ...injected };
      const a = await tokenAct(t, 'draftCreate', input);
      expect(a.outcome).toBe('invalid');
      expect(fe(a).some((e) => e.startsWith(`${path}:`))).toBe(true);
      expect(await counts()).toEqual(before);
    });
  });

  describe('reads', () => {
    it('a service token sees only its own drafts', async () => {
      const t = await serviceToken();
      const mine = await tokenAct(t, 'draftCreate', { proposalType: 'create', proposal: proposal('read-mine') });
      await tokenAct(t, 'draftSubmit', { id: mine.data.id }, { expectedVersion: mine.version as string });
      const theirs = await sessionAct(human, 'draftCreate', { proposalType: 'create', proposal: proposal('read-theirs') });
      await sessionAct(human, 'draftSubmit', { id: theirs.data.id }, theirs.version as string);
      const list = await tokenRead(t, 'logKnowledge.drafts', { q: TAG, pageSize: 100 });
      expect(list.outcome).toBe('ok');
      const ids = list.data.rows.map((r) => r.id);
      expect(ids).toContain(mine.data.id);
      expect(ids).not.toContain(theirs.data.id);
      const detail = await tokenRead(t, 'logKnowledge.draftDetail', { draftId: theirs.data.id });
      expect(detail.outcome).toBe('ok');
      expect(detail.data).toBeNull();
    });
  });
  it('C8: validatorRef and idempotency replays rejudge a real system Actor after owner access is lost', async () => {
    const token = await rawToken({ actorId: sysActorId, scopes: ['knowledge.draft.create'] });
    const input = { proposalType: 'create', proposal: proposal('access-replay'), validatorRef: ref() };
    const key = randomUUID();
    const made = await tokenAct(token, 'draftCreate', input, { key });
    expect(made.outcome).toBe('ok');
    const before = await counts();
    try {
      await sql("update knowledge.equipment_model set access_mode = 'restricted' where id = $1", [modelId]);
      const replay = await tokenAct(token, 'draftCreate', input, { key });
      expect(replay.outcome).toBe('not_found'); expect(replay.data).toBeNull();
      const byRef = await tokenAct(token, 'draftCreate', input);
      expect(byRef.outcome).toBe('invalid');
      expect(byRef.fieldErrors).toEqual([{ path: ['validatorRef'], code: 'not_found' }]);
      expect(await counts()).toEqual(before);
    } finally { await sql("update knowledge.equipment_model set access_mode = 'internal' where id = $1", [modelId]); }
  });

});
