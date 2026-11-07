// Read port of the log knowledge catalog for other modules (log-lifecycle, #1444 c; docs 02 §Approved cross-module
// surfaces). Existence and activity of a model / software version, and the spec pin of the effective spec. Reads
// `knowledge.*` only, every statement scoped to the workspace; it writes nothing.

import { and, eq } from 'drizzle-orm';

import { equipmentModels, softwareVersions } from '../../db/schema/knowledge.js';
import type { Tx } from '../../db/tx.js';
import { type SpecPin, changeSetDigest } from './domain/spec-pin.js';
import { lockModelChanges } from './repositories/spec-change.js';
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

export interface KnowledgeLookup {
  /** The model of the workspace; null when it does not exist there. */
  getModel(tx: Tx, workspaceId: string, modelId: string): Promise<KnowledgeModelRef | null>;
  /** The software version when it belongs to that model of the workspace; null otherwise. */
  getSoftware(tx: Tx, workspaceId: string, modelId: string, softwareId: string): Promise<KnowledgeSoftwareRef | null>;
  /** Null when the model has no published revision; else the revision and the digest of the applicable changes. */
  getEffectiveSpecPin(tx: Tx, workspaceId: string, modelId: string, softwareId: string | null): Promise<SpecPin | null>;
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
};
