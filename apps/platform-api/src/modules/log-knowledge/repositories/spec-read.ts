// Read side of the model spec (design v0.6 §15, #1196 a): `knowledge.*` tables only, every statement scoped to the
// session's workspace. `modelSpec` returns the latest published revision and nothing of a draft or rejected one;
// `modelSpecRevisions` lists every revision's header (a draft shows up as a row, its content never does).

import { and, asc, desc, eq, sql } from 'drizzle-orm';

import {
  modelSpecRevisions,
  specEventRelations,
  specEvents,
  specModules,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
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
export async function getSpecDraft(tx: Tx, workspaceId: string, revisionId: string): Promise<SpecDraftData | null> {
  const r = modelSpecRevisions;
  const [rev] = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.id, revisionId), eq(r.state, 'draft')));
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
