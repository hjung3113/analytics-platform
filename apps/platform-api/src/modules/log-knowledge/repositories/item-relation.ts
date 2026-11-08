// Item Event relation record storage and resolution (#1505 S-b, ADR-0125): `knowledge.item_event_relation_record` only,
// every statement scoped to the workspace, insert-only (the runtime role holds no UPDATE or DELETE). A record pairs two
// events of the item's owner by stable key. A key the owner's EFFECTIVE spec (SW-owned item: that SW version's effective
// spec; model-owned: the current published revision) does not hold is stored with `resolved = false`, never refused, so a
// spec change cannot block an item.

import { and, asc, eq, sql } from 'drizzle-orm';

import { itemEventRelationRecords, knowledgeItems, softwareVersions } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import type { ItemRelationValue } from '../domain/item-relation-input.js';
import { applySpecChanges } from '../domain/spec-effective.js';
import { buildTargetKey } from '../domain/spec-target-key.js';
import { getModelSpec, loadApplicableChanges } from './spec-read.js';

const t = itemEventRelationRecords;

export interface RelationOwner {
  modelId: string | null;
  softwareId: string | null;
}

export interface ItemRelationRow {
  ordinal: number;
  kind: string;
  source: string;
  predicate: string;
  target: string;
  /** Whether the owner's effective spec held both keys when the record was written. */
  resolved: boolean;
  /** The event's name in the owner's current effective spec; null when it is not there now. */
  sourceLabel: string | null;
  targetLabel: string | null;
}

/** The owner model and SW version of an item (SW-owned: the SW version's model). Null when the item is not in the workspace. */
export async function relationOwnerOf(tx: Tx, workspaceId: string, itemId: string): Promise<RelationOwner | null> {
  const [row] = await tx
    .select({ modelId: knowledgeItems.ownerModelId, softwareId: knowledgeItems.ownerSoftwareId })
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.workspaceId, workspaceId), eq(knowledgeItems.id, itemId)));
  if (!row) return null;
  if (row.modelId !== null || row.softwareId === null) return { modelId: row.modelId, softwareId: row.softwareId };
  const [sw] = await tx
    .select({ modelId: softwareVersions.modelId })
    .from(softwareVersions)
    .where(and(eq(softwareVersions.workspaceId, workspaceId), eq(softwareVersions.id, row.softwareId)));
  return { modelId: sw?.modelId ?? null, softwareId: row.softwareId };
}

/** Event key → name of the owner's effective spec; null when the owner has no model or no published spec. */
export async function effectiveEventNames(tx: Tx, workspaceId: string, owner: RelationOwner): Promise<Map<string, string> | null> {
  if (owner.modelId === null) return null;
  const spec = await getModelSpec(tx, workspaceId, owner.modelId);
  if (!spec) return null;
  let changes: Awaited<ReturnType<typeof loadApplicableChanges>> = [];
  if (owner.softwareId !== null) {
    const [sw] = await tx
      .select({ order: softwareVersions.releaseOrder })
      .from(softwareVersions)
      .where(and(eq(softwareVersions.workspaceId, workspaceId), eq(softwareVersions.id, owner.softwareId)));
    if (sw) changes = await loadApplicableChanges(tx, workspaceId, owner.modelId, sw.order);
  }
  const effective = applySpecChanges(spec, changes);
  return new Map(effective.events.map((e) => [buildTargetKey({ kind: 'event', module: e.moduleKey, event: e.eventKey }), e.name]));
}

export type RelationInsert = ItemRelationValue & { resolved: boolean };

/** Marks each record `resolved` when both its events are in the owner's effective spec (false for every record when there is none). */
export async function judgeRelations(tx: Tx, workspaceId: string, owner: RelationOwner, relations: readonly ItemRelationValue[]): Promise<RelationInsert[]> {
  if (relations.length === 0) return [];
  const names = await effectiveEventNames(tx, workspaceId, owner);
  return relations.map((r) => ({ ...r, resolved: names !== null && names.has(r.sourceKey) && names.has(r.targetKey) }));
}

export async function insertRelations(tx: Tx, workspaceId: string, itemId: string, revisionNo: number, rows: readonly RelationInsert[]): Promise<void> {
  if (rows.length === 0) return;
  await tx.insert(t).values(
    rows.map((r, index) => ({
      workspaceId,
      itemId,
      revisionNo,
      ordinal: index + 1,
      kind: r.kind,
      sourceKey: r.sourceKey,
      predicate: r.predicate,
      targetKey: r.targetKey,
      resolved: r.resolved,
    })),
  );
}

/** A revise that sends no `relations` keeps the previous revision's records: copied to the new revision, `resolved` as written. */
export async function carryRelations(tx: Tx, workspaceId: string, itemId: string, fromRevisionNo: number, toRevisionNo: number): Promise<void> {
  await tx.execute(sql`
    INSERT INTO knowledge.item_event_relation_record
      (workspace_id, item_id, revision_no, ordinal, kind, source_key, predicate, target_key, resolved)
    SELECT workspace_id, item_id, ${toRevisionNo}::int, ordinal, kind, source_key, predicate, target_key, resolved
    FROM knowledge.item_event_relation_record
    WHERE workspace_id = ${workspaceId} AND item_id = ${itemId} AND revision_no = ${fromRevisionNo}`);
}

/** The records of one item revision, labelled from the owner's current effective spec where the key is there. */
export async function itemRelations(tx: Tx, workspaceId: string, itemId: string, revisionNo: number): Promise<ItemRelationRow[]> {
  const rows = await tx
    .select()
    .from(t)
    .where(and(eq(t.workspaceId, workspaceId), eq(t.itemId, itemId), eq(t.revisionNo, revisionNo)))
    .orderBy(asc(t.ordinal));
  if (rows.length === 0) return [];
  const owner = await relationOwnerOf(tx, workspaceId, itemId);
  const names = owner ? await effectiveEventNames(tx, workspaceId, owner) : null;
  return rows.map((r) => ({
    ordinal: r.ordinal,
    kind: r.kind,
    source: r.sourceKey,
    predicate: r.predicate,
    target: r.targetKey,
    resolved: r.resolved,
    sourceLabel: names?.get(r.sourceKey) ?? null,
    targetLabel: names?.get(r.targetKey) ?? null,
  }));
}
