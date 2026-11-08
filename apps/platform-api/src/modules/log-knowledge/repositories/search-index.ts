// The search index's storage and consumer core (#1506 S-c, design log-knowledge-search §3.2, §5). `knowledge.search_*` tables only.
// Service path: nothing here takes an actor or a Viewer, nothing reads or writes an access rule (ADR-0124: the index holds no ACL;
// visibility is judged at query time). A document is always built from the SOURCE's current values, never from a notification, and
// the same-Item work is serialised by an advisory lock, so duplicate, reordered or racing notifications converge on one document.

import { sql } from 'drizzle-orm';

import type { Db } from '../../../db/client.js';
import type { Tx } from '../../../db/tx.js';
import { MAX_ATTEMPTS, backoffSeconds, buildDocumentText } from '../domain/search-normalize.js';
import { enqueueItems, rowsOf } from './search-outbox.js';

export const DRAIN_BATCH = 100;
export const BACKFILL_BATCH = 500;
export const GENERATION_RETENTION_DAYS = 7;
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// ---- Generation pointer ---------------------------------------------------------------------------------------------

export interface Pointer {
  activeGeneration: number;
  buildingGeneration: number | null;
  previousGeneration: number | null;
  previousRetiredAt: Date | null;
}

interface PointerRow extends Record<string, unknown> {
  active_generation: number;
  building_generation: number | null;
  previous_generation: number | null;
  previous_retired_at: Date | null;
}
const toPointer = (r: PointerRow): Pointer => ({
  activeGeneration: r.active_generation,
  buildingGeneration: r.building_generation,
  previousGeneration: r.previous_generation,
  previousRetiredAt: r.previous_retired_at,
});

/** The workspace's pointer row (created at generation 1 when absent), optionally locked `FOR UPDATE`. */
export async function readPointer(tx: Tx, workspaceId: string, lock = false): Promise<Pointer> {
  await tx.execute(sql`INSERT INTO knowledge.search_index_pointer (workspace_id) VALUES (${workspaceId}) ON CONFLICT (workspace_id) DO NOTHING`);
  const rows = rowsOf<PointerRow>(
    await tx.execute(sql`SELECT active_generation, building_generation, previous_generation, previous_retired_at FROM knowledge.search_index_pointer WHERE workspace_id = ${workspaceId} ${lock ? sql`FOR UPDATE` : sql``}`),
  );
  const row = rows[0];
  if (!row) throw new Error('search index pointer missing');
  return toPointer(row);
}

/** The generations the consumer keeps in step: the active one, the one being built and the one kept for rollback. */
export const generationsToWrite = (p: Pointer): number[] =>
  [p.activeGeneration, p.buildingGeneration, p.previousGeneration].filter((g): g is number => g !== null);

// ---- Document build and apply -----------------------------------------------------------------------------------------

type SourceRow = Record<string, unknown>;

/** What the source says about an Item right now: not indexable (missing / archived) or the document text. */
export type BuiltDocument =
  | { indexable: false }
  | { indexable: true; revisionNo: number; sourceRowVersion: number; searchText: string; termText: string };

export async function buildDocument(tx: Tx, workspaceId: string, itemId: string): Promise<BuiltDocument> {
  const [item] = rowsOf<SourceRow>(
    await tx.execute(sql`
      SELECT publication_state, latest_revision_no, row_version, owner_model_id, owner_software_id
      FROM knowledge.knowledge_item WHERE workspace_id = ${workspaceId} AND id = ${itemId}`),
  );
  if (!item || item.publication_state !== 'published') return { indexable: false };
  const revisionNo = item.latest_revision_no as number;
  const [rev] = rowsOf<SourceRow>(
    await tx.execute(sql`
      SELECT title, type_code, observation, expected, analysis_opinion, improvement, change_note
      FROM knowledge.knowledge_item_revision WHERE workspace_id = ${workspaceId} AND item_id = ${itemId} AND revision_no = ${revisionNo}`),
  );
  if (!rev) return { indexable: false };
  const relations = rowsOf<{ source_key: string; target_key: string }>(
    await tx.execute(sql`SELECT source_key, target_key FROM knowledge.item_event_relation_record WHERE workspace_id = ${workspaceId} AND item_id = ${itemId} AND revision_no = ${revisionNo}`),
  );
  const subjects = rowsOf<{ model_id: string; target_key: string }>(
    await tx.execute(sql`SELECT model_id, target_key FROM knowledge.item_revision_subject WHERE workspace_id = ${workspaceId} AND item_id = ${itemId} AND revision_no = ${revisionNo}`),
  );
  // Owner chain words: SW version label / name, model code / name, vendor code / name, mapped process codes / names.
  const ownerWords: string[] = [];
  let modelId = item.owner_model_id as string | null;
  if (item.owner_software_id) {
    const [sw] = rowsOf<{ version_label: string; name: string; model_id: string }>(
      await tx.execute(sql`SELECT version_label, name, model_id FROM knowledge.software_version WHERE workspace_id = ${workspaceId} AND id = ${item.owner_software_id as string}`),
    );
    if (sw) {
      ownerWords.push(sw.version_label, sw.name);
      modelId = sw.model_id;
    }
  }
  if (modelId) {
    const [model] = rowsOf<{ mcode: string; mname: string; vcode: string | null; vname: string | null }>(
      await tx.execute(sql`
        SELECT m.code AS mcode, m.name AS mname, v.code AS vcode, v.name AS vname FROM knowledge.equipment_model m
        LEFT JOIN knowledge.vendor v ON v.workspace_id = m.workspace_id AND v.id = m.vendor_id
        WHERE m.workspace_id = ${workspaceId} AND m.id = ${modelId}`),
    );
    if (model) ownerWords.push(model.mcode, model.mname, ...(model.vcode ? [model.vcode] : []), ...(model.vname ? [model.vname] : []));
    for (const p of rowsOf<{ code: string; name: string }>(
      await tx.execute(sql`
        SELECT p.code, p.name FROM knowledge.model_process mp JOIN knowledge.process_category p ON p.workspace_id = mp.workspace_id AND p.id = mp.process_id
        WHERE mp.workspace_id = ${workspaceId} AND mp.model_id = ${modelId}`),
    )) ownerWords.push(p.code, p.name);
  }
  const concepts = rowsOf<{ canonical_label: string }>(
    await tx.execute(sql`
      SELECT DISTINCT c.canonical_label FROM knowledge.item_revision_subject s
      JOIN knowledge.spec_concept_mapping m ON m.workspace_id = s.workspace_id AND m.model_id = s.model_id AND m.target_key = s.target_key
        AND m.review_state = 'confirmed' AND m.relation_kind = 'equivalent'
      JOIN knowledge.common_concept c ON c.workspace_id = m.workspace_id AND c.id = m.concept_id
      WHERE s.workspace_id = ${workspaceId} AND s.item_id = ${itemId} AND s.revision_no = ${revisionNo}`),
  );
  const text = buildDocumentText({
    title: rev.title as string,
    typeCode: rev.type_code as string,
    observation: rev.observation as string | null,
    expected: rev.expected as string | null,
    analysisOpinion: rev.analysis_opinion as string | null,
    improvement: rev.improvement as string | null,
    changeNote: rev.change_note as string | null,
    eventKeys: [...relations.flatMap((r) => [r.source_key, r.target_key]), ...subjects.map((s) => s.target_key)],
    extraWords: [...ownerWords, ...concepts.map((c) => c.canonical_label)],
  });
  return { indexable: true, revisionNo, sourceRowVersion: item.row_version as number, ...text };
}

/** Rebuilds one Item's document in every generation the pointer keeps (or removes it). Idempotent; the caller runs it inside a transaction. */
export async function applyItem(tx: Tx, workspaceId: string, itemId: string): Promise<void> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`search-doc:${workspaceId}:${itemId}`}, 0))`);
  const generations = generationsToWrite(await readPointer(tx, workspaceId));
  const doc = await buildDocument(tx, workspaceId, itemId);
  for (const generation of generations) {
    if (!doc.indexable) {
      await tx.execute(sql`DELETE FROM knowledge.search_document WHERE workspace_id = ${workspaceId} AND item_id = ${itemId} AND index_generation = ${generation}`);
      continue;
    }
    await tx.execute(sql`
      INSERT INTO knowledge.search_document (workspace_id, item_id, index_generation, revision_no, source_row_version, search_text, tsv, term_text, indexed_at)
      VALUES (${workspaceId}, ${itemId}, ${generation}, ${doc.revisionNo}, ${doc.sourceRowVersion}, ${doc.searchText}, to_tsvector('simple', ${doc.searchText}), ${doc.termText}, now())
      ON CONFLICT (workspace_id, item_id, index_generation) DO UPDATE SET
        revision_no = EXCLUDED.revision_no, source_row_version = EXCLUDED.source_row_version, search_text = EXCLUDED.search_text,
        tsv = EXCLUDED.tsv, term_text = EXCLUDED.term_text, indexed_at = now()
      WHERE knowledge.search_document.source_row_version <= EXCLUDED.source_row_version`);
  }
}

// ---- Drain ------------------------------------------------------------------------------------------------------------

export interface DrainResult {
  claimed: number;
  done: number;
  failed: number;
  dead: number;
}

export interface DrainOptions {
  batchSize?: number;
  /** Only this workspace's notifications (default: all; the job drains every workspace). */
  workspaceId?: string;
  /** Test seam: replaces `applyItem` (never set in production). */
  apply?: (tx: Tx, workspaceId: string, itemId: string) => Promise<void>;
}

/** A short code for `last_error`: never a message (it could carry content). */
export function errorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? `pg_${code}` : 'error';
}

/** Claims up to `batchSize` due notifications (`FOR UPDATE SKIP LOCKED`) and processes them in this one transaction. */
export async function drainBatch(db: Db, options: DrainOptions = {}): Promise<DrainResult> {
  const batchSize = options.batchSize ?? DRAIN_BATCH;
  const apply = options.apply ?? applyItem;
  return db.transaction(async (tx) => {
    const claimed = rowsOf<{ outbox_id: number; workspace_id: string; item_id: string; attempt_count: number }>(
      await tx.execute(sql`
        WITH c AS (
          SELECT outbox_id FROM knowledge.search_outbox
          WHERE state IN ('pending','failed') AND available_at <= now() ${options.workspaceId ? sql`AND workspace_id = ${options.workspaceId}` : sql``}
          ORDER BY outbox_id LIMIT ${batchSize} FOR UPDATE SKIP LOCKED)
        UPDATE knowledge.search_outbox o SET state = 'running', updated_at = now()
        FROM c WHERE o.outbox_id = c.outbox_id
        RETURNING o.outbox_id, o.workspace_id, o.item_id, o.attempt_count`),
    );
    const result: DrainResult = { claimed: claimed.length, done: 0, failed: 0, dead: 0 };
    for (const row of claimed) {
      try {
        await tx.transaction((savepoint) => apply(savepoint, row.workspace_id, row.item_id));
        await tx.execute(sql`UPDATE knowledge.search_outbox SET state = 'done', last_error = NULL, updated_at = now() WHERE outbox_id = ${row.outbox_id}`);
        result.done += 1;
      } catch (error) {
        const attempts = row.attempt_count + 1;
        const dead = attempts >= MAX_ATTEMPTS;
        await tx.execute(sql`
          UPDATE knowledge.search_outbox SET state = ${dead ? 'dead' : 'failed'}, attempt_count = ${attempts},
            available_at = now() + make_interval(secs => ${backoffSeconds(attempts)}), last_error = ${errorCode(error)}, updated_at = now()
          WHERE outbox_id = ${row.outbox_id}`);
        if (dead) result.dead += 1;
        else result.failed += 1;
      }
    }
    return result;
  });
}

/** Removes finished rows older than a day (the table only keeps what an operator may still want to see). */
export async function pruneDone(db: Db, limit = 1000): Promise<number> {
  const res = await db.execute(sql`
    DELETE FROM knowledge.search_outbox WHERE outbox_id IN (
      SELECT outbox_id FROM knowledge.search_outbox WHERE state = 'done' AND updated_at < now() - interval '1 day' LIMIT ${limit})`);
  return (res as unknown as { rowCount?: number }).rowCount ?? 0;
}

/** Dead rows -> a fresh `pending` row per Item (merged with an existing pending one), the dead rows are closed as `done`. Returns the Items requeued. */
export async function requeueDead(tx: Tx, workspaceId: string): Promise<number> {
  const dead = rowsOf<{ item_id: string }>(
    await tx.execute(sql`SELECT DISTINCT item_id FROM knowledge.search_outbox WHERE workspace_id = ${workspaceId} AND state = 'dead'`),
  );
  if (dead.length === 0) return 0;
  await enqueueItems(tx, workspaceId, dead.map((d) => d.item_id), 'reindex');
  await tx.execute(sql`UPDATE knowledge.search_outbox SET state = 'done', updated_at = now() WHERE workspace_id = ${workspaceId} AND state = 'dead'`);
  return dead.length;
}

// ---- Backfill ---------------------------------------------------------------------------------------------------------

export interface BackfillStep {
  state: 'running' | 'done';
  enqueued: number;
}

async function publishedCount(tx: Tx, workspaceId: string): Promise<number> {
  const [row] = rowsOf<{ n: number }>(await tx.execute(sql`SELECT count(*)::int AS n FROM knowledge.knowledge_item WHERE workspace_id = ${workspaceId} AND publication_state = 'published'`));
  return row?.n ?? 0;
}

/** Creates the workspace's pointer and progress rows when absent (progress starts a run at the active generation). */
export async function ensureBackfill(tx: Tx, workspaceId: string): Promise<void> {
  const pointer = await readPointer(tx, workspaceId);
  const total = await publishedCount(tx, workspaceId);
  await tx.execute(sql`
    INSERT INTO knowledge.search_backfill_progress (workspace_id, generation, total_count)
    VALUES (${workspaceId}, ${pointer.buildingGeneration ?? pointer.activeGeneration}, ${total}) ON CONFLICT (workspace_id) DO NOTHING`);
}

/** One resumable keyset batch of `reindex` notifications for the published Items. The last (short or empty) page marks the run `done`. */
export async function backfillStep(db: Db, workspaceId: string, batchSize = BACKFILL_BATCH): Promise<BackfillStep> {
  return db.transaction(async (tx) => {
    await ensureBackfill(tx, workspaceId);
    const [progress] = rowsOf<{ state: 'running' | 'done'; last_item_id: string | null }>(
      await tx.execute(sql`SELECT state, last_item_id FROM knowledge.search_backfill_progress WHERE workspace_id = ${workspaceId} FOR UPDATE`),
    );
    if (!progress) throw new Error('search backfill progress missing');
    if (progress.state === 'done') return { state: 'done' as const, enqueued: 0 };
    const page = rowsOf<{ id: string }>(
      await tx.execute(sql`
        SELECT id FROM knowledge.knowledge_item WHERE workspace_id = ${workspaceId} AND publication_state = 'published' AND id > ${progress.last_item_id ?? ZERO_UUID}::uuid
        ORDER BY id LIMIT ${batchSize}`),
    );
    if (page.length > 0) await enqueueItems(tx, workspaceId, page.map((r) => r.id), 'reindex');
    const finished = page.length < batchSize;
    await tx.execute(sql`
      UPDATE knowledge.search_backfill_progress SET last_item_id = ${page.length > 0 ? page[page.length - 1]?.id ?? null : progress.last_item_id}::uuid,
        done_count = done_count + ${page.length}, state = ${finished ? 'done' : 'running'}, finished_at = ${finished ? sql`now()` : sql`NULL`}, updated_at = now()
      WHERE workspace_id = ${workspaceId}`);
    return { state: finished ? ('done' as const) : ('running' as const), enqueued: page.length };
  });
}

/** Runs `backfillStep` until the workspace's run is done (or `maxSteps` batches were taken: the next run resumes). */
export async function backfillWorkspace(db: Db, workspaceId: string, batchSize = BACKFILL_BATCH, maxSteps = 10_000): Promise<BackfillStep> {
  let last: BackfillStep = { state: 'running', enqueued: 0 };
  let total = 0;
  for (let i = 0; i < maxSteps; i++) {
    last = await backfillStep(db, workspaceId, batchSize);
    total += last.enqueued;
    if (last.state === 'done') break;
  }
  return { state: last.state, enqueued: total };
}

export async function workspaceIds(db: Db): Promise<string[]> {
  return rowsOf<{ id: string }>(await db.execute(sql`SELECT id FROM core.workspaces ORDER BY id`)).map((r) => r.id);
}

// ---- Generations: new build, switch, rollback, retention --------------------------------------------------------------

export type GenerationOutcome = { ok: true; pointer: Pointer } | { ok: false; reason: 'already_building' | 'not_building' | 'not_ready' | 'nothing_to_roll_back' };

/** Starts building generation `n + 1` next to the active one and restarts the backfill for it. The consumer then writes both generations. */
export async function startReindex(db: Db, workspaceId: string): Promise<GenerationOutcome> {
  return db.transaction(async (tx) => {
    const pointer = await readPointer(tx, workspaceId, true);
    if (pointer.buildingGeneration !== null) return { ok: false as const, reason: 'already_building' as const };
    const next = Math.max(pointer.activeGeneration, pointer.previousGeneration ?? 0) + 1;
    await tx.execute(sql`UPDATE knowledge.search_index_pointer SET building_generation = ${next}, updated_at = now() WHERE workspace_id = ${workspaceId}`);
    const total = await publishedCount(tx, workspaceId);
    await tx.execute(sql`
      INSERT INTO knowledge.search_backfill_progress (workspace_id, generation, state, last_item_id, total_count, done_count, started_at, finished_at)
      VALUES (${workspaceId}, ${next}, 'running', NULL, ${total}, 0, now(), NULL)
      ON CONFLICT (workspace_id) DO UPDATE SET generation = EXCLUDED.generation, state = 'running', last_item_id = NULL, total_count = EXCLUDED.total_count,
        done_count = 0, started_at = now(), finished_at = NULL, updated_at = now()`);
    return { ok: true as const, pointer: await readPointer(tx, workspaceId) };
  });
}

/** Verifies the building generation (backfill done, no open notification, one document per published Item) and flips the pointer with ONE UPDATE. */
export async function switchGeneration(db: Db, workspaceId: string): Promise<GenerationOutcome> {
  return db.transaction(async (tx) => {
    const pointer = await readPointer(tx, workspaceId, true);
    if (pointer.buildingGeneration === null) return { ok: false as const, reason: 'not_building' as const };
    const [progress] = rowsOf<{ state: string; generation: number }>(
      await tx.execute(sql`SELECT state, generation FROM knowledge.search_backfill_progress WHERE workspace_id = ${workspaceId}`),
    );
    const [open] = rowsOf<{ n: number }>(
      await tx.execute(sql`SELECT count(*)::int AS n FROM knowledge.search_outbox WHERE workspace_id = ${workspaceId} AND state IN ('pending','running','failed','dead')`),
    );
    const [docs] = rowsOf<{ n: number }>(
      await tx.execute(sql`SELECT count(*)::int AS n FROM knowledge.search_document WHERE workspace_id = ${workspaceId} AND index_generation = ${pointer.buildingGeneration}`),
    );
    if (progress?.state !== 'done' || progress.generation !== pointer.buildingGeneration || (open?.n ?? 1) !== 0 || docs?.n !== (await publishedCount(tx, workspaceId))) {
      return { ok: false as const, reason: 'not_ready' as const };
    }
    await tx.execute(sql`
      UPDATE knowledge.search_index_pointer SET previous_generation = active_generation, previous_retired_at = now(),
        active_generation = building_generation, building_generation = NULL, updated_at = now()
      WHERE workspace_id = ${workspaceId}`);
    return { ok: true as const, pointer: await readPointer(tx, workspaceId) };
  });
}

/** Points the workspace back at the kept previous generation (it was written in step all along) with ONE UPDATE; an unfinished build is dropped. */
export async function rollbackGeneration(db: Db, workspaceId: string): Promise<GenerationOutcome> {
  return db.transaction(async (tx) => {
    const pointer = await readPointer(tx, workspaceId, true);
    if (pointer.previousGeneration === null) return { ok: false as const, reason: 'nothing_to_roll_back' as const };
    await tx.execute(sql`
      UPDATE knowledge.search_index_pointer SET active_generation = previous_generation, previous_generation = active_generation,
        previous_retired_at = now(), building_generation = NULL, updated_at = now()
      WHERE workspace_id = ${workspaceId}`);
    return { ok: true as const, pointer: await readPointer(tx, workspaceId) };
  });
}

/** Ends the rollback window of a previous generation older than the retention period and deletes every document outside the kept generations. */
export async function purgeRetiredGenerations(db: Db, workspaceId: string, retentionDays = GENERATION_RETENTION_DAYS): Promise<number> {
  return db.transaction(async (tx) => {
    await readPointer(tx, workspaceId, true);
    await tx.execute(sql`
      UPDATE knowledge.search_index_pointer SET previous_generation = NULL, previous_retired_at = NULL, updated_at = now()
      WHERE workspace_id = ${workspaceId} AND previous_generation IS NOT NULL AND previous_retired_at < now() - make_interval(days => ${retentionDays})`);
    const res = await tx.execute(sql`
      DELETE FROM knowledge.search_document d USING knowledge.search_index_pointer p
      WHERE d.workspace_id = ${workspaceId} AND p.workspace_id = d.workspace_id
        AND d.index_generation NOT IN (p.active_generation, COALESCE(p.building_generation, -1), COALESCE(p.previous_generation, -1))`);
    return (res as unknown as { rowCount?: number }).rowCount ?? 0;
  });
}

// ---- Ops visibility ---------------------------------------------------------------------------------------------------

export interface SearchIndexStatus {
  outbox: { pending: number; running: number; failed: number; dead: number };
  lagSeconds: number | null;
  backfill: { state: 'running' | 'done' | 'none'; generation: number | null; done: number; total: number };
  generation: { active: number; building: number | null; previous: number | null };
}

export async function searchIndexStatus(tx: Tx, workspaceId: string): Promise<SearchIndexStatus> {
  const counts = rowsOf<{ state: string; n: number }>(
    await tx.execute(sql`SELECT state, count(*)::int AS n FROM knowledge.search_outbox WHERE workspace_id = ${workspaceId} AND state IN ('pending','running','failed','dead') GROUP BY state`),
  );
  const count = (state: string) => counts.find((c) => c.state === state)?.n ?? 0;
  const [lag] = rowsOf<{ seconds: number | null }>(
    await tx.execute(sql`SELECT floor(extract(epoch FROM now() - min(created_at)))::int AS seconds FROM knowledge.search_outbox WHERE workspace_id = ${workspaceId} AND state = 'pending'`),
  );
  const [progress] = rowsOf<{ state: 'running' | 'done'; generation: number; done_count: number; total_count: number }>(
    await tx.execute(sql`SELECT state, generation, done_count, total_count FROM knowledge.search_backfill_progress WHERE workspace_id = ${workspaceId}`),
  );
  const [pointer] = rowsOf<PointerRow>(
    await tx.execute(sql`SELECT active_generation, building_generation, previous_generation, previous_retired_at FROM knowledge.search_index_pointer WHERE workspace_id = ${workspaceId}`),
  );
  return {
    outbox: { pending: count('pending'), running: count('running'), failed: count('failed'), dead: count('dead') },
    lagSeconds: lag?.seconds ?? null,
    backfill: progress
      ? { state: progress.state, generation: progress.generation, done: progress.done_count, total: progress.total_count }
      : { state: 'none', generation: null, done: 0, total: 0 },
    generation: { active: pointer?.active_generation ?? 1, building: pointer?.building_generation ?? null, previous: pointer?.previous_generation ?? null },
  };
}
