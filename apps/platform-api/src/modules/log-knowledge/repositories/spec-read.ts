// Read side of the model spec (design v0.6 §15, #1196 a): `knowledge.*` tables only, every statement scoped to the
// session's workspace. `modelSpec` returns the latest published revision and nothing of a draft or rejected one;
// `modelSpecRevisions` lists every revision's header (a draft shows up as a row, its content never does).

import { and, asc, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import {
  modelSpecRevisions,
  softwareVersions,
  specEventRelations,
  specEvents,
  specModules,
  specSwChanges,
} from '../../../db/schema/knowledge.js';
import { type EffectiveChange, type EffectiveSpec, applySpecChanges, maskChangeMarks } from '../domain/spec-effective.js';
import { appliesAt } from '../domain/spec-range.js';
import type { SpecChangeKind } from '../domain/spec-effective.js';
import type { SpecTargetKind } from '../domain/spec-target-key.js';
import type { Tx } from '../../../db/tx.js';
import { type Viewer, ref, visibleModelSql, visibleSoftwareSql } from './access-visibility.js';
import type { Page } from './catalog-read.js';

export interface SpecRevisionHeader {
  id: string;
  revisionNo: number;
  state: string;
  publishedAt: string | null;
  publishedBy: string | null;
  contentSha256: string | null;
  eventCount: number;
  /** `row_version`: the `expectedVersion` of a draft write (a non-draft's value is never accepted). */
  version: number;
}
export interface SpecContent {
  /** Flat list; the tree is `parentModuleId` (null = a root module). */
  modules: { id: string; moduleKey: string; name: string; parentModuleId: string | null }[];
  events: {
    id: string;
    moduleId: string;
    eventKey: string;
    name: string;
    fields: unknown;
    triggerRule: string | null;
    detailDocRef: string | null;
  }[];
  relations: { id: string; sourceEventId: string; predicate: string; targetEventId: string; ruleRef: string | null }[];
}
export interface ModelSpecData {
  revision: {
    id: string;
    modelId: string;
    revisionNo: number;
    state: 'published';
    schemaVersion: number;
    sourceDocRef: unknown;
    contentSha256: string | null;
    publishedAt: string | null;
    publishedBy: string | null;
  };
  /** Flat list; the tree is `parentModuleId` (null = a root module). */
  modules: { id: string; moduleKey: string; name: string; parentModuleId: string | null }[];
  events: {
    id: string;
    moduleId: string;
    eventKey: string;
    name: string;
    fields: unknown;
    triggerRule: string | null;
    detailDocRef: string | null;
  }[];
  relations: { id: string; sourceEventId: string; predicate: string; targetEventId: string; ruleRef: string | null }[];
}

const iso = (value: Date | null): string | null => (value ? value.toISOString() : null);

/** The model's latest published revision with its modules, events and relations; null when it has none (or the model is not in the workspace). */
export async function getModelSpec(tx: Tx, workspaceId: string, modelId: string): Promise<ModelSpecData | null> {
  const r = modelSpecRevisions;
  const [rev] = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.modelId, modelId), eq(r.state, 'published')))
    .orderBy(desc(r.revisionNo))
    .limit(1);
  if (!rev) return null;
  const content = await loadSpecContent(tx, workspaceId, rev.id);
  return {
    revision: {
      id: rev.id,
      modelId: rev.modelId,
      revisionNo: rev.revisionNo,
      state: 'published',
      schemaVersion: rev.schemaVersion,
      sourceDocRef: rev.sourceDocRef,
      contentSha256: rev.contentSha256,
      publishedAt: iso(rev.publishedAt),
      publishedBy: rev.publishedBy,
    },
    ...content,
  };
}

/** The modules, events and relations of one revision (any state; the caller decides who may see a draft). */
export async function loadSpecContent(tx: Tx, workspaceId: string, revisionId: string): Promise<SpecContent> {
  const [modules, events, relations] = await Promise.all([
    tx
      .select()
      .from(specModules)
      .where(and(eq(specModules.workspaceId, workspaceId), eq(specModules.specRevId, revisionId)))
      .orderBy(asc(specModules.moduleKey), asc(specModules.id)),
    tx
      .select()
      .from(specEvents)
      .where(and(eq(specEvents.workspaceId, workspaceId), eq(specEvents.specRevId, revisionId)))
      .orderBy(asc(specEvents.eventKey), asc(specEvents.id)),
    tx
      .select()
      .from(specEventRelations)
      .where(and(eq(specEventRelations.workspaceId, workspaceId), eq(specEventRelations.specRevId, revisionId)))
      .orderBy(asc(specEventRelations.predicate), asc(specEventRelations.id)),
  ]);
  return {
    modules: modules.map((m) => ({ id: m.id, moduleKey: m.moduleKey, name: m.name, parentModuleId: m.parentModuleId })),
    events: events.map((e) => ({
      id: e.id,
      moduleId: e.moduleId,
      eventKey: e.eventKey,
      name: e.name,
      fields: e.fieldsJson,
      triggerRule: e.triggerRule,
      detailDocRef: e.detailDocRef,
    })),
    relations: relations.map((x) => ({
      id: x.id,
      sourceEventId: x.sourceEventId,
      predicate: x.predicate,
      targetEventId: x.targetEventId,
      ruleRef: x.ruleRef,
    })),
  };
}

export interface SpecDraftData {
  revision: {
    id: string;
    modelId: string;
    revisionNo: number;
    state: 'draft';
    schemaVersion: number;
    sourceDocRef: unknown;
    version: number;
    createdAt: string;
    createdBy: string;
  };
  modules: SpecContent['modules'];
  events: SpecContent['events'];
  relations: SpecContent['relations'];
}

/** A draft revision with its rows; null when the id is not a draft of the workspace (published and rejected revisions are not served here). */
export async function getSpecDraft(tx: Tx, viewer: Viewer, revisionId: string): Promise<SpecDraftData | null> {
  const r = modelSpecRevisions;
  const workspaceId = viewer.workspaceId;
  const [rev] = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, revisionId), eq(r.state, 'draft'), visibleModelSql(viewer, ref(r.modelId))));
  if (!rev) return null;
  const content = await loadSpecContent(tx, workspaceId, rev.id);
  return {
    revision: {
      id: rev.id,
      modelId: rev.modelId,
      revisionNo: rev.revisionNo,
      state: 'draft',
      schemaVersion: rev.schemaVersion,
      sourceDocRef: rev.sourceDocRef,
      version: rev.rowVersion,
      createdAt: rev.createdAt.toISOString(),
      createdBy: rev.createdBy,
    },
    ...content,
  };
}

/** Revision headers of one model, newest revision first; `eventCount` counts the events a revision holds (0 for a draft not filled yet). */
export async function listModelSpecRevisions(
  tx: Tx,
  workspaceId: string,
  modelId: string,
  paging: { page: number; pageSize: number },
): Promise<Page<SpecRevisionHeader>> {
  const r = modelSpecRevisions;
  const where = and(eq(r.workspaceId, workspaceId), eq(r.modelId, modelId));
  // Written out on purpose: drizzle prints `${column}` without its table in a single-table select, which would bind to the inner `e`.
  const eventCount = sql<number>`(select count(*)::int from ${specEvents} e where e.workspace_id = "knowledge"."model_spec_revision"."workspace_id" and e.spec_rev_id = "knowledge"."model_spec_revision"."id")`;
  const rows = await tx
    .select({ row: r, eventCount })
    .from(r)
    .where(where)
    .orderBy(desc(r.revisionNo))
    .limit(paging.pageSize)
    .offset(paging.page * paging.pageSize);
  const [totalRow] = await tx.select({ n: sql<number>`count(*)::int` }).from(r).where(where);
  return {
    total: totalRow?.n ?? 0,
    rows: rows.map(({ row, eventCount: count }) => ({
      id: row.id,
      revisionNo: row.revisionNo,
      state: row.state,
      publishedAt: iso(row.publishedAt),
      publishedBy: row.publishedBy,
      contentSha256: row.contentSha256,
      eventCount: count,
      version: row.rowVersion,
    })),
  };
}

// ---- effective spec (#1196 c) ------------------------------------------------------------------------------------

/** `modelSpec` with a `softwareId`: the published revision with the changes that apply to that version (no change = the model spec as is). */
export type EffectiveModelSpecData =
  | (ModelSpecData & { effective: false })
  | ({ revision: ModelSpecData['revision']; effective: true; softwareId: string } & EffectiveSpec);

/** The open changes of a model that apply at one software release order, in apply order `(start order, created_at, id)`. */
export async function loadApplicableChanges(
  tx: Tx,
  workspaceId: string,
  modelId: string,
  softwareOrder: number,
): Promise<EffectiveChange[]> {
  const c = specSwChanges;
  const end = alias(softwareVersions, 'end_sw');
  // Every open change of the model (bounded by the per-model cap); the range is judged here against the CURRENT order.
  // The apply order `(start order, created_at, id)` is sorted in SQL: `created_at` is a full-precision timestamptz and
  // a JS Date/ISO round trip keeps only milliseconds, which would collapse a submillisecond tie onto the id order.
  const rows = await tx
    .select({
      id: c.id, targetKind: c.targetKind, targetKey: c.targetKey, changeKind: c.changeKind, change: c.changeJson,
      needsRevalidation: c.needsRevalidation, start: softwareVersions.releaseOrder, endBefore: end.releaseOrder,
    })
    .from(c)
    .innerJoin(softwareVersions, and(eq(softwareVersions.workspaceId, c.workspaceId), eq(softwareVersions.id, c.softwareId)))
    .leftJoin(end, and(eq(end.workspaceId, c.workspaceId), eq(end.id, c.endsBeforeSoftwareId)))
    .where(and(eq(c.workspaceId, workspaceId), eq(c.modelId, modelId), isNull(c.retiredAt)))
    .orderBy(asc(softwareVersions.releaseOrder), asc(c.createdAt), asc(c.id));
  const applicable = rows.filter((r) => appliesAt({ start: r.start, endBefore: r.endBefore }, softwareOrder));
  return applicable.map((r) => ({
    id: r.id,
    targetKind: r.targetKind as SpecTargetKind,
    targetKey: r.targetKey,
    changeKind: r.changeKind as SpecChangeKind,
    change: (r.change ?? {}) as Record<string, unknown>,
    needsRevalidation: r.needsRevalidation,
  }));
}

/** Ids among `changeIds` whose start SW version the viewer cannot see (#1880). */
async function hiddenStartChangeIds(tx: Tx, viewer: Viewer, changeIds: readonly string[]): Promise<Set<string>> {
  if (changeIds.length === 0) return new Set();
  const c = specSwChanges;
  const rows = await tx
    .select({ id: c.id })
    .from(c)
    .where(and(eq(c.workspaceId, viewer.workspaceId), inArray(c.id, [...changeIds]), sql`not ${visibleSoftwareSql(viewer, ref(c.softwareId))}`));
  return new Set(rows.map((r) => r.id));
}

/**
 * Null when the model has no published revision, or the software version is not a version of this model. Every
 * applicable change is applied (the values match the viewer-independent pin), but a change that starts at a SW version
 * the viewer cannot see leaves no id or marker in the answer (#1880, `maskChangeMarks`).
 */
export async function getEffectiveModelSpec(
  tx: Tx,
  viewer: Viewer,
  modelId: string,
  softwareId: string,
): Promise<EffectiveModelSpecData | null> {
  const workspaceId = viewer.workspaceId;
  const [software] = await tx
    .select({ order: softwareVersions.releaseOrder })
    .from(softwareVersions)
    .where(and(eq(softwareVersions.workspaceId, workspaceId), eq(softwareVersions.modelId, modelId), eq(softwareVersions.id, softwareId)));
  if (!software) return null;
  const spec = await getModelSpec(tx, workspaceId, modelId);
  if (!spec) return null;
  const changes = await loadApplicableChanges(tx, workspaceId, modelId, software.order);
  if (changes.length === 0) return { ...spec, effective: false };
  const hidden = await hiddenStartChangeIds(tx, viewer, changes.map((c) => c.id));
  return { revision: spec.revision, effective: true, softwareId, ...maskChangeMarks(applySpecChanges(spec, changes), changes, hidden) };
}

// ---- change list (#1196 c) ---------------------------------------------------------------------------------------

export interface SpecChangeRow {
  id: string;
  softwareId: string;
  softwareLabel: string;
  endsBeforeSoftwareId: string | null;
  endsBeforeLabel: string | null;
  targetKind: string;
  targetKey: string;
  changeKind: string;
  change: unknown;
  note: string | null;
  basedOnRevNo: number;
  evidenceRef: string | null;
  needsRevalidation: boolean;
  revalidationRevNo: number | null;
  retiredAt: string | null;
  retiredBy: string | null;
  retiredByChangeId: string | null;
  createdAt: string;
  createdBy: string;
  /** `row_version`: the `expectedVersion` of retire / confirm. */
  version: number;
}

export interface SpecChangeFilters {
  softwareId?: string;
  needsRevalidation?: boolean;
  status: 'open' | 'retired' | 'all';
}

/** Changes of one model, newest first. `softwareId` keeps the changes whose range contains that version (open-ended or before its end). */
export async function listSpecChanges(
  tx: Tx,
  viewer: Viewer,
  modelId: string,
  filters: SpecChangeFilters,
  paging: { page: number; pageSize: number },
): Promise<Page<SpecChangeRow>> {
  const workspaceId = viewer.workspaceId;
  const c = specSwChanges;
  const end = alias(softwareVersions, 'end_sw');
  const at = sql`(select s.release_order from knowledge.software_version s where s.workspace_id = ${workspaceId} and s.model_id = ${modelId} and s.id = ${filters.softwareId ?? null}::uuid and ${visibleSoftwareSql(viewer, sql`s.id`)})`;
  const where = and(
    eq(c.workspaceId, workspaceId),
    eq(c.modelId, modelId),
    // A change that starts at a SW version the viewer cannot see is not listed (#1504); a hidden end version shows no label.
    visibleSoftwareSql(viewer, ref(c.softwareId)),
    filters.status === 'open' ? isNull(c.retiredAt) : filters.status === 'retired' ? isNotNull(c.retiredAt) : undefined,
    filters.needsRevalidation === undefined ? undefined : eq(c.needsRevalidation, filters.needsRevalidation),
    filters.softwareId === undefined
      ? undefined
      : sql`${softwareVersions.releaseOrder} <= ${at} and (${end.releaseOrder} is null or ${at} < ${end.releaseOrder})`,
  );
  const from = () =>
    tx
      .select({
        row: c,
        retiredByChangeId: sql<string | null>`(select replacement_change.id from knowledge.spec_sw_change replacement_change where replacement_change.workspace_id = ${workspaceId}::uuid and replacement_change.id = ${ref(c.retiredByChangeId)} and ${visibleSoftwareSql(viewer, sql`replacement_change.software_id`)} and (replacement_change.ends_before_software_id is null or ${visibleSoftwareSql(viewer, sql`replacement_change.ends_before_software_id`)}))`,
        softwareLabel: softwareVersions.versionLabel,
        endsBeforeLabel: sql<string | null>`case when ${c.endsBeforeSoftwareId} is null or ${visibleSoftwareSql(viewer, ref(c.endsBeforeSoftwareId))} then ${end.versionLabel} else null end`,
      })
      .from(c)
      .innerJoin(softwareVersions, and(eq(softwareVersions.workspaceId, c.workspaceId), eq(softwareVersions.id, c.softwareId)))
      .leftJoin(end, and(eq(end.workspaceId, c.workspaceId), eq(end.id, c.endsBeforeSoftwareId)))
      .where(where);
  const rows = await from()
    .orderBy(desc(c.createdAt), asc(c.id))
    .limit(paging.pageSize)
    .offset(paging.page * paging.pageSize);
  const [totalRow] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(c)
    .innerJoin(softwareVersions, and(eq(softwareVersions.workspaceId, c.workspaceId), eq(softwareVersions.id, c.softwareId)))
    .leftJoin(end, and(eq(end.workspaceId, c.workspaceId), eq(end.id, c.endsBeforeSoftwareId)))
    .where(where);
  return {
    total: totalRow?.n ?? 0,
    rows: rows.map(({ row, softwareLabel, endsBeforeLabel, retiredByChangeId }) => ({
      id: row.id,
      softwareId: row.softwareId,
      softwareLabel,
      endsBeforeSoftwareId: endsBeforeLabel === null ? null : row.endsBeforeSoftwareId,
      endsBeforeLabel,
      targetKind: row.targetKind,
      targetKey: row.targetKey,
      changeKind: row.changeKind,
      change: row.changeJson,
      note: row.note,
      basedOnRevNo: row.basedOnRevNo,
      evidenceRef: row.evidenceRef,
      needsRevalidation: row.needsRevalidation,
      revalidationRevNo: row.revalidationRevNo,
      retiredAt: iso(row.retiredAt),
      retiredBy: row.retiredBy,
      retiredByChangeId,
      createdAt: row.createdAt.toISOString(),
      createdBy: row.createdBy,
      version: row.rowVersion,
    })),
  };
}
