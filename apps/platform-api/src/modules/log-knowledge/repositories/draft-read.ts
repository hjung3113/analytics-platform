// Read side of the knowledge drafts (#1198 a): `knowledge.*` tables only, every statement scoped to the session's
// workspace, and row visibility decided IN SQL (never filtered after the fact): the author sees their own drafts in every
// status; a holder of `knowledge.item.publish` (Admin by the module bypass) also sees every draft whose status is not
// `draft` (a not-yet-submitted draft is private to its author); nobody else sees any draft. A list row never carries
// `proposal_json` (title only, from the latest revision). Actors are returned as ids.

import { type SQL, and, asc, count, desc, eq, ilike, inArray, notInArray, or, sql } from 'drizzle-orm';
import { type AnyPgColumn, alias } from 'drizzle-orm/pg-core';

import { knowledgeDraftRevisions, knowledgeDrafts, softwareVersions } from '../../../db/schema/knowledge.js';
import type { Tx } from '../../../db/tx.js';
import type { FilterCondition } from '../../../lib/list-params/catalog-filters.js';
import { escapeLike, type ListQuery, type Page } from './catalog-read.js';

export const DRAFT_SORT_IDS = ['updatedAt', 'submittedAt', 'createdAt'] as const;

/** Who is looking: their actor id and whether they hold `knowledge.item.publish` (Admin through the module bypass). */
export interface DraftViewer {
  actorId: string;
  holdsPublish: boolean;
}

export interface DraftListRow {
  id: string;
  origin: string;
  proposalType: string;
  targetItemId: string | null;
  baseRevisionNo: number | null;
  ownerModelId: string | null;
  ownerSoftwareId: string | null;
  title: string;
  status: string;
  latestDraftRev: number;
  submitterActorId: string;
  submittedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

const iso = (value: Date | string): string => (value instanceof Date ? value : new Date(value)).toISOString();

const d = knowledgeDrafts;
const r = knowledgeDraftRevisions;
const sw = alias(softwareVersions, 'draft_owner_sw');

/** The visibility rule as a WHERE fragment. */
export function visibleTo(viewer: DraftViewer): SQL {
  const own = eq(d.submitterActorId, viewer.actorId);
  return viewer.holdsPublish ? (or(own, sql`${d.status} <> 'draft'`) as SQL) : own;
}

function inOrNot(column: AnyPgColumn, condition: FilterCondition | undefined): SQL | undefined {
  if (!condition) return undefined;
  return condition.op === 'notIn' ? notInArray(column, condition.values) : inArray(column, condition.values);
}

const joinLatest = and(eq(r.workspaceId, d.workspaceId), eq(r.draftId, d.id), eq(r.draftRevNo, d.latestDraftRev));
const title = sql<string>`${r.proposalJson} ->> 'title'`;
const ownerModel = sql`coalesce(${d.ownerModelId}, ${sw.modelId})`;

export async function listDrafts(tx: Tx, q: ListQuery, viewer: DraftViewer): Promise<Page<DraftListRow>> {
  const c = q.conditions;
  const text = q.q === null || q.q.trim() === '' ? undefined : ilike(title, `%${escapeLike(q.q.trim())}%`);
  const ownerModelFilter = inOrNot(ownerModel as unknown as AnyPgColumn, c.ownerModelId);
  const where = and(
    eq(d.workspaceId, q.workspaceId),
    visibleTo(viewer),
    inOrNot(d.status, c.status),
    inOrNot(d.origin, c.origin),
    inOrNot(d.proposalType, c.proposalType),
    ownerModelFilter,
    text,
  );
  const sortable: Record<string, SQL> = {
    updatedAt: sql`${d.updatedAt}`,
    submittedAt: sql`${d.submittedAt}`,
    createdAt: sql`${d.createdAt}`,
  };
  const order = q.sorting.map((s) => {
    const column = sortable[s.id] as SQL;
    return s.id === 'submittedAt' ? sql`${column} ${s.desc ? sql`desc` : sql`asc`} nulls last` : s.desc ? desc(column) : asc(column);
  });
  const base = () =>
    tx
      .select({ draft: d, title })
      .from(d)
      .innerJoin(r, joinLatest)
      .leftJoin(sw, and(eq(sw.workspaceId, d.workspaceId), eq(sw.id, d.ownerSoftwareId)));
  const rows = await base()
    .where(where)
    .orderBy(...order, asc(d.id))
    .limit(q.pageSize)
    .offset(q.page * q.pageSize);
  const [totalRow] = await tx
    .select({ n: count() })
    .from(d)
    .innerJoin(r, joinLatest)
    .leftJoin(sw, and(eq(sw.workspaceId, d.workspaceId), eq(sw.id, d.ownerSoftwareId)))
    .where(where);
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map(({ draft, title: t }) => ({
      id: draft.id,
      origin: draft.origin,
      proposalType: draft.proposalType,
      targetItemId: draft.targetItemId,
      baseRevisionNo: draft.baseRevisionNo,
      ownerModelId: draft.ownerModelId,
      ownerSoftwareId: draft.ownerSoftwareId,
      title: t,
      status: draft.status,
      latestDraftRev: draft.latestDraftRev,
      submitterActorId: draft.submitterActorId,
      submittedAt: draft.submittedAt ? iso(draft.submittedAt) : null,
      updatedAt: iso(draft.updatedAt),
      createdAt: iso(draft.createdAt),
    })),
  };
}

export interface DraftDetail {
  draft: Omit<DraftListRow, 'title'> & {
    version: string;
    closeReason: string | null;
    closedAt: string | null;
    closedBy: string | null;
    createdBy: string;
  };
  revisions: { revNo: number; payloadDigest: string; authorActorId: string; createdAt: string }[];
  /** The latest revision's stored proposal (normalized, see `draft-input.ts`). */
  proposal: unknown;
}

/** One draft the viewer may see (same rule as the list); null when it is missing, another workspace's or hidden from them. */
export async function getDraftDetail(tx: Tx, workspaceId: string, draftId: string, viewer: DraftViewer): Promise<DraftDetail | null> {
  const [row] = await tx
    .select({ draft: d, proposal: r.proposalJson, title })
    .from(d)
    .innerJoin(r, joinLatest)
    .where(and(eq(d.workspaceId, workspaceId), eq(d.id, draftId), visibleTo(viewer)));
  if (!row) return null;
  const revisions = await tx
    .select({ revNo: r.draftRevNo, payloadDigest: r.payloadDigest, authorActorId: r.authorActorId, createdAt: r.createdAt })
    .from(r)
    .where(and(eq(r.workspaceId, workspaceId), eq(r.draftId, draftId)))
    .orderBy(desc(r.draftRevNo));
  const { draft } = row;
  return {
    draft: {
      id: draft.id,
      origin: draft.origin,
      proposalType: draft.proposalType,
      targetItemId: draft.targetItemId,
      baseRevisionNo: draft.baseRevisionNo,
      ownerModelId: draft.ownerModelId,
      ownerSoftwareId: draft.ownerSoftwareId,
      status: draft.status,
      latestDraftRev: draft.latestDraftRev,
      submitterActorId: draft.submitterActorId,
      submittedAt: draft.submittedAt ? iso(draft.submittedAt) : null,
      updatedAt: iso(draft.updatedAt),
      createdAt: iso(draft.createdAt),
      createdBy: draft.createdBy,
      version: String(draft.rowVersion),
      closeReason: draft.closeReason,
      closedAt: draft.closedAt ? iso(draft.closedAt) : null,
      closedBy: draft.closedBy,
    },
    revisions: revisions.map((x) => ({ ...x, createdAt: iso(x.createdAt) })),
    proposal: row.proposal,
  };
}
