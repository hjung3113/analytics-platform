// #1492 R-b — the catalog reads (`logRules.ruleSets|ruleSetDetail|rules|ruleDetail|catalogStatus`) through the real
// `buildServer` over `POST /api/v1/menu-query` against a real Postgres (throwaway DB only;
// `pnpm --filter @ap/platform-api test:integration`; app as platform_app, fixtures and cleanup as platform_migrate).
// Needs migration 0106 (log_rules). Catalogs are seeded straight into the tables (the report REST is R-a's test);
// every label is a synthetic fixture. Keys carry a per-run TAG so the shared workspace may hold other rows.

import { createHash, randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { parseRuleParams, parseRuleSetParams } from '../domain/catalog-params.js';
import { getCatalogStatus, getRuleDetail, getRuleSetDetail, listRuleSets, listRules } from '../repositories/catalog-read.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LRB${randomUUID().slice(0, 6).toUpperCase()}`;

type Row = Record<string, unknown>;
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  message?: string;
}
interface SeedRule {
  ruleKey: string;
  support?: string;
  title?: string;
  summary?: string;
  scope?: Row | null;
  targets?: { format: string; target: string; requirementIds?: string[] }[];
}
interface SeedRevision {
  revision: string;
  status?: 'active' | 'retired';
  supersedes?: string | null;
  rules?: SeedRule[];
}
interface SeedSet {
  ruleSetKey: string;
  revisions: SeedRevision[];
}

const TRIGGERS = [
  ['rule_target', 'rule_target_append_only'],
  ['rule', 'rule_append_only'],
  ['rule_set_revision', 'rule_set_revision_append_only'],
  ['catalog_report', 'catalog_report_no_delete'],
  ['catalog_report', 'catalog_report_guard'],
] as const;

describe.skipIf(!runIntegration)('catalog reads (#1492)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: { id: string; cookie: string };
  let user: { id: string; cookie: string };
  let foreign: { workspaceId: string; actorId: string };
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const reportIds: string[] = [];
  let n = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const key = (label: string) => `${TAG}-${label}`;
  const digest = () => createHash('sha256').update(randomUUID()).digest('hex');

  async function workspaceWithActor(): Promise<{ workspaceId: string; actorId: string }> {
    const workspaceId = (await sql('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws${n++}`])).rows[0].id as string;
    workspaceIds.push(workspaceId);
    const actorId = (await insertActorRow(dbHandle, { workspaceId, externalId: `${TAG}-w${n++}`, roleLevel: 'admin' })).id;
    actorIds.push(actorId);
    return { workspaceId, actorId };
  }

  /**
   * Inserts one report with its Revisions, Rules and targets in one transaction (the report REST has its own test).
   * `replaces` marks that report superseded by this one first, as the accept transaction does.
   */
  async function seed(
    ws: { workspaceId: string; actorId: string },
    source: string,
    sets: SeedSet[],
    opts: { outcome?: 'accepted' | 'rejected'; validatorVersion?: string; reportedAt?: string; replaces?: string } = {},
  ): Promise<string> {
    const outcome = opts.outcome ?? 'accepted';
    const reportId = randomUUID();
    reportIds.push(reportId);
    const client = await migrate.pool.connect();
    const q = (text: string, params: unknown[]) => client.query(text, params);
    try {
      await client.query('begin');
      if (opts.replaces) {
        await q('update log_rules.catalog_report set superseded_at = now(), superseded_by_report_id = $2 where id = $1', [opts.replaces, reportId]);
      }
      await q(
        `insert into log_rules.catalog_report (id, workspace_id, source_system, reported_by_actor_id, validator_version, report_digest, reported_at, outcome, reject_reason)
         values ($1,$2,$3,$4,$5,$6,coalesce($7::timestamptz, now()),$8,$9)`,
        [reportId, ws.workspaceId, source, ws.actorId, outcome === 'accepted' ? (opts.validatorVersion ?? '0.0-synthetic') : null, digest(), opts.reportedAt ?? null, outcome, outcome === 'rejected' ? 'unknown_field' : null],
      );
      for (const set of sets) {
        for (const rev of set.revisions) {
          const revisionId = randomUUID();
          await q(
            `insert into log_rules.rule_set_revision (id, workspace_id, report_id, rule_set_key, revision, result_ref, revision_digest, status, supersedes)
             values ($1,$2,$3,$4,$5,$5,$6,$7,$8)`,
            [revisionId, ws.workspaceId, reportId, set.ruleSetKey, rev.revision, digest(), rev.status ?? 'active', rev.supersedes ?? null],
          );
          for (const rule of rev.rules ?? []) {
            const ruleId = randomUUID();
            await q(
              `insert into log_rules.rule (id, workspace_id, rule_set_revision_id, rule_key, title, summary, support, scope, rule_digest)
               values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9)`,
              [ruleId, ws.workspaceId, revisionId, rule.ruleKey, rule.title ?? `${rule.ruleKey} 합성 fixture`, rule.summary ?? '합성 fixture summary', rule.support ?? 'supported', rule.scope === undefined || rule.scope === null ? null : JSON.stringify(rule.scope), digest()],
            );
            for (const [position, t] of (rule.targets ?? []).entries()) {
              await q(
                `insert into log_rules.rule_target (workspace_id, rule_id, position, format, target, requirement_ids) values ($1,$2,$3,$4,$5,$6)`,
                [ws.workspaceId, ruleId, position, t.format, t.target, t.requirementIds ?? []],
              );
            }
          }
        }
      }
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
    return reportId;
  }

  async function read(endpoint: string, params: Record<string, unknown> = {}, cookie = admin.cookie): Promise<Answer> {
    // Reads are rate limited per actor (`<workspace>:<actor>`); this file makes far more than the budget in a minute.
    await sql('delete from core.rate_limits where key like any($1)', [[admin.id, user.id].map((id) => `${WORKSPACE_ID}:${id}%`)]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      payload: JSON.stringify({ endpoint: `logRules.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }
  const mine = { filters: [{ id: 'ruleSetKey', op: 'in', value: [] as string[] }] };
  const only = (...keys: string[]) => ({ filters: [{ ...mine.filters[0], value: keys }] });
  const dbFor = () => dbHandle.db;

  async function clearReports(ids: string[]) {
    if (ids.length === 0) return;
    const client = await migrate.pool.connect();
    try {
      await client.query('begin');
      for (const [table, trigger] of TRIGGERS) await client.query(`alter table log_rules.${table} disable trigger ${trigger}`);
      await client.query('delete from log_rules.rule_target where rule_id in (select r.id from log_rules.rule r join log_rules.rule_set_revision v on v.id = r.rule_set_revision_id where v.report_id = any($1))', [ids]);
      await client.query('delete from log_rules.rule where rule_set_revision_id in (select id from log_rules.rule_set_revision where report_id = any($1))', [ids]);
      await client.query('delete from log_rules.rule_set_revision where report_id = any($1)', [ids]);
      await client.query('delete from log_rules.catalog_report where id = any($1)', [ids]);
      for (const [table, trigger] of TRIGGERS) await client.query(`alter table log_rules.${table} enable trigger ${trigger}`);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    const mk = async (roleLevel: 'admin' | 'user') => {
      const externalId = `${TAG}-${roleLevel}`;
      const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel });
      actorIds.push(id);
      return { id, cookie: await loginAs(app, externalId) };
    };
    admin = await mk('admin');
    user = await mk('user');
    foreign = await workspaceWithActor();
  });

  afterAll(async () => {
    await clearReports(reportIds);
    await sql('delete from core.sessions where actor_id = any($1)', [actorIds]);
    await sql('delete from core.actors where id = any($1)', [actorIds]);
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  const here = () => ({ workspaceId: WORKSPACE_ID, actorId: admin.id });

  describe('who may read, and what a bad param does', () => {
    it('an ordinary user with platform:view reads; no session is refused before any data', async () => {
      const s = key('open');
      await seed(here(), key('src-open'), [{ ruleSetKey: s, revisions: [{ revision: '1', rules: [{ ruleKey: 'a' }] }] }]);
      const answer = await read('ruleSets', only(s), user.cookie);
      expect(answer.outcome).toBe('ok');
      expect(answer.data.rows.map((r: Row) => r.ruleSetKey)).toEqual([s]);
      const anon = await app.inject({ method: 'POST', url: '/api/v1/menu-query', headers: { 'content-type': 'application/json' }, payload: JSON.stringify({ endpoint: 'logRules.ruleSets', context: {}, params: {} }) });
      expect(anon.statusCode).toBe(401);
    });

    it.each([
      ['ruleSets', { sorting: [{ id: 'support', desc: false }] }],
      ['ruleSets', { filters: [{ id: 'support', op: 'in', value: ['supported'] }] }],
      ['rules', { sorting: [{ id: 'title; select 1', desc: false }] }],
      ['rules', { filters: [{ id: 'ruleBody', op: 'in', value: ['x'] }] }],
      ['rules', { filters: [{ id: 'support', op: 'in', value: ["x' or '1'='1"] }] }],
      ['rules', { targetQ: 7 }],
      ['rules', { pageSize: 1000 }],
      ['ruleSetDetail', {}],
      ['ruleDetail', { ruleSetKey: 'rs' }],
    ])('%s refuses %j with an error outcome, never an empty page', async (endpoint, params) => {
      const answer = await read(endpoint, params);
      expect(answer.outcome).toBe('error');
      expect(answer.data).toBeNull();
    });

    it('an unknown param key is refused by the engine', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-query',
        headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}` },
        payload: JSON.stringify({ endpoint: 'logRules.catalogStatus', context: {}, params: { workspaceId: foreign.workspaceId } }),
      });
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json<Answer>()).toMatchObject({ outcome: 'error', data: null });
    });
  });

  describe('ruleSets and ruleSetDetail', () => {
    it('lists the current active Revision with support counts and the last report time', async () => {
      const s = key('list');
      await seed(here(), key('src-list'), [
        {
          ruleSetKey: s,
          revisions: [
            { revision: '1', status: 'retired', rules: [{ ruleKey: 'old' }] },
            { revision: '2', supersedes: '1', rules: [{ ruleKey: 'a', support: 'supported' }, { ruleKey: 'b', support: 'partial' }, { ruleKey: 'c', support: 'unknown' }, { ruleKey: 'd', support: 'unsupported' }, { ruleKey: 'e', support: 'supported' }] },
          ],
        },
      ], { validatorVersion: '9.9-synthetic', reportedAt: '2026-11-01T00:00:00Z' });
      const answer = await read('ruleSets', only(s));
      expect(answer.data.total).toBe(1);
      expect(answer.data.rows[0]).toMatchObject({
        ruleSetKey: s,
        sourceSystem: key('src-list'),
        validatorVersion: '9.9-synthetic',
        lastReportedAt: '2026-11-01T00:00:00.000Z',
        revisionCount: 2,
        currentRevision: { revision: '2', resultRef: '2', supersedes: '1' },
        ambiguousCurrent: false,
        supportCounts: { supported: 2, partial: 1, unsupported: 1, unknown: 1, total: 5 },
      });
    });

    it('a RuleSet whose Revisions are all retired has no current Revision and zero counts', async () => {
      const s = key('allret');
      await seed(here(), key('src-allret'), [{ ruleSetKey: s, revisions: [{ revision: '1', status: 'retired', rules: [{ ruleKey: 'a' }] }] }]);
      const row = (await read('ruleSets', only(s))).data.rows[0];
      expect(row).toMatchObject({ currentRevision: null, supportCounts: { total: 0 } });
    });

    it('filters by source, searches the key, sorts and pages with a stable order', async () => {
      const keys = ['b', 'a', 'c'].map((x) => key(`page-${x}`));
      await seed(here(), key('src-page'), keys.map((ruleSetKey) => ({ ruleSetKey, revisions: [{ revision: '1', rules: [{ ruleKey: 'a' }] }] })));
      const q = { q: `${TAG}-page`, pageSize: 2, filters: [{ id: 'sourceSystem', op: 'in', value: [key('src-page')] }] };
      const p0 = (await read('ruleSets', { ...q, page: 0 })).data;
      const p1 = (await read('ruleSets', { ...q, page: 1 })).data;
      expect(p0.total).toBe(3);
      expect([...p0.rows, ...p1.rows].map((r: Row) => r.ruleSetKey)).toEqual([...keys].sort());
      const desc = (await read('ruleSets', { ...q, pageSize: 3, sorting: [{ id: 'ruleSetKey', desc: true }] })).data;
      expect(desc.rows.map((r: Row) => r.ruleSetKey)).toEqual([...keys].sort().reverse());
    });

    it('shows per-Revision additions, removals and support changes; the first Revision claims no change; a retired Revision is shown retired', async () => {
      const s = key('hist');
      await seed(here(), key('src-hist'), [
        {
          ruleSetKey: s,
          revisions: [
            { revision: 'v3', supersedes: 'v2', rules: [{ ruleKey: 'a', support: 'supported' }, { ruleKey: 'd' }] },
            { revision: 'v1', status: 'retired', rules: [{ ruleKey: 'a', support: 'partial' }, { ruleKey: 'b' }, { ruleKey: 'c' }] },
            { revision: 'v2', status: 'retired', supersedes: 'v1', rules: [{ ruleKey: 'a', support: 'partial' }, { ruleKey: 'c' }, { ruleKey: 'e', support: 'unknown' }] },
          ],
        },
      ]);
      const d = (await read('ruleSetDetail', { ruleSetKey: s })).data;
      expect(d).toMatchObject({ ruleSetKey: s, currentRevision: 'v3', ambiguousCurrent: false });
      expect(d.revisions.map((r: Row) => [r.revision, r.retired, r.isCurrent, r.previousRevision])).toEqual([
        ['v1', true, false, null],
        ['v2', true, false, 'v1'],
        ['v3', false, true, 'v2'],
      ]);
      expect(d.revisions[0].changes).toBeNull();
      expect(d.revisions[1].changes).toMatchObject({ added: ['e'], removed: ['b'], supportChanged: [], truncated: false });
      expect(d.revisions[2].changes).toMatchObject({
        added: ['d'],
        removed: ['c', 'e'],
        supportChanged: [{ ruleKey: 'a', from: 'partial', to: 'supported' }],
      });
      expect(d.revisions[2]).toMatchObject({ ruleCount: 2, supportCounts: { supported: 2, total: 2 } });
    });

    it('an unknown RuleSet key answers ok with null', async () => {
      expect(await read('ruleSetDetail', { ruleSetKey: key('nope') })).toMatchObject({ outcome: 'ok', data: null });
    });
  });

  describe('rules', () => {
    const s = key('rules');
    const sT = key('rules-t');
    const seeded = async () => {
      await seed(here(), key('src-rules'), [
        {
          ruleSetKey: s,
          revisions: [
            { revision: '1', status: 'retired', rules: [{ ruleKey: 'gone', title: 'only in the retired Revision' }] },
            {
              revision: '2',
              supersedes: '1',
              rules: [
                { ruleKey: 'r-a', title: 'Alpha timing', summary: 'checks the clock', support: 'supported', scope: { logTypes: ['trace'] }, targets: [{ format: 'f1', target: 'Mod_X/Ev_1 (verbatim)', requirementIds: ['Mod_X/Ev_1'] }, { format: 'f2', target: 'second' }] },
                { ruleKey: 'r-b', title: 'Beta', summary: 'beta 100%_match', support: 'partial', targets: [{ format: 'f1', target: 'plain' }] },
                { ruleKey: 'r-c', title: 'Gamma', summary: 'g', support: 'unknown', scope: {} },
                { ruleKey: 'r-d', title: 'Delta', summary: 'd', support: 'unsupported', targets: [{ format: 'f1', target: 'x', requirementIds: ['Mod_Y'] }] },
              ],
            },
          ],
        },
      ]);
      await seed(here(), key('src-rules2'), [{ ruleSetKey: sT, revisions: [{ revision: '9', rules: [{ ruleKey: 'r-a', title: 'Same key, other set' }] }] }]);
    };
    const keysOf = (a: Answer) => a.data.rows.map((r: Row) => `${r.ruleSetKey === s ? 's' : 't'}:${r.ruleKey}`);
    const base = { filters: [{ id: 'ruleSetKey', op: 'in', value: [s, sT] }] };
    const withFilters = (...f: Row[]) => ({ filters: [...base.filters, ...f] });

    it('lists only Rules of current active Revisions, with declared targets shown verbatim', async () => {
      await seeded();
      const a = await read('rules', { ...base, sorting: [{ id: 'ruleKey', desc: false }] });
      expect(keysOf(a)).toEqual(['s:r-a', 't:r-a', 's:r-b', 's:r-c', 's:r-d']);
      expect(a.data.total).toBe(5);
      const first = a.data.rows.find((r: Row) => r.ruleSetKey === s && r.ruleKey === 'r-a');
      expect(first).toMatchObject({
        revision: '2',
        support: 'supported',
        scope: { logTypes: ['trace'] },
        targetCount: 2,
        requirementIdCount: 1,
        firstTarget: { format: 'f1', target: 'Mod_X/Ev_1 (verbatim)' },
      });
      expect(a.data.rows.find((r: Row) => r.ruleKey === 'r-c')).toMatchObject({ firstTarget: null, targetCount: 0 });
    });

    it.each([
      ['support in', withFilters({ id: 'support', op: 'in', value: ['supported', 'partial'] }), ['s:r-a', 't:r-a', 's:r-b']],
      ['support notIn', withFilters({ id: 'support', op: 'notIn', value: ['supported'] }), ['s:r-b', 's:r-c', 's:r-d']],
      ['scope declared', withFilters({ id: 'scope', op: 'isNotEmpty' }), ['s:r-a']],
      ['scope not declared (null and {})', withFilters({ id: 'scope', op: 'isEmpty' }), ['t:r-a', 's:r-b', 's:r-c', 's:r-d']],
      ['requirementIds declared yes', withFilters({ id: 'requirementIds', op: 'isNotEmpty' }), ['s:r-a', 's:r-d']],
      ['requirementIds declared no', withFilters({ id: 'requirementIds', op: 'isEmpty' }), ['t:r-a', 's:r-b', 's:r-c']],
      ['one RuleSet', { filters: [{ id: 'ruleSetKey', op: 'in', value: [sT] }] }, ['t:r-a']],
    ])('filter %s', async (_name, params, expected) => {
      const a = await read('rules', { ...params, sorting: [{ id: 'ruleKey', desc: false }] });
      expect(keysOf(a)).toEqual(expected);
      expect(a.data.total).toBe(expected.length);
    });

    it.each([
      ['search over the key', { q: 'r-b' }, ['s:r-b']],
      ['search over the title (case-insensitive)', { q: 'ALPHA' }, ['s:r-a']],
      ['search over the summary with LIKE wildcards taken literally', { q: '100%_match' }, ['s:r-b']],
      ['a % alone matches no Rule', { q: '%' }, ['s:r-b']],
      ['target substring (verbatim text)', { targetQ: 'Ev_1 (verb' }, ['s:r-a']],
      ['target substring in a later target', { targetQ: 'second' }, ['s:r-a']],
      ['target search combined with a filter', { targetQ: 'x', filters: [...base.filters, { id: 'support', op: 'in', value: ['unsupported'] }] }, ['s:r-d']],
      ['no Rule body is searchable', { q: 'retired Revision' }, []],
    ])('%s', async (_name, extra, expected) => {
      const a = await read('rules', { ...base, ...extra, sorting: [{ id: 'ruleKey', desc: false }] });
      expect(keysOf(a)).toEqual(expected);
    });

    it('sorts by every allow-listed key and pages stably across ties', async () => {
      const ids = ['ruleSetKey', 'ruleKey', 'title', 'support', 'revision', 'targetCount', 'requirementIdCount'];
      for (const id of ids) {
        for (const desc of [false, true]) {
          const walk: string[] = [];
          for (let page = 0; page < 5; page++) {
            const a = await read('rules', { ...base, pageSize: 2, page, sorting: [{ id, desc }] });
            walk.push(...keysOf(a));
          }
          expect(walk, `${id} ${desc}`).toHaveLength(5);
          expect(new Set(walk).size, `${id} ${desc} repeats a row`).toBe(5);
        }
      }
      const bySupport = await read('rules', { ...base, sorting: [{ id: 'support', desc: false }] });
      expect(bySupport.data.rows.map((r: Row) => r.support)).toEqual(['supported', 'supported', 'partial', 'unsupported', 'unknown']);
    });

    it('a page past the end is empty with the true total', async () => {
      const a = await read('rules', { ...base, page: 9, pageSize: 2 });
      expect(a.data).toMatchObject({ rows: [], total: 5 });
    });
  });

  describe('ruleDetail', () => {
    it('returns the declared targets in order, requirement ids as plain strings and the support of every Revision', async () => {
      const s = key('detail');
      await seed(here(), key('src-detail'), [
        {
          ruleSetKey: s,
          revisions: [
            { revision: '1', status: 'retired', rules: [{ ruleKey: 'r', support: 'unknown', title: 'old title' }] },
            { revision: '2', supersedes: '1', rules: [{ ruleKey: 'r', support: 'supported', title: 'new title', scope: { processes: ['p1'] }, targets: [{ format: 'zeta', target: 'A <b>/ b', requirementIds: ['No/Such', 'X'] }, { format: 'alpha', target: 'second one' }] }] },
            { revision: '3', supersedes: '2', rules: [{ ruleKey: 'other' }] },
          ],
        },
      ]);
      const d = (await read('ruleDetail', { ruleSetKey: s, ruleKey: 'r' })).data;
      // Revision 3 is current but lacks the Rule: the detail comes from the latest Revision that carries it.
      expect(d).toMatchObject({ ruleSetKey: s, ruleKey: 'r', revision: '2', inCurrentRevision: false, title: 'new title', support: 'supported', scope: { processes: ['p1'] } });
      expect(d.targets).toEqual([
        { position: 0, format: 'zeta', target: 'A <b>/ b', requirementIds: ['No/Such', 'X'] },
        { position: 1, format: 'alpha', target: 'second one', requirementIds: [] },
      ]);
      expect(d.revisions).toEqual([
        { revision: '1', status: 'retired', retired: true, isCurrent: false, support: 'unknown' },
        { revision: '2', status: 'active', retired: false, isCurrent: false, support: 'supported' },
        { revision: '3', status: 'active', retired: false, isCurrent: true, support: null },
      ]);
      expect(Object.keys(d).sort()).not.toContain('body');
    });

    it('uses the current Revision when it carries the Rule', async () => {
      const s = key('detail2');
      await seed(here(), key('src-detail2'), [{ ruleSetKey: s, revisions: [{ revision: '1', rules: [{ ruleKey: 'r' }] }] }]);
      expect((await read('ruleDetail', { ruleSetKey: s, ruleKey: 'r' })).data).toMatchObject({ revision: '1', inCurrentRevision: true });
    });

    it('compares keys exactly: a different case or an unknown Rule is null', async () => {
      const s = key('detail3');
      await seed(here(), key('src-detail3'), [{ ruleSetKey: s, revisions: [{ revision: '1', rules: [{ ruleKey: 'Rule-A' }] }] }]);
      expect((await read('ruleDetail', { ruleSetKey: s, ruleKey: 'rule-a' })).data).toBeNull();
      expect((await read('ruleDetail', { ruleSetKey: s.toLowerCase(), ruleKey: 'Rule-A' })).data).toBeNull();
      expect((await read('ruleDetail', { ruleSetKey: s, ruleKey: 'Rule-A' })).data).not.toBeNull();
    });
  });

  describe('the current catalog', () => {
    it('a superseded report shows nothing of its own content; a rejected report never appears', async () => {
      const s = key('cur');
      const src = key('src-cur');
      const older = await seed(here(), src, [{ ruleSetKey: s, revisions: [{ revision: '1', rules: [{ ruleKey: 'old-rule' }, { ruleKey: 'kept' }] }] }], { reportedAt: '2026-10-01T00:00:00Z' });
      await seed(here(), src, [{ ruleSetKey: s, revisions: [{ revision: '1', rules: [{ ruleKey: 'kept', support: 'partial' }, { ruleKey: 'new-rule' }] }] }], { reportedAt: '2026-11-02T00:00:00Z', replaces: older });
      await seed(here(), key('src-cur-rej'), [{ ruleSetKey: s, revisions: [{ revision: '1', rules: [{ ruleKey: 'rejected-rule' }] }] }], { outcome: 'rejected' });
      const rules = await read('rules', { filters: [{ id: 'ruleSetKey', op: 'in', value: [s] }], sorting: [{ id: 'ruleKey', desc: false }] });
      expect(rules.data.rows.map((r: Row) => [r.ruleKey, r.support])).toEqual([['kept', 'partial'], ['new-rule', 'supported']]);
      expect((await read('ruleSets', only(s))).data.rows[0]).toMatchObject({ lastReportedAt: '2026-11-02T00:00:00.000Z' });
      expect((await read('ruleDetail', { ruleSetKey: s, ruleKey: 'old-rule' })).data).toBeNull();
      expect((await read('ruleDetail', { ruleSetKey: s, ruleKey: 'rejected-rule' })).data).toBeNull();
    });

    it('a RuleSet that only a rejected report names does not exist', async () => {
      const s = key('rejonly');
      await seed(here(), key('src-rejonly'), [{ ruleSetKey: s, revisions: [{ revision: '1', rules: [{ ruleKey: 'a' }] }] }], { outcome: 'rejected' });
      expect(await read('ruleSets', only(s))).toMatchObject({ data: { rows: [], total: 0 } });
      expect((await read('ruleSetDetail', { ruleSetKey: s })).data).toBeNull();
    });

    it('catalogStatus names the source, version and time of the most recent current report, and whether requirement ids are declared', async () => {
      const src = key('src-status');
      await seed(here(), src, [{ ruleSetKey: key('status'), revisions: [{ revision: '1', rules: [{ ruleKey: 'a', targets: [{ format: 'f', target: 't', requirementIds: ['Mod/Ev'] }] }, { ruleKey: 'b' }] }] }], { validatorVersion: '7.7-synthetic', reportedAt: '2999-01-01T00:00:00Z' });
      const d = (await read('catalogStatus')).data;
      expect(d).toMatchObject({ received: true, sourceSystem: src, validatorVersion: '7.7-synthetic', lastReportedAt: '2999-01-01T00:00:00.000Z', requirementIdsDeclared: true });
      expect(d.sources.map((x: Row) => x.sourceSystem)).toContain(src);
      expect(d.ruleCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('a workspace of its own', () => {
    it('catalogStatus of a workspace with no accepted report is «not received», not an error; a rejected report does not change that', async () => {
      const ws = await workspaceWithActor();
      expect(await getCatalogStatus(dbFor(), ws.workspaceId)).toEqual({
        received: false, lastReportedAt: null, sourceSystem: null, validatorVersion: null, sources: [], ruleSetCount: 0, ruleCount: 0, requirementIdsDeclared: null,
      });
      await seed(ws, key('src-nr'), [{ ruleSetKey: 'rs', revisions: [{ revision: '1', rules: [{ ruleKey: 'a' }] }] }], { outcome: 'rejected' });
      expect((await getCatalogStatus(dbFor(), ws.workspaceId)).received).toBe(false);
      const list = parseRuleSetParams({});
      if (!list.ok) throw new Error(list.message);
      expect(await listRuleSets(dbFor(), { ...list.value, workspaceId: ws.workspaceId })).toEqual({ total: 0, rows: [] });
    });

    it('an accepted catalog that declares no requirement id says so', async () => {
      const ws = await workspaceWithActor();
      await seed(ws, key('src-noreq'), [{ ruleSetKey: 'rs', revisions: [{ revision: '1', rules: [{ ruleKey: 'a', targets: [{ format: 'f', target: 't' }] }, { ruleKey: 'b' }] }] }]);
      expect(await getCatalogStatus(dbFor(), ws.workspaceId)).toMatchObject({ received: true, requirementIdsDeclared: false, ruleSetCount: 1, ruleCount: 2 });
    });

    it('a retired Revision\'s requirement ids count as declared for the catalog', async () => {
      const ws = await workspaceWithActor();
      await seed(ws, key('src-retreq'), [
        { ruleSetKey: 'rs', revisions: [{ revision: '1', status: 'retired', rules: [{ ruleKey: 'a', targets: [{ format: 'f', target: 't', requirementIds: ['M/E'] }] }] }, { revision: '2', supersedes: '1', rules: [{ ruleKey: 'a' }] }] },
      ]);
      expect(await getCatalogStatus(dbFor(), ws.workspaceId)).toMatchObject({ requirementIdsDeclared: true, ruleCount: 1 });
    });

    it('another workspace\'s catalog is invisible on every read: null or empty, never a refusal', async () => {
      const s = key('iso');
      await seed(foreign, key('src-iso'), [{ ruleSetKey: s, revisions: [{ revision: '1', rules: [{ ruleKey: 'secret-rule', targets: [{ format: 'f', target: 'foreign target' }] }] }] }]);
      expect(await read('ruleSets', { q: s })).toMatchObject({ outcome: 'ok', data: { rows: [], total: 0 } });
      expect(await read('ruleSetDetail', { ruleSetKey: s })).toMatchObject({ outcome: 'ok', data: null });
      expect(await read('ruleDetail', { ruleSetKey: s, ruleKey: 'secret-rule' })).toMatchObject({ outcome: 'ok', data: null });
      expect(await read('rules', { q: 'secret-rule' })).toMatchObject({ outcome: 'ok', data: { rows: [], total: 0 } });
      expect(await read('rules', { targetQ: 'foreign target' })).toMatchObject({ outcome: 'ok', data: { rows: [], total: 0 } });
      const status = (await read('catalogStatus')).data;
      expect(status.sources.map((x: Row) => x.sourceSystem)).not.toContain(key('src-iso'));
      // ...and it is there for its own workspace.
      expect((await getRuleDetail(dbFor(), foreign.workspaceId, { ruleSetKey: s, ruleKey: 'secret-rule' }))?.targets[0]?.target).toBe('foreign target');
      expect(await getRuleSetDetail(dbFor(), WORKSPACE_ID, s)).toBeNull();
    });

    it('a large catalog (5,000 Rules) pages, filters and searches targets within a second each', async () => {
      const ws = await workspaceWithActor();
      const report = randomUUID();
      reportIds.push(report);
      const revision = randomUUID();
      await sql(`insert into log_rules.catalog_report (id, workspace_id, source_system, reported_by_actor_id, validator_version, report_digest, outcome) values ($1,$2,$3,$4,'v',$5,'accepted')`, [report, ws.workspaceId, key('src-big'), ws.actorId, digest()]);
      await sql(`insert into log_rules.rule_set_revision (id, workspace_id, report_id, rule_set_key, revision, result_ref, revision_digest, status) values ($1,$2,$3,'big','1','1',$4,'active')`, [revision, ws.workspaceId, report, digest()]);
      await sql(
        `insert into log_rules.rule (workspace_id, rule_set_revision_id, rule_key, title, summary, support, rule_digest)
         select $1, $2, 'rule-' || lpad(i::text, 5, '0'), 'title ' || i, 'summary ' || i, (array['supported','partial','unsupported','unknown'])[1 + i % 4], $3 from generate_series(1, 5000) i`,
        [ws.workspaceId, revision, digest()],
      );
      await sql(
        `insert into log_rules.rule_target (workspace_id, rule_id, position, format, target, requirement_ids)
         select r.workspace_id, r.id, p, 'fmt', 'target ' || r.rule_key || '/' || p, case when p = 0 then array['M' || r.rule_key] else '{}' end
         from log_rules.rule r, generate_series(0, 1) p where r.rule_set_revision_id = $1`,
        [revision],
      );
      const timed: Record<string, number> = {};
      const run = async (name: string, params: Record<string, unknown>) => {
        const parsed = parseRuleParams(params);
        if (!parsed.ok) throw new Error(parsed.message);
        const t0 = performance.now();
        const page = await listRules(dbFor(), { ...parsed.value, workspaceId: ws.workspaceId });
        timed[name] = Math.round(performance.now() - t0);
        return page;
      };
      const first = await run('first page', { pageSize: 200 });
      expect(first.total).toBe(5000);
      const deep = await run('deep page, sorted by support', { page: 24, pageSize: 200, sorting: [{ id: 'support', desc: false }] });
      expect(deep.rows).toHaveLength(200);
      const ids = await run('requirementIds yes', { filters: [{ id: 'requirementIds', op: 'isNotEmpty' }] });
      expect(ids.total).toBe(5000);
      const target = await run('target substring', { targetQ: 'rule-04999/1' });
      expect(target.rows.map((r) => r.ruleKey)).toEqual(['rule-04999']);
      const text = await run('text search', { q: 'summary 49' });
      expect(text.total).toBe(111);
      console.info('log-rules rules page timings (ms, 5,000 Rules):', JSON.stringify(timed));
      for (const [name, ms] of Object.entries(timed)) expect(ms, name).toBeLessThan(1000);
    });
  });
});
