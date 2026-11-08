// Write side of the knowledge items (#1197 w, ADR-0109): `knowledge.*` item tables and the item counter only,
// every statement scoped to the actor's workspace, no hard delete. The caller owns the transaction and the audit
// rows. The item a write targets is locked `FOR UPDATE` by `lockItem` (the action's `currentVersion`); an owner
// a new item hangs under is locked `FOR SHARE` so a concurrent deactivation cannot slip between check and insert.
// Revision, evidence, assessment and link rows are insert-only (the runtime role holds no UPDATE or DELETE on them).

import { and, eq, sql } from 'drizzle-orm';

import {
  equipmentModels,
  itemAssessmentEvents,
  itemLinks,
  itemRevisionEvidence,
  knowledgeItemRevisions,
  knowledgeItems,
  softwareVersions,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import type { EvidencePointer } from '../domain/item-input.js';
import { type Viewer, canSeeItem, canSeeModel, canSeeSoftware } from './access-visibility.js';
import { allocateItemNo } from './item-number.js';
import { enqueueItems } from './search-outbox.js';

export interface ItemRow {
  id: string;
  itemNo: number;
  latestRevisionNo: number;
  publicationState: string;
  verificationState: string;
  processingState: string;
  rowVersion: number;
}

export interface RevisionContent {
  typeCode: string;
  title: string;
  observation: string | null;
  expected: string | null;
  analysisOpinion: string | null;
  improvement: string | null;
}

const itemColumns = {
  id: knowledgeItems.id,
  itemNo: knowledgeItems.itemNo,
  latestRevisionNo: knowledgeItems.latestRevisionNo,
  publicationState: knowledgeItems.publicationState,
  verificationState: knowledgeItems.verificationState,
  processingState: knowledgeItems.processingState,
  rowVersion: knowledgeItems.rowVersion,
};

/** Locks the item `FOR UPDATE`; null when it is not in the workspace or the viewer cannot see it (#1504: a hidden item is not found). */
export async function lockItem(tx: Tx, viewer: Viewer, id: string): Promise<ItemRow | null> {
  const workspaceId = viewer.workspaceId;
  if (!(await canSeeItem(tx, viewer, id))) return null;
  const [owner] = await tx.select({ ownerModelId: knowledgeItems.ownerModelId, ownerSoftwareId: knowledgeItems.ownerSoftwareId }).from(knowledgeItems).where(and(eq(knowledgeItems.workspaceId, workspaceId), eq(knowledgeItems.id, id)));
  if (!owner || !(await lockOwnerAccess(tx, viewer, owner))) return null;
  const [row] = await tx
    .select(itemColumns)
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.workspaceId, workspaceId), eq(knowledgeItems.id, id)))
    .for('update');
  return row && await canSeeItem(tx, viewer, id) ? row : null;
}

/** Whether the workspace holds this item AND the viewer may see it (unlocked: items are never deleted). */
export async function itemExists(tx: Tx, viewer: Viewer, id: string): Promise<boolean> {
  const workspaceId = viewer.workspaceId;
  if (!(await canSeeItem(tx, viewer, id))) return false;
  const [row] = await tx
    .select({ id: knowledgeItems.id })
    .from(knowledgeItems)
    .where(and(eq(knowledgeItems.workspaceId, workspaceId), eq(knowledgeItems.id, id)));
  return row !== undefined;
}

/** The title of the item's latest revision (audit detail of a state change). */
export async function latestTitle(tx: Tx, workspaceId: string, item: ItemRow): Promise<string> {
  const [row] = await tx
    .select({ title: knowledgeItemRevisions.title })
    .from(knowledgeItemRevisions)
    .where(
      and(
        eq(knowledgeItemRevisions.workspaceId, workspaceId),
        eq(knowledgeItemRevisions.itemId, item.id),
        eq(knowledgeItemRevisions.revisionNo, item.latestRevisionNo),
      ),
    );
  if (!row) throw new Error(`item ${item.id}: latest revision ${item.latestRevisionNo} is missing`);
  return row.title;
}

export type OwnerCheck = 'ok' | 'not_found' | 'inactive';

/**
 * Judges the owner a new item hangs under and locks it `FOR SHARE`: a model must exist and be active; a software
 * version must exist, be active and belong to an active model.
 */
export async function checkOwner(
  tx: Tx,
  viewer: Viewer,
  owner: { modelId: string } | { softwareId: string },
): Promise<OwnerCheck> {
  const workspaceId = viewer.workspaceId;
  // An owner the viewer cannot see is `not_found`, exactly like one that does not exist (#1504).
  if (!(await lockOwnerAccess(tx, viewer, { ownerModelId: 'modelId' in owner ? owner.modelId : null, ownerSoftwareId: 'softwareId' in owner ? owner.softwareId : null }))) return 'not_found';
  if ('modelId' in owner) {
    const [model] = await tx
      .select({ active: equipmentModels.active })
      .from(equipmentModels)
      .where(and(eq(equipmentModels.workspaceId, workspaceId), eq(equipmentModels.id, owner.modelId)))
      .for('share');
    if (!model || !(await canSeeModel(tx, viewer, owner.modelId))) return 'not_found';
    return model.active ? 'ok' : 'inactive';
  }
  const [software] = await tx
    .select({ active: softwareVersions.active, modelId: softwareVersions.modelId })
    .from(softwareVersions)
    .where(and(eq(softwareVersions.workspaceId, workspaceId), eq(softwareVersions.id, owner.softwareId)))
    .for('share');
  if (!software) return 'not_found';
  const [model] = await tx
    .select({ active: equipmentModels.active })
    .from(equipmentModels)
    .where(and(eq(equipmentModels.workspaceId, workspaceId), eq(equipmentModels.id, software.modelId)))
    .for('share');
  if (!model || !(await canSeeSoftware(tx, viewer, owner.softwareId))) return 'not_found';
  return software.active && model.active ? 'ok' : 'inactive';
}

/** Whether the workspace holds this revision of this item (`derive` pins a link to it). */
export async function revisionExists(
  tx: Tx,
  workspaceId: string,
  itemId: string,
  revisionNo: number,
): Promise<boolean> {
  const [row] = await tx
    .select({ n: knowledgeItemRevisions.revisionNo })
    .from(knowledgeItemRevisions)
    .where(
      and(
        eq(knowledgeItemRevisions.workspaceId, workspaceId),
        eq(knowledgeItemRevisions.itemId, itemId),
        eq(knowledgeItemRevisions.revisionNo, revisionNo),
      ),
    );
  return row !== undefined;
}

async function insertRevision(
  tx: Tx,
  workspaceId: string,
  itemId: string,
  revisionNo: number,
  actorId: string,
  content: RevisionContent,
  changeNote: string | null,
  evidence: readonly EvidencePointer[],
): Promise<void> {
  await tx.insert(knowledgeItemRevisions).values({
    workspaceId,
    itemId,
    revisionNo,
    ...content,
    changeNote,
    publishedBy: actorId,
  });
  if (evidence.length > 0) {
    await tx.insert(itemRevisionEvidence).values(
      evidence.map((pointer, index) => ({
        workspaceId,
        itemId,
        revisionNo,
        ordinal: index + 1,
        sourceKind: pointer.sourceKind,
        sourceOwner: pointer.sourceOwner,
        sourceRef: pointer.sourceRef,
        sourceVersion: pointer.sourceVersion,
        contentHash: pointer.contentHash,
        locator: pointer.locator,
        note: pointer.note,
      })),
    );
  }
}

/** A new published item (number from the workspace counter) with its revision 1 and evidence. */
export async function insertItem(
  tx: Tx,
  input: {
    workspaceId: string;
    actorId: string;
    ownerModelId: string | null;
    ownerSoftwareId: string | null;
    content: RevisionContent;
    evidence: readonly EvidencePointer[];
  },
): Promise<ItemRow> {
  const itemNo = await allocateItemNo(tx, input.workspaceId);
  const [row] = await tx
    .insert(knowledgeItems)
    .values({
      workspaceId: input.workspaceId,
      itemNo,
      ownerModelId: input.ownerModelId,
      ownerSoftwareId: input.ownerSoftwareId,
      latestRevisionNo: 1,
      publicationState: 'published',
      createdBy: input.actorId,
      updatedBy: input.actorId,
    })
    .returning(itemColumns);
  if (!row) throw new Error('item insert returned no row');
  await insertRevision(tx, input.workspaceId, row.id, 1, input.actorId, input.content, null, input.evidence);
  await enqueueItems(tx, input.workspaceId, [row.id], 'published'); // #1506: same transaction as the publish
  return row;
}

/** Appends revision `latest + 1` (with its own evidence) and moves the item's `latest_revision_no`. */
export async function appendRevision(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  item: ItemRow,
  content: RevisionContent,
  changeNote: string,
  evidence: readonly EvidencePointer[],
): Promise<ItemRow> {
  const revisionNo = item.latestRevisionNo + 1;
  await insertRevision(tx, workspaceId, item.id, revisionNo, actorId, content, changeNote, evidence);
  const bumped = await bump(tx, workspaceId, item.id, actorId, { latestRevisionNo: revisionNo });
  await enqueueItems(tx, workspaceId, [item.id], 'published'); // #1506
  return bumped;
}

/** Records one assessment event and sets the item's projection of that dimension. */
export async function appendAssessment(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  item: ItemRow,
  dimension: 'verification' | 'processing',
  newState: string,
  rationale: string,
): Promise<ItemRow> {
  const priorState = dimension === 'verification' ? item.verificationState : item.processingState;
  await tx.insert(itemAssessmentEvents).values({
    workspaceId,
    itemId: item.id,
    basedOnRevisionNo: item.latestRevisionNo,
    dimension,
    priorState,
    newState,
    rationale,
    actorId,
  });
  return bump(
    tx,
    workspaceId,
    item.id,
    actorId,
    dimension === 'verification' ? { verificationState: newState } : { processingState: newState },
  );
}

export async function setPublicationState(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  item: ItemRow,
  publicationState: 'published' | 'archived',
): Promise<ItemRow> {
  const bumped = await bump(tx, workspaceId, item.id, actorId, { publicationState });
  await enqueueItems(tx, workspaceId, [item.id], publicationState === 'archived' ? 'archived' : 'published'); // #1506
  return bumped;
}

/** `derived_from` link: `source` = the new item, `target` = the original, pinned to one of its revisions. */
export async function insertDerivedLink(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  newItemId: string,
  originalItemId: string,
  originalRevisionNo: number,
): Promise<void> {
  await tx.insert(itemLinks).values({
    workspaceId,
    sourceItemId: newItemId,
    targetItemId: originalItemId,
    linkKind: 'derived_from',
    sourceRevisionNo: originalRevisionNo,
    createdBy: actorId,
  });
}

async function bump(
  tx: Tx,
  workspaceId: string,
  id: string,
  actorId: string,
  set: Partial<{
    latestRevisionNo: number;
    publicationState: string;
    verificationState: string;
    processingState: string;
  }>,
): Promise<ItemRow> {
  const [row] = await tx
    .update(knowledgeItems)
    .set({
      ...set,
      rowVersion: sql`${knowledgeItems.rowVersion} + 1`,
      updatedBy: actorId,
      updatedAt: sql`now()`,
    })
    .where(and(eq(knowledgeItems.workspaceId, workspaceId), eq(knowledgeItems.id, id)))
    .returning(itemColumns);
  if (!row) throw new Error(`item ${id}: update returned no row`);
  return row;
}

/** Stabilizes the owner chain against mode changes, deny additions and allow revocations until commit. */
export async function lockOwnerAccess(tx: Tx, viewer: Viewer, owner: { ownerModelId: string | null; ownerSoftwareId: string | null }): Promise<boolean> {
  if (owner.ownerSoftwareId) {
    if (!(await canSeeSoftware(tx, viewer, owner.ownerSoftwareId))) return false;
    const [software] = await tx.select({ modelId: softwareVersions.modelId }).from(softwareVersions).where(and(eq(softwareVersions.workspaceId, viewer.workspaceId), eq(softwareVersions.id, owner.ownerSoftwareId)));
    if (!software) return false;
    await tx.select({ id: equipmentModels.id }).from(equipmentModels).where(and(eq(equipmentModels.workspaceId, viewer.workspaceId), eq(equipmentModels.id, software.modelId))).for('share');
    await tx.select({ id: softwareVersions.id }).from(softwareVersions).where(and(eq(softwareVersions.workspaceId, viewer.workspaceId), eq(softwareVersions.id, owner.ownerSoftwareId))).for('share');
    return canSeeSoftware(tx, viewer, owner.ownerSoftwareId);
  }
  if (!owner.ownerModelId || !(await canSeeModel(tx, viewer, owner.ownerModelId))) return false;
  await tx.select({ id: equipmentModels.id }).from(equipmentModels).where(and(eq(equipmentModels.workspaceId, viewer.workspaceId), eq(equipmentModels.id, owner.ownerModelId))).for('share');
  return canSeeModel(tx, viewer, owner.ownerModelId);
}
