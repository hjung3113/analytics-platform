// #1196 a — model spec schema (migration 0091), `software_version.release_order` and the two model spec reads, against a
// real Postgres (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`). App as platform_app, fixtures as
// platform_migrate. The real `buildServer` over `app.inject`.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../domain/code-key.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `ISP${randomUUID().slice(0, 6).toUpperCase()}`;
const SHA = (n: number) => String(n).padStart(64, '0');
const DOC = JSON.stringify({ docLabel: 'Synthetic log spec', docVersion: 'v1' });

interface Answer {
  outcome: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  message?: string;
}

describe.skipIf(!runIntegration)('model spec schema and reads (#1196 a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let cookie = '';
  let csrf = '';
  let actorId = '';
  let other = '';
  const actorIds: string[] = [];
  const workspaceIds: string[] = [];
  const ids: Record<string, string> = {};

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const appSql = (text: string, params: unknown[] = []) => dbHandle.pool.query(text, params);
  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0].id as string;
  const catalog = (table: string, workspace: string, code: string, extra: Record<string, unknown> = {}) => {
    const cols = { workspace_id: workspace, code, code_key: toCodeKey(code), name: code, created_by: actorId, updated_by: actorId, ...extra };
    return one(
      `insert into knowledge.${table} (${Object.keys(cols).join(',')}) values (${Object.keys(cols).map((_, n) => `$${n + 1}`).join(',')}) returning id`,
      Object.values(cols),
    );
  };
  const software = (workspace: string, model: string, label: string, extra = '') =>
    one(
      `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by${extra ? ', created_at' : ''})
       values ($1,$2,$3,$4,'',$5,$5${extra ? ', $6' : ''}) returning id`,
      [workspace, model, label, toCodeKey(label), actorId, ...(extra ? [extra] : [])],
    );
  const releaseOrders = async (model: string) =>
    Object.fromEntries(
      (await sql('select version_label, release_order from knowledge.software_version where model_id = $1', [model])).rows.map(
        (r) => [r.version_label as string, r.release_order as number],
      ),
    );
  /** A revision as the migrate role writes it: a draft with children, then (optionally) published. */
  const revision = async (
    workspace: string,
    model: string,
    revisionNo: number,
    opts: { publish: boolean; modules?: string[]; events?: [string, string][] },
  ) => {
    const rev = await one(
      `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by)
       values ($1,$2,$3,'draft',$4::jsonb,1,$5) returning id`,
      [workspace, model, revisionNo, DOC, actorId],
    );
    const moduleIds: Record<string, string> = {};
    for (const [index, key] of (opts.modules ?? []).entries()) {
      moduleIds[key] = await one(
        `insert into knowledge.spec_module (workspace_id, spec_rev_id, module_key, name, parent_module_id) values ($1,$2,$3,$4,$5) returning id`,
        [workspace, rev, key, `Module ${key}`, index === 0 ? null : moduleIds[(opts.modules ?? [])[0] as string]],
      );
    }
    const eventIds: Record<string, string> = {};
    for (const [moduleKey, eventKey] of opts.events ?? []) {
      eventIds[eventKey] = await one(
        `insert into knowledge.spec_event (workspace_id, spec_rev_id, module_id, event_key, name, fields_json, trigger_rule, detail_doc_ref)
         values ($1,$2,$3,$4,$5,$6::jsonb,'on start','sec 3.2') returning id`,
        [workspace, rev, moduleIds[moduleKey], eventKey, `Event ${eventKey}`, JSON.stringify([{ name: 'speed', type: 'float', unit: 'rpm', description: 'spindle speed' }])],
      );
    }
    const keys = Object.keys(eventIds);
    if (keys.length >= 2) {
      await sql(
        `insert into knowledge.spec_event_relation (workspace_id, spec_rev_id, source_event_id, predicate, target_event_id, rule_ref) values ($1,$2,$3,'precedes',$4,'sec 4')`,
        [workspace, rev, eventIds[keys[0] as string], eventIds[keys[1] as string]],
      );
    }
    if (opts.publish) {
      await sql(
        `update knowledge.model_spec_revision set state = 'published', content_sha256 = $2, published_by = $3, published_at = now() where id = $1`,
        [rev, SHA(revisionNo), actorId],
      );
    }
    return { rev, moduleIds, eventIds };
  };
  const query = (endpoint: string, params: Record<string, unknown>) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${cookie}` },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
  const read = async (endpoint: string, params: Record<string, unknown> = {}): Promise<Answer> => {
    const res = await query(endpoint, params);
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    const externalId = `${TAG}-admin`;
    actorId = (await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'admin' })).id;
    actorIds.push(actorId);
    cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: { cookie: `${SESSION_COOKIE_NAME}=${cookie}` } });
    csrf = boot.json<{ csrfToken: string }>().csrfToken;
    other = await one('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`]);
    workspaceIds.push(other);

    ids.v = await catalog('vendor', WORKSPACE_ID, `${TAG}-v`);
    ids.vOther = await catalog('vendor', other, `${TAG}-vo`);
    for (const m of ['m1', 'm2', 'm3', 'm4']) ids[m] = await catalog('equipment_model', WORKSPACE_ID, `${TAG}-${m}`, { vendor_id: ids.v });
    ids.mOther = await catalog('equipment_model', other, `${TAG}-mo`, { vendor_id: ids.vOther });
  }, 60_000);

  afterAll(async () => {
    const both = [WORKSPACE_ID, other];
    const revs = '(select id from knowledge.model_spec_revision where created_by = any($1))';
    await sql(`delete from knowledge.spec_event_relation where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_event where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`update knowledge.spec_module set parent_module_id = null where spec_rev_id in ${revs}`, [actorIds]);
    await sql(`delete from knowledge.spec_module where spec_rev_id in ${revs}`, [actorIds]);
    await sql('delete from knowledge.model_spec_revision where created_by = any($1)', [actorIds]);
    for (const table of ['software_version', 'equipment_model', 'vendor']) {
      await sql(`delete from knowledge.${table} where workspace_id = any($1) and created_by = any($2)`, [both, actorIds]);
    }
    for (const [table, column] of [
      ['core.idempotency_keys', 'actor_id'],
      ['core.audit_log', 'actor_id'],
      ['permission.permission_grants', 'actor_id'],
      ['permission.permission_denies', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]);
    }
    await sql('delete from core.workspaces where id = any($1)', [workspaceIds]);
    await app?.close();
    await dbHandle?.close();
    await migrate?.close();
  });

  describe('software_version.release_order', () => {
    it('backfill numbers each model 1..n by created_at then id, independent of the other model', async () => {
      // Inserted out of registration order on purpose: the creation time decides, not the insert order.
      await software(WORKSPACE_ID, ids.m1 as string, 'late', '2026-03-03T00:00:00Z');
      await software(WORKSPACE_ID, ids.m1 as string, 'early', '2026-01-01T00:00:00Z');
      await software(WORKSPACE_ID, ids.m1 as string, 'middle', '2026-02-02T00:00:00Z');
      await software(WORKSPACE_ID, ids.m2 as string, 'b-second', '2026-05-05T00:00:00Z');
      await software(WORKSPACE_ID, ids.m2 as string, 'b-first', '2026-04-04T00:00:00Z');
      await software(WORKSPACE_ID, ids.m2 as string, 'b-third', '2026-06-06T00:00:00Z');
      const models = [ids.m1, ids.m2];
      await sql('update knowledge.software_version set release_order = 99 where model_id = any($1)', [models]);
      // The migration's own backfill statement, narrowed to the fixture models so other suites' rows stay untouched.
      const migration = readFileSync(fileURLToPath(new URL('../../../../migrations/0091_model_spec.sql', import.meta.url)), 'utf8');
      const backfill = migration.split('\n').find((line) => line.startsWith('UPDATE "knowledge"."software_version" AS s'));
      expect(backfill).toBeDefined();
      const narrowed = (backfill as string)
        .replace('--> statement-breakpoint', '')
        .replace('FROM "knowledge"."software_version") AS r', 'FROM "knowledge"."software_version" WHERE "model_id" = ANY($1)) AS r');
      expect(narrowed).toContain('ANY($1)');
      await sql(narrowed, [models]);
      expect(await releaseOrders(ids.m1 as string)).toEqual({ early: 1, middle: 2, late: 3 });
      expect(await releaseOrders(ids.m2 as string)).toEqual({ 'b-first': 1, 'b-second': 2, 'b-third': 3 });
    });

    it('a new row takes max + 1 of its own model whatever path inserts it; an explicit order is kept', async () => {
      // direct SQL (fixtures, any insert path)
      await software(WORKSPACE_ID, ids.m3 as string, 'one');
      await software(WORKSPACE_ID, ids.m3 as string, 'two');
      expect(await releaseOrders(ids.m3 as string)).toEqual({ one: 1, two: 2 });
      // the create action (the import apply path inserts through the same `insertRow`)
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/menu-action',
        headers: { 'content-type': 'application/json', cookie: `${SESSION_COOKIE_NAME}=${cookie}`, 'x-csrf-token': csrf },
        payload: JSON.stringify({ action: 'logKnowledge.softwareCreate', context: {}, input: { modelId: ids.m1, versionLabel: `${TAG}-v4`, name: '' }, idempotencyKey: randomUUID() }),
      });
      expect(res.json<Answer>()).toMatchObject({ outcome: 'ok' });
      expect((await releaseOrders(ids.m1 as string))[`${TAG}-v4`]).toBe(4);
      expect(await releaseOrders(ids.m3 as string)).toEqual({ one: 1, two: 2 });
      await sql(
        `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, release_order, created_by, updated_by) values ($1,$2,'seven','SEVEN','',7,$3,$3)`,
        [WORKSPACE_ID, ids.m3, actorId],
      );
      await software(WORKSPACE_ID, ids.m3 as string, 'after-seven');
      expect(await releaseOrders(ids.m3 as string)).toEqual({ one: 1, two: 2, seven: 7, 'after-seven': 8 });
    });

    it('refuses a release order below 1 and keeps the column non-unique', async () => {
      await expect(
        sql(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, release_order, created_by, updated_by) values ($1,$2,'neg','NEG','',-1,$3,$3)`, [WORKSPACE_ID, ids.m3, actorId]),
      ).rejects.toMatchObject({ constraint: 'software_version_release_order_check' });
      await sql(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, release_order, created_by, updated_by) values ($1,$2,'dup-two','DUP-TWO','',2,$3,$3)`, [WORKSPACE_ID, ids.m3, actorId]);
    });

    it('softwareVersions returns releaseOrder and sorts by it; the default sort is unchanged', async () => {
      const filters = [{ id: 'modelId', op: 'in', value: [ids.m1] }];
      const asc = await read('logKnowledge.softwareVersions', { filters, sorting: [{ id: 'releaseOrder', desc: false }] });
      expect(asc.outcome).toBe('ok');
      expect(asc.data.rows.map((r: { versionLabel: string; releaseOrder: number }) => [r.versionLabel, r.releaseOrder])).toEqual([
        ['early', 1], ['middle', 2], ['late', 3], [`${TAG}-v4`, 4],
      ]);
      const desc = await read('logKnowledge.softwareVersions', { filters, sorting: [{ id: 'releaseOrder', desc: true }] });
      expect(desc.data.rows.map((r: { releaseOrder: number }) => r.releaseOrder)).toEqual([4, 3, 2, 1]);
      const byDefault = await read('logKnowledge.softwareVersions', { filters });
      expect(byDefault.data.rows.map((r: { versionLabel: string }) => r.versionLabel)).toEqual(
        [...byDefault.data.rows.map((r: { versionLabel: string }) => r.versionLabel)].sort((a, b) => toCodeKey(a).localeCompare(toCodeKey(b))),
      );
    });
  });

  describe('model spec tables', () => {
    it('refuses a duplicate revision number, a bad source_doc_ref, a bad state and a published row without a hash', async () => {
      const { rev } = await revision(WORKSPACE_ID, ids.m4 as string, 1, { publish: false });
      ids.m4rev1 = rev;
      const insert = (revisionNo: number, state: string, doc: string, extra = '', values: unknown[] = []) =>
        sql(
          `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by${extra}) values ($1,$2,$3,$4,$5::jsonb,1,$6${values.length ? `,${values.map((_, n) => `$${n + 7}`).join(',')}` : ''})`,
          [WORKSPACE_ID, ids.m4, revisionNo, state, doc, actorId, ...values],
        );
      await expect(insert(1, 'draft', DOC)).rejects.toMatchObject({ constraint: 'model_spec_revision_workspace_model_revision_no_uq' });
      await expect(insert(2, 'archived', DOC)).rejects.toMatchObject({ constraint: 'model_spec_revision_state_check' });
      await expect(insert(2, 'draft', JSON.stringify({ docLabel: 'x' }))).rejects.toMatchObject({ constraint: 'model_spec_revision_source_doc_ref_check' });
      await expect(insert(2, 'draft', JSON.stringify({ docLabel: 'x', docVersion: 'v', file: 'a.pdf' }))).rejects.toMatchObject({ constraint: 'model_spec_revision_source_doc_ref_check' });
      await expect(insert(2, 'published', DOC, ', published_by, published_at', [actorId, new Date().toISOString()])).rejects.toMatchObject({ constraint: 'model_spec_revision_published_check' });
      await insert(2, 'rejected', JSON.stringify({ docLabel: 'x', docVersion: 'v', link: 'https://example.invalid/spec' }));
    });

    it('refuses a revision of a model from another workspace', async () => {
      await expect(
        sql(`insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,1,'draft',$3::jsonb,1,$4)`, [WORKSPACE_ID, ids.mOther, DOC, actorId]),
      ).rejects.toMatchObject({ constraint: 'model_spec_revision_model_fk' });
    });

    it('keeps module keys unique per revision, parents inside the revision and events inside their own module', async () => {
      const a = await revision(WORKSPACE_ID, ids.m4 as string, 3, { publish: false, modules: ['root', 'child'], events: [['child', 'E1']] });
      const b = await revision(WORKSPACE_ID, ids.m4 as string, 4, { publish: false, modules: ['root'] });
      const addModule = (rev: string, key: string, parent: string | null) =>
        sql(`insert into knowledge.spec_module (workspace_id, spec_rev_id, module_key, name, parent_module_id) values ($1,$2,$3,'n',$4)`, [WORKSPACE_ID, rev, key, parent]);
      await expect(addModule(a.rev, 'root', null)).rejects.toMatchObject({ constraint: 'spec_module_workspace_rev_module_key_uq' });
      await expect(addModule(b.rev, 'orphan', a.moduleIds.root as string)).rejects.toMatchObject({ constraint: 'spec_module_parent_fk' });
      await expect(
        sql(`insert into knowledge.spec_event (workspace_id, spec_rev_id, module_id, event_key, name, fields_json) values ($1,$2,$3,'X','n','[]'::jsonb)`, [WORKSPACE_ID, b.rev, a.moduleIds.child]),
      ).rejects.toMatchObject({ constraint: 'spec_event_module_fk' });
      await expect(
        sql(`insert into knowledge.spec_event (workspace_id, spec_rev_id, module_id, event_key, name, fields_json) values ($1,$2,$3,'E1','n','[]'::jsonb)`, [WORKSPACE_ID, a.rev, a.moduleIds.child]),
      ).rejects.toMatchObject({ constraint: 'spec_event_workspace_rev_module_event_key_uq' });
      await expect(
        sql(`insert into knowledge.spec_event (workspace_id, spec_rev_id, module_id, event_key, name, fields_json) values ($1,$2,$3,'X','n','{}'::jsonb)`, [WORKSPACE_ID, a.rev, a.moduleIds.child]),
      ).rejects.toMatchObject({ constraint: 'spec_event_fields_json_check' });
    });

    it('refuses a relation whose events live in another revision', async () => {
      const a = await revision(WORKSPACE_ID, ids.m4 as string, 5, { publish: false, modules: ['m'], events: [['m', 'A'], ['m', 'B']] });
      const b = await revision(WORKSPACE_ID, ids.m4 as string, 6, { publish: false, modules: ['m'], events: [['m', 'A']] });
      await expect(
        sql(`insert into knowledge.spec_event_relation (workspace_id, spec_rev_id, source_event_id, predicate, target_event_id) values ($1,$2,$3,'precedes',$4)`, [WORKSPACE_ID, a.rev, a.eventIds.A, b.eventIds.A]),
      ).rejects.toMatchObject({ constraint: 'spec_event_relation_target_fk' });
    });
  });

  describe('immutability for the runtime role', () => {
    it('refuses every UPDATE and DELETE of a published revision (content, hash, state)', async () => {
      const { rev } = await revision(WORKSPACE_ID, ids.m4 as string, 7, { publish: true, modules: ['m'], events: [['m', 'A']] });
      for (const statement of [
        `update knowledge.model_spec_revision set content_sha256 = '${SHA(9)}' where id = $1`,
        `update knowledge.model_spec_revision set source_doc_ref = '{"docLabel":"x","docVersion":"y"}' where id = $1`,
        `update knowledge.model_spec_revision set state = 'rejected' where id = $1`,
        `delete from knowledge.model_spec_revision where id = $1`,
        `update knowledge.spec_event set name = 'changed' where spec_rev_id = $1`,
        `update knowledge.spec_module set name = 'changed' where spec_rev_id = $1`,
        `delete from knowledge.spec_event where spec_rev_id = $1`,
        `delete from knowledge.spec_event_relation where spec_rev_id = $1`,
      ]) {
        await expect(appSql(statement, [rev]), statement).rejects.toMatchObject({ code: '42501' });
      }
      const [row] = (await sql('select content_sha256, state from knowledge.model_spec_revision where id = $1', [rev])).rows;
      expect(row).toEqual({ content_sha256: SHA(7), state: 'published' });
    });

    it('refuses new modules, events and relations on a published revision, allows them on a draft', async () => {
      const published = await revision(WORKSPACE_ID, ids.m4 as string, 8, { publish: true, modules: ['m'], events: [['m', 'A']] });
      await expect(
        appSql(`insert into knowledge.spec_module (workspace_id, spec_rev_id, module_key, name) values ($1,$2,'late','n')`, [WORKSPACE_ID, published.rev]),
      ).rejects.toMatchObject({ code: '23514', message: expect.stringContaining('not a draft') });
      await expect(
        appSql(`insert into knowledge.spec_event (workspace_id, spec_rev_id, module_id, event_key, name, fields_json) values ($1,$2,$3,'late','n','[]'::jsonb)`, [WORKSPACE_ID, published.rev, published.moduleIds.m]),
      ).rejects.toMatchObject({ code: '23514' });
      const draft = await appSql(
        `insert into knowledge.model_spec_revision (workspace_id, model_id, revision_no, state, source_doc_ref, schema_version, created_by) values ($1,$2,9,'draft',$3::jsonb,1,$4) returning id`,
        [WORKSPACE_ID, ids.m4, DOC, actorId],
      );
      const draftId = draft.rows[0].id as string;
      const mod = await appSql(`insert into knowledge.spec_module (workspace_id, spec_rev_id, module_key, name) values ($1,$2,'ok','n') returning id`, [WORKSPACE_ID, draftId]);
      await appSql(`insert into knowledge.spec_event (workspace_id, spec_rev_id, module_id, event_key, name, fields_json) values ($1,$2,$3,'ok','n','[]'::jsonb)`, [WORKSPACE_ID, draftId, mod.rows[0].id]);
    });
  });

  describe('logKnowledge.modelSpec', () => {
    it('answers ok with null data when the model has no published revision (none, or only drafts)', async () => {
      await revision(WORKSPACE_ID, ids.m2 as string, 1, { publish: false, modules: ['draft-only'], events: [['draft-only', 'D1']] });
      for (const modelId of [ids.m3, ids.m2, randomUUID()]) {
        expect(await read('logKnowledge.modelSpec', { modelId })).toMatchObject({ outcome: 'ok', data: null });
      }
    });

    it('returns only the latest published revision with its tree, events and relations, and never draft content', async () => {
      await revision(WORKSPACE_ID, ids.m1 as string, 1, { publish: true, modules: ['old-root'], events: [['old-root', 'OLD']] });
      const v2 = await revision(WORKSPACE_ID, ids.m1 as string, 2, { publish: true, modules: ['root', 'child'], events: [['root', 'START'], ['child', 'STOP']] });
      await revision(WORKSPACE_ID, ids.m1 as string, 3, { publish: false, modules: ['draft-root'], events: [['draft-root', 'DRAFT-EVT']] });
      const res = await read('logKnowledge.modelSpec', { modelId: ids.m1 });
      expect(res.outcome).toBe('ok');
      expect(res.data.revision).toMatchObject({
        id: v2.rev, modelId: ids.m1, revisionNo: 2, state: 'published', schemaVersion: 1, contentSha256: SHA(2), publishedBy: actorId,
        sourceDocRef: { docLabel: 'Synthetic log spec', docVersion: 'v1' },
      });
      expect(typeof res.data.revision.publishedAt).toBe('string');
      expect(res.data.modules).toEqual([
        { id: v2.moduleIds.child, moduleKey: 'child', name: 'Module child', parentModuleId: v2.moduleIds.root },
        { id: v2.moduleIds.root, moduleKey: 'root', name: 'Module root', parentModuleId: null },
      ]);
      expect(res.data.events).toEqual([
        {
          id: v2.eventIds.START, moduleId: v2.moduleIds.root, eventKey: 'START', name: 'Event START',
          fields: [{ name: 'speed', type: 'float', unit: 'rpm', description: 'spindle speed' }], triggerRule: 'on start', detailDocRef: 'sec 3.2',
        },
        expect.objectContaining({ id: v2.eventIds.STOP, moduleId: v2.moduleIds.child, eventKey: 'STOP' }),
      ]);
      expect(res.data.relations).toEqual([
        { id: expect.any(String), sourceEventId: v2.eventIds.START, predicate: 'precedes', targetEventId: v2.eventIds.STOP, ruleRef: 'sec 4' },
      ]);
      const text = JSON.stringify(res.data);
      for (const leaked of ['draft-root', 'DRAFT-EVT', 'old-root', 'OLD']) expect(text).not.toContain(leaked);
    });

    it('does not see a model or revision of another workspace', async () => {
      await revision(other, ids.mOther as string, 1, { publish: true, modules: ['foreign'] });
      expect(await read('logKnowledge.modelSpec', { modelId: ids.mOther })).toMatchObject({ outcome: 'ok', data: null });
      expect(JSON.stringify((await read('logKnowledge.modelSpecRevisions', { modelId: ids.mOther })).data)).not.toContain('"revisionNo"');
    });

    it.each([
      ['no modelId', {}],
      ['modelId not a uuid', { modelId: 'x' }],
      ['modelId null', { modelId: null }],
      ['unknown param', { modelId: randomUUID(), softwareId: randomUUID() }],
    ])('refuses %s with an error outcome', async (_name, params) => {
      const res = await query('logKnowledge.modelSpec', params);
      expect(res.statusCode === 200 ? res.json<Answer>().outcome : 'http-error').not.toBe('ok');
    });
  });

  describe('logKnowledge.modelSpecRevisions', () => {
    it('lists revision headers newest first, drafts included without content, with an event count', async () => {
      const res = await read('logKnowledge.modelSpecRevisions', { modelId: ids.m1 });
      expect(res.outcome).toBe('ok');
      expect(res.data.total).toBe(3);
      expect(res.data.rows.map((r: { revisionNo: number; state: string }) => [r.revisionNo, r.state])).toEqual([[3, 'draft'], [2, 'published'], [1, 'published']]);
      expect(res.data.rows[0]).toEqual({
        id: expect.any(String), revisionNo: 3, state: 'draft', publishedAt: null, publishedBy: null, contentSha256: null, eventCount: 1,
      });
      expect(res.data.rows[1]).toMatchObject({ revisionNo: 2, publishedBy: actorId, contentSha256: SHA(2), eventCount: 2 });
      expect(typeof res.data.rows[1].publishedAt).toBe('string');
      expect(JSON.stringify(res.data)).not.toContain('DRAFT-EVT');
    });

    it('pages the list', async () => {
      const first = await read('logKnowledge.modelSpecRevisions', { modelId: ids.m1, page: 0, pageSize: 2 });
      const second = await read('logKnowledge.modelSpecRevisions', { modelId: ids.m1, page: 1, pageSize: 2 });
      expect(first.data.total).toBe(3);
      expect(first.data.rows.map((r: { revisionNo: number }) => r.revisionNo)).toEqual([3, 2]);
      expect(second.data.rows.map((r: { revisionNo: number }) => r.revisionNo)).toEqual([1]);
    });

    it('answers an empty page for a model without revisions', async () => {
      expect(await read('logKnowledge.modelSpecRevisions', { modelId: ids.m3 })).toMatchObject({ outcome: 'ok', data: { rows: [], total: 0 } });
    });

    it.each([
      ['no modelId', {}],
      ['pageSize 0', { modelId: randomUUID(), pageSize: 0 }],
      ['pageSize over the cap', { modelId: randomUUID(), pageSize: 201 }],
      ['negative page', { modelId: randomUUID(), page: -1 }],
      ['unknown param', { modelId: randomUUID(), sorting: [] }],
    ])('refuses %s with an error outcome', async (_name, params) => {
      const res = await query('logKnowledge.modelSpecRevisions', params);
      expect(res.statusCode === 200 ? res.json<Answer>().outcome : 'http-error').not.toBe('ok');
    });
  });
});
