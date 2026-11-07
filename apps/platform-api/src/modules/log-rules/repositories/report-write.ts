// Writes of the catalog report (#1491). Insert-only; the one UPDATE is the supersede marker of the previous report.
// Every function takes the caller's transaction.

import { randomUUID } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';

import { catalogReports, ruleSetRevisions, ruleTargets, rules } from '../../../db/schema/log-rules.js';
import type { Tx } from '../../../db/tx.js';
import { type CatalogReport, resultRefOf, revisionDigest, ruleDigest } from '../domain/report.js';

const CHUNK = 500;

/** One report at a time per workspace: replays, supersession and the one-current-report-per-source index all run behind it. */
export async function lockReports(tx: Tx, workspaceId: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`log_rules.report:${workspaceId}`}, 0))`);
}

export async function findByDigest(tx: Tx, workspaceId: string, digest: string) {
  const rows = await tx
    .select()
    .from(catalogReports)
    .where(and(eq(catalogReports.workspaceId, workspaceId), eq(catalogReports.reportDigest, digest)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findCurrent(tx: Tx, workspaceId: string, sourceSystem: string) {
  const rows = await tx
    .select({ id: catalogReports.id })
    .from(catalogReports)
    .where(
      and(
        eq(catalogReports.workspaceId, workspaceId),
        eq(catalogReports.sourceSystem, sourceSystem),
        eq(catalogReports.outcome, 'accepted'),
        isNull(catalogReports.supersededAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function insertRejected(
  tx: Tx,
  input: { workspaceId: string; actorId: string; digest: string; reason: string; sourceSystem: string | null },
): Promise<string> {
  const rows = await tx
    .insert(catalogReports)
    .values({
      workspaceId: input.workspaceId,
      reportedByActorId: input.actorId,
      sourceSystem: input.sourceSystem,
      reportDigest: input.digest,
      outcome: 'rejected',
      rejectReason: input.reason,
    })
    .returning({ id: catalogReports.id });
  return (rows[0] as { id: string }).id;
}

/**
 * Supersedes the previous current report of the source (if any) and inserts the new snapshot. The previous row is marked
 * first (the one-current-per-source index), pointing at the new id whose row follows in the same transaction (the FK is
 * deferred to commit).
 */
export async function insertAccepted(
  tx: Tx,
  input: { workspaceId: string; actorId: string; digest: string; report: CatalogReport; now: Date },
): Promise<{ reportId: string; supersededReportId: string | null }> {
  const { workspaceId, report } = input;
  const reportId = randomUUID();
  const previous = await findCurrent(tx, workspaceId, report.sourceSystem);
  if (previous) {
    await tx
      .update(catalogReports)
      .set({ supersededAt: input.now, supersededByReportId: reportId })
      .where(and(eq(catalogReports.workspaceId, workspaceId), eq(catalogReports.id, previous.id)));
  }
  await tx.insert(catalogReports).values({
    id: reportId,
    workspaceId,
    sourceSystem: report.sourceSystem,
    reportedByActorId: input.actorId,
    validatorVersion: report.validatorVersion,
    reportDigest: input.digest,
    reportedAt: input.now,
    outcome: 'accepted',
  });

  const revisionRows: (typeof ruleSetRevisions.$inferInsert)[] = [];
  const ruleRows: (typeof rules.$inferInsert)[] = [];
  const targetRows: (typeof ruleTargets.$inferInsert)[] = [];
  for (const rs of report.ruleSets) {
    const revisionId = randomUUID();
    revisionRows.push({
      id: revisionId,
      workspaceId,
      reportId,
      ruleSetKey: rs.ruleSetKey,
      revision: rs.revision,
      resultRef: resultRefOf(rs),
      revisionDigest: revisionDigest(rs),
      status: rs.status,
      supersedes: rs.supersedes ?? null,
    });
    for (const rule of rs.rules) {
      const ruleId = randomUUID();
      ruleRows.push({
        id: ruleId,
        workspaceId,
        ruleSetRevisionId: revisionId,
        ruleKey: rule.ruleKey,
        title: rule.title,
        summary: rule.summary,
        support: rule.support,
        scope: rule.scope ?? null,
        requiredDefault: rule.requiredDefault ?? null,
        ruleDigest: ruleDigest(rule),
      });
      (rule.targets ?? []).forEach((t, position) =>
        targetRows.push({
          workspaceId,
          ruleId,
          position,
          format: t.format,
          target: t.target,
          requirementIds: t.requirementIds ?? [],
        }),
      );
    }
  }
  for (let i = 0; i < revisionRows.length; i += CHUNK) await tx.insert(ruleSetRevisions).values(revisionRows.slice(i, i + CHUNK));
  for (let i = 0; i < ruleRows.length; i += CHUNK) await tx.insert(rules).values(ruleRows.slice(i, i + CHUNK));
  for (let i = 0; i < targetRows.length; i += CHUNK) await tx.insert(ruleTargets).values(targetRows.slice(i, i + CHUNK));
  return { reportId, supersededReportId: previous?.id ?? null };
}
