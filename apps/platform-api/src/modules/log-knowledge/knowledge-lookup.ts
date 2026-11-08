// Read port of the log knowledge catalog for other modules (log-lifecycle, #1444 c; docs 02 §Approved cross-module
// surfaces). Existence and activity of a model / software version, and the spec pin of the effective spec. Reads
// `knowledge.*` only, every statement scoped to the workspace; it writes nothing.

import { and, asc, eq, sql } from 'drizzle-orm';

import { equipmentModels, softwareVersions, vendors } from '../../db/schema/knowledge.js';
import type { DrizzleTx, Tx } from '../../db/tx.js';
import { isUnambiguousSegment, requirementKey } from './domain/requirement-key.js';
import { applySpecChanges } from './domain/spec-effective.js';
import { type SpecPin, changeSetDigest } from './domain/spec-pin.js';
import { lockModelChanges } from './repositories/spec-change.js';
import { textFilter } from './repositories/catalog-read.js';
import { getModelSpec, loadApplicableChanges } from './repositories/spec-read.js';

export type { SpecPin };

export interface KnowledgeModelRef {
  id: string;
  name: string;
  active: boolean;
}
export interface KnowledgeSoftwareRef {
  id: string;
  modelId: string;
  versionLabel: string;
  active: boolean;
}

/** A model as a picker option: ids and display text only. */
export interface KnowledgeModelOption {
  id: string;
  code: string;
  name: string;
  vendorName: string;
  active: boolean;
}
export interface KnowledgeSoftwareOption {
  id: string;
  versionLabel: string;
  name: string;
  active: boolean;
}

export interface EffectiveRequirement {
  /** `moduleKey` for a module, `moduleKey/eventKey` for an event, as stored. */
  key: string;
  kind: 'module' | 'event';
  moduleKey: string;
  eventKey?: string;
}
export type EffectiveRequirements =
  | { state: 'ok'; specPin: SpecPin; requirements: EffectiveRequirement[] }
  | { state: 'no_spec' | 'model_unknown'; specPin: null; requirements: [] }
  /** A module or event key of the effective spec is empty or contains `/`; `ambiguousKeys` lists them. */
  | { state: 'ambiguous_key'; specPin: SpecPin; requirements: []; ambiguousKeys: string[] };

export interface KnowledgeLookup {
  /** The model of the workspace; null when it does not exist there. */
  getModel(tx: Tx, workspaceId: string, modelId: string): Promise<KnowledgeModelRef | null>;
  /** The software version when it belongs to that model of the workspace; null otherwise. */
  getSoftware(tx: Tx, workspaceId: string, modelId: string, softwareId: string): Promise<KnowledgeSoftwareRef | null>;
  /**
   * Models of the workspace for a picker, searchable (`q`: code key prefix or name contains) and paged, ordered by code then id.
   * Like `getModel`, no model-level ACL exists in log-knowledge (reads are `platform:view`), so none is applied here (#1496).
   */
  listModels(tx: Tx, workspaceId: string, query: { q: string | null; page: number; pageSize: number }): Promise<{ rows: KnowledgeModelOption[]; total: number }>;
  /** Software versions of one model in release order; empty for an unknown model. */
  listSoftware(tx: Tx, workspaceId: string, modelId: string): Promise<KnowledgeSoftwareOption[]>;
  /** Null when the model has no published revision; else the revision and the digest of the applicable changes. */
  getEffectiveSpecPin(tx: Tx, workspaceId: string, modelId: string, softwareId: string | null): Promise<SpecPin | null>;
  /**
   * The requirement keys of the effective spec (published model spec revision + the changes applicable to the
   * software version; none = the revision as is) and the pin of that same state, read under the model lock. The caller
   * has verified the workspace and decides the permission; this port applies no ACL (see the module AGENTS.md).
   */
  listEffectiveRequirements(tx: Tx, workspaceId: string, modelId: string, softwareId: string | null): Promise<EffectiveRequirements>;
}

export const knowledgeLookup: KnowledgeLookup = {
  async getModel(tx, workspaceId, modelId) {
    const [row] = await tx
      .select({ id: equipmentModels.id, name: equipmentModels.name, active: equipmentModels.active })
      .from(equipmentModels)
      .where(and(eq(equipmentModels.workspaceId, workspaceId), eq(equipmentModels.id, modelId)));
    return row ?? null;
  },
  async getSoftware(tx, workspaceId, modelId, softwareId) {
    const s = softwareVersions;
    const [row] = await tx
      .select({ id: s.id, modelId: s.modelId, versionLabel: s.versionLabel, active: s.active })
      .from(s)
      .where(and(eq(s.workspaceId, workspaceId), eq(s.modelId, modelId), eq(s.id, softwareId)));
    return row ?? null;
  },
  async listModels(tx, workspaceId, { q, page, pageSize }) {
    const t = equipmentModels;
    const where = and(eq(t.workspaceId, workspaceId), textFilter(t.codeKey, t.name, q));
    const rows = await tx
      .select({ id: t.id, code: t.code, name: t.name, active: t.active, vendorName: vendors.name })
      .from(t)
      .innerJoin(vendors, and(eq(vendors.workspaceId, t.workspaceId), eq(vendors.id, t.vendorId)))
      .where(where)
      .orderBy(asc(t.codeKey), asc(t.id))
      .limit(pageSize)
      .offset(page * pageSize);
    const [total] = await tx.select({ n: sql<number>`count(*)::int` }).from(t).where(where);
    return { rows, total: total?.n ?? 0 };
  },
  async listSoftware(tx, workspaceId, modelId) {
    const s = softwareVersions;
    return tx
      .select({ id: s.id, versionLabel: s.versionLabel, name: s.name, active: s.active })
      .from(s)
      .where(and(eq(s.workspaceId, workspaceId), eq(s.modelId, modelId)))
      .orderBy(asc(s.releaseOrder), asc(s.id));
  },
  async getEffectiveSpecPin(tx, workspaceId, modelId, softwareId) {
    // The model lock publish and SW-change writes take: the revision and the change list below are read as one
    // committed state, never a revision of one moment with the changes of the next (review C1).
    await lockModelChanges(tx, workspaceId, modelId);
    const spec = await getModelSpec(tx, workspaceId, modelId);
    if (!spec) return null;
    let changes: Awaited<ReturnType<typeof loadApplicableChanges>> = [];
    if (softwareId !== null) {
      const s = softwareVersions;
      const [software] = await tx
        .select({ order: s.releaseOrder })
        .from(s)
        .where(and(eq(s.workspaceId, workspaceId), eq(s.modelId, modelId), eq(s.id, softwareId)));
      if (software) changes = await loadApplicableChanges(tx, workspaceId, modelId, software.order);
    }
    return { revisionId: spec.revision.id, changeSetDigest: changeSetDigest(changes) };
  },
  async listEffectiveRequirements(tx, workspaceId, modelId, softwareId) {
    // The snapshot guarantee needs the advisory lock to live until the last read: it is a transaction lock, so a
    // pool-backed `Db` is wrapped in its own transaction here instead of silently losing it (review C2).
    if (!isDrizzleTx(tx)) return tx.transaction((inner) => effectiveRequirementsInTx(inner, workspaceId, modelId, softwareId));
    return effectiveRequirementsInTx(tx, workspaceId, modelId, softwareId);
  },
};

/** A drizzle transaction handle has `rollback`; the pool-backed `Db` does not. */
function isDrizzleTx(tx: Tx): tx is DrizzleTx {
  return typeof (tx as { rollback?: unknown }).rollback === 'function';
}

async function effectiveRequirementsInTx(tx: Tx, workspaceId: string, modelId: string, softwareId: string | null): Promise<EffectiveRequirements> {
  // Lock first, then read everything (the requested software's release order included): a concurrent reorder can
  // otherwise leave the order of one moment next to the change list of another (review C1). Same lock as
  // `getEffectiveSpecPin`, so the pin below is derived from exactly the rows the keys come from.
  await lockModelChanges(tx, workspaceId, modelId);
  const unknown: EffectiveRequirements = { state: 'model_unknown', specPin: null, requirements: [] };
  const [model] = await tx
    .select({ id: equipmentModels.id })
    .from(equipmentModels)
    .where(and(eq(equipmentModels.workspaceId, workspaceId), eq(equipmentModels.id, modelId)));
  if (!model) return unknown;
  let softwareOrder: number | null = null;
  if (softwareId !== null) {
    const s = softwareVersions;
    const [software] = await tx
      .select({ order: s.releaseOrder })
      .from(s)
      .where(and(eq(s.workspaceId, workspaceId), eq(s.modelId, modelId), eq(s.id, softwareId)));
    if (!software) return unknown;
    softwareOrder = software.order;
  }
  const spec = await getModelSpec(tx, workspaceId, modelId);
  if (!spec) return { state: 'no_spec', specPin: null, requirements: [] };
  const changes = softwareOrder === null ? [] : await loadApplicableChanges(tx, workspaceId, modelId, softwareOrder);
  const specPin = { revisionId: spec.revision.id, changeSetDigest: changeSetDigest(changes) };
  const effective = applySpecChanges(spec, changes);
  const ambiguousKeys = [
    ...effective.modules.filter((m) => !isUnambiguousSegment(m.moduleKey)).map((m) => m.moduleKey),
    ...effective.events.filter((e) => !isUnambiguousSegment(e.moduleKey) || !isUnambiguousSegment(e.eventKey)).map((e) => `${e.moduleKey}/${e.eventKey}`),
  ];
  if (ambiguousKeys.length > 0) return { state: 'ambiguous_key', specPin, requirements: [], ambiguousKeys: [...new Set(ambiguousKeys)] };
  // Modules first, then events, each in the effective spec's own order (revision order, added entries last).
  const requirements: EffectiveRequirement[] = [
    ...effective.modules.map((m) => ({ key: requirementKey(m.moduleKey), kind: 'module' as const, moduleKey: m.moduleKey })),
    ...effective.events.map((e) => ({ key: requirementKey(e.moduleKey, e.eventKey), kind: 'event' as const, moduleKey: e.moduleKey, eventKey: e.eventKey })),
  ];
  return { state: 'ok', specPin, requirements };
}
