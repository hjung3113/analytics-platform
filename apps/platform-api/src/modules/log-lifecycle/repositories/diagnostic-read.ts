import { and, asc, count, eq, sql } from 'drizzle-orm';
import { attemptDiagnostics as d, attemptDiagnosticItems as i, executionAttempts as a, executionRequests as q, validationRounds as r } from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import { type Viewer, ref } from '../../log-knowledge/index.js';
import { roundVisibleSql } from './access-visibility.js';

export async function diagnosticTarget(tx: Tx, workspaceId: string, attemptId: string, viewer: Viewer) {
  const [target] = await tx.select({ requestId: q.id, sampleSet: r.sampleSet }).from(a)
    .innerJoin(q, and(eq(q.workspaceId, a.workspaceId), eq(q.id, a.requestId)))
    .innerJoin(r, and(eq(r.workspaceId, q.workspaceId), eq(r.id, q.roundId)))
    .where(and(eq(a.workspaceId, workspaceId), eq(a.id, attemptId), roundVisibleSql(viewer, ref(r.id))));
  return target ? { requestId: target.requestId, sourceOwner: (target.sampleSet as { sourceOwner?: string }).sourceOwner ?? '' } : null;
}
const bodyState = sql<'live' | 'erased_retention' | 'erased_admin'>`case when ${i.erasedAt} is null then 'live' when ${i.erasedCause} = 'retention' then 'erased_retention' else 'erased_admin' end`;
export interface DiagnosticListQuery { attemptId: string; ruleResultId?: string | undefined; page: number; pageSize: number }
export interface DiagnosticItemQuery { attemptId: string; producer: string; itemKey: string; tableKey?: string | undefined; rowOffset?: number | undefined }

/** Shape metadata is independent of Source ACL; titles are selected only when the endpoint granted it. */
export async function listDiagnostics(tx: Tx, workspaceId: string, query: DiagnosticListQuery, allowed: boolean) {
  const documents = await tx.select({ producer: d.producer, producerVersion: d.producerVersion, schemaVersion: d.schemaVersion, itemCount: d.itemCount, createdAt: d.createdAt }).from(d).where(and(eq(d.workspaceId, workspaceId), eq(d.attemptId, query.attemptId))).orderBy(asc(d.producer));
  const where = and(eq(i.workspaceId, workspaceId), eq(i.attemptId, query.attemptId), query.ruleResultId ? eq(i.ruleResultId, query.ruleResultId) : undefined);
  const [total] = await tx.select({ n: count() }).from(i).where(where);
  const rows = await tx.select({ producer: d.producer, itemKey: i.itemKey, origin: i.origin, ruleResultId: i.ruleResultId,
    evidenceCount: sql<number>`jsonb_array_length(${i.evidence})`, tableCount: sql<number>`jsonb_array_length(${i.tables})`,
    rowCounts: sql<number[]>`coalesce((select jsonb_agg(jsonb_array_length(t->'rows')) from jsonb_array_elements(${i.tables}) t), '[]'::jsonb)`,
    bodyState, title: allowed ? i.title : sql<null>`null`,
  }).from(i).innerJoin(d, and(eq(d.workspaceId, i.workspaceId), eq(d.id, i.diagnosticId))).where(where).orderBy(asc(d.producer), asc(i.ordinal)).limit(query.pageSize).offset(query.page * query.pageSize);
  return { access: allowed ? 'granted' as const : 'no_permission' as const, documents: documents.map((doc) => ({ ...doc, createdAt: doc.createdAt.toISOString() })), rows, total: Number(total?.n ?? 0) };
}
interface StoredTable { tableKey: string; title?: string | null; columns: { key: string; label: string | null; type: 'string' | 'number' | 'boolean' }[]; rows: Record<string, string | number | boolean | null>[] }
export async function readDiagnosticItem(tx: Tx, workspaceId: string, query: DiagnosticItemQuery) {
  const [row] = await tx.select({ producer: d.producer, itemKey: i.itemKey, origin: i.origin, ruleResultId: i.ruleResultId, title: i.title, explanation: i.explanation, evidenceRefs: i.evidence, bodyState, tables: i.tables })
    .from(i).innerJoin(d, and(eq(d.workspaceId, i.workspaceId), eq(d.id, i.diagnosticId)))
    .where(and(eq(i.workspaceId, workspaceId), eq(i.attemptId, query.attemptId), eq(d.producer, query.producer), eq(i.itemKey, query.itemKey)));
  if (!row) return null;
  const tables = (row.tables as StoredTable[]).filter((t) => query.tableKey === undefined || t.tableKey === query.tableKey).map((t) => {
    const rowOffset = query.rowOffset ?? 0;
    return { tableKey: t.tableKey, title: t.title ?? null, columns: t.columns, totalRows: t.rows.length, rowOffset, rows: t.rows.slice(rowOffset, rowOffset + 100) };
  });
  return { item: { ...row, tables } };
}
