// #1491 R-a — the validation catalog report over API tokens, through the real `buildServer` and a real Postgres
// (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`). Needs migration 0106 (log_rules) on top of 0101
// (api tokens). Tokens are inserted directly (like draft-token.integration.test.ts). Every label here is a synthetic fixture.

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
import { type CatalogReport, REPORT_DIGEST_DOMAIN, canonicalJson, normalizeReport } from '../domain/report.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LRP${randomUUID().slice(0, 6).toUpperCase()}`;
const URL = '/api/v1/validation-catalog/report';
const CAPABILITY = 'validation.catalog.report';

type Row = Record<string, unknown>;
interface Token {
  value: string;
  id: string;
}
interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  body: any;
}

describe.skipIf(!runIntegration)('validation catalog report over API tokens (#1491)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let adminId: string;
  let adminCookie: string;
  let reporterActorId: string; // system Actor holding the capability
  let ungrantedActorId: string; // system Actor without it
  const actorIds: string[] = [];
  const tokenIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const one = async (text: string, params: unknown[] = []) => (await sql(text, params)).rows[0] as Row | undefined;
  const all = async (text: string, params: unknown[] = []) => (await sql(text, params)).rows as Row[];
  const source = (label: string) => `${TAG}-${label}`;

  async function grant(actorId: string) {
    await sql(
      `insert into permission.permission_grants (workspace_id, actor_id, capability, managed_system_id, granted_by_actor_id)
       values ($1, $2, $3, null, $4)`,
      [WORKSPACE_ID, actorId, CAPABILITY, adminId],
    );
  }
  async function systemActor(withGrant: boolean, actorType: 'system' | 'internal_member' = 'system'): Promise<string> {
    const externalId = `${TAG}-${actorType === 'system' ? 'sys' : 'member'}-${n++}`;
    const res = await sql(
      `insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type)
       values ($1, $2, $3, $2, 'user', $4) returning id`,
      [WORKSPACE_ID, externalId, `${externalId}@local`, actorType],
    );
    const id = res.rows[0].id as string;
    actorIds.push(id);
    if (withGrant) await grant(id);
    return id;
  }
  async function rawToken(over: { actorId: string; scopes: string[]; kind?: 'personal' | 'service' }): Promise<Token> {
    const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
    const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
    const res = await sql(
      `insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, expires_at, revoked_at, created_by)
       values ($1,$2,$3,'raw',$4,$5,$6,null,null,$7) returning id`,
      [WORKSPACE_ID, over.actorId, over.kind ?? 'service', prefix, hashToken(value), over.scopes, over.kind === 'personal' ? over.actorId : adminId],
    );
    const id = res.rows[0].id as string;
    tokenIds.push(id);
    return { value, id };
  }
  const reporterToken = () => rawToken({ actorId: reporterActorId, scopes: [CAPABILITY] });

  async function post(token: Token | null, payload: string | Buffer, headers: Record<string, string> = {}): Promise<Answer> {
    const res = await app.inject({
      method: 'POST',
      url: URL,
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token.value}` } : {}), ...headers },
      payload,
    });
    return { status: res.statusCode, body: res.json() };
  }
  const send = (token: Token | null, report: unknown) => post(token, JSON.stringify(report));

  const rule = (over: Row = {}) => ({ ruleKey: 'r1', title: `${TAG} 합성 fixture rule`, summary: '합성 fixture summary', support: 'supported', ...over });
  const ruleSet = (over: Row = {}) => ({ ruleSetKey: 'rs', revision: '1', status: 'active', rules: [rule()], ...over });
  const report = (src: string, over: Row = {}) => ({ sourceSystem: src, validatorVersion: '0.0-synthetic', ruleSets: [ruleSet()], ...over });

  const reportRows = (src: string) => all('select * from log_rules.catalog_report where source_system = $1 order by reported_at, id', [src]);
  const counts = async () =>
    (await one(
      `select (select count(*) from log_rules.catalog_report where reported_by_actor_id = any($1))::int as reports,
              (select count(*) from log_rules.rule_set_revision where workspace_id = $2)::int as revisions,
              (select count(*) from log_rules.rule where workspace_id = $2)::int as rules,
              (select count(*) from log_rules.rule_target where workspace_id = $2)::int as targets,
              (select count(*) from core.audit_log where actor_id = any($1) and subject_type = 'catalog_report')::int as audits`,
      [actorIds, WORKSPACE_ID],
    )) as Row;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    const externalId = `${TAG}-admin`;
    adminId = (await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'admin' })).id;
    actorIds.push(adminId);
    adminCookie = await loginAs(app, externalId);
    reporterActorId = await systemActor(true);
    ungrantedActorId = await systemActor(false);
  });

  // Token calls are rate limited per token (10/min, mutation tier): clear this file's buckets before each test.
  beforeEach(async () => {
    if (tokenIds.length > 0) await sql('delete from core.rate_limits where key like any($1)', [tokenIds.map((id) => `${WORKSPACE_ID}:token:${id}%`)]);
  });

  afterAll(async () => {
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      for (const [table, trigger] of [
        ['rule_target', 'rule_target_append_only'],
        ['rule', 'rule_append_only'],
        ['rule_set_revision', 'rule_set_revision_append_only'],
        ['catalog_report', 'catalog_report_no_delete'],
        ['catalog_report', 'catalog_report_guard'],
      ] as const) await client.query(`alter table log_rules.${table} disable trigger ${trigger}`);
      const mine = '(select id from log_rules.catalog_report where reported_by_actor_id = any($1))';
      await client.query(`delete from log_rules.rule_target where rule_id in (select id from log_rules.rule where rule_set_revision_id in (select id from log_rules.rule_set_revision where report_id in ${mine}))`, [actorIds]);
      await client.query(`delete from log_rules.rule where rule_set_revision_id in (select id from log_rules.rule_set_revision where report_id in ${mine})`, [actorIds]);
      await client.query(`delete from log_rules.rule_set_revision where report_id in ${mine}`, [actorIds]);
      await client.query('delete from log_rules.catalog_report where reported_by_actor_id = any($1)', [actorIds]);
      for (const [table, trigger] of [
        ['rule_target', 'rule_target_append_only'],
        ['rule', 'rule_append_only'],
        ['rule_set_revision', 'rule_set_revision_append_only'],
        ['catalog_report', 'catalog_report_no_delete'],
        ['catalog_report', 'catalog_report_guard'],
      ] as const) await client.query(`alter table log_rules.${table} enable trigger ${trigger}`);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
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

  describe('who may report', () => {
    it('refuses a cookie session — admin included — with permission.denied and writes nothing', async () => {
      const before = await counts();
      const res = await app.inject({
        method: 'POST',
        url: URL,
        headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${adminCookie}` },
        payload: JSON.stringify(report(source('session'))),
      });
      expect(res.statusCode).toBe(403);
      expect(res.json()).toMatchObject({ code: 'permission.denied', detail: { capability: CAPABILITY } });
      expect(await counts()).toEqual(before);
    });

    it('answers 401 without credentials and auth.token_invalid for an unknown token', async () => {
      const none = await app.inject({ method: 'POST', url: URL, headers: { 'content-type': 'application/json' }, payload: '{}' });
      expect(none.statusCode).toBe(401);
      const bad = await post({ value: `ap_${'0'.repeat(8)}_${'A'.repeat(43)}`, id: '' }, '{}');
      expect(bad).toMatchObject({ status: 401, body: { code: 'auth.token_invalid' } });
    });

    it('refuses a token without the scope, even though its owner holds the grant', async () => {
      const t = await rawToken({ actorId: reporterActorId, scopes: ['workspace.read'] });
      const before = await counts();
      expect(await send(t, report(source('noscope')))).toMatchObject({ status: 403, body: { code: 'permission.denied' } });
      expect(await counts()).toEqual(before);
    });

    it('refuses a token whose owner lacks the capability although the scope is present (issuer ∩ scope)', async () => {
      const t = await rawToken({ actorId: ungrantedActorId, scopes: [CAPABILITY] });
      expect(await send(t, report(source('nogrant')))).toMatchObject({ status: 403, body: { code: 'permission.denied' } });
      expect(await reportRows(source('nogrant'))).toEqual([]);
    });

    it('a personal token follows its issuer: accepted with the grant, refused after the grant is revoked', async () => {
      const issuer = await systemActor(true, 'internal_member'); // a personal token belongs to a human issuer (the token gate refuses a system Actor's)
      const t = await rawToken({ actorId: issuer, scopes: [CAPABILITY], kind: 'personal' });
      expect((await send(t, report(source('personal')))).status).toBe(200);
      await sql('update permission.permission_grants set revoked_at = now() where actor_id = $1 and capability = $2', [issuer, CAPABILITY]);
      expect((await send(t, report(source('personal2'), { validatorVersion: 'v2' }))).status).toBe(403);
      expect(await reportRows(source('personal2'))).toEqual([]);
    });
  });

  describe('accepting a report', () => {
    it('stores the snapshot verbatim, answers 200 and writes one body-free audit row carrying the token id', async () => {
      const t = await reporterToken();
      const src = source('store');
      const targets = [
        { format: 'xpath', target: '//Event[@id="1"]', requirementIds: ['mod-a/ev-1', 'mod-a'] },
        { format: 'free', target: '아무 형식 그대로' },
      ];
      const res = await send(
        t,
        report(src, {
          ruleSets: [
            ruleSet({ rules: [rule({ targets, scope: { logTypes: ['a'], softwareRange: '>=1' }, requiredDefault: true })] }),
            ruleSet({ revision: '2', resultRef: 'rs@2', status: 'retired', supersedes: '1', rules: [rule({ support: 'unknown' })] }),
          ],
        }),
      );
      expect(res).toMatchObject({ status: 200, body: { outcome: 'accepted', replayed: false, current: true } });
      const id = res.body.reportId as string;
      expect(await one('select * from log_rules.catalog_report where id = $1', [id])).toMatchObject({
        source_system: src,
        validator_version: '0.0-synthetic',
        outcome: 'accepted',
        reported_by_actor_id: reporterActorId,
        superseded_at: null,
      });
      const revs = await all('select * from log_rules.rule_set_revision where report_id = $1 order by revision', [id]);
      expect(revs.map((r) => [r.revision, r.result_ref, r.status, r.supersedes])).toEqual([['1', '1', 'active', null], ['2', 'rs@2', 'retired', '1']]);
      const stored = await all(
        'select r.rule_key, r.support, r.scope, r.required_default, t.position, t.format, t.target, t.requirement_ids from log_rules.rule r join log_rules.rule_set_revision v on v.id = r.rule_set_revision_id left join log_rules.rule_target t on t.rule_id = r.id where v.report_id = $1 order by v.revision, t.position',
        [id],
      );
      expect(stored[0]).toMatchObject({ rule_key: 'r1', support: 'supported', scope: { logTypes: ['a'], softwareRange: '>=1' }, required_default: true, position: 0, format: 'xpath', target: '//Event[@id="1"]', requirement_ids: ['mod-a/ev-1', 'mod-a'] });
      expect(stored[1]).toMatchObject({ position: 1, format: 'free', target: '아무 형식 그대로', requirement_ids: [] });
      expect(stored[2]).toMatchObject({ support: 'unknown', position: null });

      const audit = await all('select event_type, actor_id, subject_type, detail from core.audit_log where subject_id = $1', [id]);
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({ event_type: 'validation.catalog.reported', actor_id: reporterActorId, subject_type: 'catalog_report' });
      expect(audit[0]?.detail).toMatchObject({ sourceSystem: src, outcome: 'accepted', ruleSetCount: 2, ruleCount: 2, targetCount: 2, api_token_id: t.id, supersededReportId: null });
      const text = JSON.stringify(audit[0]);
      for (const secret of ['합성 fixture rule', 'summary', '//Event', 'mod-a']) expect(text).not.toContain(secret);
    });

    it('replays the same snapshot: same reportId, nothing written, order of rules does not matter', async () => {
      const t = await reporterToken();
      const src = source('replay');
      const first = await send(t, report(src, { ruleSets: [ruleSet({ rules: [rule(), rule({ ruleKey: 'r2' })] })] }));
      expect(first.status).toBe(200);
      const before = await counts();
      const again = await send(t, report(src, { ruleSets: [ruleSet({ rules: [rule({ ruleKey: 'r2' }), rule()] })] }));
      expect(again).toMatchObject({ status: 200, body: { reportId: first.body.reportId, outcome: 'accepted', replayed: true, current: true } });
      expect(await counts()).toEqual(before);
    });

    it('a different snapshot of the same source supersedes the previous one; replaying the old one says current=false', async () => {
      const t = await reporterToken();
      const src = source('supersede');
      const a = await send(t, report(src));
      const b = await send(t, report(src, { validatorVersion: 'v2' }));
      expect(b.body).toMatchObject({ replayed: false, current: true });
      const rows = await reportRows(src);
      expect(rows.map((r) => [r.id, r.superseded_by_report_id === null ? 'current' : 'superseded'])).toEqual(
        expect.arrayContaining([[a.body.reportId, 'superseded'], [b.body.reportId, 'current']]),
      );
      expect(rows).toHaveLength(2);
      expect((await one('select count(*)::int as n from log_rules.rule_set_revision where report_id = $1', [a.body.reportId]))?.n).toBe(1);
      const audit = await one("select detail from core.audit_log where subject_id = $1 and event_type = 'validation.catalog.reported'", [b.body.reportId]);
      expect(audit?.detail).toMatchObject({ supersededReportId: a.body.reportId });
      const replayOld = await send(t, report(src));
      expect(replayOld).toMatchObject({ status: 200, body: { reportId: a.body.reportId, replayed: true, current: false } });
    });

    it('keeps one current report per source system', async () => {
      const t = await reporterToken();
      const a = await send(t, report(source('src-a')));
      const b = await send(t, report(source('src-b')));
      expect(a.body.current && b.body.current).toBe(true);
      expect((await reportRows(source('src-a')))[0]?.superseded_at).toBeNull();
      expect((await reportRows(source('src-b')))[0]?.superseded_at).toBeNull();
    });

    it('serializes parallel submissions: identical ones make one report, different ones leave exactly one current', async () => {
      const t = await reporterToken();
      const same = source('par-same');
      const results = await Promise.all(Array.from({ length: 5 }, () => send(t, report(same))));
      expect(results.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(new Set(results.map((r) => r.body.reportId)).size).toBe(1);
      expect(results.filter((r) => !r.body.replayed)).toHaveLength(1);
      expect(await reportRows(same)).toHaveLength(1);

      const diff = source('par-diff');
      const t2 = await reporterToken();
      const many = await Promise.all(Array.from({ length: 5 }, (_, i) => send(t2, report(diff, { validatorVersion: `v${i}` }))));
      expect(many.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      const rows = await reportRows(diff);
      expect(rows).toHaveLength(5);
      expect(rows.filter((r) => r.superseded_at === null)).toHaveLength(1);
      expect(rows.filter((r) => r.superseded_at !== null)).toHaveLength(4);
    });
  });

  describe('refusing a report', () => {
    const rejectedCases: [string, (src: string) => unknown, string][] = [
      ['an unknown top-level key', (s) => ({ ...report(s), extra: 1 }), 'unknown_field'],
      ['an unknown nested key (rule body)', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ condition: 'x > 3' })] })] }), 'unknown_field'],
      ['a blank-edged identifier', (s) => report(s, { ruleSets: [ruleSet({ ruleSetKey: ' rs' })] }), 'invalid_identifier'],
      ['a control character in an identifier', (s) => report(s, { ruleSets: [ruleSet({ revision: 'a\u0001' })] }), 'invalid_identifier'],
      ['a duplicate ruleKey', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule(), rule()] })] }), 'duplicate_key'],
      ['a duplicate revision', (s) => report(s, { ruleSets: [ruleSet(), ruleSet()] }), 'duplicate_key'],
      ['a duplicate resultRef', (s) => report(s, { ruleSets: [ruleSet({ resultRef: 'x' }), ruleSet({ revision: '2', resultRef: 'x' })] }), 'duplicate_key'],
      ['a too long title', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ title: 'x'.repeat(121) })] })] }), 'too_large'],
      ['too many targets', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ targets: Array.from({ length: 21 }, () => ({ format: 'f', target: 't' })) })] })] }), 'too_large'],
      ['a bad support value', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ support: 'maybe' })] })] }), 'invalid_value'],
      ['a control character in the summary', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ summary: 'a\u0007b' })] })] }), 'control_character'],
      ['a secret in the title', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ title: 'password = hunter2-leak' })] })] }), 'secret_pattern'],
      ['a secret in the summary', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ summary: 'AKIAIOSFODNN7EXAMPLE' })] })] }), 'secret_pattern'],
      ['a secret in a target', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: 'f', target: '-----BEGIN PRIVATE KEY-----' }] })] })] }), 'secret_pattern'],
      ['a secret in the format', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: 'token: abc', target: 't' }] })] })] }), 'secret_pattern'],
      ['a secret in a requirement id', (s) => report(s, { ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: 'f', target: 't', requirementIds: ['Bearer abcdefghijklmnopqrstuvwxyz0123'] }] })] })] }), 'secret_pattern'],
    ];

    it.each(rejectedCases)('rejects %s, records the reason and no content, and replays the refusal', async (_name, build, code) => {
      const t = await reporterToken();
      const src = source(`rej-${n++}`);
      const before = await counts();
      const res = await send(t, build(src));
      expect(res.status).toBe(422);
      expect(res.body).toMatchObject({ code: 'validation.failed' });
      expect((res.body.detail.fields as { code: string }[]).map((f) => f.code)).toContain(code);
      const row = await one('select * from log_rules.catalog_report where id = $1', [res.body.detail.report_id]);
      expect(row).toMatchObject({ outcome: 'rejected', reject_reason: res.body.detail.fields[0].code, reported_by_actor_id: reporterActorId });
      const after = await counts();
      expect(after).toMatchObject({ reports: (before.reports as number) + 1, revisions: before.revisions, rules: before.rules, targets: before.targets, audits: (before.audits as number) + 1 });
      // no content anywhere in the rows written for the refusal
      const dump = JSON.stringify([row, await all('select detail, summary from core.audit_log where subject_id = $1', [res.body.detail.report_id])]);
      for (const leak of ['hunter2', 'AKIAIOSFODNN7EXAMPLE', 'PRIVATE KEY', 'abcdefghijklmnop', 'x > 3']) expect(dump).not.toContain(leak);
      const audit = await one('select event_type, detail from core.audit_log where subject_id = $1', [res.body.detail.report_id]);
      expect(audit).toMatchObject({ event_type: 'validation.catalog.rejected', detail: { outcome: 'rejected', api_token_id: t.id } });

      const again = await send(t, build(src));
      expect(again.status).toBe(422);
      expect(again.body.detail.report_id).toBe(res.body.detail.report_id);
      expect(await counts()).toEqual(after);
    });

    it('judges the size before parsing: a body over 2 MB is too_large (not JSON at all), exactly 2 MB is read', async () => {
      const t = await reporterToken();
      const big = await post(t, Buffer.alloc(2 * 1024 * 1024 + 1, 'x'));
      expect(big.status).toBe(422);
      expect(big.body.detail.fields).toEqual([{ path: [], code: 'too_large' }]);
      expect(await one('select reject_reason, source_system from log_rules.catalog_report where id = $1', [big.body.detail.report_id])).toEqual({ reject_reason: 'too_large', source_system: null });
      const edge = await post(t, Buffer.alloc(2 * 1024 * 1024, 'x'));
      expect(edge.body.detail.fields).toEqual([{ path: [], code: 'invalid_json' }]);
    });

    it('a body over the 8 MB transport limit never reaches the handler: 422 validation.malformed_request, nothing recorded (review C3)', async () => {
      const t = await reporterToken();
      const before = await counts();
      const huge = await post(t, Buffer.alloc(8 * 1024 * 1024 + 1, 'x'));
      expect(huge.status).toBe(422);
      expect(huge.body.code).toBe('validation.malformed_request');
      expect(await counts()).toEqual(before);
    });

    it('a rejected body never occupies the digest of a valid snapshot, in either submission order (review C1)', async () => {
      const t = await reporterToken();
      const colliderOf = (value: Row) => Buffer.from(REPORT_DIGEST_DOMAIN + canonicalJson(normalizeReport(value as unknown as CatalogReport)));
      const first = report(source('collide-a'));
      expect((await post(t, colliderOf(first))).status).toBe(422); // the collider first ...
      const accepted = await send(t, first);
      expect(accepted).toMatchObject({ status: 200, body: { outcome: 'accepted', current: true } }); // ... must not poison the valid report
      const second = report(source('collide-b'));
      expect(await send(t, second)).toMatchObject({ status: 200, body: { outcome: 'accepted' } });
      const rejected = await post(t, colliderOf(second)); // the valid report first: the collider is still recorded
      expect(rejected.status).toBe(422);
      expect(await reportRows(source('collide-b'))).toHaveLength(1); // only the accepted one carries the source (the rejected body is not a report)
      expect(await one('select outcome from log_rules.catalog_report where id = $1', [rejected.body.detail.report_id])).toEqual({ outcome: 'rejected' });
    });

    it('records malformed JSON and an empty body as invalid_json', async () => {
      const t = await reporterToken();
      expect((await post(t, '{')).body.detail.fields).toEqual([{ path: [], code: 'invalid_json' }]);
      expect((await post(t, '')).body.detail.fields).toEqual([{ path: [], code: 'invalid_json' }]);
    });

    it('keeps a clean source system on a rejected report and drops one that carries a secret', async () => {
      const t = await reporterToken();
      const src = source('rej-src');
      const res = await send(t, report(src, { ruleSets: [ruleSet(), ruleSet()] }));
      expect((await one('select source_system from log_rules.catalog_report where id = $1', [res.body.detail.report_id]))?.source_system).toBe(src);
      const leaky = await send(t, report('AKIAIOSFODNN7EXAMPLE'));
      expect((await one('select source_system from log_rules.catalog_report where id = $1', [leaky.body.detail.report_id]))?.source_system).toBeNull();
    });

    it('a refused report leaves the current snapshot untouched', async () => {
      const t = await reporterToken();
      const src = source('keep');
      const ok = await send(t, report(src));
      await send(t, { ...report(src, { validatorVersion: 'v2' }), extra: 1 });
      const rows = await reportRows(src);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ id: ok.body.reportId, superseded_at: null });
    });
  });

  describe('immutability and grants', () => {
    let reportId = '';
    beforeAll(async () => {
      const t = await reporterToken();
      reportId = (await send(t, report(source('immutable'), { ruleSets: [ruleSet({ rules: [rule({ targets: [{ format: 'f', target: 't' }] })] })] }))).body.reportId as string;
    });
    const expectRefused = async (handle: DbHandle, text: string, params: unknown[] = []) => {
      await expect(handle.pool.query(text, params)).rejects.toThrow();
    };

    it.each([
      ['update rule_set_revision', "update log_rules.rule_set_revision set status = 'retired' where report_id = $1"],
      ['delete rule_set_revision', 'delete from log_rules.rule_set_revision where report_id = $1'],
      ['update rule', "update log_rules.rule set title = 'x' where rule_set_revision_id in (select id from log_rules.rule_set_revision where report_id = $1)"],
      ['delete rule', 'delete from log_rules.rule where rule_set_revision_id in (select id from log_rules.rule_set_revision where report_id = $1)'],
      ['update rule_target', "update log_rules.rule_target set target = 'x' where rule_id in (select r.id from log_rules.rule r join log_rules.rule_set_revision v on v.id = r.rule_set_revision_id where v.report_id = $1)"],
      ['delete rule_target', 'delete from log_rules.rule_target where rule_id in (select r.id from log_rules.rule r join log_rules.rule_set_revision v on v.id = r.rule_set_revision_id where v.report_id = $1)'],
      ['update catalog_report content', "update log_rules.catalog_report set validator_version = 'x' where id = $1"],
      ['delete catalog_report', 'delete from log_rules.catalog_report where id = $1'],
    ])('the migrate role cannot %s (trigger wall), nor can the runtime role', async (_n, text) => {
      await expectRefused(migrate, text, [reportId]);
      await expectRefused(dbHandle, text, [reportId]);
      expect((await one('select count(*)::int as n from log_rules.rule_set_revision where report_id = $1', [reportId]))?.n).toBe(1);
    });

    it('the supersede marker is the only change a report row allows, and only once', async () => {
      const t = await reporterToken();
      const src = source('marker');
      const a = (await send(t, report(src))).body.reportId as string;
      await expectRefused(dbHandle, 'update log_rules.catalog_report set superseded_at = now() where id = $1', [a]); // check constraint: needs the pointer too
      await expectRefused(migrate, 'update log_rules.catalog_report set superseded_at = now() where id = $1', [a]);
      const b = (await send(t, report(src, { validatorVersion: 'v2' }))).body.reportId as string;
      await expectRefused(migrate, 'update log_rules.catalog_report set superseded_by_report_id = $2 where id = $1', [a, b]);
      await expectRefused(migrate, 'update log_rules.catalog_report set superseded_at = null, superseded_by_report_id = null where id = $1', [a]);
    });
  });
});

