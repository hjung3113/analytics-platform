// #1197 a — knowledge item schema invariants (migration 0082) and the four item reads, against a real Postgres
// (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`). App as platform_app, fixtures as
// platform_migrate. The real `buildServer` over `app.inject`.

import { randomUUID } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../domain/code-key.js';
import { allocateItemNo } from '../repositories/item-number.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `IIT${randomUUID().slice(0, 6).toUpperCase()}`;

interface Answer {
  outcome: string;
  data: any; // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON read by path in assertions
  message?: string;
}

describe.skipIf(!runIntegration)('knowledge items schema and reads (#1197 a)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  let cookie = '';
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
  let counter = 0;
  const createdItems: string[] = [];
  /** An item with one or more revisions; `owner` is { model } or { software }. */
  const item = async (
    workspace: string,
    owner: { model?: string | undefined; software?: string | undefined },
    title: string,
    extra: { revisions?: number; publication?: string; type?: string; no?: number } = {},
  ) => {
    const revisions = extra.revisions ?? 1;
    const no = extra.no ?? (await allocateItemNo(dbHandle.db, workspace));
    counter += 1;
    const id = await one(
      `insert into knowledge.knowledge_item (workspace_id, item_no, owner_model_id, owner_software_id, latest_revision_no, publication_state, created_by, updated_by)
       values ($1,$2,$3,$4,$5,$6,$7,$7) returning id`,
      [workspace, no, owner.model ?? null, owner.software ?? null, revisions, extra.publication ?? 'published', actorId],
    );
    createdItems.push(id);
    for (let n = 1; n <= revisions; n += 1) {
      await sql(
        `insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [workspace, id, n, n === revisions ? title : `${title} (old)`, extra.type ?? 'anomaly', `observation ${n}`, actorId],
      );
    }
    return id;
  };
  const query = (endpoint: string, params: Record<string, unknown>, who: string | null = cookie) =>
    app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...(who ? { cookie: `${SESSION_COOKIE_NAME}=${who}` } : {}) },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
  const read = async (endpoint: string, params: Record<string, unknown> = {}): Promise<Answer> => {
    const res = await query(endpoint, params);
    expect(res.statusCode).toBe(200);
    return res.json<Answer>();
  };
  const flt = (id: string, op: string, value: unknown[]) => ({ id, op, value });
  const list = (filters: unknown[] = [], extra: Record<string, unknown> = {}) =>
    read('logKnowledge.items', { q: TAG, filters, ...extra });
  const titles = (a: Answer) => (a.data.rows as { title: string }[]).map((r) => r.title);

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
    other = await one('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-ws`]);
    workspaceIds.push(other);

    ids.v = await catalog('vendor', WORKSPACE_ID, `${TAG}-v`);
    ids.vOther = await catalog('vendor', other, `${TAG}-vo`);
    ids.m1 = await catalog('equipment_model', WORKSPACE_ID, `${TAG}-m1`, { vendor_id: ids.v });
    ids.m2 = await catalog('equipment_model', WORKSPACE_ID, `${TAG}-m2`, { vendor_id: ids.v });
    ids.m3 = await catalog('equipment_model', WORKSPACE_ID, `${TAG}-m3`, { vendor_id: ids.v });
    ids.mOther = await catalog('equipment_model', other, `${TAG}-mo`, { vendor_id: ids.vOther });
    const software = (workspace: string, model: string, label: string) =>
      one(
        `insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`,
        [workspace, model, label, toCodeKey(label), actorId],
      );
    ids.s1 = await software(WORKSPACE_ID, ids.m1, `${TAG}-s1`);
    ids.s2 = await software(WORKSPACE_ID, ids.m1, `${TAG}-s2`);
    ids.sOther = await software(other, ids.mOther, `${TAG}-so`);

    ids.i1 = await item(WORKSPACE_ID, { model: ids.m1 }, `${TAG} model item one`, { revisions: 2, type: 'guideline' });
    ids.i2 = await item(WORKSPACE_ID, { model: ids.m1 }, `${TAG} model item two`);
    ids.i3 = await item(WORKSPACE_ID, { software: ids.s1 }, `${TAG} software item`);
    ids.i4 = await item(WORKSPACE_ID, { software: ids.s2 }, `${TAG} derived item`);
    ids.i5 = await item(WORKSPACE_ID, { model: ids.m1 }, `${TAG} archived item`, { publication: 'archived' });
    ids.i6 = await item(WORKSPACE_ID, { model: ids.m2 }, `${TAG} other model item`);
    ids.iOther = await item(other, { model: ids.mOther }, `${TAG} foreign item`);
    await sql(
      `insert into knowledge.item_revision_evidence (workspace_id,item_id,revision_no,ordinal,source_kind,source_owner,source_ref,locator) values ($1,$2,2,1,'log_file','Log system','log-1','rows 1-9')`,
      [WORKSPACE_ID, ids.i1],
    );
    await sql(
      `insert into knowledge.item_assessment_event (workspace_id,item_id,based_on_revision_no,dimension,prior_state,new_state,rationale,actor_id) values ($1,$2,1,'verification','not_checked','observed','seen once',$3)`,
      [WORKSPACE_ID, ids.i1, actorId],
    );
    // i4 derived from i3 (revision 1); i2 related to i1
    await sql(
      `insert into knowledge.item_link (workspace_id,source_item_id,target_item_id,link_kind,source_revision_no,created_by) values ($1,$2,$3,'derived_from',1,$4),($1,$5,$6,'related',null,$4)`,
      [WORKSPACE_ID, ids.i4, ids.i3, actorId, ids.i2, ids.i1],
    );
  }, 60_000);

  afterAll(async () => {
    const both = [WORKSPACE_ID, other];
    await sql('delete from knowledge.item_link where source_item_id = any($1) or target_item_id = any($1)', [createdItems]);
    for (const table of ['item_assessment_event', 'item_revision_evidence', 'knowledge_item_revision']) {
      await sql(`delete from knowledge.${table} where item_id = any($1)`, [createdItems]);
    }
    await sql('delete from knowledge.knowledge_item where id = any($1)', [createdItems]);
    await sql('delete from knowledge.item_counter where workspace_id = any($1)', [workspaceIds]);
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

  describe('schema invariants', () => {
    const insertItem = (workspace: string, model: string | null, software: string | null, no = 9000 + counter++) =>
      appSql(
        `insert into knowledge.knowledge_item (workspace_id,item_no,owner_model_id,owner_software_id,latest_revision_no,publication_state,created_by,updated_by) values ($1,$2,$3,$4,1,'published',$5,$5)`,
        [workspace, no, model, software, actorId],
      );

    it('refuses an item with both owners or with none', async () => {
      await expect(insertItem(WORKSPACE_ID, ids.m1 as string, ids.s1 as string)).rejects.toMatchObject({ constraint: 'knowledge_item_owner_xor' });
      await expect(insertItem(WORKSPACE_ID, null, null)).rejects.toMatchObject({ constraint: 'knowledge_item_owner_xor' });
    });

    it('refuses an owner from another workspace (composite foreign key)', async () => {
      await expect(insertItem(WORKSPACE_ID, ids.mOther as string, null)).rejects.toMatchObject({ constraint: 'knowledge_item_owner_model_fk' });
      await expect(insertItem(WORKSPACE_ID, null, ids.sOther as string)).rejects.toMatchObject({ constraint: 'knowledge_item_owner_software_fk' });
    });

    it('refuses a duplicate number inside a workspace but allows it across workspaces', async () => {
      const no = 4242;
      await item(WORKSPACE_ID, { model: ids.m3 }, `${TAG} numbered`, { no });
      await expect(insertItem(WORKSPACE_ID, ids.m3 as string, null, no)).rejects.toMatchObject({ constraint: 'knowledge_item_workspace_item_no_uq' });
      await expect(item(other, { model: ids.mOther }, `${TAG} numbered elsewhere`, { no })).resolves.toBeTruthy();
    });

    it('platform_app cannot change the owner, but can move the state columns', async () => {
      await expect(
        appSql('update knowledge.knowledge_item set owner_model_id = $1 where id = $2', [ids.m2, ids.i2]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        appSql('update knowledge.knowledge_item set owner_software_id = $1 where id = $2', [ids.s1, ids.i3]),
      ).rejects.toMatchObject({ code: '42501' });
      await expect(
        appSql('update knowledge.knowledge_item set workspace_id = $1 where id = $2', [other, ids.i2]),
      ).rejects.toMatchObject({ code: '42501' });
      const ok = await appSql(
        `update knowledge.knowledge_item set verification_state = 'verified', row_version = row_version + 1, updated_at = now() where id = $1`,
        [ids.i6],
      );
      expect(ok.rowCount).toBe(1);
    });

    it.each([
      ['knowledge_item_revision', `update knowledge.knowledge_item_revision set title = 'x' where item_id = $1`],
      ['knowledge_item_revision', `delete from knowledge.knowledge_item_revision where item_id = $1`],
      ['item_revision_evidence', `update knowledge.item_revision_evidence set note = 'x' where item_id = $1`],
      ['item_revision_evidence', `delete from knowledge.item_revision_evidence where item_id = $1`],
      ['item_assessment_event', `update knowledge.item_assessment_event set rationale = 'x' where item_id = $1`],
      ['item_assessment_event', `delete from knowledge.item_assessment_event where item_id = $1`],
      ['item_link', `update knowledge.item_link set link_kind = 'related' where source_item_id = $1`],
      ['item_link', `delete from knowledge.item_link where source_item_id = $1`],
      ['knowledge_item', `delete from knowledge.knowledge_item where id = $1`],
    ])('platform_app cannot rewrite or delete history (%s)', async (_table, statement) => {
      const target = statement.includes('item_link') ? ids.i4 : ids.i1;
      await expect(appSql(statement, [target])).rejects.toMatchObject({ code: '42501' });
    });

    const link = (kind: string, revision: string, source = 'i4', target = 'i3') =>
      appSql(
        `insert into knowledge.item_link (workspace_id,source_item_id,target_item_id,link_kind,source_revision_no,created_by) values ($1,$2,$3,$4,${revision},$5)`,
        [WORKSPACE_ID, ids[source], ids[target], kind, actorId],
      );

    it.each([
      ['a derive without a revision', () => link('derived_from', 'null', 'i6', 'i3'), 'item_link_revision_check'],
      ['a related link that carries a revision', () => link('related', '1', 'i6', 'i3'), 'item_link_revision_check'],
      ['a link to itself', () => link('related', 'null', 'i3', 'i3'), 'item_link_not_self_check'],
      ['a derive pinned to a revision that does not exist', () => link('derived_from', '9', 'i6', 'i3'), 'item_link_target_revision_fk'],
      ['a duplicate link', async () => { await link('related', 'null', 'i6', 'i2'); return link('related', 'null', 'i6', 'i2'); }, 'item_link_pair_uq'],
    ])('refuses %s', async (_name, run, constraint) => {
      await expect(run()).rejects.toMatchObject({ constraint });
    });

    it.each([
      ['an unknown type code', `insert into knowledge.knowledge_item_revision (workspace_id,item_id,revision_no,title,type_code,observation,published_by) values ($1,$2,9,'t','bug','o',$3)`, 'knowledge_item_revision_type_code_check'],
      ['a blank title', `insert into knowledge.knowledge_item_revision (workspace_id,item_id,revision_no,title,type_code,observation,published_by) values ($1,$2,9,'   ','anomaly','o',$3)`, 'knowledge_item_revision_title_check'],
      ['neither observation nor expected', `insert into knowledge.knowledge_item_revision (workspace_id,item_id,revision_no,title,type_code,improvement,published_by) values ($1,$2,9,'t','anomaly','i',$3)`, 'knowledge_item_revision_content_check'],
      ['a text over 20000', `insert into knowledge.knowledge_item_revision (workspace_id,item_id,revision_no,title,type_code,observation,published_by) values ($1,$2,9,'t','anomaly',repeat('a',20001),$3)`, 'knowledge_item_revision_text_check'],
      ['a revision 0', `insert into knowledge.knowledge_item_revision (workspace_id,item_id,revision_no,title,type_code,observation,published_by) values ($1,$2,0,'t','anomaly','o',$3)`, 'knowledge_item_revision_no_check'],
    ])('refuses a revision with %s', async (_name, statement, constraint) => {
      await expect(appSql(statement, [WORKSPACE_ID, ids.i2, actorId])).rejects.toMatchObject({ constraint });
    });

    it.each([
      ['a state of the other dimension', `'verification','open','observed'`],
      ['an unknown new state', `'processing','open','closed'`],
    ])('refuses an assessment event with %s', async (_name, values) => {
      await expect(
        appSql(
          `insert into knowledge.item_assessment_event (workspace_id,item_id,based_on_revision_no,dimension,prior_state,new_state,rationale,actor_id) values ($1,$2,1,${values.split(',').slice(0, 1)[0]},${values.split(',')[1]},${values.split(',')[2]},'why',$3)`,
          [WORKSPACE_ID, ids.i2, actorId],
        ),
      ).rejects.toMatchObject({ constraint: 'item_assessment_event_states_check' });
    });

    it('refuses an empty rationale and a revision the item does not have', async () => {
      await expect(
        appSql(`insert into knowledge.item_assessment_event (workspace_id,item_id,based_on_revision_no,dimension,prior_state,new_state,rationale,actor_id) values ($1,$2,1,'processing','open','resolved',' ',$3)`, [WORKSPACE_ID, ids.i2, actorId]),
      ).rejects.toMatchObject({ constraint: 'item_assessment_event_rationale_check' });
      await expect(
        appSql(`insert into knowledge.item_assessment_event (workspace_id,item_id,based_on_revision_no,dimension,prior_state,new_state,rationale,actor_id) values ($1,$2,5,'processing','open','resolved','why',$3)`, [WORKSPACE_ID, ids.i2, actorId]),
      ).rejects.toMatchObject({ constraint: 'item_assessment_event_revision_fk' });
    });

    it('refuses evidence with an unknown source kind or a note over 500', async () => {
      const base = `insert into knowledge.item_revision_evidence (workspace_id,item_id,revision_no,ordinal,source_kind,source_owner,source_ref,note) values ($1,$2,1,7,`;
      await expect(appSql(`${base}'video','S','r',null)`, [WORKSPACE_ID, ids.i2])).rejects.toMatchObject({ constraint: 'item_revision_evidence_source_kind_check' });
      await expect(appSql(`${base}'other','S','r',repeat('a',501))`, [WORKSPACE_ID, ids.i2])).rejects.toMatchObject({ constraint: 'item_revision_evidence_note_check' });
    });
  });

  describe('item number allocation', () => {
    it('gives concurrent allocations distinct, gap-free numbers, including the first of a workspace', async () => {
      const fresh = await one('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-alloc`]);
      workspaceIds.push(fresh);
      const numbers = await Promise.all(
        Array.from({ length: 12 }, () => dbHandle.db.transaction((tx) => allocateItemNo(tx, fresh))),
      );
      expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: 12 }, (_, n) => n + 1));
      expect(await allocateItemNo(dbHandle.db, fresh)).toBe(13);
    });

    it('a rolled-back allocation leaves no gap', async () => {
      const fresh = await one('insert into core.workspaces (name) values ($1) returning id', [`${TAG}-alloc2`]);
      workspaceIds.push(fresh);
      await expect(
        dbHandle.db.transaction(async (tx) => {
          await allocateItemNo(tx, fresh);
          throw new Error('abort');
        }),
      ).rejects.toThrow('abort');
      expect(await allocateItemNo(dbHandle.db, fresh)).toBe(1);
    });
  });

  describe('logKnowledge.items', () => {
    it('lists published items only by default, newest update first, and never another workspace', async () => {
      const all = await list();
      expect(titles(all)).not.toContain(`${TAG} archived item`);
      expect(titles(all)).not.toContain(`${TAG} foreign item`);
      expect(all.data.rows.map((r: { id: string }) => r.id)).not.toContain(ids.iOther);
      expect(all.data.total).toBe(all.data.rows.length);
      const stamps = all.data.rows.map((r: { updatedAt: string }) => r.updatedAt);
      expect(stamps).toEqual([...stamps].sort().reverse());
    });

    it('answers archived items only when asked', async () => {
      expect(titles(await list([flt('publicationState', 'in', ['archived'])]))).toEqual([`${TAG} archived item`]);
    });

    it('row shape: number, latest title, type, owner, states', async () => {
      const row = (await list([flt('ownerSoftwareId', 'in', [ids.s1])])).data.rows[0];
      expect(row).toEqual({
        id: ids.i3,
        itemNo: expect.any(Number),
        title: `${TAG} software item`,
        typeCode: 'anomaly',
        owner: { kind: 'software', modelId: ids.m1, modelName: `${TAG}-m1`, softwareId: ids.s1, versionLabel: `${TAG}-s1` },
        verificationState: 'not_checked',
        processingState: 'open',
        publicationState: 'published',
        latestRevisionNo: 1,
        updatedAt: expect.any(String),
      });
      const modelRow = (await list([flt('ownerModelId', 'in', [ids.m2])])).data.rows[0];
      expect(modelRow.owner).toEqual({ kind: 'model', modelId: ids.m2, modelName: `${TAG}-m2` });
    });

    it('a model filter shows its own items only; includeSoftware adds its SW versions` items', async () => {
      const own = await list([flt('ownerModelId', 'in', [ids.m1])]);
      expect(titles(own).sort()).toEqual([`${TAG} model item one`, `${TAG} model item two`]);
      const explicitOff = await list([flt('ownerModelId', 'in', [ids.m1]), flt('includeSoftware', 'in', ['false'])]);
      expect(titles(explicitOff).sort()).toEqual(titles(own).sort());
      const withSw = await list([flt('ownerModelId', 'in', [ids.m1]), flt('includeSoftware', 'in', ['true'])]);
      expect(titles(withSw).sort()).toEqual(
        [`${TAG} derived item`, `${TAG} model item one`, `${TAG} model item two`, `${TAG} software item`].sort(),
      );
    });

    it('filters by owner kind, type, and the two assessment states', async () => {
      expect(titles(await list([flt('ownerKind', 'in', ['software'])])).sort()).toEqual([`${TAG} derived item`, `${TAG} software item`]);
      expect(titles(await list([flt('typeCode', 'in', ['guideline'])]))).toEqual([`${TAG} model item one`]);
      expect(titles(await list([flt('typeCode', 'notIn', ['anomaly', 'needs_check', 'behavior_note'])]))).toEqual([`${TAG} model item one`]);
      await appSql(`update knowledge.knowledge_item set processing_state = 'resolved' where id = $1`, [ids.i2]);
      expect(titles(await list([flt('processingState', 'in', ['resolved'])]))).toEqual([`${TAG} model item two`]);
      await appSql(`update knowledge.knowledge_item set verification_state = 'disputed' where id = $1`, [ids.i2]);
      expect(titles(await list([flt('verificationState', 'in', ['disputed'])]))).toEqual([`${TAG} model item two`]);
    });

    it('q matches the latest title and KI-<n>', async () => {
      const no = (await list([flt('ownerSoftwareId', 'in', [ids.s2])])).data.rows[0].itemNo as number;
      const byNo = await read('logKnowledge.items', { q: `KI-${no}` });
      expect(byNo.data.rows.map((r: { id: string }) => r.id)).toContain(ids.i4);
      // item one's first revision was titled "(old)": the search sees the latest title only
      expect((await read('logKnowledge.items', { q: `${TAG} model item one (old)` })).data.total).toBe(0);
    });

    it('sorts by title and pages with a total', async () => {
      const asc = await list([], { sorting: [{ id: 'title', desc: false }], pageSize: 2 });
      expect(asc.data.rows).toHaveLength(2);
      expect(asc.data.total).toBeGreaterThan(2);
      expect(titles(asc)).toEqual([...titles(asc)].sort());
    });

    it('refuses a bad filter value as an error, not an empty page', async () => {
      const res = await read('logKnowledge.items', { filters: [flt('typeCode', 'in', ['bug'])] });
      expect(res.outcome).toBe('error');
    });
  });

  describe('logKnowledge.itemDetail', () => {
    it('answers the latest revision with evidence, revisions, assessments and links', async () => {
      const res = await read('logKnowledge.itemDetail', { itemId: ids.i1 });
      expect(res.outcome).toBe('ok');
      expect(res.data.item).toMatchObject({ id: ids.i1, title: `${TAG} model item one`, createdBy: actorId, version: '1' });
      expect(res.data.revision).toMatchObject({ revisionNo: 2, title: `${TAG} model item one` });
      expect(res.data.revision.evidence).toEqual([
        { ordinal: 1, sourceKind: 'log_file', sourceOwner: 'Log system', sourceRef: 'log-1', sourceVersion: null, contentHash: null, locator: 'rows 1-9', note: null },
      ]);
      expect(res.data.revisions.map((r: { revisionNo: number }) => r.revisionNo)).toEqual([2, 1]);
      expect(res.data.assessments).toEqual([
        expect.objectContaining({ dimension: 'verification', priorState: 'not_checked', newState: 'observed', rationale: 'seen once', actorId, basedOnRevisionNo: 1 }),
      ]);
    });

    it('lists revisions with only the five history fields, no bodies', async () => {
      const res = await read('logKnowledge.itemDetail', { itemId: ids.i1 });
      expect(res.data.revisions).toEqual([
        { revisionNo: 2, title: `${TAG} model item one`, publishedBy: actorId, publishedAt: expect.any(String), changeNote: null },
        { revisionNo: 1, title: `${TAG} model item one (old)`, publishedBy: actorId, publishedAt: expect.any(String), changeNote: null },
      ]);
    });

    it('reads an older revision on request, without its later evidence', async () => {
      const res = await read('logKnowledge.itemDetail', { itemId: ids.i1, revisionNo: 1 });
      expect(res.data.revision).toMatchObject({ revisionNo: 1, title: `${TAG} model item one (old)`, evidence: [] });
      expect(res.data.item.title).toBe(`${TAG} model item one`);
      expect((await read('logKnowledge.itemDetail', { itemId: ids.i1, revisionNo: 3 })).data).toBeNull();
    });

    it('shows link directions from both ends', async () => {
      const derived = (await read('logKnowledge.itemDetail', { itemId: ids.i4 })).data.links;
      expect(derived).toEqual([
        expect.objectContaining({ kind: 'derived_from', direction: 'outgoing', itemId: ids.i3, title: `${TAG} software item`, sourceRevisionNo: 1 }),
      ]);
      const original = (await read('logKnowledge.itemDetail', { itemId: ids.i3 })).data.links;
      expect(original).toEqual([
        expect.objectContaining({ kind: 'derived_from', direction: 'incoming', itemId: ids.i4, sourceRevisionNo: 1 }),
      ]);
      const related = (await read('logKnowledge.itemDetail', { itemId: ids.i1 })).data.links;
      expect(related).toEqual([expect.objectContaining({ kind: 'related', direction: 'incoming', itemId: ids.i2, sourceRevisionNo: null })]);
    });

    it('answers ok with null data for an unknown or other-workspace item', async () => {
      for (const itemId of [ids.iOther, randomUUID()]) {
        const res = await read('logKnowledge.itemDetail', { itemId });
        expect(res).toMatchObject({ outcome: 'ok', data: null });
      }
    });
  });

  describe('logKnowledge.exploreModels and modelProfile', () => {
    it('adds modelItemCount (published, model-owned) to the models rows only on explore', async () => {
      const explore = await read('logKnowledge.exploreModels', { q: TAG });
      const m1 = explore.data.rows.find((r: { id: string }) => r.id === ids.m1);
      const m2 = explore.data.rows.find((r: { id: string }) => r.id === ids.m2);
      expect(m1.modelItemCount).toBe(2); // archived and SW-owned items do not count
      expect(m2.modelItemCount).toBe(1);
      expect(m1.softwareCount).toBe(2);
      const plain = await read('logKnowledge.models', { q: TAG });
      expect(plain.data.rows[0]).not.toHaveProperty('modelItemCount');
    });

    it('profile: model, vendor, SW versions with item counts, model-owned total', async () => {
      const res = await read('logKnowledge.modelProfile', { modelId: ids.m1 });
      expect(res.data.model).toMatchObject({ id: ids.m1, code: `${TAG}-m1`, active: true, vendor: { id: ids.v, code: `${TAG}-v`, active: true }, processes: [] });
      expect(res.data.modelItems).toEqual({ total: 2 });
      expect(res.data.truncated).toBe(false);
      const counts = Object.fromEntries(res.data.softwareVersions.map((s: { id: string; itemCount: number }) => [s.id, s.itemCount]));
      expect(counts).toEqual({ [ids.s1 as string]: 1, [ids.s2 as string]: 1 });
    });

    it('profile of an unknown or other-workspace model answers ok with null data', async () => {
      for (const modelId of [ids.mOther, randomUUID()]) {
        expect(await read('logKnowledge.modelProfile', { modelId })).toMatchObject({ outcome: 'ok', data: null });
      }
    });
  });
});
