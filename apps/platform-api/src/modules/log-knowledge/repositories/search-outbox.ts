// Outbox writers of the search index (#1506 S-c, design log-knowledge-search §3.3). Called from the single write functions of
// the source change (`item-write.ts`, `access-write.ts`, `concept.ts`, `catalog-write.ts`), so the notification commits or rolls
// back with the change itself. A notification carries NO payload: «rebuild Item X». At most one `pending` row exists per Item
// (partial unique), a second request merges into it. The consumer (`search-index.ts`) reads the source's current values.
// A change to a Model / SW version / vendor / process / concept reaches its Items in keyset batches inside the same transaction.

import { type SQL, sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import type { AccessTargetKind } from '../domain/access-visibility.js';
import { chunk } from '../domain/search-normalize.js';

export const OUTBOX_REASONS = ['published', 'archived', 'access_changed', 'concept_changed', 'alias_changed', 'subject_changed', 'catalog_changed', 'reindex'] as const;
export type OutboxReason = (typeof OUTBOX_REASONS)[number];

/** Items per INSERT and per keyset page of an affected-set enqueue. */
export const ENQUEUE_BATCH = 1000;

const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

export const rowsOf = <T>(result: unknown): T[] => (result as { rows: T[] }).rows;

const uuidArray = (ids: readonly string[]) => sql`ARRAY[${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)}]::uuid[]`;

/** Notifies these Items (any state). Coalescing UPDATE locks the pending row through the source commit:
 * a drain skips it until then, or, if the drain claimed first, this INSERT waits and creates a fresh pending row after it finishes.
 * `available_at` is the request marker; no source payload or additional column is needed. */
export async function enqueueItems(tx: Tx, workspaceId: string, itemIds: readonly string[], reason: OutboxReason): Promise<void> {
  // One global ascending Item id order (across batches and inside each INSERT) so two concurrent writers lock pending rows in the same order and cannot deadlock.
  for (const batch of chunk([...new Set(itemIds)].sort(), ENQUEUE_BATCH)) {
    await tx.execute(sql`
      INSERT INTO knowledge.search_outbox (workspace_id, item_id, reason)
      SELECT ${workspaceId}::uuid, i, ${reason} FROM unnest(${uuidArray(batch)}) AS i ORDER BY i
      ON CONFLICT (workspace_id, item_id) WHERE state = 'pending'
      DO UPDATE SET available_at = EXCLUDED.available_at, updated_at = now()`);
  }
}

/** Notifies every published Item of the workspace that `condition` (a predicate over alias `i` = knowledge_item) selects, by keyset pages. Returns the count. */
export async function enqueueWhere(tx: Tx, workspaceId: string, condition: SQL, reason: OutboxReason): Promise<number> {
  let after = ZERO_UUID;
  let total = 0;
  for (;;) {
    const page = rowsOf<{ id: string }>(
      await tx.execute(sql`
        SELECT i.id FROM knowledge.knowledge_item i
        WHERE i.workspace_id = ${workspaceId} AND i.publication_state = 'published' AND i.id > ${after}::uuid AND (${condition})
        ORDER BY i.id LIMIT ${ENQUEUE_BATCH}`),
    );
    if (page.length === 0) break;
    await enqueueItems(tx, workspaceId, page.map((r) => r.id), reason);
    total += page.length;
    after = page[page.length - 1]?.id ?? after;
    if (page.length < ENQUEUE_BATCH) break;
  }
  return total;
}

const softwareOfModel = (workspaceId: string, modelId: SQL | string) =>
  sql`(SELECT sv.id FROM knowledge.software_version sv WHERE sv.workspace_id = ${workspaceId} AND sv.model_id = ${modelId})`;

/** Items owned by the model or by one of its SW versions. */
const ofModel = (workspaceId: string, modelId: string) =>
  sql`(i.owner_model_id = ${modelId}::uuid OR i.owner_software_id IN ${softwareOfModel(workspaceId, modelId)})`;

/** The Items a change of this access target reaches: the Item itself, the Model's Items and its SW versions' Items, or the SW version's Items. */
export async function enqueueAccessChange(tx: Tx, workspaceId: string, kind: AccessTargetKind, targetId: string): Promise<void> {
  if (kind === 'item') return enqueueItems(tx, workspaceId, [targetId], 'access_changed');
  const condition = kind === 'model' ? ofModel(workspaceId, targetId) : sql`i.owner_software_id = ${targetId}::uuid`;
  await enqueueWhere(tx, workspaceId, condition, 'access_changed');
}

/** The Items whose owner chain holds this catalog row (vendor -> models -> SW versions; process category -> mapped models -> SW versions). */
export async function enqueueCatalogChange(tx: Tx, workspaceId: string, kind: 'vendor' | 'process' | 'model' | 'software', id: string): Promise<void> {
  const models =
    kind === 'vendor'
      ? sql`(SELECT m.id FROM knowledge.equipment_model m WHERE m.workspace_id = ${workspaceId} AND m.vendor_id = ${id}::uuid)`
      : sql`(SELECT mp.model_id FROM knowledge.model_process mp WHERE mp.workspace_id = ${workspaceId} AND mp.process_id = ${id}::uuid)`;
  const condition =
    kind === 'model'
      ? ofModel(workspaceId, id)
      : kind === 'software'
        ? sql`i.owner_software_id = ${id}::uuid`
        : sql`(i.owner_model_id IN ${models} OR i.owner_software_id IN (SELECT sv.id FROM knowledge.software_version sv WHERE sv.workspace_id = ${workspaceId} AND sv.model_id IN ${models}))`;
  await enqueueWhere(tx, workspaceId, condition, 'catalog_changed');
}

/** The Items that name a target of any mapping of this concept (any revision: a superset is fine, the consumer reads the current values). */
export async function enqueueConceptChange(tx: Tx, workspaceId: string, conceptId: string): Promise<void> {
  const condition = sql`i.id IN (
    SELECT s.item_id FROM knowledge.item_revision_subject s
    JOIN knowledge.spec_concept_mapping m ON m.workspace_id = s.workspace_id AND m.model_id = s.model_id AND m.target_key = s.target_key
    WHERE s.workspace_id = ${workspaceId} AND m.concept_id = ${conceptId}::uuid)`;
  await enqueueWhere(tx, workspaceId, condition, 'concept_changed');
}
