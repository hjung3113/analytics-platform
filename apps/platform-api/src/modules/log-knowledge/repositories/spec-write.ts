// Write side of the model spec (#1196 b1, ADR-0111): `knowledge.*` spec tables only, every statement scoped to the
// actor's workspace, no delete anywhere. The caller owns the transaction and the audit row. The revision a write
// targets is locked `FOR UPDATE` by `lockRevision` (the action's `currentVersion`); the child-row guard trigger
// reads the revision `FOR SHARE`, so an insert and a publish never interleave. Child rows are insert-only.

import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  equipmentModels,
  modelSpecRevisions,
  specEventRelations,
  specEvents,
  specModules,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { type DraftIndex, type PlannedEvent, type PlannedModule, type PlannedRelation, type SourceDocRef, SPEC_SCHEMA_VERSION, qualifiedKey, relationEdgeKey } from '../domain/spec-input.js';
import { type HashEvent, type HashModule, type HashRelation, specContentHash } from '../domain/spec-hash.js';

export interface RevisionRow {
  id: string;
  modelId: string;
  revisionNo: number;
  state: string;
  rowVersion: number;
  schemaVersion: number;
  sourceDocRef: SourceDocRef;
  contentSha256: string | null;
}

const revisionColumns = {
  id: modelSpecRevisions.id,
  modelId: modelSpecRevisions.modelId,
  revisionNo: modelSpecRevisions.revisionNo,
  state: modelSpecRevisions.state,
  rowVersion: modelSpecRevisions.rowVersion,
  schemaVersion: modelSpecRevisions.schemaVersion,
  sourceDocRef: modelSpecRevisions.sourceDocRef,
  contentSha256: modelSpecRevisions.contentSha256,
};

/** Locks the revision `FOR UPDATE`; null when it is not in the workspace. */
export async function lockRevision(tx: Tx, workspaceId: string, id: string): Promise<RevisionRow | null> {
  const [row] = await tx
    .select(revisionColumns)
    .from(modelSpecRevisions)
    .where(and(eq(modelSpecRevisions.workspaceId, workspaceId), eq(modelSpecRevisions.id, id)))
    .for('update');
  return (row as RevisionRow | undefined) ?? null;
}

export type CreateDraftResult = { ok: true; revision: RevisionRow } | { ok: false; code: 'not_found' | 'draft_exists' };

/** Creates the model's draft (`revision_no` = max + 1, `row_version` 1). Serialised per workspace + model. */
export async function createDraft(
  tx: Tx,
  input: { workspaceId: string; actorId: string; modelId: string; sourceDocRef: SourceDocRef },
): Promise<CreateDraftResult> {
  const { workspaceId, modelId } = input;
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`spec-draft:${workspaceId}:${modelId}`}, 0))`);
  const [model] = await tx
    .select({ id: equipmentModels.id })
    .from(equipmentModels)
    .where(and(eq(equipmentModels.workspaceId, workspaceId), eq(equipmentModels.id, modelId)))
    .for('share');
  if (!model) return { ok: false, code: 'not_found' };
  return insertDraft(tx, input);
}

async function insertDraft(
  tx: Tx,
  input: { workspaceId: string; actorId: string; modelId: string; sourceDocRef: SourceDocRef },
): Promise<CreateDraftResult> {
  const r = modelSpecRevisions;
  const [open] = await tx
    .select({ id: r.id })
    .from(r)
    .where(and(eq(r.workspaceId, input.workspaceId), eq(r.modelId, input.modelId), eq(r.state, 'draft')));
  if (open) return { ok: false, code: 'draft_exists' };
  const [max] = await tx
    .select({ n: sql<number>`coalesce(max(${r.revisionNo}), 0)::int` })
    .from(r)
    .where(and(eq(r.workspaceId, input.workspaceId), eq(r.modelId, input.modelId)));
  try {
    const [row] = await tx
      .insert(r)
      .values({
        workspaceId: input.workspaceId,
        modelId: input.modelId,
        revisionNo: (max?.n ?? 0) + 1,
        state: 'draft',
        sourceDocRef: input.sourceDocRef,
        schemaVersion: SPEC_SCHEMA_VERSION,
        createdBy: input.actorId,
      })
      .returning(revisionColumns);
    if (!row) throw new Error('spec draft insert returned no row');
    return { ok: true, revision: row as RevisionRow };
  } catch (error) {
    // A draft inserted outside the advisory lock (the open-draft index): the caller rolls the transaction back.
    if (isUniqueViolation(error)) return { ok: false, code: 'draft_exists' };
    throw error;
  }
}

const isUniqueViolation = (error: unknown): boolean => {
  const code = (e: unknown) => (e as { code?: string } | null)?.code;
  return code(error) === '23505' || code((error as { cause?: unknown } | null)?.cause) === '23505';
};

/** A new draft in the same transaction as the rejection of the one it replaces (the caller rejected it first). */
export async function createReplacementDraft(
  tx: Tx,
  input: { workspaceId: string; actorId: string; modelId: string; sourceDocRef: SourceDocRef },
): Promise<RevisionRow> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`spec-draft:${input.workspaceId}:${input.modelId}`}, 0))`);
  const result = await insertDraft(tx, input);
  if (!result.ok) throw new Error(`spec replace: ${result.code} after the old draft was rejected`);
  return result.revision;
}

/** The keys a draft already holds. */
export async function loadDraftIndex(tx: Tx, workspaceId: string, revisionId: string): Promise<DraftIndex> {
  const modules = await tx
    .select({ key: specModules.moduleKey })
    .from(specModules)
    .where(and(eq(specModules.workspaceId, workspaceId), eq(specModules.specRevId, revisionId)));
  const events = await tx
    .select({ moduleKey: specModules.moduleKey, key: specEvents.eventKey })
    .from(specEvents)
    .innerJoin(specModules, and(eq(specModules.workspaceId, specEvents.workspaceId), eq(specModules.id, specEvents.moduleId)))
    .where(and(eq(specEvents.workspaceId, workspaceId), eq(specEvents.specRevId, revisionId)));
  const sourceEvent = alias(specEvents, 'index_source_event');
  const targetEvent = alias(specEvents, 'index_target_event');
  const sourceModule = alias(specModules, 'index_source_module');
  const targetModule = alias(specModules, 'index_target_module');
  const relations = await tx
    .select({
      sourceModule: sourceModule.moduleKey,
      sourceEvent: sourceEvent.eventKey,
      predicate: specEventRelations.predicate,
      targetModule: targetModule.moduleKey,
      targetEvent: targetEvent.eventKey,
    })
    .from(specEventRelations)
    .innerJoin(
      sourceEvent,
      and(
        eq(sourceEvent.workspaceId, specEventRelations.workspaceId),
        eq(sourceEvent.specRevId, specEventRelations.specRevId),
        eq(sourceEvent.id, specEventRelations.sourceEventId),
      ),
    )
    .innerJoin(
      targetEvent,
      and(
        eq(targetEvent.workspaceId, specEventRelations.workspaceId),
        eq(targetEvent.specRevId, specEventRelations.specRevId),
        eq(targetEvent.id, specEventRelations.targetEventId),
      ),
    )
    .innerJoin(sourceModule, and(eq(sourceModule.workspaceId, sourceEvent.workspaceId), eq(sourceModule.id, sourceEvent.moduleId)))
    .innerJoin(targetModule, and(eq(targetModule.workspaceId, targetEvent.workspaceId), eq(targetModule.id, targetEvent.moduleId)))
    .where(and(eq(specEventRelations.workspaceId, workspaceId), eq(specEventRelations.specRevId, revisionId)));
  return {
    moduleKeys: new Set(modules.map((m) => m.key)),
    eventKeys: new Set(events.map((e) => qualifiedKey(e.moduleKey, e.key))),
    relationEdges: new Set(
      relations.map((r) => relationEdgeKey(qualifiedKey(r.sourceModule, r.sourceEvent), r.predicate, qualifiedKey(r.targetModule, r.targetEvent))),
    ),
  };
}

const CHUNK = 500;
async function inChunks<T>(values: T[], insert: (chunk: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < values.length; i += CHUNK) await insert(values.slice(i, i + CHUNK));
}

/** Inserts planned rows in dependency order. Parents and events of the draft are resolved from the database. */
export async function insertPlannedRows(
  tx: Tx,
  workspaceId: string,
  revisionId: string,
  plan: { modules: PlannedModule[]; events: PlannedEvent[]; relations: PlannedRelation[] },
): Promise<void> {
  // Existing ids by key (modules of the draft), extended by this call's own preassigned ids.
  const existingModules = await tx
    .select({ id: specModules.id, key: specModules.moduleKey })
    .from(specModules)
    .where(and(eq(specModules.workspaceId, workspaceId), eq(specModules.specRevId, revisionId)));
  const moduleIds = new Map(existingModules.map((m) => [m.key, m.id]));
  const newModules = plan.modules.map((m) => {
    const id = randomUUID();
    return { m, id };
  });
  for (const { m, id } of newModules) moduleIds.set(m.key, id);
  // `plan.modules` is sorted by depth, so a parent is inserted in this or an earlier chunk.
  await inChunks(newModules, (chunk) =>
    tx.insert(specModules).values(
      chunk.map(({ m, id }) => ({
        id,
        workspaceId,
        specRevId: revisionId,
        moduleKey: m.key,
        name: m.name,
        parentModuleId: m.parentKey === null ? null : (moduleIds.get(m.parentKey) ?? null),
      })),
    ),
  );

  const existingEvents = await tx
    .select({ id: specEvents.id, moduleKey: specModules.moduleKey, key: specEvents.eventKey })
    .from(specEvents)
    .innerJoin(specModules, and(eq(specModules.workspaceId, specEvents.workspaceId), eq(specModules.id, specEvents.moduleId)))
    .where(and(eq(specEvents.workspaceId, workspaceId), eq(specEvents.specRevId, revisionId)));
  const eventIds = new Map(existingEvents.map((e) => [qualifiedKey(e.moduleKey, e.key), e.id]));
  const newEvents = plan.events.map((e) => ({ e, id: randomUUID() }));
  for (const { e, id } of newEvents) eventIds.set(qualifiedKey(e.moduleKey, e.key), id);
  await inChunks(newEvents, (chunk) =>
    tx.insert(specEvents).values(
      chunk.map(({ e, id }) => ({
        id,
        workspaceId,
        specRevId: revisionId,
        moduleId: moduleIds.get(e.moduleKey) as string,
        eventKey: e.key,
        name: e.name,
        fieldsJson: e.fields,
        triggerRule: e.triggerRule,
        detailDocRef: e.detailDocRef,
      })),
    ),
  );

  await inChunks(plan.relations, (chunk) =>
    tx.insert(specEventRelations).values(
      chunk.map((r) => ({
        workspaceId,
        specRevId: revisionId,
        sourceEventId: eventIds.get(qualifiedKey(r.sourceModule, r.sourceEvent)) as string,
        predicate: r.predicate,
        targetEventId: eventIds.get(qualifiedKey(r.targetModule, r.targetEvent)) as string,
        ruleRef: r.ruleRef,
      })),
    ),
  );
}

export interface SpecCounts {
  modules: number;
  events: number;
  relations: number;
}

/** Reads the revision's stored rows and hashes them (the revision is locked by the caller). */
export async function hashRevision(
  tx: Tx,
  workspaceId: string,
  revision: RevisionRow,
): Promise<{ sha256: string; counts: SpecCounts }> {
  const modules = await tx
    .select()
    .from(specModules)
    .where(and(eq(specModules.workspaceId, workspaceId), eq(specModules.specRevId, revision.id)));
  const events = await tx
    .select()
    .from(specEvents)
    .where(and(eq(specEvents.workspaceId, workspaceId), eq(specEvents.specRevId, revision.id)));
  const relations = await tx
    .select()
    .from(specEventRelations)
    .where(and(eq(specEventRelations.workspaceId, workspaceId), eq(specEventRelations.specRevId, revision.id)));
  const moduleKey = new Map(modules.map((m) => [m.id, m.moduleKey]));
  const eventRef = new Map(events.map((e) => [e.id, { moduleKey: moduleKey.get(e.moduleId) as string, key: e.eventKey }]));
  const hashModules: HashModule[] = modules.map((m) => ({
    key: m.moduleKey,
    name: m.name,
    parentKey: m.parentModuleId === null ? null : (moduleKey.get(m.parentModuleId) as string),
  }));
  const hashEvents: HashEvent[] = events.map((e) => ({
    moduleKey: moduleKey.get(e.moduleId) as string,
    key: e.eventKey,
    name: e.name,
    fields: e.fieldsJson,
    triggerRule: e.triggerRule,
    detailDocRef: e.detailDocRef,
  }));
  const hashRelations: HashRelation[] = relations.map((x) => {
    const s = eventRef.get(x.sourceEventId) as { moduleKey: string; key: string };
    const t = eventRef.get(x.targetEventId) as { moduleKey: string; key: string };
    return {
      sourceModule: s.moduleKey,
      sourceEvent: s.key,
      predicate: x.predicate,
      targetModule: t.moduleKey,
      targetEvent: t.key,
      ruleRef: x.ruleRef,
    };
  });
  return {
    sha256: specContentHash(revision.schemaVersion, { modules: hashModules, events: hashEvents, relations: hashRelations }),
    counts: { modules: modules.length, events: events.length, relations: relations.length },
  };
}

/** The latest published revision of the model, if any. */
export async function latestPublished(
  tx: Tx,
  workspaceId: string,
  modelId: string,
): Promise<{ id: string; contentSha256: string | null } | null> {
  const r = modelSpecRevisions;
  const [row] = await tx
    .select({ id: r.id, contentSha256: r.contentSha256 })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.modelId, modelId), eq(r.state, 'published')))
    .orderBy(sql`${r.revisionNo} desc`)
    .limit(1);
  return row ?? null;
}

/** Draft save: bumps `row_version` (and may replace `source_doc_ref`). Returns the new version. */
export async function bumpDraft(
  tx: Tx,
  workspaceId: string,
  revision: RevisionRow,
  sourceDocRef: SourceDocRef | undefined,
): Promise<number> {
  const r = modelSpecRevisions;
  const [row] = await tx
    .update(r)
    .set({ rowVersion: revision.rowVersion + 1, ...(sourceDocRef ? { sourceDocRef } : {}) })
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, revision.id)))
    .returning({ rowVersion: r.rowVersion });
  if (!row) throw new Error('spec draft bump returned no row');
  return row.rowVersion;
}

/** Draft → rejected. Returns the new version. */
export async function rejectDraft(tx: Tx, workspaceId: string, revision: RevisionRow, reason: string): Promise<number> {
  const r = modelSpecRevisions;
  const [row] = await tx
    .update(r)
    .set({ state: 'rejected', rejectReason: reason, rowVersion: revision.rowVersion + 1 })
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, revision.id)))
    .returning({ rowVersion: r.rowVersion });
  if (!row) throw new Error('spec draft reject returned no row');
  return row.rowVersion;
}

/** Draft → published, sealed with the hash. Returns the new version. */
export async function sealDraft(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  revision: RevisionRow,
  sha256: string,
): Promise<number> {
  const r = modelSpecRevisions;
  const [row] = await tx
    .update(r)
    .set({
      state: 'published',
      contentSha256: sha256,
      publishedBy: actorId,
      publishedAt: sql`now()`,
      rowVersion: revision.rowVersion + 1,
    })
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, revision.id)))
    .returning({ rowVersion: r.rowVersion });
  if (!row) throw new Error('spec draft seal returned no row');
  return row.rowVersion;
}
