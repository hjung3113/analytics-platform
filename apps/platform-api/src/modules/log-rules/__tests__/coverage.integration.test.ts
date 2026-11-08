// #1494 R-d — spec coverage (`logRules.coverage|coverageSummary`, `RuleCoveragePort`) against a real Postgres (throwaway DB
// only; `pnpm --filter @ap/platform-api test:integration`; app as platform_app, fixtures and cleanup as platform_migrate).
// The port cases run in a private workspace (the catalog is workspace-wide, so «no catalog» needs an empty one); the route
// cases run in the shared workspace with TAG-prefixed requirement keys. Every label is a synthetic fixture.

import { createHash, randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../../log-knowledge/domain/code-key.js';
import { knowledgeLookup } from '../../log-knowledge/index.js';
import { createRuleCoveragePort } from '../coverage-port.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `LRD${randomUUID().slice(0, 6).toUpperCase()}`;
const DOC = JSON.stringify({ docLabel: 'Synthetic log spec', docVersion: 'v1' });

interface SeedRule {
  ruleKey: string;
  support?: string;
  scope?: Record<string, unknown> | null;
  targets?: { requirementIds?: string[] }[];
}
interface SeedSet {
  ruleSetKey: string;
  revisions: { revision: string; status?: 'active' | 'retired'; supersedes?: string | null; digest?: string; resultRef?: string; rules?: SeedRule[] }[];
}
interface Answer {
  outcome: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  data: any;
  message?: string;
}

const TRIGGERS = [
  ['rule_target', 'rule_target_append_only'],
  ['rule', 'rule_append_only'],
  ['rule_set_revision', 'rule_set_revision_append_only'],
  ['catalog_report', 'catalog_report_no_delete'],
  ['catalog_report', 'catalog_report_guard'],
] as const;

describe.skipIf(!runIntegration)('spec coverage (#1494)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let admin: { id: string; cookie: string };
  let actorId = '';
  let privateWs = '';
  let vendorShared = '';
  let vendorPrivate = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const reportIds: string[] = [];
  const port = createRuleCoveragePort({ knowledgeLookup });

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0].id as string;
  const digest = () => createHash('sha256').update(randomUUID()).digest('hex');
  const getCoverage = (ws: string, modelId: string, software: string | null = null) =>
    dbHandle.db.transaction((tx) => port.getCoverage(tx, ws, modelId, software, actorId));
  const stateMap = (r: Awaited<ReturnType<typeof getCoverage>>) => {
    if (!r.computable) throw new Error(`not computable: ${r.reason}`);
    return Object.fromEntries(r.requirements.map((x) => [x.key, x.state]));
  };

  const catalog = (table: string, workspace: string, code: string, extra: Record<string, unknown> = {}) => {
    const cols = { workspace_id: workspace, code, code_key: toCodeKey(code), name: code, created_by: actorId, updated_by: actorId, ...extra };
    return one(`insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, n) => `$${n + 1}`).join(',')}) returning id`, Object.values(cols));
  };
  const model = (workspace: string, vendor: string, name: string) => catalog('equipment_model', workspace, `${TAG}-${name}`, { vendor_id: vendor });
  const publish = async (workspace: string, modelId: string, modules: string[], events: [string, string][]) => {
    const rev = await one(
      `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,1,'draft',$3::jsonb,1,$4) returning id`,
      [workspace, modelId, DOC, actorId],
    );
    const moduleIds: Record<string, string> = {};
    for (const key of modules) {
      moduleIds[key] = await one(`insert into knowledge.spec_module (workspace_id, spec_rev_id, module_key, name) values ($1,$2,$3,$4) returning id`, [workspace, rev, key, `Module ${key}`]);
    }
    for (const [moduleKey, eventKey] of events) {
      await sql(`insert into knowledge.spec_event (workspace_id, spec_rev_id, module_id, event_key, name, fields_json) values ($1,$2,$3,$4,$5,'[]'::jsonb)`, [workspace, rev, moduleIds[moduleKey], eventKey, `Event ${eventKey}`]);
    }
    await sql(`update knowledge.model_spec_revision set state = 'published', content_sha256 = $2, published_by = $3, published_at = now() where id = $1`, [rev, '1'.padStart(64, '0'), actorId]);
    return rev;
  };

  async function seed(workspace: string, source: string, sets: SeedSet[], opts: { outcome?: 'accepted' | 'rejected'; replaces?: string } = {}): Promise<string> {
    const outcome = opts.outcome ?? 'accepted';
    const reportId = randomUUID();
    reportIds.push(reportId);
    const client = await migrate.pool.connect();
    const q = (text: string, params: unknown[]) => client.query(text, params);
    try {
      await client.query('begin');
      if (opts.replaces) await q('update log_rules.catalog_report set superseded_at = now(), superseded_by_report_id = $2 where id = $1', [opts.replaces, reportId]);
      await q(
        `insert into log_rules.catalog_report (id, workspace_id, source_system, reported_by_actor_id, validator_version, report_digest, outcome, reject_reason) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [reportId, workspace, source, actorId, outcome === 'accepted' ? '0.0-synthetic' : null, digest(), outcome, outcome === 'rejected' ? 'unknown_field' : null],
      );
      for (const set of sets) {
        for (const rev of set.revisions) {
          const revisionId = randomUUID();
          await q(
            `insert into log_rules.rule_set_revision (id, workspace_id, report_id, rule_set_key, revision, result_ref, revision_digest, status, supersedes) values ($1,$2,$3,$4,$5,$9,$6,$7,$8)`,
            [revisionId, workspace, reportId, set.ruleSetKey, rev.revision, rev.digest ?? digest(), rev.status ?? 'active', rev.supersedes ?? null, rev.resultRef ?? rev.revision],
          );
          for (const rule of rev.rules ?? []) {
            const ruleId = randomUUID();
            await q(
              `insert into log_rules.rule (id, workspace_id, rule_set_revision_id, rule_key, title, summary, support, scope, rule_digest) values ($1,$2,$3,$4,'합성 fixture','합성 fixture summary',$5,$6::jsonb,$7)`,
              [ruleId, workspace, revisionId, rule.ruleKey, rule.support ?? 'supported', rule.scope ? JSON.stringify(rule.scope) : null, digest()],
            );
            for (const [position, t] of (rule.targets ?? []).entries()) {
              await q(`insert into log_rules.rule_target (workspace_id, rule_id, position, format, target, requirement_ids) values ($1,$2,$3,'synthetic','t',$4)`, [workspace, ruleId, position, t.requirementIds ?? []]);
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
  const set = (key: string, rules: SeedRule[], revision = '1', extra: Partial<SeedSet['revisions'][number]> = {}): SeedSet => ({ ruleSetKey: `${TAG}-${key}`, revisions: [{ revision, rules, ...extra }] });
  const rule = (ruleKey: string, support: string, ...ids: string[]): SeedRule => ({ ruleKey, support, targets: [{ requirementIds: ids }] });

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
  /** Private-workspace tests start from an empty catalog. */
  async function resetPrivate() {
    const ids = (await sql('select id from log_rules.catalog_report where workspace_id = $1', [privateWs])).rows.map((r) => r.id as string);
    await clearReports(ids);
  }
  async function read(endpoint: string, params: Record<string, unknown> = {}): Promise<Answer> {
    await sql('delete from core.rate_limits where key like $1', [`${WORKSPACE_ID}:${admin.id}%`]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${admin.cookie}` },
      payload: JSON.stringify({ endpoint: `logRules.${endpoint}`, context: {}, params }),
    });
    expect(res.statusCode, res.body).toBe(200);
    return res.json<Answer>();
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    const externalId = `${TAG}-admin`;
    admin = { ...(await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'admin' })), cookie: '' };
    actorId = admin.id;
    actorIds.push(actorId);
    admin.cookie = await loginAs(app, externalId);
    privateWs = await one('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`]);
    workspaceIds.push(privateWs);
    vendorShared = await catalog('vendor', WORKSPACE_ID, `${TAG}-v`);
    vendorPrivate = await catalog('vendor', privateWs, `${TAG}-vp`);
  }, 60_000);

  afterAll(async () => {
    await clearReports(reportIds);
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    await sql(`delete from knowledge.spec_event where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_module where spec_rev_id in ${revs}`, [actorIds]);
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    for (const table of ['software_version', 'equipment_model', 'vendor']) {
      await sql(`delete from knowledge.${table} where workspace_id = any($1) and created_by = any($2)`, [[WORKSPACE_ID, privateWs], actorIds]);
    }
    await sql('delete from core.sessions where actor_id = any($1)', [actorIds]);
    await sql('delete from core.actors where id = any($1)', [actorIds]);
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('computability (port, private workspace)', () => {
    it('no_catalog: nothing reported, a rejected report and a fully superseded-away catalog never read as 0%', async () => {
      await resetPrivate();
      const m = await model(privateWs, vendorPrivate, 'nocat');
      await publish(privateWs, m, ['A'], []);
      expect(await getCoverage(privateWs, m)).toMatchObject({ computable: false, reason: 'no_catalog' });
      await seed(privateWs, 'src', [set('rej', [rule('r', 'supported', 'A')])], { outcome: 'rejected' });
      expect(await getCoverage(privateWs, m)).toMatchObject({ computable: false, reason: 'no_catalog' });
    });

    it('no_requirement_ids: rules without ids, or ids only on a retired Revision, are not all-no_rule', async () => {
      await resetPrivate();
      const m = await model(privateWs, vendorPrivate, 'noids');
      await publish(privateWs, m, ['A'], []);
      await seed(privateWs, 'src', [
        set('plain', [{ ruleKey: 'r1', support: 'supported', targets: [{ requirementIds: [] }, {}] }]),
        { ruleSetKey: `${TAG}-old`, revisions: [{ revision: '1', status: 'retired', rules: [rule('r2', 'supported', 'A')] }] },
      ]);
      expect(await getCoverage(privateWs, m)).toMatchObject({ computable: false, reason: 'no_requirement_ids' });
    });

    it('no_spec, model_unknown (unknown, other workspace) and ambiguous_key are distinct reasons', async () => {
      await resetPrivate();
      await seed(privateWs, 'src', [set('s', [rule('r', 'supported', 'A')])]);
      const nospec = await model(privateWs, vendorPrivate, 'nospec');
      expect(await getCoverage(privateWs, nospec)).toMatchObject({ computable: false, reason: 'no_spec', specPin: null });
      expect(await getCoverage(privateWs, randomUUID())).toMatchObject({ computable: false, reason: 'model_unknown' });
      const shared = await model(WORKSPACE_ID, vendorShared, 'otherws');
      expect(await getCoverage(privateWs, shared)).toMatchObject({ computable: false, reason: 'model_unknown' });
      const amb = await model(privateWs, vendorPrivate, 'amb');
      await publish(privateWs, amb, ['a/b'], []);
      const r = await getCoverage(privateWs, amb);
      expect(r).toMatchObject({ computable: false, reason: 'ambiguous_key', ambiguousKeys: ['a/b'] });
      expect(r.specPin).not.toBeNull();
    });
  });

  describe('states and the current catalog (port)', () => {
    it('matches exact strings only and counts only current active Revisions of accepted, current reports', async () => {
      await resetPrivate();
      const m = await model(privateWs, vendorPrivate, 'states');
      await publish(privateWs, m, ['m', 'M', 'n'], [['m', 'e'], ['M', 'E'], ['n', 'x'], ['n', 'y']]);
      const first = await seed(privateWs, 'src', [
        set('cur', [
          rule('exact', 'supported', 'm/e'),
          rule('cases', 'supported', 'm/E', 'M/e', 'm ', ' m', 'm/', 'm/e/x'),
          rule('part', 'partial', 'n'),
          rule('uns', 'unsupported', 'n/x'),
          rule('unk', 'unknown', 'n/y'),
          rule('mod', 'supported', 'M'),
        ]),
        { ruleSetKey: `${TAG}-chain`, revisions: [
          { revision: '1', status: 'active', rules: [rule('old', 'supported', 'M/E')] },
          { revision: '2', status: 'active', supersedes: '1', rules: [rule('new', 'unsupported', 'M/E')] },
        ] },
        { ruleSetKey: `${TAG}-retired`, revisions: [{ revision: '9', status: 'retired', rules: [rule('gone', 'supported', 'n/y')] }] },
      ]);
      // A newer report of the same source replaces the first one; the first must not count any more.
      await seed(privateWs, 'src', [
        set('cur', [rule('exact', 'supported', 'm/e'), rule('part', 'partial', 'n'), rule('uns', 'unsupported', 'n/x'), rule('unk', 'unknown', 'n/y'), rule('mod', 'supported', 'M')]),
        { ruleSetKey: `${TAG}-chain`, revisions: [
          { revision: '1', status: 'active', rules: [rule('old', 'supported', 'M/E')] },
          { revision: '2', status: 'active', supersedes: '1', rules: [rule('new', 'unsupported', 'M/E')] },
        ] },
        { ruleSetKey: `${TAG}-retired`, revisions: [{ revision: '9', status: 'retired', rules: [rule('gone', 'supported', 'n/y')] }] },
      ], { replaces: first });
      const r = await getCoverage(privateWs, m);
      expect(stateMap(r)).toEqual({ m: 'no_rule', M: 'covered', n: 'partial', 'm/e': 'covered', 'M/E': 'unsupported', 'n/x': 'unsupported', 'n/y': 'unknown' });
      // The retired RuleSet and the superseded revision 1 are not in the Revisions the digest covers.
      if (!r.computable) throw new Error('x');
      expect(r.ruleSetRevisions.map((v) => `${v.ruleSetKey}@${v.revision}`).sort()).toEqual([`${TAG}-chain@2`, `${TAG}-cur@1`]);
    });

    it('a superseded report does not count even when the newer one drops the Rule (replacement is the whole snapshot)', async () => {
      await resetPrivate();
      const m = await model(privateWs, vendorPrivate, 'repl');
      await publish(privateWs, m, ['A', 'B'], []);
      const first = await seed(privateWs, 'src', [set('s', [rule('r1', 'supported', 'A')])]);
      expect(stateMap(await getCoverage(privateWs, m))).toEqual({ A: 'covered', B: 'no_rule' });
      await seed(privateWs, 'src', [set('s', [rule('r2', 'supported', 'B')], '2')], { replaces: first });
      expect(stateMap(await getCoverage(privateWs, m))).toEqual({ A: 'no_rule', B: 'covered' });
    });

    it('scope is a free label: a Rule with a scope counts by support alone', async () => {
      await resetPrivate();
      const m = await model(privateWs, vendorPrivate, 'scope');
      await publish(privateWs, m, ['A'], []);
      await seed(privateWs, 'src', [set('s', [{ ruleKey: 'r', support: 'supported', scope: { modelIds: ['someone-else'] }, targets: [{ requirementIds: ['A'] }] }])]);
      expect(stateMap(await getCoverage(privateWs, m))).toEqual({ A: 'covered' });
    });

    it('another workspace catalog never counts', async () => {
      await resetPrivate();
      const m = await model(privateWs, vendorPrivate, 'iso');
      await publish(privateWs, m, ['A'], []);
      const foreignReport = await seed(WORKSPACE_ID, `${TAG}-iso`, [set('iso', [rule('r', 'supported', 'A')])]);
      expect(await getCoverage(privateWs, m)).toMatchObject({ computable: false, reason: 'no_catalog' });
      await clearReports([foreignReport]);
    });

    it('digest: stable on re-read, changed by a new report; the pin is the model spec revision', async () => {
      await resetPrivate();
      const m = await model(privateWs, vendorPrivate, 'dig');
      const rev = await publish(privateWs, m, ['A'], []);
      const first = await seed(privateWs, 'src', [set('s', [rule('r', 'supported', 'A')])]);
      const a = await getCoverage(privateWs, m);
      const b = await getCoverage(privateWs, m);
      if (!a.computable || !b.computable) throw new Error('x');
      expect(a.coverageDigest).toBe(b.coverageDigest);
      expect(a.specPin.revisionId).toBe(rev);
      await seed(privateWs, 'src', [set('s', [rule('r', 'supported', 'A')], '2')], { replaces: first });
      const c = await getCoverage(privateWs, m);
      if (!c.computable) throw new Error('x');
      expect(c.coverageDigest).not.toBe(a.coverageDigest);
    });

    it('resolveRuleSetRevision: current catalog only, exact, ambiguity is null', async () => {
      await resetPrivate();
      const first = await seed(privateWs, 'src', [
        { ruleSetKey: `${TAG}-rv`, revisions: [{ revision: '1', status: 'retired' }, { revision: '2', status: 'active' }] },
      ]);
      const resolve = (key: string, rev: string) => dbHandle.db.transaction((tx) => port.resolveRuleSetRevision(tx, privateWs, key, rev));
      expect(await resolve(`${TAG}-rv`, '2')).toMatchObject({ revision: '2', status: 'active', isCurrent: true });
      expect(await resolve(`${TAG}-rv`, '1')).toMatchObject({ status: 'retired', isCurrent: false });
      expect(await resolve(`${TAG}-rv`, '3')).toBeNull();
      expect(await resolve(`${TAG}-RV`, '2')).toBeNull();
      expect(await resolve(`${TAG}-rv`, '2 ')).toBeNull();
      // "10" is revision "10" and also the resultRef of revision "9" (each unique on its own): ambiguous, so null.
      await seed(privateWs, 'src2', [
        { ruleSetKey: `${TAG}-amb`, revisions: [{ revision: '9', status: 'active', resultRef: '10' }, { revision: '10', status: 'active', resultRef: 'ext-10' }, { revision: '11', status: 'active', resultRef: 'ext-11' }] },
      ]);
      expect(await resolve(`${TAG}-amb`, '10')).toBeNull();
      expect(await resolve(`${TAG}-amb`, 'ext-11')).toMatchObject({ revision: '11' });
      await seed(privateWs, 'src', [], { replaces: first });
      expect(await resolve(`${TAG}-rv`, '2')).toBeNull();
    });
    it('findRuleSetRevision / checkRuleKeys (#1496): matched, ambiguous across RuleSets, unknown, no_catalog', async () => {
      await resetPrivate();
      const find = (ref: string) => dbHandle.db.transaction((tx) => port.findRuleSetRevision(tx, privateWs, ref));
      const check = (ref: string, ids: string[]) => dbHandle.db.transaction((tx) => port.checkRuleKeys(tx, privateWs, ref, ids));
      expect(await find('rv-1')).toEqual({ state: 'no_catalog' });
      expect(await check('rv-1', ['x'])).toEqual({ state: 'unresolved', reason: 'no_catalog' });
      await seed(privateWs, 'src', [
        { ruleSetKey: `${TAG}-fa`, revisions: [{ revision: 'fa-1', rules: [{ ruleKey: 'R-1' }, { ruleKey: 'R-2' }] }, { revision: 'fa-2', status: 'active', supersedes: 'fa-1', resultRef: 'ext-fa-2', rules: [{ ruleKey: 'R-1' }] }] },
        { ruleSetKey: `${TAG}-fb`, revisions: [{ revision: 'shared' }] },
        { ruleSetKey: `${TAG}-fc`, revisions: [{ revision: 'shared' }] },
      ]);
      expect(await find('ext-fa-2')).toMatchObject({ state: 'matched', ruleSetKey: `${TAG}-fa`, revision: 'fa-2', isCurrent: true });
      expect(await find('fa-1')).toMatchObject({ state: 'matched', isCurrent: false });
      expect(await find('shared')).toEqual({ state: 'ambiguous', count: 2 });
      expect(await find('nope')).toEqual({ state: 'unknown' });
      expect(await check('fa-1', ['R-1', 'R-2', 'R-3'])).toEqual({ state: 'checked', missing: ['R-3'] });
      expect(await check('fa-2', ['R-1', 'R-2'])).toEqual({ state: 'checked', missing: ['R-2'] });
      expect(await check('shared', ['R-1'])).toEqual({ state: 'unresolved', reason: 'ambiguous' });
      expect(await check('nope', ['R-1'])).toEqual({ state: 'unresolved', reason: 'unknown' });
    });
  });

  describe('picker options (#1496)', () => {
    it('modelOptions: q, paging, ids + display text only; softwareOptions in release order; unknown model empty', async () => {
      const a = await model(WORKSPACE_ID, vendorShared, 'optA');
      await model(WORKSPACE_ID, vendorShared, 'optB');
      const sw1 = await one(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,'1.0','1.0','one',$3,$3) returning id`, [WORKSPACE_ID, a, actorId]);
      const sw2 = await one(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,'2.0','2.0','two',$3,$3) returning id`, [WORKSPACE_ID, a, actorId]);
      const found = await read('modelOptions', { q: `${TAG}-opt`, pageSize: 1 });
      expect(found.data.total).toBe(2);
      expect(found.data.rows).toHaveLength(1);
      expect(found.data.rows[0]).toEqual({ id: a, code: `${TAG}-optA`, name: `${TAG}-optA`, vendorName: expect.any(String), active: true });
      expect((await read('modelOptions', { q: `${TAG}-opt`, pageSize: 1, page: 1 })).data.rows).toHaveLength(1);
      expect((await read('modelOptions', { q: `${TAG}-nothing` })).data).toMatchObject({ total: 0, rows: [] });
      expect((await read('softwareOptions', { modelId: a })).data.rows.map((r: { id: string }) => r.id)).toEqual([sw1, sw2]);
      expect((await read('softwareOptions', { modelId: randomUUID() })).data.rows).toEqual([]);
      expect(await read('modelOptions', { pageSize: 0 })).toMatchObject({ outcome: 'error' });
    });
  });

  describe('menu endpoints (shared workspace)', () => {
    it('coverage: states, counts, default order (no_rule first), paging, and the digest', async () => {
      const m = await model(WORKSPACE_ID, vendorShared, 'route');
      await publish(WORKSPACE_ID, m, [`${TAG}-a`, `${TAG}-b`, `${TAG}-c`], [[`${TAG}-a`, 'e']]);
      reportIds.push(await seed(WORKSPACE_ID, `${TAG}-src`, [set('rt', [rule('r1', 'supported', `${TAG}-a`), rule('r2', 'partial', `${TAG}-b`), rule('r3', 'unsupported', `${TAG}-b`)])]));
      const all = await read('coverage', { modelId: m });
      expect(all.outcome).toBe('ok');
      expect(all.data.computable).toBe(true);
      expect(all.data.rows.map((r: { key: string; state: string }) => `${r.key}:${r.state}`)).toEqual([
        `${TAG}-a/e:no_rule`,
        `${TAG}-c:no_rule`,
        `${TAG}-b:partial`,
        `${TAG}-a:covered`,
      ]);
      expect(all.data.counts).toEqual({ no_rule: 2, unsupported: 0, unknown: 0, partial: 1, covered: 1, total: 4 });
      expect(all.data.rows[3].declaredBy).toEqual([{ ruleSetKey: `${TAG}-rt`, revision: '1', ruleKey: 'r1', support: 'supported' }]);
      expect(all.data.coverageDigest).toMatch(/^[0-9a-f]{64}$/);
      const page = await read('coverage', { modelId: m, pageSize: 2, page: 1 });
      expect(page.data.rows.map((r: { key: string }) => r.key)).toEqual([`${TAG}-b`, `${TAG}-a`]);
      expect(page.data.total).toBe(4);
      expect(page.data.coverageDigest).toBe(all.data.coverageDigest);
    });

    it('coverage: unknown model / other-workspace model / software of another model → ok with data null; bad params → error', async () => {
      expect(await read('coverage', { modelId: randomUUID() })).toMatchObject({ outcome: 'ok', data: null });
      const foreign = await model(privateWs, vendorPrivate, 'foreign');
      expect(await read('coverage', { modelId: foreign })).toMatchObject({ outcome: 'ok', data: null });
      const m = await model(WORKSPACE_ID, vendorShared, 'sw');
      expect(await read('coverage', { modelId: m, softwareId: randomUUID() })).toMatchObject({ outcome: 'ok', data: null });
      for (const params of [{}, { modelId: 'x' }, { modelId: m, pageSize: 0 }, { modelId: m, page: -1 }, { modelId: m, extra: 1 }]) {
        expect(await read('coverage', params)).toMatchObject({ outcome: 'error', data: null });
      }
    });

    it('coverage: not computable is answered as a reason, not as rows', async () => {
      const m = await model(WORKSPACE_ID, vendorShared, 'nospecroute');
      const r = await read('coverage', { modelId: m });
      expect(r.outcome).toBe('ok');
      expect(r.data).toMatchObject({ computable: false, reason: 'no_spec' });
      expect(r.data.rows).toBeUndefined();
    });

    it('coverageSummary: counts per model, reasons per model, duplicates folded, cap enforced', async () => {
      const m = await model(WORKSPACE_ID, vendorShared, 'sum');
      await publish(WORKSPACE_ID, m, [`${TAG}-s1`], []);
      const nospec = await model(WORKSPACE_ID, vendorShared, 'sumnospec');
      reportIds.push(await seed(WORKSPACE_ID, `${TAG}-src2`, [set('sm', [rule('r', 'supported', `${TAG}-s1`)])]));
      const ghost = randomUUID();
      const r = await read('coverageSummary', { modelIds: [m, nospec, ghost, m] });
      expect(r.outcome).toBe('ok');
      expect(r.data.rows).toHaveLength(3);
      expect(r.data.rows[0]).toMatchObject({ modelId: m, computable: true, counts: { covered: 1, total: 1 } });
      expect(r.data.rows[1]).toMatchObject({ modelId: nospec, computable: false, reason: 'no_spec' });
      expect(r.data.rows[2]).toMatchObject({ modelId: ghost, computable: false, reason: 'model_unknown' });
      expect(await read('coverageSummary', { modelIds: Array.from({ length: 51 }, () => randomUUID()) })).toMatchObject({ outcome: 'error', data: null });
    });
  });

  describe('cost', () => {
    it('a model of 600 requirement keys against 5,000 Rules (measured, not asserted tightly)', async () => {
      await resetPrivate();
      const m = await model(privateWs, vendorPrivate, 'big');
      const modules = Array.from({ length: 100 }, (_, i) => `M${i}`);
      const events: [string, string][] = modules.flatMap((mod) => Array.from({ length: 5 }, (_, j): [string, string] => [mod, `E${j}`]));
      await publish(privateWs, m, modules, events);
      const keys = [...modules, ...events.map(([a, b]) => `${a}/${b}`)];
      // 5,000 Rules in 10 RuleSets, each declaring two keys, spread over the 600 keys.
      const sets: SeedSet[] = Array.from({ length: 10 }, (_, s) => ({
        ruleSetKey: `${TAG}-big${s}`,
        revisions: [{ revision: '1', rules: Array.from({ length: 500 }, (_, i) => rule(`r${i}`, ['supported', 'partial', 'unsupported', 'unknown'][i % 4] as string, keys[(s * 500 + i) % keys.length] as string, keys[(s * 500 + i * 7) % keys.length] as string)) }],
      }));
      await seed(privateWs, 'src', sets);
      const started = performance.now();
      const r = await getCoverage(privateWs, m);
      const ms = Math.round(performance.now() - started);
      if (!r.computable) throw new Error('x');
      expect(r.requirements).toHaveLength(600);
      console.info(`[#1494 cost] 600 keys x 5000 rules: ${ms} ms`);
      expect(ms).toBeLessThan(10_000);
    }, 120_000);
  });
});
