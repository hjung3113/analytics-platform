// #1506 S-c — the derived search index against a real Postgres (throwaway DB only; `pnpm --filter @ap/platform-api test:integration`;
// repositories run as platform_app, fixtures and cleanup as platform_migrate). Needs migration 0120. Repository tests use a workspace
// of their own so counts are exact; the ops read / requeue and the access writer go through the real server in the seeded workspace.

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../config.js';
import { type DbHandle, createDb, dbOnClient } from '../../../db/client.js';
import { SESSION_COOKIE_NAME } from '../../../middleware/require-session.js';
import { buildServer } from '../../../server.js';
import { insertActorRow } from '../../../test-support/actor-fixtures.js';
import { loginAs } from '../../../test-support/auth.js';
import { toCodeKey } from '../domain/code-key.js';
import { MAX_ATTEMPTS } from '../domain/search-normalize.js';
import { enqueueItems } from '../repositories/search-outbox.js';
import { setPublicationState } from '../repositories/item-write.js';
import {
  applyItem,
  backfillStep,
  backfillWorkspace,
  drainBatch,
  purgeRetiredGenerations,
  readPointer,
  requeueDead,
  rollbackGeneration,
  searchIndexStatus,
  startReindex,
  switchGeneration,
} from '../repositories/search-index.js';
import { drainLoop } from '../search-index-jobs.js';

const APP_URL = process.env.DATABASE_URL ?? '';
const MIGRATE_URL = process.env.DATABASE_URL_MIGRATE ?? '';
const WORKSPACE_ID = process.env.WORKSPACE_ID ?? '';
const runIntegration = Boolean(APP_URL && MIGRATE_URL && WORKSPACE_ID);
const TAG = `SIX${randomUUID().slice(0, 6).toUpperCase()}`;

type Row = Record<string, unknown>;

describe.skipIf(!runIntegration)('log knowledge search index (#1506 S-c)', () => {
  let app: FastifyInstance;
  let dbHandle: DbHandle;
  let migrate: DbHandle;
  const ws = randomUUID(); // a workspace of its own for the repository tests
  const emptyWs = randomUUID(); // a workspace with no Item at all
  let actorId: string;
  let modelId: string;
  let itemNo = 0;
  const workspaces = [ws, emptyWs];
  const actorIds: string[] = [];
  const mainItems: string[] = [];
  let mainModel = '';
  let mainVendor = '';
  let admin: { id: string; cookie: string; csrf: string };

  const sql = (text: string, params: unknown[] = []) => migrate.pool.query(text, params);
  const rows = async (text: string, params: unknown[] = []) => (await sql(text, params)).rows as Row[];
  const one = async (text: string, params: unknown[]) => (await sql(text, params)).rows[0]?.id as string;

  async function newItem(workspace: string, creator: string, model: string, title: string, extra: { published?: boolean; observation?: string } = {}) {
    const id = await one(
      `insert into knowledge.knowledge_item (workspace_id, item_no, owner_model_id, latest_revision_no, publication_state, created_by, updated_by)
       values ($1,$2,$3,1,$4,$5,$5) returning id`,
      [workspace, ++itemNo, model, extra.published === false ? 'archived' : 'published', creator],
    );
    await sql(
      `insert into knowledge.knowledge_item_revision (workspace_id, item_id, revision_no, title, type_code, observation, published_by) values ($1,$2,1,$3,'anomaly',$4,$5)`,
      [workspace, id, title, extra.observation ?? 'obs', creator],
    );
    return id;
  }
  const outboxOf = (item: string) => rows('select state, reason, attempt_count, last_error, available_at from knowledge.search_outbox where item_id = $1 order by outbox_id', [item]);
  const docsOf = (item: string) => rows('select index_generation, revision_no, source_row_version, search_text, term_text from knowledge.search_document where item_id = $1 order by index_generation', [item]);
  const drainAll = async () => {
    for (;;) if ((await drainBatch(dbHandle.db, { workspaceId: ws })).claimed === 0) return;
  };
  const cookieHeader = (cookie: string) => ({ cookie: `${SESSION_COOKIE_NAME}=${cookie}` });

  async function call(kind: 'menu-query' | 'menu-action', body: Record<string, unknown>) {
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/${kind}`,
      headers: { 'content-type': 'application/json', ...cookieHeader(admin.cookie), ...(kind === 'menu-action' ? { 'x-csrf-token': admin.csrf } : {}) },
      payload: JSON.stringify(body),
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ outcome: string; data: any }>(); // eslint-disable-line @typescript-eslint/no-explicit-any -- wire JSON read by path
  }

  async function waitForBlocker(waitingPid: number | undefined, blockerPid: number | undefined) {
    const deadline = Date.now() + 5000;
    for (;;) {
      const waiting = await dbHandle.pool.query<{ waiting: boolean }>('select $1::int = any(pg_blocking_pids($2::int)) as waiting', [blockerPid, waitingPid]);
      if (waiting.rows[0]?.waiting) return;
      if (Date.now() >= deadline) throw new Error('expected transaction did not reach its lock wait');
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    dbHandle = createDb(APP_URL);
    migrate = createDb(MIGRATE_URL);
    app = await buildServer({ config: loadConfig(), dbHandle });
    await app.ready();
    for (const id of workspaces) await sql('insert into core.workspaces (id, name) values ($1, $2)', [id, `${TAG}-${id.slice(0, 4)}`]);
    actorId = (await insertActorRow(dbHandle, { workspaceId: ws, externalId: `${TAG}-a`, roleLevel: 'admin' })).id;
    const vendor = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,'Vendor Syn',$4,$4) returning id`, [ws, `${TAG}V`, toCodeKey(`${TAG}V`), actorId]);
    modelId = await one(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,'Model Syn',$5,$5) returning id`, [ws, vendor, `${TAG}M`, toCodeKey(`${TAG}M`), actorId]);
    // The seeded workspace: an Admin through the real session, one model and Items.
    const externalId = `${TAG}-admin`;
    const { id } = await insertActorRow(dbHandle, { workspaceId: WORKSPACE_ID, externalId, roleLevel: 'admin' });
    actorIds.push(id);
    const cookie = await loginAs(app, externalId);
    const boot = await app.inject({ method: 'GET', url: '/api/v1/platform/bootstrap', headers: cookieHeader(cookie) });
    admin = { id, cookie, csrf: boot.json<{ csrfToken: string }>().csrfToken };
    mainVendor = await one(`insert into knowledge.vendor (workspace_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,'V',$4,$4) returning id`, [WORKSPACE_ID, `${TAG}W`, toCodeKey(`${TAG}W`), id]);
    mainModel = await one(`insert into knowledge.equipment_model (workspace_id, vendor_id, code, code_key, name, created_by, updated_by) values ($1,$2,$3,$4,'M',$5,$5) returning id`, [WORKSPACE_ID, mainVendor, `${TAG}X`, toCodeKey(`${TAG}X`), id]);
    itemNo = 1_000_000 + Math.floor(Math.random() * 1_000_000);
  });

  beforeEach(async () => {
    await sql('delete from knowledge.search_outbox where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.search_document where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.search_backfill_progress where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.search_index_pointer where workspace_id = any($1)', [workspaces]);
    await sql(`update knowledge.knowledge_item set publication_state = 'published' where workspace_id = $1`, [ws]);
  });

  afterAll(async () => {
    for (const w of [...workspaces, WORKSPACE_ID]) {
      await sql('delete from knowledge.search_outbox where item_id = any($1) or workspace_id = $2', [mainItems, w]).catch(() => undefined);
    }
    await sql('delete from knowledge.search_document where workspace_id = any($1) or item_id = any($2)', [workspaces, mainItems]);
    await sql('delete from knowledge.search_backfill_progress where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.search_index_pointer where workspace_id = any($1)', [workspaces]);
    await sql('delete from knowledge.object_access_rule where workspace_id = any($1)', [[...workspaces, WORKSPACE_ID]]);
    for (const table of ['knowledge_item_revision']) await sql(`delete from knowledge.${table} where workspace_id = any($1) or item_id = any($2)`, [workspaces, mainItems]);
    await sql('delete from knowledge.knowledge_item where workspace_id = any($1) or id = any($2)', [workspaces, mainItems]);
    await sql('delete from knowledge.equipment_model where workspace_id = any($1) or id = $2', [workspaces, mainModel]);
    await sql('delete from knowledge.vendor where workspace_id = any($1) or id = $2', [workspaces, mainVendor]);
    for (const [table, column] of [
      ['core.audit_log', 'actor_id'],
      ['core.idempotency_keys', 'actor_id'],
      ['core.sessions', 'actor_id'],
      ['core.actors', 'id'],
    ]) await sql(`delete from ${table} where ${column} = any($1)`, [[...actorIds, actorId]]);
    await sql('delete from core.workspaces where id = any($1)', [workspaces]);
    await app.close();
    await dbHandle.pool.end();
    await migrate.pool.end();
  });

  it('writes a notification in the SAME transaction as the source change and leaves none when it rolls back', async () => {
    const item = await newItem(ws, actorId, modelId, `${TAG} atomic`);
    const [row] = await rows('select id, item_no, latest_revision_no, publication_state, verification_state, processing_state, row_version from knowledge.knowledge_item where id = $1', [item]);
    const itemRow = { id: item, itemNo: row?.item_no as number, latestRevisionNo: 1, publicationState: 'published', verificationState: 'not_checked', processingState: 'open', rowVersion: 1 };
    await expect(
      dbHandle.db.transaction(async (tx) => {
        await setPublicationState(tx, ws, actorId, itemRow, 'archived');
        throw new Error('roll back');
      }),
    ).rejects.toThrow('roll back');
    expect(await outboxOf(item)).toEqual([]);
    expect((await rows('select publication_state from knowledge.knowledge_item where id = $1', [item]))[0]?.publication_state).toBe('published');
    await dbHandle.db.transaction((tx) => setPublicationState(tx, ws, actorId, itemRow, 'archived'));
    expect(await outboxOf(item)).toMatchObject([{ state: 'pending', reason: 'archived' }]);
  });

  it('merges duplicate notifications into one pending row and converges to one document', async () => {
    const item = await newItem(ws, actorId, modelId, `${TAG} STEP_PROCESS late`);
    for (const reason of ['published', 'access_changed', 'reindex'] as const) await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item, item], reason));
    expect(await outboxOf(item)).toHaveLength(1);
    await drainAll();
    const first = await docsOf(item);
    expect(first).toHaveLength(1);
    expect(first[0]?.search_text).toContain('step_process');
    expect(first[0]?.term_text).toEqual(expect.stringContaining(`${TAG}m`.toLowerCase())); // the owner model code
    // Processing the same Item again (a duplicate, out-of-order notification) gives the same document.
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'published'));
    await drainAll();
    const second = await docsOf(item);
    expect(second.map(({ search_text, term_text, revision_no }) => ({ search_text, term_text, revision_no }))).toEqual(first.map(({ search_text, term_text, revision_no }) => ({ search_text, term_text, revision_no })));
    expect((await outboxOf(item)).every((r) => r.state === 'done')).toBe(true);
  });

  it('does not let a stale build overwrite a newer document', async () => {
    const item = await newItem(ws, actorId, modelId, `${TAG} stale`);
    await dbHandle.db.transaction((tx) => readPointer(tx, ws));
    await sql(
      `insert into knowledge.search_document (workspace_id, item_id, index_generation, revision_no, source_row_version, search_text, tsv, term_text)
       values ($1,$2,1,7,99,'newer text', to_tsvector('simple','newer text'),'newer')`,
      [ws, item],
    );
    await dbHandle.db.transaction((tx) => applyItem(tx, ws, item)); // the source row_version is 1 < 99
    expect(await docsOf(item)).toMatchObject([{ revision_no: 7, source_row_version: 99, search_text: 'newer text' }]);
  });

  it('keeps a coalesced notification pending while its source writer is uncommitted', async () => {
    const item = await newItem(ws, actorId, modelId, `${TAG} coalesced archive`);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'published'));
    await drainAll();
    expect(await docsOf(item)).toHaveLength(1);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'reindex'));
    const writer = await dbHandle.pool.connect();
    const drainer = await dbHandle.pool.connect();
    try {
      await writer.query('begin');
      const itemRow = { id: item, itemNo: 0, latestRevisionNo: 1, publicationState: 'published', verificationState: 'not_checked', processingState: 'open', rowVersion: 1 };
      await setPublicationState(dbOnClient(writer), ws, actorId, itemRow, 'archived');
      // A different connection claims while the archive transaction remains open.
      // DO NOTHING would allow it to consume the sole notification against the old source.
      expect((await drainBatch(dbOnClient(drainer), { workspaceId: ws })).claimed).toBe(0);
      await writer.query('commit');
      expect((await outboxOf(item)).map((r) => r.state)).toEqual(['done', 'pending']);
      await drainAll();
      expect(await docsOf(item)).toEqual([]);
      expect((await outboxOf(item)).every((r) => r.state === 'done')).toBe(true);
    } finally {
      await writer.query('rollback');
      writer.release();
      drainer.release();
    }
  });

  it('deletes the document when the Item is no longer published', async () => {
    const item = await newItem(ws, actorId, modelId, `${TAG} to archive`);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'published'));
    await drainAll();
    expect(await docsOf(item)).toHaveLength(1);
    await sql(`update knowledge.knowledge_item set publication_state = 'archived', row_version = row_version + 1 where id = $1`, [item]);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'archived'));
    await drainAll();
    expect(await docsOf(item)).toEqual([]);
  });

  it('backs off, goes dead at the attempt cap with a code only, and requeue brings it back', async () => {
    const item = await newItem(ws, actorId, modelId, `${TAG} dead`);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'published'));
    const failing = () => Promise.reject(new Error('secret content that must not be stored'));
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await sql(`update knowledge.search_outbox set available_at = now() - interval '1 second' where item_id = $1`, [item]);
      const result = await drainBatch(dbHandle.db, { apply: failing, workspaceId: ws });
      expect(result.claimed).toBe(1);
      const [row] = await outboxOf(item);
      expect(row).toMatchObject({ attempt_count: attempt, last_error: 'error', state: attempt === MAX_ATTEMPTS ? 'dead' : 'failed' });
      if (attempt < MAX_ATTEMPTS) expect(new Date(row?.available_at as string).getTime()).toBeGreaterThan(Date.now());
    }
    expect(await docsOf(item)).toEqual([]);
    const requeued = await dbHandle.db.transaction((tx) => requeueDead(tx, ws));
    expect(requeued).toBe(1);
    expect((await outboxOf(item)).map((r) => r.state)).toEqual(['done', 'pending']);
    await drainAll();
    expect(await docsOf(item)).toHaveLength(1);
  });

  it('drainLoop stops at its time budget and returns the summed counts', async () => {
    const item = await newItem(ws, actorId, modelId, `${TAG} loop`);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'published'));
    let clock = 0;
    const result = await drainLoop(dbHandle.db, { maxMs: 5000, pollMs: 2000, now: () => clock, sleep: async (ms) => void (clock += ms) });
    expect(result.done).toBeGreaterThanOrEqual(1);
    expect(clock).toBeGreaterThan(0);
  });

  it('requeue leaves a newly dead notification open when it was not selected for re-enqueue', async () => {
    const first = await newItem(ws, actorId, modelId, `${TAG} selected dead`);
    const later = await newItem(ws, actorId, modelId, `${TAG} newly dead`);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [first], 'published'));
    await sql(`update knowledge.search_outbox set state = 'dead', attempt_count = 8 where item_id = $1`, [first]);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [first, later], 'published'));
    await sql(`update knowledge.search_outbox set attempt_count = 7 where item_id = $1`, [later]);
    const blocker = await dbHandle.pool.connect();
    const requeuer = await dbHandle.pool.connect();
    let requeue: Promise<number> | undefined;
    try {
      await blocker.query('begin');
      await blocker.query(`select outbox_id from knowledge.search_outbox where item_id = $1 and state = 'pending' for update`, [first]);
      const blockerPid = (await blocker.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]?.pid;
      const requeuePid = (await requeuer.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]?.pid;
      requeue = dbOnClient(requeuer).transaction((tx) => requeueDead(tx, ws));
      // Enqueue of the selected Item waits on its already-pending row. Only now
      // let the other drain commit a new dead row, between selection and closure.
      await waitForBlocker(requeuePid, blockerPid);
      expect((await drainBatch(dbHandle.db, { workspaceId: ws, apply: async () => { throw new Error('eighth failure'); } })).dead).toBe(1);
      await blocker.query('commit');
      expect(await requeue).toBe(1);
      expect((await outboxOf(first)).map((r) => r.state)).toEqual(['done', 'pending']);
      expect(await outboxOf(later)).toMatchObject([{ state: 'dead', attempt_count: 8 }]);
      expect(await dbHandle.db.transaction((tx) => requeueDead(tx, ws))).toBe(1);
      await drainAll();
      expect(await docsOf(later)).toHaveLength(1);
    } finally {
      await blocker.query('rollback');
      await requeue?.catch(() => undefined);
      blocker.release();
      requeuer.release();
    }
  });

  it('drainLoop yields at its deadline even when every processed batch is full', async () => {
    const items: string[] = [];
    for (let i = 0; i < 4; i++) items.push(await newItem(ws, actorId, modelId, `${TAG} full batch ${i}`));
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, items, 'published'));
    let clock = 0;
    const result = await drainLoop(dbHandle.db, {
      batchSize: 1,
      maxMs: 2,
      now: () => clock++,
      sleep: async () => { throw new Error('a full batch should not poll'); },
    });
    expect(result.claimed).toBe(2);
    expect((await rows(`select item_id from knowledge.search_outbox where workspace_id = $1 and state = 'pending'`, [ws])).length).toBeGreaterThan(0);
  });

  it('backfills in keyset batches, resumes after an interruption, and completes at once on an empty workspace', async () => {
    await sql(`update knowledge.knowledge_item set publication_state = 'archived' where workspace_id = $1`, [ws]);
    const items = [];
    for (let i = 0; i < 5; i++) items.push(await newItem(ws, actorId, modelId, `${TAG} fill ${i}`));
    await newItem(ws, actorId, modelId, `${TAG} not published`, { published: false });
    const first = await backfillStep(dbHandle.db, ws, 2);
    expect(first).toEqual({ state: 'running', enqueued: 2 });
    // "Interrupted": the next call resumes from the stored position (same code path as a restart).
    const rest = await backfillWorkspace(dbHandle.db, ws, 2);
    expect(rest).toEqual({ state: 'done', enqueued: 3 });
    const status = await dbHandle.db.transaction((tx) => searchIndexStatus(tx, ws));
    expect(status.backfill).toMatchObject({ state: 'done', done: 5, total: 5 });
    expect(await rows(`select distinct item_id from knowledge.search_outbox where workspace_id = $1 and reason = 'reindex'`, [ws])).toHaveLength(5);
    expect((await backfillStep(dbHandle.db, ws, 2)).enqueued).toBe(0); // a finished run does nothing
    expect(await backfillWorkspace(dbHandle.db, emptyWs)).toEqual({ state: 'done', enqueued: 0 });
    expect((await dbHandle.db.transaction((tx) => searchIndexStatus(tx, emptyWs))).backfill).toMatchObject({ state: 'done', done: 0, total: 0 });
  });

  it('builds a new generation next to the active one, switches with one UPDATE, rolls back, and purges the retired one', async () => {
    const item = await newItem(ws, actorId, modelId, `${TAG} generations`);
    await backfillWorkspace(dbHandle.db, ws);
    await drainAll();
    expect((await docsOf(item)).map((d) => d.index_generation)).toEqual([1]);
    expect(await switchGeneration(dbHandle.db, ws)).toEqual({ ok: false, reason: 'not_building' });
    expect((await startReindex(dbHandle.db, ws)).ok).toBe(true);
    expect(await startReindex(dbHandle.db, ws)).toEqual({ ok: false, reason: 'already_building' });
    expect(await switchGeneration(dbHandle.db, ws)).toEqual({ ok: false, reason: 'not_ready' }); // backfill not run yet
    await backfillWorkspace(dbHandle.db, ws);
    await drainAll();
    expect((await docsOf(item)).map((d) => d.index_generation)).toEqual([1, 2]); // the consumer keeps both in step
    const switched = await switchGeneration(dbHandle.db, ws);
    expect(switched).toMatchObject({ ok: true, pointer: { activeGeneration: 2, buildingGeneration: null, previousGeneration: 1 } });
    // The generation kept for rollback stays in step: a rebuild after the switch writes both.
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'published'));
    await drainAll();
    expect((await docsOf(item)).map((d) => d.index_generation)).toEqual([1, 2]);
    const back = await rollbackGeneration(dbHandle.db, ws);
    expect(back).toMatchObject({ ok: true, pointer: { activeGeneration: 1, previousGeneration: 2 } });
    expect(await rollbackGeneration(dbHandle.db, ws)).toMatchObject({ ok: true, pointer: { activeGeneration: 2, previousGeneration: 1 } });
    await sql(`update knowledge.search_index_pointer set previous_retired_at = now() - interval '8 days' where workspace_id = $1`, [ws]);
    await purgeRetiredGenerations(dbHandle.db, ws);
    expect((await docsOf(item)).map((d) => d.index_generation)).toEqual([2]);
    expect(await dbHandle.db.transaction((tx) => readPointer(tx, ws))).toMatchObject({ activeGeneration: 2, previousGeneration: null });
  });

  it.each([false, true])('restarts an abandoned generation after rollback and archive (abandoned documents purged: %s)', async (purge) => {
    const item = await newItem(ws, actorId, modelId, `${TAG} abandoned build`);
    await backfillWorkspace(dbHandle.db, ws);
    await drainAll();
    expect((await startReindex(dbHandle.db, ws)).ok).toBe(true);
    await backfillWorkspace(dbHandle.db, ws);
    await drainAll();
    expect(await switchGeneration(dbHandle.db, ws)).toMatchObject({ ok: true, pointer: { activeGeneration: 2 } });
    expect(await startReindex(dbHandle.db, ws)).toMatchObject({ ok: true, pointer: { buildingGeneration: 3 } });
    await backfillWorkspace(dbHandle.db, ws);
    await drainAll();
    expect((await docsOf(item)).map((d) => d.index_generation)).toEqual([1, 2, 3]);
    expect(await rollbackGeneration(dbHandle.db, ws)).toMatchObject({ ok: true, pointer: { activeGeneration: 1, previousGeneration: 2, buildingGeneration: null } });
    await sql(`update knowledge.knowledge_item set publication_state = 'archived', row_version = row_version + 1 where id = $1`, [item]);
    await dbHandle.db.transaction((tx) => enqueueItems(tx, ws, [item], 'archived'));
    await drainAll();
    expect((await docsOf(item)).map((d) => d.index_generation)).toEqual([3]);
    if (purge) {
      await purgeRetiredGenerations(dbHandle.db, ws);
      expect(await docsOf(item)).toEqual([]);
    }
    // The allocation watermark must survive rollback and document retention alike.
    expect(await startReindex(dbHandle.db, ws)).toMatchObject({ ok: true, pointer: { buildingGeneration: 4 } });
    await backfillWorkspace(dbHandle.db, ws);
    await drainAll();
    const switched = await switchGeneration(dbHandle.db, ws);
    expect(switched.ok).toBe(true);
    expect((await docsOf(item)).map((d) => d.index_generation)).not.toContain(switched.ok ? switched.pointer.activeGeneration : -1);
  });

  it('holds no ACL, excerpt or 지식 근거 column', async () => {
    const columns = (await rows(`select table_name, column_name from information_schema.columns where table_schema = 'knowledge' and table_name in ('search_document','search_outbox','search_index_pointer','search_backfill_progress')`)).map((r) => `${r.table_name}.${r.column_name}`);
    expect(columns.filter((c) => /access|acl|allow|deny|grantee|restricted|owner|excerpt|locator|note|source_ref|evidence/.test(c))).toEqual([]);
    expect(columns).toEqual(expect.arrayContaining(['search_document.tsv', 'search_document.term_text', 'search_document.source_row_version']));
  });

  it('migration asserts pg_trgm and the index uses trigram + FTS GIN', async () => {
    expect((await rows(`select extname from pg_extension where extname = 'pg_trgm'`)).length).toBe(1);
    const defs = (await rows(`select indexdef from pg_indexes where schemaname = 'knowledge' and tablename = 'search_document'`)).map((r) => r.indexdef as string).join('\n');
    expect(defs).toMatch(/USING gin \(tsv\)/);
    expect(defs).toMatch(/USING gin \(term_text gin_trgm_ops\)/);
    expect(readFileSync(new URL('../../../../migrations/0120_search_index.sql', import.meta.url), 'utf8')).toContain("extname = 'pg_trgm'");
  });

  it('platform_app cannot delete the pointer or change a notification beyond its processing columns', async () => {
    await expect(dbHandle.pool.query('delete from knowledge.search_index_pointer where workspace_id = $1', [ws])).rejects.toThrow(/permission denied/);
    await expect(dbHandle.pool.query('update knowledge.search_outbox set item_id = item_id where workspace_id = $1', [ws])).rejects.toThrow(/permission denied/);
  });

  it('writes the outbox from the access writer, shows counts and lag to the manager, and requeues dead rows (real server)', async () => {
    const item = await newItem(WORKSPACE_ID, admin.id, mainModel, `${TAG} main`);
    mainItems.push(item);
    const set = await call('menu-action', { action: 'logKnowledge.accessModeSet', context: {}, input: { targetKind: 'model', targetId: mainModel, mode: 'restricted' }, idempotencyKey: randomUUID(), expectedVersion: '1' });
    expect(set.outcome).toBe('ok');
    expect(await rows(`select reason, state from knowledge.search_outbox where item_id = $1`, [item])).toEqual([{ reason: 'access_changed', state: 'pending' }]);
    await sql(`update knowledge.search_outbox set state = 'dead', attempt_count = 8 where item_id = $1`, [item]);
    const status = await call('menu-query', { endpoint: 'logKnowledge.searchIndexStatus', context: {}, params: {} });
    expect(status.data.outbox.dead).toBeGreaterThanOrEqual(1);
    expect(status.data.generation.active).toBeGreaterThanOrEqual(1);
    const requeue = await call('menu-action', { action: 'logKnowledge.searchIndexRequeue', context: {}, input: {}, idempotencyKey: randomUUID() });
    expect(requeue.data.requeued).toBeGreaterThanOrEqual(1);
    expect((await rows(`select state from knowledge.search_outbox where item_id = $1 order by outbox_id`, [item])).map((r) => r.state)).toEqual(['done', 'pending']);
    await sql(`update knowledge.equipment_model set access_mode = 'internal' where id = $1`, [mainModel]);
  });
});

