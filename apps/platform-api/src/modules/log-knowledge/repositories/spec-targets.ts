// The module / event targets of each model's CURRENT published spec revision, keyed by stable target key (#1196 e + f).
// Read-only, every statement scoped to the workspace. Two readers: `scanCurrentTargets` is the BOUNDED suggestion scan
// (it says when it stopped early), `resolveTargets` is the EXACT lookup of named keys — validation and `target_gone` /
// `gone` state use only the exact one, so a capped scan never fabricates a missing key. A revision that no longer holds a key is how a mapping or an Item
// subject becomes `target_gone`; a model without a published revision has no entry (`no_spec`).

import { and, desc, eq, inArray } from 'drizzle-orm';

import { modelSpecRevisions, specEvents, specModules } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import { buildTargetKey, parseTargetKey } from '../domain/spec-target-key.js';
import { type Viewer, ref, visibleModelSql } from './access-visibility.js';

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

/** Upper bound of modules / events one suggestion scan reads each, so a very large workspace cannot make a read unbounded. */
export const TARGET_SCAN_CAP = 50_000;

const fieldNames = (fieldsJson: unknown): string[] =>
  (Array.isArray(fieldsJson) ? fieldsJson : []).map((f) => String((f as { name?: unknown } | null)?.name ?? '')).filter((n) => n !== '');

interface CurrentRevision {
  revisionId: string;
  revisionNo: number;
}

/**
 * The current published revision of each model (every model of the workspace when `modelIds` is undefined). Uncapped: one row per model.
 * `viewer: null` is the exact key resolver (`resolveTargets`): its callers validate the model/owner access themselves before they ask (writes under `lockOwnerAccess`; the concept-mapping and Item-subject reads after their own `canSeeModel` / owner checks), so it adds no second rule. Every scan that lists models for a user passes a Viewer.
 */
async function currentRevisions(tx: Tx, workspaceId: string, modelIds: readonly string[] | undefined, viewer: Viewer | null): Promise<Map<string, CurrentRevision>> {
  const r = modelSpecRevisions;
  if (modelIds && modelIds.length === 0) return new Map();
  const rows = await tx
    .selectDistinctOn([r.modelId], { id: r.id, modelId: r.modelId, revisionNo: r.revisionNo })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.state, 'published'), modelIds ? inArray(r.modelId, [...modelIds]) : undefined, viewer ? visibleModelSql(viewer, ref(r.modelId)) : undefined))
    .orderBy(r.modelId, desc(r.revisionNo));
  return new Map(rows.map((x) => [x.modelId, { revisionId: x.id, revisionNo: x.revisionNo }]));
}

export interface TargetScan {
  models: Map<string, ModelTargets>;
  /** True when a cap stopped the read early: the scan is a partial view and a suggestion list built from it is incomplete. */
  truncated: boolean;
}

/**
 * The BOUNDED scan of every model's current targets, for suggestions only. Never use it to decide that a key is absent.
 * `viewer`: only the models that actor may see (#1504); required, so no caller can skip the rule.
 */
export async function scanCurrentTargets(tx: Tx, workspaceId: string, viewer: Viewer, cap: number = TARGET_SCAN_CAP): Promise<TargetScan> {
  const revisions = await currentRevisions(tx, workspaceId, undefined, viewer);
  const models = new Map<string, ModelTargets>();
  if (revisions.size === 0) return { models, truncated: false };
  const byRevision = new Map<string, string>();
  for (const [modelId, x] of revisions) {
    byRevision.set(x.revisionId, modelId);
    models.set(modelId, { ...x, targets: new Map() });
  }
  const ids = [...byRevision.keys()];
  const modules = await tx
    .select({ revId: specModules.specRevId, id: specModules.id, key: specModules.moduleKey, name: specModules.name })
    .from(specModules)
    .where(and(eq(specModules.workspaceId, workspaceId), inArray(specModules.specRevId, ids)))
    .limit(cap + 1);
  const moduleKey = new Map<string, string>();
  for (const m of modules.slice(0, cap)) {
    moduleKey.set(m.id, m.key);
    models.get(byRevision.get(m.revId) as string)?.targets.set(buildTargetKey({ kind: 'module', module: m.key }), { kind: 'module', name: m.name, fields: [] });
  }
  // Events need their module's key; a module outside the cap leaves its events out, which the flag already reports.
  const events = await tx
    .select({ revId: specEvents.specRevId, moduleId: specEvents.moduleId, key: specEvents.eventKey, name: specEvents.name, fields: specEvents.fieldsJson })
    .from(specEvents)
    .where(and(eq(specEvents.workspaceId, workspaceId), inArray(specEvents.specRevId, ids)))
    .limit(cap + 1);
  for (const e of events.slice(0, cap)) {
    const module = moduleKey.get(e.moduleId);
    if (module === undefined) continue;
    models
      .get(byRevision.get(e.revId) as string)
      ?.targets.set(buildTargetKey({ kind: 'event', module, event: e.key }), { kind: 'event', name: e.name, fields: fieldNames(e.fields) });
  }
  return { models, truncated: modules.length > cap || events.length > cap };
}

export interface TargetRef {
  modelId: string;
  targetKind: string;
  targetKey: string;
}
export interface ResolvedTargets {
  /** A model without a published revision has no entry (`no_spec`). */
  revisions: Map<string, CurrentRevision>;
  /** The named target in its model's CURRENT published revision; undefined when the revision does not hold that kind + key. */
  get(modelId: string, targetKind: string, targetKey: string): SpecTarget | undefined;
}

const refId = (modelId: string, kind: string, key: string): string => `${modelId}\u0000${kind}\u0000${key}`;

/**
 * EXACT lookup of the named module / event keys in each model's current published revision: workspace + revision + key
 * statements with no row cap, so a spec of any size answers the same. Model ids are canonical (lower-case) in the result.
 * A ref whose key is not of its kind's shape, or whose kind is not module / event, is absent.
 */
export async function resolveTargets(tx: Tx, workspaceId: string, refs: readonly TargetRef[]): Promise<ResolvedTargets> {
  const wanted = refs.map((x) => ({ ...x, modelId: x.modelId.toLowerCase() }));
  const revisions = await currentRevisions(tx, workspaceId, [...new Set(wanted.map((x) => x.modelId))], null);
  const found = new Map<string, SpecTarget>();
  for (const [modelId, rev] of revisions) {
    const moduleKeys = new Set<string>();
    const eventKeys: { module: string; event: string }[] = [];
    for (const x of wanted) {
      if (x.modelId !== modelId) continue;
      const ref = x.targetKind === 'module' || x.targetKind === 'event' ? parseTargetKey(x.targetKind, x.targetKey) : null;
      if (ref?.kind === 'module') moduleKeys.add(ref.module);
      else if (ref?.kind === 'event') eventKeys.push({ module: ref.module, event: ref.event });
    }
    if (moduleKeys.size > 0) {
      const rows = await tx
        .select({ key: specModules.moduleKey, name: specModules.name })
        .from(specModules)
        .where(and(eq(specModules.workspaceId, workspaceId), eq(specModules.specRevId, rev.revisionId), inArray(specModules.moduleKey, [...moduleKeys])));
      for (const m of rows) found.set(refId(modelId, 'module', buildTargetKey({ kind: 'module', module: m.key })), { kind: 'module', name: m.name, fields: [] });
    }
    if (eventKeys.length > 0) {
      const rows = await tx
        .select({ module: specModules.moduleKey, key: specEvents.eventKey, name: specEvents.name, fields: specEvents.fieldsJson })
        .from(specEvents)
        .innerJoin(specModules, and(eq(specModules.workspaceId, specEvents.workspaceId), eq(specModules.specRevId, specEvents.specRevId), eq(specModules.id, specEvents.moduleId)))
        .where(
          and(
            eq(specEvents.workspaceId, workspaceId),
            eq(specEvents.specRevId, rev.revisionId),
            inArray(specModules.moduleKey, [...new Set(eventKeys.map((x) => x.module))]),
            inArray(specEvents.eventKey, [...new Set(eventKeys.map((x) => x.event))]),
          ),
        );
      for (const e of rows) {
        found.set(refId(modelId, 'event', buildTargetKey({ kind: 'event', module: e.module, event: e.key })), { kind: 'event', name: e.name, fields: fieldNames(e.fields) });
      }
    }
  }
  return { revisions, get: (modelId, kind, key) => found.get(refId(modelId.toLowerCase(), kind, key)) };
}
