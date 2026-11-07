// Read side of the log test datasets (#1477 D-a): `log_datasets.*` tables only. Every statement is scoped to the session's workspace
// AND to what the actor may see (a `private` dataset is its owner's alone). Nothing here writes. The "기준 낡음 요약" column belongs to
// node b: no stale field is returned yet.

import { type SQL, and, asc, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { actors } from '../../../db/schema/core.js';
import { datasetRevisions, datasets } from '../../../db/schema/log-datasets.js';
import type { Tx } from '../../../db/tx.js';
import type { FilterCondition } from '../../../lib/list-params/catalog-filters.js';
import type { ListQuery, Page } from '../../../lib/list-params/types.js';
import { escapeLikePattern } from '../../../lib/sql-like.js';
import { type Availability, type FileCheckState, calculateAvailability } from '../domain/availability.js';
import type { SampleSet } from '../domain/sample-manifest.js';
import { datasetVisibleTo } from './dataset-write.js';

const d = datasets;
const r = datasetRevisions;
const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

export interface DatasetListRow {
  id: string;
  name: string;
  purpose: string;
  owner: { id: string; displayName: string };
  shareScope: string;
  modelIds: string[];
  scenarioTags: string[];
  status: string;
  synthetic: boolean;
  revisionCount: number;
  latestRevisionSeq: number | null;
  version: string;
  createdAt: string;
  updatedAt: string;
}

/** A set cell (`scenario_tags`, `model_ids`): `in` = any value held; `notIn` = not empty and none of them; `isEmpty` / `isNotEmpty` by length. */
function setFilter(column: SQL | typeof d.scenarioTags | typeof d.modelIds, cast: 'text' | 'uuid', condition: FilterCondition | undefined): SQL | undefined {
  if (!condition) return undefined;
  const values = sql`array[${sql.join(condition.values.map((v) => sql`${v}`), sql`, `)}]::${sql.raw(cast)}[]`;
  switch (condition.op) {
    case 'in':
      return sql`${column} && ${values}`;
    case 'notIn':
      return sql`(cardinality(${column}) > 0 and not (${column} && ${values}))`;
    case 'isEmpty':
      return sql`cardinality(${column}) = 0`;
    default:
      return sql`cardinality(${column}) > 0`;
  }
}

const revisionStat = (expr: string) =>
  sql<number | null>`(select ${sql.raw(expr)} from ${r} rv where rv.workspace_id = ${d.workspaceId} and rv.dataset_id = ${d.id})`;

export async function listDatasets(tx: Tx, q: ListQuery, actorId: string): Promise<Page<DatasetListRow>> {
  const statusCondition = q.conditions.status;
  const text = q.q === null || q.q.trim() === '' ? undefined : `%${escapeLikePattern(q.q.trim())}%`;
  const where = and(
    eq(d.workspaceId, q.workspaceId),
    datasetVisibleTo(actorId),
    statusCondition
      ? statusCondition.op === 'notIn'
        ? sql`${d.status} not in (${sql.join(statusCondition.values.map((v) => sql`${v}`), sql`, `)})`
        : sql`${d.status} in (${sql.join(statusCondition.values.map((v) => sql`${v}`), sql`, `)})`
      : undefined,
    setFilter(d.scenarioTags, 'text', q.conditions.tag),
    setFilter(d.modelIds, 'uuid', q.conditions.model),
    text ? or(ilike(d.name, text), ilike(d.purpose, text)) : undefined,
  );
  const revisionCount = revisionStat('count(*)::int');
  const sortable = { updatedAt: d.updatedAt, name: d.name, status: d.status, createdAt: d.createdAt, revisionCount } as const;
  const owner = alias(actors, 'dataset_owner');
  const rows = await tx
    .select({ row: d, ownerName: owner.displayName, revisions: revisionCount, latest: revisionStat('max(rv.seq)') })
    .from(d)
    .leftJoin(owner, eq(owner.id, d.ownerActorId))
    .where(where)
    // `id` makes every order total, so a page never repeats a row.
    .orderBy(...q.sorting.map((s) => (s.desc ? desc(sortable[s.id as keyof typeof sortable]) : asc(sortable[s.id as keyof typeof sortable]))), asc(d.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx.select({ n: count() }).from(d).where(where);
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map(({ row, ownerName, revisions, latest }) => ({
      id: row.id,
      name: row.name,
      purpose: row.purpose,
      owner: { id: row.ownerActorId, displayName: ownerName ?? '' },
      shareScope: row.shareScope,
      modelIds: row.modelIds,
      scenarioTags: row.scenarioTags,
      status: row.status,
      synthetic: row.synthetic,
      revisionCount: Number(revisions ?? 0),
      latestRevisionSeq: latest === null || latest === undefined ? null : Number(latest),
      version: String(row.rowVersion),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    })),
  };
}

export interface RevisionDetail {
  id: string;
  seq: number;
  sourceOwner: string;
  fileCount: number;
  digest: string;
  inputMeta: unknown;
  note: string | null;
  createdBy: string;
  createdAt: string;
  availability: Availability;
  /** `false` = this revision was not checked at read time (only the latest is), so `availability` is `unverified` by absence of a check. */
  availabilityChecked: boolean;
  /** Only the latest revision lists its files, in the user's order; `state` is null when no check was made. */
  files?: { fileRef: string; order: number; sha256: string; state: FileCheckState | null }[];
}

export interface DatasetDetail extends Omit<DatasetListRow, 'revisionCount' | 'latestRevisionSeq'> {
  revisions: RevisionDetail[];
}

/** The latest revision of a dataset the actor may see, or null. The caller computes the availability (it needs the port). */
export async function getDatasetHead(
  tx: Tx,
  workspaceId: string,
  actorId: string,
  datasetId: string,
): Promise<{ dataset: Omit<DatasetDetail, 'revisions'>; revisions: (typeof r.$inferSelect)[] } | null> {
  const owner = alias(actors, 'dataset_owner');
  const [found] = await tx
    .select({ row: d, ownerName: owner.displayName })
    .from(d)
    .leftJoin(owner, eq(owner.id, d.ownerActorId))
    .where(and(eq(d.workspaceId, workspaceId), eq(d.id, datasetId), datasetVisibleTo(actorId)))
    .limit(1);
  if (!found) return null;
  const revisions = await tx
    .select()
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.datasetId, datasetId)))
    .orderBy(desc(r.seq));
  const row = found.row;
  return {
    dataset: {
      id: row.id,
      name: row.name,
      purpose: row.purpose,
      owner: { id: row.ownerActorId, displayName: found.ownerName ?? '' },
      shareScope: row.shareScope,
      modelIds: row.modelIds,
      scenarioTags: row.scenarioTags,
      status: row.status,
      synthetic: row.synthetic,
      version: String(row.rowVersion),
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    },
    revisions,
  };
}

export function toRevisionDetail(row: typeof r.$inferSelect, states: readonly FileCheckState[] | null | undefined): RevisionDetail {
  const set = row.sampleSet as SampleSet;
  const base: RevisionDetail = {
    id: row.id,
    seq: row.seq,
    sourceOwner: set.sourceOwner,
    fileCount: set.files.length,
    digest: row.sampleManifestDigest,
    inputMeta: row.inputMeta,
    note: row.note,
    createdBy: row.createdBy,
    createdAt: iso(row.createdAt),
    availability: calculateAvailability(states ?? null),
    availabilityChecked: Array.isArray(states),
  };
  if (states === undefined) return base;
  const ordered = [...set.files].sort((a, b) => a.order - b.order);
  return { ...base, files: ordered.map((f, i) => ({ fileRef: f.fileRef, order: f.order, sha256: f.sha256, state: states?.[i] ?? null })) };
}
