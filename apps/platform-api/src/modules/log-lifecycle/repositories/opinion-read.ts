// Read side of the attempt opinions (#1778, ADR-0117 amendment 2). Workspace-filtered and object-access-filtered like the rule
// results read. The note is untrusted text: `listOpinions` returns it only for an item-specific history (`itemKey` or `ruleResultId` given); every other list is one summary row per item that carries `hasNote` only. Reads
// only: nothing here is joined into a verdict, a Gate input or a regression comparison.

import { and, count, desc, eq, sql } from 'drizzle-orm';

import { actors } from '../../../db/schema/core.js';
import { attemptOpinions, executionAttempts } from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import { type Viewer, ref } from '../../log-knowledge/index.js';
import type { OpinionEvidence, OpinionScale } from '../domain/opinion-input.js';
import type { OpinionListQuery } from '../domain/queue-params.js';
import { attemptVisibleSql } from './access-visibility.js';

const o = attemptOpinions;
const iso = (d: Date | string) => new Date(d).toISOString();

export interface ScaleRef {
  key: string;
  /** `null` once the key left the declared scale: the screen shows the key as text. */
  label: string | null;
}
export const gradeRef = (scale: OpinionScale, key: string): ScaleRef => ({ key, label: scale.grades.find((g) => g.key === key)?.label ?? null });
export const markRef = (scale: OpinionScale, key: string | null): ScaleRef | null => (key === null ? null : { key, label: scale.marks.find((m) => m.key === key)?.label ?? null });

export interface OpinionSummary {
  grade: ScaleRef;
  mark: ScaleRef | null;
  hasNote: boolean;
  at: string;
  count: number;
}

/** The latest opinion and the count of the linked item, per rule result id: one batched lookup for a page of rule results. */
export async function opinionSummaries(
  tx: Tx,
  workspaceId: string,
  attemptId: string,
  ruleResultIds: readonly string[],
): Promise<Map<string, Omit<OpinionSummary, 'grade' | 'mark'> & { grade: string; mark: string | null }>> {
  if (ruleResultIds.length === 0) return new Map();
  const ids = sql.join(
    ruleResultIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );
  const res = await tx.execute(sql`
    select t.rule_result_id, t.grade, t.mark, t.has_note, t.created_at, t.cnt
    from (
      select x.rule_result_id, x.grade, x.mark, (x.note is not null) as has_note, x.created_at,
             count(*) over (partition by x.rule_result_id) as cnt,
             row_number() over (partition by x.rule_result_id order by x.created_at desc, x.id desc) as rn
      from log_lifecycle.attempt_opinion x
      where x.workspace_id = ${workspaceId}::uuid and x.attempt_id = ${attemptId}::uuid and x.rule_result_id in (${ids})
    ) t
    where t.rn = 1`);
  const rows = (res as unknown as { rows: { rule_result_id: string; grade: string; mark: string | null; has_note: boolean; created_at: Date | string; cnt: string | number }[] }).rows;
  return new Map(
    rows.map((r) => [r.rule_result_id, { grade: r.grade, mark: r.mark, hasNote: r.has_note, at: iso(r.created_at), count: Number(r.cnt) }]),
  );
}

export function summaryOut(scale: OpinionScale, s: { grade: string; mark: string | null; hasNote: boolean; at: string; count: number }): OpinionSummary {
  return { grade: gradeRef(scale, s.grade), mark: markRef(scale, s.mark), hasNote: s.hasNote, at: s.at, count: s.count };
}

/** Opinion rows per attempt of one request (`requestDetail`'s `opinionCount`); attempts without a row are absent. */
export async function opinionCounts(tx: Tx, workspaceId: string, requestId: string): Promise<Map<string, number>> {
  const rows = await tx
    .select({ attemptId: o.attemptId, n: count() })
    .from(o)
    .innerJoin(executionAttempts, and(eq(executionAttempts.workspaceId, o.workspaceId), eq(executionAttempts.id, o.attemptId)))
    .where(and(eq(o.workspaceId, workspaceId), eq(executionAttempts.requestId, requestId)))
    .groupBy(o.attemptId);
  return new Map(rows.map((r) => [r.attemptId, Number(r.n)]));
}

export interface OpinionOut {
  id: string;
  itemKey: string;
  ruleResultId: string | null;
  grade: ScaleRef;
  mark: ScaleRef | null;
  /** Untrusted text of the in-house side: rendered as text only. */
  note: string | null;
  evidence: OpinionEvidence[];
  inputRevision: string | null;
  producer: string | null;
  author: { id: string; displayName: string };
  at: string;
}

/** One row per item of the general and the unlinked list: the latest opinion and the count. Never a note, evidence, revision or producer. */
export interface OpinionItemSummary extends OpinionSummary {
  itemKey: string;
}

/**
 * The opinions of one attempt; an unknown, foreign or hidden attempt answers an empty page. With `itemKey` or `ruleResultId` it is the
 * item's history (newest first, with note, evidence, revision, producer and author); without, one summary row per item, newest first.
 */
export async function listOpinions(
  tx: Tx,
  workspaceId: string,
  query: OpinionListQuery,
  scale: OpinionScale,
  viewer: Viewer,
): Promise<{ total: number; rows: OpinionOut[] } | { total: number; rows: OpinionItemSummary[] }> {
  const a = executionAttempts;
  const [owner] = await tx
    .select({ id: a.id })
    .from(a)
    .where(and(eq(a.workspaceId, workspaceId), eq(a.id, query.attemptId), attemptVisibleSql(viewer, ref(a.id))));
  if (!owner) return { total: 0, rows: [] };
  if (query.itemKey === undefined && query.ruleResultId === undefined) return listItemSummaries(tx, workspaceId, query, scale);
  const where = and(
    eq(o.workspaceId, workspaceId),
    eq(o.attemptId, query.attemptId),
    query.ruleResultId === undefined ? undefined : eq(o.ruleResultId, query.ruleResultId),
    query.itemKey === undefined ? undefined : eq(o.itemKey, query.itemKey),
    query.unlinked ? sql`${o.ruleResultId} is null` : undefined,
  );
  const rows = await tx
    .select({ row: o, authorName: actors.displayName })
    .from(o)
    .leftJoin(actors, and(eq(actors.id, o.actorId), eq(actors.workspaceId, o.workspaceId)))
    .where(where)
    .orderBy(desc(o.createdAt), desc(o.id))
    .limit(query.pageSize)
    .offset(query.page * query.pageSize);
  const [totalRow] = await tx.select({ n: count() }).from(o).where(where);
  return {
    total: Number(totalRow?.n ?? 0),
    rows: rows.map(({ row: r, authorName }) => ({
      id: r.id,
      itemKey: r.itemKey,
      ruleResultId: r.ruleResultId,
      grade: gradeRef(scale, r.grade),
      mark: markRef(scale, r.mark),
      note: r.note,
      evidence: Array.isArray(r.evidence) ? (r.evidence as OpinionEvidence[]) : [],
      inputRevision: r.inputRevision,
      producer: r.producer,
      author: { id: r.actorId, displayName: authorName ?? '' },
      at: iso(r.createdAt),
    })),
  };
}

async function listItemSummaries(
  tx: Tx,
  workspaceId: string,
  query: OpinionListQuery,
  scale: OpinionScale,
): Promise<{ total: number; rows: OpinionItemSummary[] }> {
  const res = await tx.execute(sql`
    select t.item_key, t.grade, t.mark, t.has_note, t.created_at, t.cnt
    from (
      select x.item_key, x.grade, x.mark, (x.note is not null) as has_note, x.created_at,
             count(*) over (partition by x.item_key) as cnt,
             row_number() over (partition by x.item_key order by x.created_at desc, x.id desc) as rn
      from log_lifecycle.attempt_opinion x
      where x.workspace_id = ${workspaceId}::uuid and x.attempt_id = ${query.attemptId}::uuid
        ${query.unlinked ? sql`and x.rule_result_id is null` : sql``}
    ) t
    where t.rn = 1`);
  const all = (res as unknown as { rows: { item_key: string; grade: string; mark: string | null; has_note: boolean; created_at: Date | string; cnt: string | number }[] }).rows
    .map((r) => ({ itemKey: r.item_key, ...summaryOut(scale, { grade: r.grade, mark: r.mark, hasNote: r.has_note, at: iso(r.created_at), count: Number(r.cnt) }) }))
    .sort((x, y) => (x.at === y.at ? x.itemKey.localeCompare(y.itemKey) : x.at < y.at ? 1 : -1));
  return { total: all.length, rows: all.slice(query.page * query.pageSize, (query.page + 1) * query.pageSize) };
}
