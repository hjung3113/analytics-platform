// Read side of the log knowledge items (ADR-0109): `knowledge.*` tables only, every statement scoped to the
// session's workspace. An item row shows its latest revision; a detail can read an older one. Actors are returned
// as ids (no cheap approved cross-module name read exists for this module).

import { type SQL, and, asc, count, desc, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm';
import { type AnyPgColumn, alias } from 'drizzle-orm/pg-core';

import {
  equipmentModels,
  itemAssessmentEvents,
  itemLinks,
  itemRevisionEvidence,
  itemRevisionSubjects,
  knowledgeItemRevisions,
  knowledgeItems,
  modelProcesses,
  processCategories,
  softwareVersions,
  vendors,
} from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import type { FilterCondition } from '../../../lib/list-params/catalog-filters.js';
import { type Viewer, ref, visibleItemSql, visibleModelSql, visibleSoftwareSql } from './access-visibility.js';
import { escapeLike, type ListQuery, type Page } from './catalog-read.js';
import { type ItemRelationRow, itemRelations } from './item-relation.js';
import { type ResolvedSubject, resolvedSubjects } from './item-subject.js';

export const ITEM_SORT_IDS = ['itemNo', 'title', 'updatedAt'] as const;
export const SOFTWARE_LIST_CAP = 500;

export interface ItemOwner {
  kind: 'model' | 'software';
  modelId: string;
  modelName: string;
  softwareId?: string;
  versionLabel?: string;
}
export interface ItemRow {
  id: string;
  itemNo: number;
  title: string;
  typeCode: string;
  owner: ItemOwner;
  verificationState: string;
  processingState: string;
  publicationState: string;
  latestRevisionNo: number;
  updatedAt: string;
}

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

const i = knowledgeItems;
const r = knowledgeItemRevisions;
const sw = alias(softwareVersions, 'owner_sw');
const md = alias(equipmentModels, 'owner_md');

/** Items with their latest revision and owner (model, or SW version + its model): the shape of every item row. */
function itemSelect(tx: Tx) {
  return tx
    .select({
      item: i,
      title: r.title,
      typeCode: r.typeCode,
      modelId: md.id,
      modelName: md.name,
      softwareId: sw.id,
      versionLabel: sw.versionLabel,
    })
    .from(i)
    .innerJoin(r, and(eq(r.workspaceId, i.workspaceId), eq(r.itemId, i.id), eq(r.revisionNo, i.latestRevisionNo)))
    .leftJoin(sw, and(eq(sw.workspaceId, i.workspaceId), eq(sw.id, i.ownerSoftwareId)))
    .innerJoin(
      md,
      and(eq(md.workspaceId, i.workspaceId), eq(md.id, sql`coalesce(${i.ownerModelId}, ${sw.modelId})`)),
    )
    .$dynamic();
}
type Joined = Awaited<ReturnType<typeof itemSelect>>[number];

function toRow(row: Joined): ItemRow {
  const owner: ItemOwner =
    row.item.ownerSoftwareId === null
      ? { kind: 'model', modelId: row.modelId, modelName: row.modelName }
      : {
          kind: 'software',
          modelId: row.modelId,
          modelName: row.modelName,
          softwareId: row.softwareId as string,
          versionLabel: row.versionLabel as string,
        };
  return {
    id: row.item.id,
    itemNo: row.item.itemNo,
    title: row.title,
    typeCode: row.typeCode,
    owner,
    verificationState: row.item.verificationState,
    processingState: row.item.processingState,
    publicationState: row.item.publicationState,
    latestRevisionNo: row.item.latestRevisionNo,
    updatedAt: iso(row.item.updatedAt),
  };
}

function inOrNot(column: AnyPgColumn, condition: FilterCondition | undefined): SQL | undefined {
  if (!condition) return undefined;
  return condition.op === 'notIn' ? notInArray(column, condition.values) : inArray(column, condition.values);
}

/** `ownerKind`: a model-owned item has owner_model_id, a SW-owned one owner_software_id. */
function ownerKindFilter(condition: FilterCondition | undefined): SQL | undefined {
  if (!condition) return undefined;
  const kinds = condition.op === 'notIn' ? ['model', 'software'].filter((k) => !condition.values.includes(k)) : condition.values;
  const parts = kinds.map((k) => (k === 'model' ? sql`${i.ownerModelId} is not null` : sql`${i.ownerSoftwareId} is not null`));
  return parts.length === 0 ? sql`false` : or(...parts);
}

/** `subject` (#1196 f): the latest revision has a subject with this target key. */
function subjectFilter(condition: FilterCondition | undefined): SQL | undefined {
  const key = condition?.values[0];
  if (key === undefined) return undefined;
  return sql`exists (select 1 from knowledge.item_revision_subject sub where sub.workspace_id = ${i.workspaceId} and sub.item_id = ${i.id} and sub.revision_no = ${i.latestRevisionNo} and sub.target_key = ${key})`;
}

/** `q`: `KI-<n>` / `<n>` matches the number, any text matches the latest title. */
function textFilter(q: string | null): SQL | undefined {
  if (q === null || q.trim() === '') return undefined;
  const text = q.trim();
  const byTitle = ilike(r.title, `%${escapeLike(text)}%`);
  const no = /^ki-?(\d{1,9})$/i.exec(text);
  return no ? or(eq(i.itemNo, Number(no[1])), byTitle) : byTitle;
}

export async function listItems(tx: Tx, q: ListQuery, viewer: Viewer): Promise<Page<ItemRow>> {
  const c = q.conditions;
  const includeSoftware = c.includeSoftware?.values[0] === 'true';
  const where = and(
    eq(i.workspaceId, q.workspaceId),
    visibleItemSql(viewer, ref(i.id)),
    // Default: published only. An explicit publicationState condition is the caller's choice.
    c.publicationState ? inOrNot(i.publicationState, c.publicationState) : eq(i.publicationState, 'published'),
    ownerKindFilter(c.ownerKind),
    // The model's items alone, or (includeSoftware) also those of its SW versions: the joined model is the owner's model.
    inOrNot(includeSoftware ? md.id : i.ownerModelId, c.ownerModelId),
    inOrNot(i.ownerSoftwareId, c.ownerSoftwareId),
    inOrNot(r.typeCode, c.typeCode),
    inOrNot(i.verificationState, c.verificationState),
    inOrNot(i.processingState, c.processingState),
    subjectFilter(c.subject),
    textFilter(q.q),
  );
  const sortable: Record<string, AnyPgColumn> = { itemNo: i.itemNo, title: r.title, updatedAt: i.updatedAt };
  const rows = await itemSelect(tx)
    .where(where)
    .orderBy(...q.sorting.map((s) => (s.desc ? desc : asc)(sortable[s.id] as AnyPgColumn)), asc(i.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx
    .select({ n: count() })
    .from(i)
    .innerJoin(r, and(eq(r.workspaceId, i.workspaceId), eq(r.itemId, i.id), eq(r.revisionNo, i.latestRevisionNo)))
    .leftJoin(sw, and(eq(sw.workspaceId, i.workspaceId), eq(sw.id, i.ownerSoftwareId)))
    .innerJoin(
      md,
      and(eq(md.workspaceId, i.workspaceId), eq(md.id, sql`coalesce(${i.ownerModelId}, ${sw.modelId})`)),
    )
    .where(where);
  return { total: Number(totalRow?.n ?? 0), rows: rows.map(toRow) };
}

export interface ItemDetail {
  item: ItemRow & { version: string; createdBy: string; createdAt: string };
  revision: {
    revisionNo: number;
    title: string;
    typeCode: string;
    observation: string | null;
    expected: string | null;
    analysisOpinion: string | null;
    improvement: string | null;
    changeNote: string | null;
    publishedBy: string;
    publishedAt: string;
    evidence: {
      ordinal: number;
      sourceKind: string;
      sourceOwner: string;
      sourceRef: string;
      sourceVersion: string | null;
      contentHash: string | null;
      locator: string | null;
      note: string | null;
    }[];
  };
  revisions: { revisionNo: number; title: string; publishedBy: string; publishedAt: string; changeNote: string | null }[];
  assessments: {
    id: string;
    dimension: string;
    priorState: string;
    newState: string;
    rationale: string;
    actorId: string;
    basedOnRevisionNo: number;
    observedAt: string;
  }[];
  links: {
    kind: string;
    direction: 'outgoing' | 'incoming';
    itemId: string;
    itemNo: number;
    title: string;
    owner: ItemOwner;
    sourceRevisionNo: number | null;
  }[];
  /** The targets the shown revision is about (#1196 f), resolved against each model's current published spec. */
  subjects: ResolvedSubject[];
  /** The Event relation records of the shown revision (#1505): `before` pairs, empty for an item without any. */
  relations: ItemRelationRow[];
}

/** One item with one revision (`revisionNo`, default the latest); null when the item or the revision does not exist in the workspace. */
export async function getItemDetail(
  tx: Tx,
  viewer: Viewer,
  workspaceId: string,
  itemId: string,
  revisionNo: number | null,
): Promise<ItemDetail | null> {
  // A hidden item is not found: the same `null` as an id that does not exist (ADR-0124).
  const [found] = await itemSelect(tx).where(and(eq(i.workspaceId, workspaceId), eq(i.id, itemId), visibleItemSql(viewer, ref(i.id)))).limit(1);
  if (!found) return null;
  const wanted = revisionNo ?? found.item.latestRevisionNo;
  const [rev] = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.itemId, itemId), eq(r.revisionNo, wanted)));
  if (!rev) return null;

  const evidence = await tx
    .select()
    .from(itemRevisionEvidence)
    .where(
      and(
        eq(itemRevisionEvidence.workspaceId, workspaceId),
        eq(itemRevisionEvidence.itemId, itemId),
        eq(itemRevisionEvidence.revisionNo, wanted),
      ),
    )
    .orderBy(asc(itemRevisionEvidence.ordinal));
  const revisions = await tx
    .select({
      revisionNo: r.revisionNo,
      title: r.title,
      publishedBy: r.publishedBy,
      publishedAt: r.publishedAt,
      changeNote: r.changeNote,
    })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.itemId, itemId)))
    .orderBy(desc(r.revisionNo));
  const events = await tx
    .select()
    .from(itemAssessmentEvents)
    .where(and(eq(itemAssessmentEvents.workspaceId, workspaceId), eq(itemAssessmentEvents.itemId, itemId)))
    .orderBy(desc(itemAssessmentEvents.observedAt), desc(itemAssessmentEvents.id));

  const l = itemLinks;
  const linkRows = await tx
    .select()
    .from(l)
    .where(and(eq(l.workspaceId, workspaceId), or(eq(l.sourceItemId, itemId), eq(l.targetItemId, itemId))))
    .orderBy(asc(l.createdAt), asc(l.id));
  const otherIds = [...new Set(linkRows.map((x) => (x.sourceItemId === itemId ? x.targetItemId : x.sourceItemId)))];
  const others = new Map<string, ItemRow>();
  if (otherIds.length > 0) {
    const rows = await itemSelect(tx).where(and(eq(i.workspaceId, workspaceId), inArray(i.id, otherIds), visibleItemSql(viewer, ref(i.id))));
    for (const row of rows) others.set(row.item.id, toRow(row));
  }

  const subjects = await resolvedSubjects(tx, workspaceId, itemId, wanted);
  const relations = await itemRelations(tx, workspaceId, itemId, wanted);

  return {
    item: {
      ...toRow(found),
      version: String(found.item.rowVersion),
      createdBy: found.item.createdBy,
      createdAt: iso(found.item.createdAt),
    },
    revision: {
      revisionNo: rev.revisionNo,
      title: rev.title,
      typeCode: rev.typeCode,
      observation: rev.observation,
      expected: rev.expected,
      analysisOpinion: rev.analysisOpinion,
      improvement: rev.improvement,
      changeNote: rev.changeNote,
      publishedBy: rev.publishedBy,
      publishedAt: iso(rev.publishedAt),
      evidence: evidence.map((e) => ({
        ordinal: e.ordinal,
        sourceKind: e.sourceKind,
        sourceOwner: e.sourceOwner,
        sourceRef: e.sourceRef,
        sourceVersion: e.sourceVersion,
        contentHash: e.contentHash,
        locator: e.locator,
        note: e.note,
      })),
    },
    revisions: revisions.map((x) => ({
      revisionNo: x.revisionNo,
      title: x.title,
      publishedBy: x.publishedBy,
      publishedAt: iso(x.publishedAt),
      changeNote: x.changeNote,
    })),
    assessments: events.map((e) => ({
      id: e.id,
      dimension: e.dimension,
      priorState: e.priorState,
      newState: e.newState,
      rationale: e.rationale,
      actorId: e.actorId,
      basedOnRevisionNo: e.basedOnRevisionNo,
      observedAt: iso(e.observedAt),
    })),
    links: linkRows.flatMap((x) => {
      const outgoing = x.sourceItemId === itemId;
      const other = others.get(outgoing ? x.targetItemId : x.sourceItemId);
      if (!other) return [];
      return [
        {
          kind: x.linkKind,
          direction: outgoing ? ('outgoing' as const) : ('incoming' as const),
          itemId: other.id,
          itemNo: other.itemNo,
          title: other.title,
          owner: other.owner,
          sourceRevisionNo: x.sourceRevisionNo,
        },
      ];
    }),
    subjects,
    relations,
  };
}

export interface SubjectItemRow extends ItemRow {
  subjectRelation: string;
}

/**
 * `specSubjectItems` (#1196 f): the published items whose LATEST revision is about this model target. Same visibility as
 * the item list (published only; an archived item is not listed). The key is the escaped target key of the model.
 */
export async function listSubjectItems(
  tx: Tx,
  viewer: Viewer,
  workspaceId: string,
  modelId: string,
  targetKey: string,
  paging: { page: number; pageSize: number },
): Promise<Page<SubjectItemRow>> {
  const match = sql`exists (select 1 from knowledge.item_revision_subject sub where sub.workspace_id = ${i.workspaceId} and sub.item_id = ${i.id} and sub.revision_no = ${i.latestRevisionNo} and sub.model_id = ${modelId} and sub.target_key = ${targetKey})`;
  const where = and(eq(i.workspaceId, workspaceId), eq(i.publicationState, 'published'), visibleItemSql(viewer, ref(i.id)), match);
  const rows = await itemSelect(tx)
    .where(where)
    .orderBy(desc(i.updatedAt), asc(i.id))
    .limit(paging.pageSize)
    .offset(paging.page * paging.pageSize);
  const [totalRow] = await tx
    .select({ n: count() })
    .from(i)
    .innerJoin(r, and(eq(r.workspaceId, i.workspaceId), eq(r.itemId, i.id), eq(r.revisionNo, i.latestRevisionNo)))
    .where(where);
  const relations = new Map<string, string>();
  if (rows.length > 0) {
    const found = await tx
      .select({ itemId: itemRevisionSubjects.itemId, relation: itemRevisionSubjects.subjectRelation, revisionNo: itemRevisionSubjects.revisionNo })
      .from(itemRevisionSubjects)
      .where(
        and(
          eq(itemRevisionSubjects.workspaceId, workspaceId),
          eq(itemRevisionSubjects.modelId, modelId),
          eq(itemRevisionSubjects.targetKey, targetKey),
          inArray(itemRevisionSubjects.itemId, rows.map((x) => x.item.id)),
        ),
      );
    const latest = new Map(rows.map((x) => [x.item.id, x.item.latestRevisionNo]));
    for (const f of found) if (latest.get(f.itemId) === f.revisionNo) relations.set(f.itemId, f.relation);
  }
  return { total: Number(totalRow?.n ?? 0), rows: rows.map((x) => ({ ...toRow(x), subjectRelation: relations.get(x.item.id) ?? 'about' })) };
}

export interface ModelProfile {
  model: {
    id: string;
    code: string;
    name: string;
    active: boolean;
    vendor: { id: string; code: string; name: string; active: boolean };
    processes: { id: string; code: string; name: string }[];
    createdAt: string;
    updatedAt: string;
  };
  softwareVersions: {
    id: string;
    versionLabel: string;
    name: string;
    active: boolean;
    itemCount: number;
    updatedAt: string;
  }[];
  /** True when the model has more than `SOFTWARE_LIST_CAP` SW versions (the list is cut at the cap). */
  truncated: boolean;
  modelItems: { total: number };
}

/**
 * Published items owned directly by the outer row's SW version. The outer columns are written qualified:
 * a single-table select renders a bare column unqualified, which would bind to the subquery's own table.
 */
const publishedItemsOfSoftware = (viewer: Viewer) => sql<number>`(select count(*)::int from ${i} ki where ki.workspace_id = "knowledge"."software_version"."workspace_id" and ki.owner_software_id = "knowledge"."software_version"."id" and ki.publication_state = 'published' and ${visibleItemSql(viewer, sql`ki.id`)})`;

export async function getModelProfile(tx: Tx, viewer: Viewer, workspaceId: string, modelId: string): Promise<ModelProfile | null> {
  const [row] = await tx
    .select({ model: equipmentModels, vendor: vendors })
    .from(equipmentModels)
    .innerJoin(vendors, and(eq(vendors.workspaceId, equipmentModels.workspaceId), eq(vendors.id, equipmentModels.vendorId)))
    .where(and(eq(equipmentModels.workspaceId, workspaceId), eq(equipmentModels.id, modelId), visibleModelSql(viewer, ref(equipmentModels.id))));
  if (!row) return null;
  const processes = await tx
    .select({ id: processCategories.id, code: processCategories.code, name: processCategories.name })
    .from(modelProcesses)
    .innerJoin(
      processCategories,
      and(eq(processCategories.workspaceId, modelProcesses.workspaceId), eq(processCategories.id, modelProcesses.processId)),
    )
    .where(and(eq(modelProcesses.workspaceId, workspaceId), eq(modelProcesses.modelId, modelId)))
    .orderBy(asc(processCategories.name), asc(processCategories.id));
  const itemCount = publishedItemsOfSoftware(viewer);
  const versions = await tx
    .select({ sw: softwareVersions, itemCount })
    .from(softwareVersions)
    .where(and(eq(softwareVersions.workspaceId, workspaceId), eq(softwareVersions.modelId, modelId), visibleSoftwareSql(viewer, ref(softwareVersions.id))))
    .orderBy(desc(softwareVersions.createdAt), desc(softwareVersions.id))
    .limit(SOFTWARE_LIST_CAP + 1);
  const [own] = await tx
    .select({ n: count() })
    .from(i)
    .where(and(eq(i.workspaceId, workspaceId), eq(i.ownerModelId, modelId), eq(i.publicationState, 'published'), visibleItemSql(viewer, ref(i.id))));
  const { model, vendor } = row;
  return {
    model: {
      id: model.id,
      code: model.code,
      name: model.name,
      active: model.active,
      vendor: { id: vendor.id, code: vendor.code, name: vendor.name, active: vendor.active },
      processes,
      createdAt: iso(model.createdAt),
      updatedAt: iso(model.updatedAt),
    },
    softwareVersions: versions.slice(0, SOFTWARE_LIST_CAP).map(({ sw: v, itemCount: n }) => ({
      id: v.id,
      versionLabel: v.versionLabel,
      name: v.name,
      active: v.active,
      itemCount: n,
      updatedAt: iso(v.updatedAt),
    })),
    truncated: versions.length > SOFTWARE_LIST_CAP,
    modelItems: { total: Number(own?.n ?? 0) },
  };
}
