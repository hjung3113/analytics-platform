// The module / event targets of each model's CURRENT published spec revision, keyed by stable target key (#1196 e + f).
// Read-only, every statement scoped to the workspace. A revision that no longer holds a key is how a mapping or an Item
// subject becomes `target_gone`; a model without a published revision has no entry (`no_spec`).

import { and, desc, eq, inArray } from 'drizzle-orm';

import { modelSpecRevisions, specEvents, specModules } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { buildTargetKey } from '../domain/spec-target-key.js';

export interface SpecTarget {
  kind: 'module' | 'event';
  name: string;
  /** Field names of an event; empty for a module. */
  fields: string[];
}
export interface ModelTargets {
  revisionId: string;
  revisionNo: number;
  targets: Map<string, SpecTarget>;
}

/** Upper bound of targets one suggestion scan reads, so a very large workspace cannot make a read unbounded. */
export const TARGET_SCAN_CAP = 50_000;

const fieldNames = (fieldsJson: unknown): string[] =>
  (Array.isArray(fieldsJson) ? fieldsJson : []).map((f) => String((f as { name?: unknown } | null)?.name ?? '')).filter((n) => n !== '');

/** `modelIds` undefined = every model of the workspace (the suggestion scan). */
export async function loadCurrentTargets(tx: Tx, workspaceId: string, modelIds?: readonly string[]): Promise<Map<string, ModelTargets>> {
  const out = new Map<string, ModelTargets>();
  if (modelIds && modelIds.length === 0) return out;
  const r = modelSpecRevisions;
  const revisions = await tx
    .selectDistinctOn([r.modelId], { id: r.id, modelId: r.modelId, revisionNo: r.revisionNo })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.state, 'published'), modelIds ? inArray(r.modelId, [...modelIds]) : undefined))
    .orderBy(r.modelId, desc(r.revisionNo));
  if (revisions.length === 0) return out;
  const byRevision = new Map(revisions.map((x) => [x.id, x.modelId]));
  for (const x of revisions) out.set(x.modelId, { revisionId: x.id, revisionNo: x.revisionNo, targets: new Map() });
  const ids = revisions.map((x) => x.id);
  const modules = await tx
    .select({ revId: specModules.specRevId, id: specModules.id, key: specModules.moduleKey, name: specModules.name })
    .from(specModules)
    .where(and(eq(specModules.workspaceId, workspaceId), inArray(specModules.specRevId, ids)))
    .limit(TARGET_SCAN_CAP);
  const moduleKey = new Map<string, string>();
  for (const m of modules) {
    moduleKey.set(m.id, m.key);
    out.get(byRevision.get(m.revId) as string)?.targets.set(buildTargetKey({ kind: 'module', module: m.key }), { kind: 'module', name: m.name, fields: [] });
  }
  const events = await tx
    .select({ revId: specEvents.specRevId, moduleId: specEvents.moduleId, key: specEvents.eventKey, name: specEvents.name, fields: specEvents.fieldsJson })
    .from(specEvents)
    .where(and(eq(specEvents.workspaceId, workspaceId), inArray(specEvents.specRevId, ids)))
    .limit(TARGET_SCAN_CAP);
  for (const e of events) {
    const module = moduleKey.get(e.moduleId);
    if (module === undefined) continue;
    out
      .get(byRevision.get(e.revId) as string)
      ?.targets.set(buildTargetKey({ kind: 'event', module, event: e.key }), { kind: 'event', name: e.name, fields: fieldNames(e.fields) });
  }
  return out;
}

/** The current targets of one model; null when it has no published revision. */
export async function currentTargetsOf(tx: Tx, workspaceId: string, modelId: string): Promise<ModelTargets | null> {
  return (await loadCurrentTargets(tx, workspaceId, [modelId])).get(modelId) ?? null;
}
