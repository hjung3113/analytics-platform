// Concept mapping storage (#1196 e, design v0.6 §15.4): `knowledge.common_concept` and `knowledge.spec_concept_mapping`
// only, every statement scoped to the actor's workspace, no delete. The caller owns the transaction and the audit row.
// LOCK ORDER: the models' concept advisory locks (sorted by id), then mapping rows. Equivalence is human-confirmed only:
// `findEquivalents` reads `confirmed` + `equivalent` rows and nothing else — a proposal, a rejected row, a `related`
// row or a same name never joins.

import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { commonConcepts, equipmentModels, specConceptMappings } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import type { SimilarityBasis } from '../domain/concept-similarity.js';
import { type Viewer, canSeeModel, ref, visibleModelSql } from './access-visibility.js';
import { enqueueConceptChange } from './search-outbox.js';
import { resolveTargets } from './spec-targets.js';

const m = specConceptMappings;
const k = commonConcepts;

export interface ConceptRow {
  id: string;
  kind: string;
  canonicalLabel: string;
  labelKey: string;
}
export interface MappingRow {
  id: string;
  conceptId: string;
  modelId: string;
  targetKind: string;
  targetKey: string;
  relationKind: string;
  reviewState: string;
  rowVersion: number;
}

const mappingColumns = {
  id: m.id,
  conceptId: m.conceptId,
  modelId: m.modelId,
  targetKind: m.targetKind,
  targetKey: m.targetKey,
  relationKind: m.relationKind,
  reviewState: m.reviewState,
  rowVersion: m.rowVersion,
};

/** One lock per model for propose / confirm. Ids go in canonical (lower-case) spelling: the key hashes the text. */
export async function lockModelConcepts(tx: Tx, workspaceId: string, modelIds: readonly string[]): Promise<void> {
  for (const id of [...new Set(modelIds.map((x) => x.toLowerCase()))].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`spec-concept:${workspaceId.toLowerCase()}:${id}`}, 0))`);
  }
}

export async function mappingModelId(tx: Tx, viewer: Viewer, id: string): Promise<string | null> {
  const [row] = await tx.select({ modelId: m.modelId }).from(m).where(and(eq(m.workspaceId, viewer.workspaceId), eq(m.id, id)));
  // A mapping of a hidden model is not found (#1504).
  return row && (await canSeeModel(tx, viewer, row.modelId)) ? row.modelId : null;
}

export async function lockMapping(tx: Tx, viewer: Viewer, id: string): Promise<MappingRow | null> {
  const [row] = await tx.select(mappingColumns).from(m).where(and(eq(m.workspaceId, viewer.workspaceId), eq(m.id, id))).for('update');
  if (!row || !(await canSeeModel(tx, viewer, row.modelId))) return null;
  return row;
}

export async function conceptById(tx: Tx, workspaceId: string, id: string): Promise<ConceptRow | null> {
  const [row] = await tx
    .select({ id: k.id, kind: k.kind, canonicalLabel: k.canonicalLabel, labelKey: k.labelKey })
    .from(k)
    .where(and(eq(k.workspaceId, workspaceId), eq(k.id, id)));
  return row ?? null;
}

/** Create-or-pick by (kind, label key): a concept row asserts nothing, so reusing one is always safe. */
export async function pickOrCreateConcept(
  tx: Tx,
  values: { workspaceId: string; actorId: string; kind: string; canonicalLabel: string; labelKey: string; description: string | null },
): Promise<ConceptRow> {
  await tx
    .insert(k)
    .values({
      workspaceId: values.workspaceId,
      kind: values.kind,
      canonicalLabel: values.canonicalLabel,
      labelKey: values.labelKey,
      description: values.description,
      createdBy: values.actorId,
    })
    .onConflictDoNothing({ target: [k.workspaceId, k.kind, k.labelKey] });
  const [row] = await tx
    .select({ id: k.id, kind: k.kind, canonicalLabel: k.canonicalLabel, labelKey: k.labelKey })
    .from(k)
    .where(and(eq(k.workspaceId, values.workspaceId), eq(k.kind, values.kind), eq(k.labelKey, values.labelKey)));
  if (!row) throw new Error('concept pick-or-create returned no row');
  return row;
}

/** The row of this exact pair in any state (the unique indexes allow one open row or one rejected row per pair). */
export async function pairRow(tx: Tx, workspaceId: string, conceptId: string, modelId: string, targetKey: string): Promise<{ id: string; reviewState: string } | null> {
  const [row] = await tx
    .select({ id: m.id, reviewState: m.reviewState })
    .from(m)
    .where(and(eq(m.workspaceId, workspaceId), eq(m.conceptId, conceptId), eq(m.modelId, modelId), eq(m.targetKey, targetKey)));
  return row ?? null;
}

export async function insertMapping(
  tx: Tx,
  values: {
    workspaceId: string;
    actorId: string;
    conceptId: string;
    modelId: string;
    targetKind: string;
    targetKey: string;
    relationKind: string;
    similarity: { score: number; basis: SimilarityBasis } | null;
  },
): Promise<string> {
  const [row] = await tx
    .insert(m)
    .values({
      workspaceId: values.workspaceId,
      conceptId: values.conceptId,
      modelId: values.modelId,
      targetKind: values.targetKind,
      targetKey: values.targetKey,
      relationKind: values.relationKind,
      reviewState: 'proposed',
      origin: values.similarity ? 'similarity' : 'human',
      similarityScore: values.similarity?.score ?? null,
      similarityBasis: values.similarity?.basis ?? null,
      proposedBy: values.actorId,
    })
    .returning({ id: m.id });
  if (!row) throw new Error('concept mapping insert returned no row');
  return row.id;
}

/** Whether another row already holds the one confirmed `equivalent` place of this target. */
export async function hasConfirmedEquivalent(tx: Tx, workspaceId: string, modelId: string, targetKey: string, excludeId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: m.id })
    .from(m)
    .where(
      and(eq(m.workspaceId, workspaceId), eq(m.modelId, modelId), eq(m.targetKey, targetKey), eq(m.reviewState, 'confirmed'), eq(m.relationKind, 'equivalent')),
    );
  return rows.some((r) => r.id !== excludeId);
}

/** proposed → confirmed or rejected, confirmed → rejected. Returns the new version. */
export async function reviewMapping(
  tx: Tx,
  workspaceId: string,
  row: MappingRow,
  actorId: string,
  next: { state: 'confirmed' } | { state: 'rejected'; reason: string },
): Promise<number> {
  const [out] = await tx
    .update(m)
    .set({
      reviewState: next.state,
      rejectReason: next.state === 'rejected' ? next.reason : null,
      reviewedBy: actorId,
      reviewedAt: sql`now()`,
      rowVersion: row.rowVersion + 1,
    })
    .where(and(eq(m.workspaceId, workspaceId), eq(m.id, row.id)))
    .returning({ rowVersion: m.rowVersion });
  if (!out) throw new Error('concept mapping review returned no row');
  await enqueueConceptChange(tx, workspaceId, row.conceptId); // #1506: the Items that name a target of this concept
  return out.rowVersion;
}

export interface EquivalentTarget {
  conceptId: string;
  modelId: string;
  targetKind: string;
  targetKey: string;
}

/**
 * The targets a human has confirmed to be the SAME concept as (modelId, targetKey): the other `confirmed` +
 * `equivalent` rows of that target's concept. Nothing else counts — not a proposal (whatever its similarity score), not
 * a rejected row, not a `related` row, and never a shared name. For search and cross-model reads.
 */
export async function findEquivalents(tx: Tx, workspaceId: string, modelId: string, targetKey: string, viewer?: Viewer): Promise<EquivalentTarget[]> {
  const mine = alias(specConceptMappings, 'mine');
  return tx
    .select({ conceptId: m.conceptId, modelId: m.modelId, targetKind: m.targetKind, targetKey: m.targetKey })
    .from(m)
    .innerJoin(
      mine,
      and(
        eq(mine.workspaceId, m.workspaceId),
        eq(mine.conceptId, m.conceptId),
        eq(mine.modelId, modelId),
        eq(mine.targetKey, targetKey),
        eq(mine.reviewState, 'confirmed'),
        eq(mine.relationKind, 'equivalent'),
      ),
    )
    .where(and(eq(m.workspaceId, workspaceId), eq(m.reviewState, 'confirmed'), eq(m.relationKind, 'equivalent'), sql`${m.id} <> ${mine.id}`, viewer ? visibleModelSql(viewer, ref(m.modelId)) : undefined))
    .orderBy(asc(m.modelId), asc(m.targetKey));
}

export interface ConceptMappingFilters {
  modelId?: string;
  conceptId?: string;
  reviewState?: string;
  kind?: string;
}
export interface ConceptMappingView {
  id: string;
  conceptId: string;
  conceptLabel: string;
  kind: string;
  modelId: string;
  modelName: string;
  targetKind: string;
  targetKey: string;
  /** The target's display name in the model's current published spec; null when it is gone. */
  targetName: string | null;
  /** `target_gone`: the current published revision no longer holds the key (the row is kept, never deleted). */
  targetState: 'present' | 'target_gone';
  relationKind: string;
  reviewState: string;
  origin: string;
  similarityScore: number | null;
  similarityBasis: unknown;
  rejectReason: string | null;
  proposedBy: string;
  proposedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** `row_version`: the `expectedVersion` of confirm / reject. */
  version: number;
}

export async function listConceptMappings(
  tx: Tx,
  viewer: Viewer,
  workspaceId: string,
  filters: ConceptMappingFilters,
  paging: { page: number; pageSize: number },
): Promise<{ total: number; rows: ConceptMappingView[] }> {
  const where = and(
    eq(m.workspaceId, workspaceId),
    visibleModelSql(viewer, ref(m.modelId)),
    filters.modelId ? eq(m.modelId, filters.modelId) : undefined,
    filters.conceptId ? eq(m.conceptId, filters.conceptId) : undefined,
    filters.reviewState ? eq(m.reviewState, filters.reviewState) : undefined,
    filters.kind ? eq(m.targetKind, filters.kind) : undefined,
  );
  const rows = await tx
    .select({ row: m, conceptLabel: k.canonicalLabel, modelName: equipmentModels.name })
    .from(m)
    .innerJoin(k, and(eq(k.workspaceId, m.workspaceId), eq(k.id, m.conceptId)))
    .innerJoin(equipmentModels, and(eq(equipmentModels.workspaceId, m.workspaceId), eq(equipmentModels.id, m.modelId)))
    .where(where)
    .orderBy(desc(m.proposedAt), asc(m.id))
    .limit(paging.pageSize)
    .offset(paging.page * paging.pageSize);
  const [totalRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(m).where(where);
  // EXACT lookup of the listed rows' keys: a spec of any size answers `target_gone` only when the key is really not there.
  const targets = await resolveTargets(tx, workspaceId, rows.map((r) => ({ modelId: r.row.modelId, targetKind: r.row.targetKind, targetKey: r.row.targetKey })));
  return {
    total: totalRow?.n ?? 0,
    rows: rows.map(({ row, conceptLabel, modelName }) => {
      const target = targets.get(row.modelId, row.targetKind, row.targetKey);
      return {
        id: row.id,
        conceptId: row.conceptId,
        conceptLabel,
        kind: row.targetKind,
        modelId: row.modelId,
        modelName,
        targetKind: row.targetKind,
        targetKey: row.targetKey,
        targetName: target?.name ?? null,
        targetState: target ? ('present' as const) : ('target_gone' as const),
        relationKind: row.relationKind,
        reviewState: row.reviewState,
        origin: row.origin,
        similarityScore: row.similarityScore,
        similarityBasis: row.similarityBasis,
        rejectReason: row.rejectReason,
        proposedBy: row.proposedBy,
        proposedAt: row.proposedAt.toISOString(),
        reviewedBy: row.reviewedBy,
        reviewedAt: row.reviewedAt ? row.reviewedAt.toISOString() : null,
        version: row.rowVersion,
      };
    }),
  };
}

export interface DecidedMember {
  conceptId: string;
  modelId: string;
  targetKey: string;
  reviewState: string;
  relationKind: string;
}

/**
 * The stored decisions the suggestion scan must respect, for the given models: every `confirmed` + `equivalent` row, and
 * every row (any state) of a concept that holds a `rejected` row — so a rejection also hides the pair it was judged
 * with. A pair a human has decided is not proposed again; a genuinely different association still is.
 */
export async function decidedMembers(tx: Tx, workspaceId: string, modelIds: readonly string[]): Promise<DecidedMember[]> {
  if (modelIds.length === 0) return [];
  const rejectedConcepts = tx.select({ id: m.conceptId }).from(m).where(and(eq(m.workspaceId, workspaceId), eq(m.reviewState, 'rejected')));
  return tx
    .select({ conceptId: m.conceptId, modelId: m.modelId, targetKey: m.targetKey, reviewState: m.reviewState, relationKind: m.relationKind })
    .from(m)
    .where(
      and(
        eq(m.workspaceId, workspaceId),
        inArray(m.modelId, [...modelIds]),
        or(and(eq(m.reviewState, 'confirmed'), eq(m.relationKind, 'equivalent')), inArray(m.conceptId, rejectedConcepts)),
      ),
    );
}
