import { and, count, eq, sql } from 'drizzle-orm';
import { attemptDiagnostics, attemptDiagnosticItems } from '../../../db/schema/log-lifecycle.js';
import type { Tx } from '../../../db/tx.js';
import type { DiagnosticBody } from '../domain/diagnostic-payload.js';
import type { WorkerCaller } from '../queue-service.js';

export async function diagnosticDocument(tx: Tx, workspaceId: string, attemptId: string, producer: string) {
  const [row] = await tx.select().from(attemptDiagnostics).where(and(eq(attemptDiagnostics.workspaceId, workspaceId), eq(attemptDiagnostics.attemptId, attemptId), eq(attemptDiagnostics.producer, producer)));
  return row ?? null;
}
export async function diagnosticTotals(tx: Tx, workspaceId: string, attemptId: string) {
  const [row] = await tx.select({ producers: count(), byteCount: sql<number>`coalesce(sum(${attemptDiagnostics.byteCount}),0)::int` }).from(attemptDiagnostics).where(and(eq(attemptDiagnostics.workspaceId, workspaceId), eq(attemptDiagnostics.attemptId, attemptId)));
  return { producers: Number(row?.producers ?? 0), byteCount: Number(row?.byteCount ?? 0) };
}
export async function insertDiagnostic(tx: Tx, caller: WorkerCaller, attemptId: string, body: DiagnosticBody, digest: string, byteCount: number, links: ReadonlyMap<string, string>) {
  const [document] = await tx.insert(attemptDiagnostics).values({ workspaceId: caller.workspaceId, attemptId, producer: body.producer, producerVersion: body.producerVersion, schemaVersion: body.schemaVersion, digest, byteCount, itemCount: body.items.length, actorId: caller.actorId, tokenId: caller.tokenId }).returning({ id: attemptDiagnostics.id });
  if (!document) throw new Error('diagnostic insert returned no document');
  await tx.insert(attemptDiagnosticItems).values(body.items.map((item, ordinal) => ({ workspaceId: caller.workspaceId, attemptId, diagnosticId: document.id, itemKey: item.itemKey, ordinal, origin: item.origin, ruleResultId: item.ruleId ? links.get(item.ruleId) : null, evidence: item.evidenceRefs ?? [], title: item.title, explanation: item.explanation ?? null, tables: item.tables ?? [] })));
}
