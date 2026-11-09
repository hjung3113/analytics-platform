// #1507 S-d — the knowledge search read against a real Postgres (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`;
// the read runs as platform_app, fixtures and cleanup as platform_migrate). Needs migrations 0117 (relation records), 0118 (access) and 0120
// (search index). Repository-level checks use a workspace of their own so lists are exact; the endpoint, permission and token checks go
// through the real server in the seeded workspace.

import { randomUUID } from 'node:crypto';

import { sql as dsql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { hashToken } from '../../api-tokens/token-format.js';
import { toCodeKey } from '../domain/code-key.js';
import { visibleItemSql } from '../repositories/access-visibility.js';
import { pgSearchPort } from '../repositories/search-pg-adapter.js';
import { applyItem } from '../repositories/search-index.js';
import { type SearchInput, type SearchResponse, runSearch, runSuggest } from '../repositories/search-read.js';
import { describeSearchPortContract } from './search-port-contract.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `SRD${randomUUID().slice(0, 6).toUpperCase()}`;
const STEP = 'STEP/STEP_PROCESS';
const START = 'PROC/PROCESS_START';

describe.skipIf(!runIntegration)('log knowledge search read (#1507 S-d)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  const ws = randomUUID(); // repository tests
  const cws = randomUUID(); // adapter contract fixture
  const workspaces = [ws, cws];
  let creator = '';
  let viewerA = ''; // may see everything that is internal
  let viewerB = ''; // second viewer for allow rules
  let vendor = '';
  const models = {} as Record<'MA' | 'MB' | 'MC' | 'MD', string>;
  let swA1 = '';
  const itemNos = new Map<string, number>();
  const actorIds: string[] = [];
  const seededItems: string[] = [];
  let seededModel = '';
  let seededVendor = '';
  let admin: { id: string; cookie: string };
  let sysId = '';
  let tokenOk = '';
  let tokenNoRead = '';
  let tick = 0;

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0]?.id as string;
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });
  const view = (actorId: string, workspaceId = ws) => ({ workspaceId, actorId });

  const input = (over: Partial<SearchInput> = {}): SearchInput => ({ q: null, owner: null, relation: null, kind: 'all', includeOpposite: false, cursor: null, limit: 20, ...over });
  async function search(over: Partial<SearchInput>, actorId = viewerA, workspaceId = ws): Promise<SearchResponse> {
    const out = await runSearch(dbHandle.db, view(actorId, workspaceId), input(over));
    if (!out.ok) throw new Error(out.message);
    return out.response;
  }

  async function model(workspaceId: string, code: string, access = 'internal') {
    return one(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, access_mode, created_by, updated_by) values ($1,$2,$3,$4,$3,$5,$6,$6) returning id`, [workspaceId, vendor, code, toCodeKey(code), access, creator]);
  }
  async function item(
    workspaceId: string,
    owner: { model?: string; software?: string },
    title: string,
    over: { observation?: string; access?: string; archived?: boolean; relations?: [string, string, string][]; subjects?: [string, string][]; modelForSubject?: string } = {},
  ): Promise<string> {
    const no = (itemNos.get(workspaceId) ?? 0) + 1;
    itemNos.set(workspaceId, no);
    const id = await one(
      `insert into knowledge.knowledge_item (workspace_id, item_no, owner_model_id, owner_software_id, latest_revision_no, publication_state, access_mode, created_by, updated_by)
       values ($1,$2,$3,$4,1,$5,$6,$7,$7) returning id`,
      [workspaceId, no, owner.model ?? null, owner.software ?? null, over.archived ? 'archived' : 'published', over.access ?? 'internal', creator],
    );
    await sql(
      `insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by, published_at) values ($1,$2,1,$3,'anomaly',$4,$5, now() + ($6 || ' seconds')::interval)`,
      [workspaceId, id, title, over.observation ?? 'obs', creator, String(++tick)],
    );
    let ordinal = 0;
    for (const [kind, source, target] of over.relations ?? []) {
      await sql(
        `insert into knowledge.item_event_relation_record (workspace_id, item_id, revision_no, ordinal, kind, source_key, predicate, target_key, resolved) values ($1,$2,1,$3,$4,$5,'before',$6,true)`,
        [workspaceId, id, ++ordinal, kind, source, target],
      );
    }
    for (const [key] of over.subjects ?? []) {
      await sql(`insert into knowledge.item_revision_subject (workspace_id, item_id, revision_no, model_id, target_kind, target_key, subject_relation) values ($1,$2,1,$3,'event',$4,'about')`, [workspaceId, id, over.modelForSubject, key]);
    }
    if (workspaceId === WORKSPACE_ID) seededItems.push(id);
    return id;
  }
  const index = async (workspaceId: string, ...ids: string[]) => {
    for (const id of ids) await dbHandle.db.transaction((tx) => applyItem(tx, workspaceId, id));
  };
  async function concept(label: string, pairs: [string, string, string?][]) {
    const c = await one(`insert into knowledge.common_concept (workspace_id, kind, canonical_label, label_key, created_by) values ($1,'event',$2,$3,$4) returning id`, [ws, `${TAG} ${label}`, toCodeKey(`${TAG} ${label}`), creator]);
    const ids: string[] = [];
    for (const [modelId, key, state] of pairs) {
      ids.push(
        await one(
          `insert into knowledge.spec_concept_mapping (workspace_id, concept_id, model_id, target_kind, target_key, relation_kind, review_state, origin, reject_reason, proposed_by, reviewed_by, reviewed_at)
           values ($1,$2,$3,'event',$4,'equivalent',$5,'human',$6,$7,$8,$9) returning id`,
          [ws, c, modelId, key, state ?? 'confirmed', state === 'rejected' ? 'no' : null, creator, state === 'proposed' ? null : creator, state === 'proposed' ? null : new Date().toISOString()],
        ),
      );
    }
    return ids;
  }
  const rule = (kind: 'model' | 'software' | 'item', target: string, grantee: string, effect: 'allow' | 'deny' = 'allow') =>
    one(`insert into knowledge.object_access_rule (workspace_id, target_kind, target_id, grantee_id, effect, created_by) values ($1,$2,$3,$4,$5,$6) returning rule_id as id`, [ws, kind, target, grantee, effect, creator]);
  const revoke = (ruleId: string) => sql(`update knowledge.object_access_rule set revoked_at = now(), revoked_by = $2 where rule_id = $1`, [ruleId, creator]);

  const ids = {} as Record<'fwdObs' | 'fwdExp' | 'rev' | 'plain' | 'sw' | 'otherModel' | 'mapped' | 'proposed' | 'archived' | 'cFwdObs' | 'cFwdExp' | 'cRev' | 'cText' | 'cBlocked', string>;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    for (const w of workspaces) await sql('insert into core.workspaces (id, name) values ($1, $2)', [w, `${TAG}-${w.slice(0, 4)}`]);
    const actor = async (workspaceId: string, name: string) => {
      const a = (await insertActorRow(dbHandle, { workspaceId, externalId: `${TAG}-${name}`, roleLevel: 'admin' })).id;
      actorIds.push(a);
      return a;
    };
    creator = await actor(ws, 'creator');
    viewerA = await actor(ws, 'viewer-a');
    viewerB = await actor(ws, 'viewer-b');
    const cCreator = await actor(cws, 'ccreator');
    vendor = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,'V',$4,$4) returning id`, [ws, `${TAG}V`, toCodeKey(`${TAG}V`), creator]);
    for (const code of ['MA', 'MB', 'MC', 'MD'] as const) models[code] = await model(ws, `${TAG}${code}`);
    swA1 = await one(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`, [ws, models.MA, `${TAG}1.0`, toCodeKey(`${TAG}1.0`), creator]);

    // ---- the main fixture (workspace `ws`) ----
    ids.fwdObs = await item(ws, { model: models.MA }, 'Forward observed', { relations: [['observed', STEP, START]] });
    ids.fwdExp = await item(ws, { model: models.MA }, 'Forward expected', { relations: [['expected', STEP, START]] });
    ids.rev = await item(ws, { model: models.MA }, 'Reverse observed', { relations: [['observed', START, STEP]] });
    ids.plain = await item(ws, { model: models.MA }, 'Mentions STEP_PROCESS and PROCESS_START', { observation: 'the chamber ran STEP_PROCESS then PROCESS_START' });
    ids.sw = await item(ws, { software: swA1 }, 'Forward in a SW version', { relations: [['observed', STEP, START]] });
    ids.otherModel = await item(ws, { model: models.MB }, 'Forward in another model', { relations: [['observed', STEP, START]] });
    ids.mapped = await item(ws, { model: models.MB }, 'Forward by concept', { relations: [['observed', 'X/X_STEP', 'X/X_START']] });
    ids.proposed = await item(ws, { model: models.MC }, 'Forward by proposed concept', { relations: [['observed', 'Y/Y_STEP', 'Y/Y_START']] });
    ids.archived = await item(ws, { model: models.MA }, 'Archived forward', { archived: true, relations: [['observed', STEP, START]] });
    // `step` and `start` tie the A and B models; a proposed / rejected third member must never widen a match.
    const stepMaps = await concept('step', [[models.MA, STEP], [models.MB, 'X/X_STEP'], [models.MC, 'Y/Y_STEP', 'proposed']]);
    const startMaps = await concept('start', [[models.MA, START], [models.MB, 'X/X_START'], [models.MC, 'Y/Y_START', 'rejected']]);
    expect(stepMaps.length + startMaps.length).toBe(6);
    await index(ws, ...Object.values(ids));

    // ---- the adapter contract fixture (workspace `cws`) ----
    const cVendor = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,'V',$4,$4) returning id`, [cws, `${TAG}CV`, toCodeKey(`${TAG}CV`), cCreator]);
    const cModel = await one(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,$3,$5,$5) returning id`, [cws, cVendor, `${TAG}CM`, toCodeKey(`${TAG}CM`), cCreator]);
    const cItem = async (title: string, relations: [string, string, string][]) => {
      const no = (itemNos.get(cws) ?? 0) + 1;
      itemNos.set(cws, no);
      const id = await one(`insert into knowledge.knowledge_item (workspace_id, item_no, owner_model_id, latest_revision_no, publication_state, created_by, updated_by) values ($1,$2,$3,1,'published',$4,$4) returning id`, [cws, no, cModel, cCreator]);
      await sql(`insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by, published_at) values ($1,$2,1,$3,'anomaly','obs',$4, now() + ($5 || ' seconds')::interval)`, [cws, id, title, cCreator, String(++tick)]);
      let ordinal = 0;
      for (const [kind, s, t] of relations) await sql(`insert into knowledge.item_event_relation_record (workspace_id, item_id, revision_no, ordinal, kind, source_key, predicate, target_key, resolved) values ($1,$2,1,$3,$4,$5,'before',$6,true)`, [cws, id, ++ordinal, kind, s, t]);
      await index(cws, id);
      return id;
    };
    ids.cFwdObs = await cItem('alpha forward', [['observed', 'M/a_evt', 'M/b_evt']]);
    ids.cFwdExp = await cItem('alpha expected', [['expected', 'M/a_evt', 'M/b_evt']]);
    ids.cRev = await cItem('alpha reverse', [['observed', 'M/b_evt', 'M/a_evt']]);
    ids.cText = await cItem('alpha lookup', []);
    ids.cBlocked = await cItem('alpha blocked', [['observed', 'M/a_evt', 'M/b_evt']]);

    // ---- the seeded workspace for the endpoint checks ----
    const externalId = `${TAG}-admin`;
    const adminActor = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'admin' });
    actorIds.push(adminActor.id);
    admin = { id: adminActor.id, cookie: await loginAs(app, externalId) };
    seededVendor = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,'V',$4,$4) returning id`, [WORKSPACE_ID, `${TAG}W`, toCodeKey(`${TAG}W`), admin.id]);
    seededModel = await one(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, access_mode, created_by, updated_by) values ($1,$2,$3,$4,$3,'restricted',$5,$5) returning id`, [WORKSPACE_ID, seededVendor, `${TAG}H`, toCodeKey(`${TAG}H`), admin.id]);
    const sysExternal = `${TAG}-sys`;
    sysId = (await sql(`insert into core.actors (workspace_id, external_id, email, display_name, role_level, actor_type) values ($1,$2,$2 || '@local',$2,'user','system') returning id`, [WORKSPACE_ID, sysExternal])).rows[0].id as string;
    actorIds.push(sysId);
    await sql(`insert into permission.permission_grants (workspace_id, actor_id, capability, granted_by_actor_id) values ($1,$2,'workspace.read',$3)`, [WORKSPACE_ID, sysId, admin.id]);
    const mkToken = async (scopes: string[]) => {
      const prefix = randomUUID().replace(/-/g, '').slice(0, 8);
      const value = `ap_${prefix}_${Buffer.from(randomUUID() + randomUUID()).toString('base64url').slice(0, 43)}`;
      await sql(`insert into core.api_tokens (workspace_id, actor_id, kind, name, prefix, secret_hash, scopes, created_by) values ($1,$2,'service','fixture',$3,$4,$5,$6)`, [WORKSPACE_ID, sysId, prefix, hashToken(value), scopes, admin.id]);
      return value;
    };
    tokenOk = await mkToken(['workspace.read']);
    tokenNoRead = await mkToken(['knowledge.draft.create']);
  });

  afterAll(async () => {
    // draft_revision refuses DELETE for every role: lift its trigger inside the cleanup transaction (the migrate role owns it).
    const cleanup = await migrate.pool.connect();
    try {
      await cleanup.query('begin');
      await cleanup.query('alter table knowledge.draft_revision disable trigger draft_revision_append_only');
      await cleanup.query('delete from knowledge.draft_revision where workspace_id = any($1)', [workspaces]);
      await cleanup.query('alter table knowledge.draft_revision enable trigger draft_revision_append_only');
      await cleanup.query('delete from knowledge.draft where workspace_id = any($1)', [workspaces]);
      await cleanup.query('commit');
    } catch (error) {
      await cleanup.query('rollback');
      throw error;
    } finally {
      cleanup.release();
    }
    await sql('delete from knowledge.search_document where workspace_id = any($1) or item_id = any($2)', [workspaces, seededItems]);
    await sql('delete from knowledge.search_outbox where workspace_id = any($1)', [workspaces]).catch(() => undefined);
    await sql('delete from knowledge.search_backfill_progress where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.search_index_pointer where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.item_link where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.object_access_rule where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.spec_concept_mapping where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.common_concept where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.item_event_relation_record where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.item_revision_subject where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.knowledge_item_revision where workspace_id = any($1) or item_id = any($2)', [workspaces, seededItems]);
    await sql('delete from knowledge.knowledge_item where workspace_id = any($1) or id = any($2)', [workspaces, seededItems]);
    await sql('delete from knowledge.software_version where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.equipment_model where workspace_id = any($1) or id = $2::uuid', [workspaces, seededModel || null]);
    await sql('delete from knowledge.vendor where workspace_id = any($1) or id = $2::uuid', [workspaces, seededVendor || null]);
    await sql('delete from core.api_tokens where actor_id = $1', [sysId]);
    await sql('delete from permission.permission_grants where actor_id = $1', [sysId]);
    for (const [table, column] of [['core.audit_log', 'actor_id'], ['core.idempotency_keys', 'actor_id'], ['core.sessions', 'actor_id'], ['core.actors', 'id']]) {
      await sql(`delete from ${table} where ${column} = any($1)`, [actorIds]).catch(() => undefined);
    }
    await sql('delete from core.workspaces where id = any($1)', [workspaces]);
    await app.close();
    await dbHandle.pool.end();
    await migrate.pool.end();
  });

  // ---- the adapter contract, run on the PG adapter -------------------------------------------------------------------
  describeSearchPortContract('pg (FTS + trigram over search_document)', () => ({
    port: pgSearchPort,
    withTx: (fn) => dbHandle.db.transaction(fn),
    workspaceId: cws,
    ids: { fwdObserved: ids.cFwdObs, fwdExpected: ids.cFwdExp, reverse: ids.cRev, textOnly: ids.cText, blocked: ids.cBlocked },
    guard: (itemId) => dsql`(${visibleItemSql({ workspaceId: cws, actorId: viewerA }, itemId)} AND ${itemId} <> ${ids.cBlocked}::uuid)`,
  }));

  // ---- interpretation, direction, ranking ---------------------------------------------------------------------------
  it('a forward query returns observed (1) before expected (2, «명세상 기대»), concept-mapped last, each owner on its own row', async () => {
    const r = await search({ q: 'STEP_PROCESS before PROCESS_START' });
    expect(r.interpretation.direction).toMatchObject({ origin: 'operator', source: 'STEP_PROCESS', target: 'PROCESS_START', kind: 'all', swapped: false });
    expect(r.items.map((i) => [i.itemId, i.stage, i.expectedOnly])).toEqual([
      ...[ids.otherModel, ids.sw, ids.fwdObs].map((id) => [id, 1, false]), // newest first inside a stage
      [ids.fwdExp, 2, true],
      [ids.mapped, 4, false],
    ]);
    expect(r.items.find((i) => i.itemId === ids.mapped)?.reasons).toEqual(['concept_mapping']);
    expect(r.items.find((i) => i.itemId === ids.fwdExp)?.reasons).toEqual(['expected_same_direction']);
    // Same Event keys in a model, a SW version and another model: three rows, each with its owner, never merged.
    const owners = r.items.filter((i) => [ids.fwdObs, ids.sw, ids.otherModel].includes(i.itemId)).map((i) => [i.owner.modelId, i.owner.softwareId]);
    expect(new Set(owners.map((o) => o.join('/'))).size).toBe(3);
    expect(r.items.find((i) => i.itemId === ids.sw)?.owner).toMatchObject({ modelId: models.MA, softwareId: swA1 });
    for (const excluded of [ids.rev, ids.plain, ids.proposed, ids.archived]) expect(r.items.map((i) => i.itemId)).not.toContain(excluded);
  });

  it('`B after A` finds exactly what `A before B` finds; `B before A` finds the reverse Item only', async () => {
    const forward = await search({ q: 'STEP_PROCESS before PROCESS_START' });
    const swapped = await search({ q: 'PROCESS_START after STEP_PROCESS' });
    expect(swapped.interpretation.direction).toMatchObject({ source: 'STEP_PROCESS', target: 'PROCESS_START', swapped: true });
    expect(swapped.items.map((i) => i.itemId)).toEqual(forward.items.map((i) => i.itemId));
    const reverse = await search({ q: 'PROCESS_START before STEP_PROCESS' });
    expect(reverse.items.map((i) => i.itemId)).toEqual([ids.rev]);
    const viaParam = await search({ relation: { source: 'PROCESS_START', predicate: 'after', target: 'STEP_PROCESS' } });
    expect(viaParam.interpretation.direction?.origin).toBe('explicit');
    expect(viaParam.items.map((i) => i.itemId)).toEqual(forward.items.map((i) => i.itemId));
  });

  it('the relation kind picks observed or expected records; the opposite direction is an opt-in separate section', async () => {
    const observed = await search({ q: 'STEP_PROCESS before PROCESS_START', kind: 'observed' });
    expect(observed.items.map((i) => i.itemId)).not.toContain(ids.fwdExp);
    const expected = await search({ q: 'STEP_PROCESS before PROCESS_START', kind: 'expected' });
    expect(expected.items.map((i) => i.itemId)).toEqual([ids.fwdExp]);
    expect((await search({ q: 'STEP_PROCESS before PROCESS_START' })).opposite).toBeNull();
    const withOpposite = await search({ q: 'STEP_PROCESS before PROCESS_START', includeOpposite: true });
    expect(withOpposite.opposite?.map((i) => i.itemId)).toEqual([ids.rev]);
    expect(withOpposite.opposite?.[0]?.reasons).toEqual([]);
    expect(withOpposite.items.map((i) => i.itemId)).not.toContain(ids.rev);
  });

  it('an Item without records is never matched by direction, but a plain-text query finds it (and the reverse Item) as text', async () => {
    const direction = await search({ q: 'STEP_PROCESS before PROCESS_START' });
    expect(direction.items.map((i) => i.itemId)).not.toContain(ids.plain);
    const text = await search({ q: 'STEP_PROCESS PROCESS_START' });
    expect(text.interpretation.direction).toBeNull();
    expect(text.items.map((i) => i.itemId)).toEqual(expect.arrayContaining([ids.plain, ids.rev, ids.fwdObs]));
    for (const i of text.items) expect(i.reasons.some((x) => x.endsWith('same_direction'))).toBe(false);
  });

  it('negated or one-sided text is plain text and gets no direction', async () => {
    for (const q of ['PROCESS_START 전에 STEP_PROCESS가 아니다', 'before PROCESS_START']) expect((await search({ q })).interpretation.direction).toBeNull();
  });

  it('only a confirmed equivalent mapping widens the match: proposed and rejected are unused, and a state change takes effect at once', async () => {
    const r = await search({ q: 'STEP_PROCESS before PROCESS_START' });
    expect(r.items.map((i) => i.itemId)).not.toContain(ids.proposed);
    // A fresh pair of PROPOSED mappings into the same concepts: no effect until a person confirms them, and none again once rejected.
    const conceptOf = async (key: string) => (await sql(`select concept_id as id from knowledge.spec_concept_mapping where workspace_id = $1 and target_key = $2 and review_state = 'confirmed'`, [ws, key])).rows[0]?.id as string;
    const propose = (concept: string, key: string) =>
      one(`insert into knowledge.spec_concept_mapping (workspace_id, concept_id, model_id, target_kind, target_key, relation_kind, review_state, origin, proposed_by) values ($1,$2,$3,'event',$4,'equivalent','proposed','human',$5) returning id`, [ws, concept, models.MD, key, creator]);
    const zs = await propose(await conceptOf(STEP), 'Z/Z_STEP');
    const ze = await propose(await conceptOf(START), 'Z/Z_START');
    const zItem = await item(ws, { model: models.MD }, 'Forward by a later concept', { relations: [['observed', 'Z/Z_STEP', 'Z/Z_START']] });
    await index(ws, zItem);
    const ask = async () => (await search({ q: 'STEP_PROCESS before PROCESS_START' })).items.map((i) => i.itemId);
    expect(await ask()).not.toContain(zItem);
    const setState = (id: string, state: 'confirmed' | 'rejected') =>
      sql(`update knowledge.spec_concept_mapping set review_state = $2, reviewed_by = $3, reviewed_at = now(), reject_reason = $4, row_version = row_version + 1 where id = $1`, [id, state, creator, state === 'rejected' ? 'no' : null]);
    await setState(zs, 'confirmed');
    expect(await ask()).not.toContain(zItem); // one side only
    await setState(ze, 'confirmed');
    expect(await ask()).toContain(zItem);
    expect((await search({ q: 'STEP_PROCESS before PROCESS_START' })).items.find((i) => i.itemId === zItem)?.reasons).toEqual(['concept_mapping']);
    await setState(ze, 'rejected');
    expect(await ask()).not.toContain(zItem);
  });

  // ---- visibility ------------------------------------------------------------------------------------------------
  it('revoking a right removes the Item from the same query, the suggestions and the related-Item count at the next request', async () => {
    const secret = await item(ws, { model: models.MD }, `${TAG} secretword zeta`, { access: 'restricted', relations: [['observed', STEP, START]] });
    const linker = await item(ws, { model: models.MD }, `${TAG} linker`);
    await sql(`insert into knowledge.item_link (workspace_id, source_item_id, target_item_id, link_kind, created_by) values ($1,$2,$3,'related',$4)`, [ws, linker, secret, creator]);
    await index(ws, secret, linker);
    const grant = await rule('item', secret, viewerB);
    const q = { q: 'secretword' };
    expect((await search(q, viewerB)).items.map((i) => i.itemId)).toEqual([secret]);
    expect((await search({ q: 'linker' }, viewerB)).items[0]?.relatedCount).toBe(1);
    expect((await runSuggest(dbHandle.db, view(viewerB), 'zeta', null)).suggestions).toEqual([]);
    expect((await runSuggest(dbHandle.db, view(viewerB), `${TAG.toLowerCase()} secret`, null)).suggestions.map((s) => s.text)).toEqual([`${TAG} secretword zeta`]);
    expect((await search({ q: 'STEP_PROCESS before PROCESS_START' }, viewerB)).items.map((i) => i.itemId)).toContain(secret);
    await revoke(grant);
    expect((await search(q, viewerB)).items).toEqual([]);
    expect((await search({ q: 'linker' }, viewerB)).items[0]?.relatedCount).toBe(0);
    expect((await runSuggest(dbHandle.db, view(viewerB), `${TAG.toLowerCase()} secret`, null)).suggestions).toEqual([]);
    expect((await search({ q: 'STEP_PROCESS before PROCESS_START' }, viewerB)).items.map((i) => i.itemId)).not.toContain(secret);
    expect((await search({ q: 'secretword' }, viewerA)).items).toEqual([]); // nobody was ever allowed but B
  });

  it('a restricted parent hides its children whatever the child rules say', async () => {
    const hiddenModel = await model(ws, `${TAG}MH`, 'restricted');
    const hiddenSw = await one(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,$3,$4,'',$5,$5) returning id`, [ws, hiddenModel, `${TAG}9.9`, toCodeKey(`${TAG}9.9`), creator]);
    const child = await item(ws, { software: hiddenSw }, `${TAG} childword bypass`);
    const modelItem = await item(ws, { model: hiddenModel }, `${TAG} childword direct`, { access: 'internal' });
    await index(ws, child, modelItem);
    await rule('software', hiddenSw, viewerB); // a child allow cannot lift the parent restriction
    await rule('item', child, viewerB);
    await rule('item', modelItem, viewerB);
    expect((await search({ q: 'childword' }, viewerB)).items).toEqual([]);
    const allow = await rule('model', hiddenModel, viewerB);
    expect((await search({ q: 'childword' }, viewerB)).items.map((i) => i.itemId).sort()).toEqual([child, modelItem].sort());
    await revoke(allow);
    expect((await search({ q: 'childword' }, viewerB)).items).toEqual([]);
  });

  it('a hidden owner filter and a nonexistent one answer byte-identically; a hidden Item shows nowhere', async () => {
    const hiddenModel = await model(ws, `${TAG}MX`, 'restricted');
    const hidden = await item(ws, { model: hiddenModel }, `${TAG} oracleword`);
    await index(ws, hidden);
    const owner = (modelId: string) => ({ modelId, softwareId: null, includeSoftware: false });
    const a = await search({ q: 'oracleword', owner: owner(hiddenModel) });
    const b = await search({ q: 'oracleword', owner: owner(randomUUID()) });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.items).toEqual([]);
    const sa = await runSuggest(dbHandle.db, view(viewerA), 'oracle', owner(hiddenModel));
    const sb = await runSuggest(dbHandle.db, view(viewerA), 'oracle', owner(randomUUID()));
    expect(JSON.stringify(sa)).toBe(JSON.stringify(sb));
  });

  it('the response has no exact total; `capped` ignores hidden Items and flips only above 100 VISIBLE matches', async () => {
    const bulk = async (n: number, access: string, word: string) => {
      const m = access === 'restricted' ? await model(ws, `${TAG}MR${tick++}`, 'restricted') : models.MA;
      const before = (await sql(`select coalesce(max(item_no),0)::int as n from knowledge.knowledge_item where workspace_id = $1`, [ws])).rows[0].n as number;
      const res = await sql(
        `insert into knowledge.knowledge_item (workspace_id, item_no, owner_model_id, latest_revision_no, publication_state, created_by, updated_by)
         select $1, $2 + g, $3, 1, 'published', $4, $4 from generate_series(1, $5) g returning id`,
        [ws, before, m, creator, n],
      );
      const created = res.rows.map((r) => r.id as string);
      await sql(`insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by) select $1, x, 1, $2 || ' ' || x, 'anomaly', 'obs', $3 from unnest($4::uuid[]) x`, [ws, word, creator, created]);
      for (const id of created) await index(ws, id);
      itemNos.set(ws, before + n);
      return created;
    };
    await bulk(98, 'internal', 'capword');
    await bulk(10, 'restricted', 'capword'); // hidden: must not push the answer over the cap
    let r = await search({ q: 'capword', limit: 50 });
    expect(r.capped).toBe(false);
    expect(Object.keys(r).sort()).toEqual(['capped', 'hasMore', 'indexLag', 'interpretation', 'items', 'nextCursor', 'opposite', 'oppositeHasMore', 'version']);
    expect(JSON.stringify(r)).not.toMatch(/"(total|totalCount|count|matchCount|hiddenCount)"/i);
    await bulk(3, 'internal', 'capword');
    r = await search({ q: 'capword', limit: 50 });
    expect(r.capped).toBe(true);
    expect(r.hasMore).toBe(true);
  });

  it('keyset pages are stable: no duplicate, no gap, a foreign cursor is refused', async () => {
    const created: string[] = [];
    for (let n = 0; n < 7; n += 1) created.push(await item(ws, { model: models.MA }, `${TAG} pagerword ${n}`));
    await index(ws, ...created);
    const whole = await search({ q: 'pagerword', limit: 50 });
    expect(whole.items).toHaveLength(7);
    const walked: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page += 1) {
      const r: SearchResponse = await search({ q: 'pagerword', limit: 3, cursor });
      walked.push(...r.items.map((i) => i.itemId));
      if (!r.hasMore) {
        expect(r.nextCursor).toBeNull();
        break;
      }
      cursor = r.nextCursor;
    }
    expect(walked).toEqual(whole.items.map((i) => i.itemId));
    const first = await search({ q: 'pagerword', limit: 3 });
    const foreign = await runSearch(dbHandle.db, view(viewerA), input({ q: 'otherword', limit: 3, cursor: first.nextCursor }));
    expect(foreign.ok).toBe(false);
    expect((await runSearch(dbHandle.db, view(viewerA), input({ q: 'pagerword', cursor: 'zzzz' }))).ok).toBe(false);
  });

  it('display is read live: during index lag the answer shows the latest Revision, and the old body is not shown', async () => {
    const id = await item(ws, { model: models.MA }, `${TAG} lagword old title`, { observation: 'old observation text' });
    await index(ws, id);
    // A new Revision is published but the index has not taken it in yet.
    await sql(`insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by) values ($1,$2,2,$3,'anomaly','new observation text',$4)`, [ws, id, `${TAG} fresh title`, creator]);
    await sql(`update knowledge.knowledge_item set latest_revision_no = 2, row_version = row_version + 1 where id = $1`, [id]);
    const r = await search({ q: 'lagword' });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ title: `${TAG} fresh title`, excerpt: 'new observation text', revisionNo: 2 });
    expect(JSON.stringify(r)).not.toContain('old observation');
    expect(JSON.stringify(r)).not.toContain('lagword old title');
    // The state comes from the Item row at this moment.
    await sql(`update knowledge.knowledge_item set verification_state = 'verified', row_version = row_version + 1 where id = $1`, [id]);
    expect((await search({ q: 'lagword' })).items[0]?.verificationState).toBe('verified');
    // Unpublished after indexing but before the drain: gone at once.
    await sql(`update knowledge.knowledge_item set publication_state = 'archived', row_version = row_version + 1 where id = $1`, [id]);
    expect((await search({ q: 'lagword' })).items).toEqual([]);
  });

  it('suggestions: prefix on title and Event key, at most 12, through the same visibility', async () => {
    for (let n = 0; n < 14; n += 1) await index(ws, await item(ws, { model: models.MA }, `${TAG} sugword ${String(n).padStart(2, '0')}`));
    const s = await runSuggest(dbHandle.db, view(viewerA), `${TAG} sugword`, null);
    expect(s.suggestions).toHaveLength(12);
    expect(s.suggestions.every((x) => x.kind === 'title')).toBe(true);
    const keys = await runSuggest(dbHandle.db, view(viewerA), 'step_', null);
    expect(keys.suggestions).toEqual([{ kind: 'eventKey', text: STEP }]);
    expect((await runSuggest(dbHandle.db, view(viewerA), 'proc/', null)).suggestions.map((x) => x.text)).toContain(START);
  });

  it('the index hint is a lag age and a whole percent, never an item count', async () => {
    const r = await search({ q: 'forward' });
    expect(r.indexLag.lagSeconds === null || Number.isInteger(r.indexLag.lagSeconds)).toBe(true);
    expect(['running', 'done', 'none']).toContain(r.indexLag.backfill.state);
    expect(Number.isInteger(r.indexLag.backfill.percent)).toBe(true);
  });

  // ---- through the server: endpoint, permission, service Actor ----------------------------------------------------
  async function call(endpoint: string, params: Record<string, unknown>, auth: { cookie?: string; token?: string }) {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/menu-query',
      headers: { 'content-type': 'application/json', ...(auth.cookie ? cookieHeader(auth.cookie) : { authorization: `Bearer ${auth.token}` }) },
      payload: JSON.stringify({ endpoint, context: {}, params }),
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ outcome: string; data: any }>(); // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON read by path
  }

  it('the endpoint answers a session; a refused param is an error; hidden and nonexistent owners answer the same', async () => {
    const ok = await call('logKnowledge.search', { q: 'anything' }, { cookie: admin.cookie });
    expect(ok.outcome).toBe('ok');
    expect(ok.data.version).toBe('v0');
    expect((await call('logKnowledge.search', { limit: 500 }, { cookie: admin.cookie })).outcome).toBe('error');
    const hiddenItem = await item(WORKSPACE_ID, { model: seededModel }, `${TAG} httpword`);
    await index(WORKSPACE_ID, hiddenItem);
    const hidden = await call('logKnowledge.search', { q: 'httpword', ownerFilter: { modelId: seededModel } }, { cookie: admin.cookie });
    const missing = await call('logKnowledge.search', { q: 'httpword', ownerFilter: { modelId: randomUUID() } }, { cookie: admin.cookie });
    expect({ outcome: hidden.outcome, data: hidden.data }).toEqual({ outcome: missing.outcome, data: missing.data });
    expect(hidden.data.items).toEqual([]);
    expect((await call('logKnowledge.search', { q: 'httpword' }, { cookie: admin.cookie })).data.items).toEqual([]); // Admin has no read bypass
    const sug = await call('logKnowledge.searchSuggest', { q: 'httpw' }, { cookie: admin.cookie });
    expect(sug.outcome).toBe('ok');
    expect(sug.data.suggestions).toEqual([]);
  });

  it('a Draft (create or revise proposal) is never indexed and never returned, before or after the owner is reindexed', async () => {
    const word = `${TAG.toLowerCase()}draftonly`;
    const published = await item(ws, { model: models.MA }, `${TAG} published base`);
    const createDraft = (await sql(`insert into knowledge.draft (workspace_id, origin, proposal_type, owner_model_id, submitter_actor_id, created_by, updated_by) values ($1,'human','create',$2,$3,$3,$3) returning id`, [ws, models.MA, creator])).rows[0].id as string;
    const reviseDraft = (await sql(`insert into knowledge.draft (workspace_id, origin, proposal_type, owner_model_id, target_item_id, base_revision_no, submitter_actor_id, created_by, updated_by) values ($1,'human','revise',$2,$3,1,$4,$4,$4) returning id`, [ws, models.MA, published, creator])).rows[0].id as string;
    for (const d of [createDraft, reviseDraft]) {
      await sql(`insert into knowledge.draft_revision (workspace_id, draft_id, draft_rev_no, proposal_json, payload_digest, author_actor_id, author_auth) values ($1,$2,1,$3::jsonb,$4,$5,'session')`, [ws, d, JSON.stringify({ title: `${word} title`, observation: `${word} body` }), 'a'.repeat(64), creator]);
    }
    await index(ws, published);
    expect((await search({ q: word })).items).toEqual([]);
    expect((await runSuggest(dbHandle.db, view(viewerA), word, null)).suggestions).toEqual([]);
    const docs = await sql(`select 1 from knowledge.search_document where workspace_id = $1 and (search_text like $2 or term_text like $2)`, [ws, `%${word}%`]);
    expect(docs.rows).toEqual([]);
    expect((await search({ q: 'published base' })).items.map((i) => i.itemId)).toContain(published);
  });

  it('Items with the same title in different owners stay separate rows, each with its own owner', async () => {
    const title = `${TAG} twin title`;
    const a = await item(ws, { model: models.MA }, title);
    const b = await item(ws, { model: models.MB }, title);
    await index(ws, a, b);
    const r = await search({ q: 'twin title' });
    expect(r.items.map((i) => i.itemId).sort()).toEqual([a, b].sort());
  });

  it('the query text is not written to the audit log or the usage events', async () => {
    const word = `${TAG.toLowerCase()}noleakquery`;
    expect((await call('logKnowledge.search', { q: word }, { cookie: admin.cookie })).outcome).toBe('ok');
    expect((await call('logKnowledge.searchSuggest', { q: word }, { cookie: admin.cookie })).outcome).toBe('ok');
    for (const table of ['core.audit_log', 'platform.usage_events']) {
      const hit = await sql(`select 1 from ${table} t where to_jsonb(t)::text ilike $1`, [`%${word}%`]);
      expect(hit.rows, table).toEqual([]);
    }
  });

  it('C1: hidden pending changes leave the lag hint identical to absent changes', async () => {
    const before = (await search({ q: 'hintmissingword' })).indexLag;
    const hidden = await item(ws, { model: models.MA }, 'hidden lag hint', { access: 'restricted' });
    try {
      await sql(`insert into knowledge.search_outbox (workspace_id, item_id, reason, created_at) values ($1,$2,'reindex',now() - interval '1 minute')`, [ws, hidden]);
      expect((await search({ q: 'hintmissingword' })).indexLag).toEqual(before);
      await rule('item', hidden, viewerB);
      expect((await search({ q: 'hintmissingword' }, viewerB)).indexLag.lagSeconds).toBeGreaterThanOrEqual(60);
    } finally {
      await sql('delete from knowledge.search_outbox where item_id = $1', [hidden]);
    }
  });

  it('C1: hidden backfill Items and operational counters cannot change viewer progress', async () => {
    await sql(`insert into knowledge.search_backfill_progress (workspace_id, generation, total_count, done_count) values ($1,1,2,1)`, [ws]);
    try {
      const before = (await search({ q: 'hintmissingword' })).indexLag.backfill;
      const hidden = await item(ws, { model: models.MA }, 'hidden progress hint', { access: 'restricted' });
      await sql('update knowledge.search_backfill_progress set total_count = 3 where workspace_id = $1', [ws]);
      expect((await search({ q: 'hintmissingword' })).indexLag.backfill).toEqual(before);
      await rule('item', hidden, viewerB);
      const pending = (await search({ q: 'hintmissingword' }, viewerB)).indexLag.backfill;
      expect(pending.state).toBe('running');
      await index(ws, hidden);
      const indexed = (await search({ q: 'hintmissingword' }, viewerB)).indexLag.backfill;
      expect(indexed.percent).toBeGreaterThan(pending.percent);
    } finally {
      await sql('delete from knowledge.search_backfill_progress where workspace_id = $1', [ws]);
    }
  });

  it.each(['model', 'software', 'rejected'] as const)('C2: concept direction preserves mapped Model identity for %s owners', async (kind) => {
    const m = await model(ws, `${TAG}PAIR${tick++}`);
    let owner: { model?: string; software?: string } = { model: m };
    if (kind === 'software') {
      const sw = await one(`insert into knowledge.software_version (workspace_id, model_id, version_label, version_key, name, created_by, updated_by) values ($1,$2,'pair','pair','',$3,$3) returning id`, [ws, m, creator]);
      owner = { software: sw };
    }
    if (kind === 'rejected') {
      for (const key of ['X/X_STEP', 'X/X_START']) {
        await sql(`insert into knowledge.spec_concept_mapping (workspace_id, concept_id, model_id, target_kind, target_key, relation_kind, review_state, origin, reject_reason, proposed_by, reviewed_by, reviewed_at)
          select workspace_id, concept_id, $2, target_kind, target_key, 'equivalent', 'rejected', 'human', 'no', $3, $3, now() from knowledge.spec_concept_mapping where workspace_id = $1 and model_id = $4 and target_key = $5`, [ws, m, creator, models.MB, key]);
      }
    }
    const unmapped = await item(ws, owner, 'Unmapped reused keys', { relations: [['observed', 'X/X_STEP', 'X/X_START']] });
    await index(ws, unmapped);
    const result = await search({ q: 'STEP_PROCESS before PROCESS_START' });
    expect(result.items.map((i) => i.itemId)).toContain(ids.mapped);
    expect(result.items.map((i) => i.itemId)).not.toContain(unmapped);
  });

  it.each(['record', 'subject'] as const)('C2: text concept expansion preserves the %s Model/key pair', async (kind) => {
    const m = await model(ws, `${TAG}TEXT${tick++}`);
    const over = kind === 'record'
      ? { relations: [['observed', 'X/X_STEP', 'X/X_START']] as [string, string, string][] }
      : { subjects: [['X/X_STEP', 'about']] as [string, string][], modelForSubject: m };
    const unmapped = await item(ws, { model: m }, 'Unmapped reused text keys', over);
    const mapped = kind === 'record' ? ids.mapped : await item(ws, { model: m }, 'Mapped subject', { subjects: [['X/X_STEP', 'about']], modelForSubject: models.MB });
    await index(ws, unmapped, mapped);
    const result = await search({ q: 'STEP_PROCESS', limit: 50 });
    expect(result.items.find((i) => i.itemId === mapped)?.reasons).toContain('concept_mapping');
    expect(result.items.find((i) => i.itemId === unmapped)?.reasons ?? []).not.toContain('concept_mapping');
  });

  it.each([false, true])('C3: mixed adapter plans exclude reverse-only Items (includeOpposite=%s)', async (includeOpposite) => {
    const result = await search({ q: 'alpha', relation: { source: 'a_evt', predicate: 'before', target: 'b_evt' }, includeOpposite }, viewerA, cws);
    expect(result.items.map((i) => i.itemId)).toEqual(expect.arrayContaining([ids.cFwdObs, ids.cText]));
    expect(result.items.map((i) => i.itemId)).not.toContain(ids.cRev);
    expect(result.opposite?.map((i) => i.itemId) ?? []).toEqual(includeOpposite ? [ids.cRev] : []);
    const plan = { workspaceId: cws, owner: null, text: { normalized: 'alpha', words: ['alpha'], conceptKeys: [] }, direction: { source: { tokens: ['a_evt'], conceptKeys: [] }, target: { tokens: ['b_evt'], conceptKeys: [] }, kinds: ['observed', 'expected'] as ('observed' | 'expected')[] } };
    expect(await pgSearchPort.countUpTo(dbHandle.db, plan, (id) => visibleItemSql(view(viewerA, cws), id), 101)).toBe(4);
  });

  it('C3: the endpoint keeps mixed text/relation reverse-only results in the opt-in section', async () => {
    const m = await one(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,'mixed',$5,$5) returning id`, [WORKSPACE_ID, seededVendor, `${TAG}MIX`, toCodeKey(`${TAG}MIX`), admin.id]);
    try {
      const forward = await item(WORKSPACE_ID, { model: m }, 'mixedword forward', { relations: [['observed', STEP, START]] });
      const reverse = await item(WORKSPACE_ID, { model: m }, 'mixedword reverse', { relations: [['observed', START, STEP]] });
      const plain = await item(WORKSPACE_ID, { model: m }, 'mixedword plain');
      await index(WORKSPACE_ID, forward, reverse, plain);
      for (const includeOpposite of [false, true]) {
        const result = await call('logKnowledge.search', { q: 'mixedword', relation: { source: STEP, predicate: 'before', target: START }, includeOpposite }, { cookie: admin.cookie });
        expect(result.outcome).toBe('ok');
        expect(result.data.items.map((i: { itemId: string }) => i.itemId)).toEqual(expect.arrayContaining([forward, plain]));
        expect(result.data.items.map((i: { itemId: string }) => i.itemId)).not.toContain(reverse);
        expect(result.data.opposite?.map((i: { itemId: string }) => i.itemId) ?? []).toEqual(includeOpposite ? [reverse] : []);
      }
    } finally {
      // Existing suite teardown owns seeded Items; remove this extra owner after its Items.
      await sql('delete from knowledge.item_event_relation_record where item_id in (select id from knowledge.knowledge_item where owner_model_id = $1)', [m]);
      await sql('delete from knowledge.knowledge_item_revision where item_id in (select id from knowledge.knowledge_item where owner_model_id = $1)', [m]);
      await sql('delete from knowledge.knowledge_item where owner_model_id = $1', [m]);
      await sql('delete from knowledge.equipment_model where id = $1', [m]);
    }
  });

  it.each(['actor', 'workspace', 'tamper'] as const)('C4: %s cursors are refused exactly like malformed cursors', async (variant) => {
    const first = await search({ q: 'forward', limit: 1 });
    expect(first.nextCursor).not.toBeNull();
    const cursor = first.nextCursor ?? '';
    const binding = variant === 'actor' ? view(viewerB) : variant === 'workspace' ? view(viewerA, cws) : view(viewerA);
    let supplied = cursor;
    if (variant === 'tamper') {
      // Preserve every valid field and the signature (if present), changing only a valid-shaped anchor.
      const [payload, signature] = cursor.split('.');
      const parsed = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as { i: string };
      parsed.i = randomUUID();
      supplied = [Buffer.from(JSON.stringify(parsed)).toString('base64url'), ...(signature ? [signature] : [])].join('.');
    }
    const malformed = await runSearch(dbHandle.db, binding, input({ q: 'forward', limit: 1, cursor: 'malformed!' }));
    expect(malformed.ok).toBe(false);
    expect(await runSearch(dbHandle.db, binding, input({ q: 'forward', limit: 1, cursor: supplied }))).toEqual(malformed);
    expect((await runSearch(dbHandle.db, view(viewerA), input({ q: 'forward', limit: 1, cursor }))).ok).toBe(true);
  });

  it('a service Actor reads only through a token that carries workspace.read, and gets no visibility bypass', async () => {
    const withRead = await call('logKnowledge.search', { q: 'httpword' }, { token: tokenOk });
    expect(withRead.outcome).toBe('ok');
    expect(withRead.data.items).toEqual([]);
    const withoutRead = await call('logKnowledge.search', { q: 'httpword' }, { token: tokenNoRead });
    expect(withoutRead.outcome).not.toBe('ok');
    expect(JSON.stringify(withoutRead)).not.toContain('httpword');
  });
});
