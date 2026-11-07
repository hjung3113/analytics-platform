// The catalog report command (#1491, design §5.1, ADR-0122). One transaction per report, behind a per-workspace
// advisory lock: the idempotent replay lookup, the supersession of the previous report, the snapshot rows and the
// audit row all commit together or not at all. A replay (same digest) writes nothing, not even an audit row.
//   accepted: digest = SHA-256 of the canonical, order-independent form (domain/report.ts)
//   rejected: digest = SHA-256 of the raw body bytes; the row keeps only the reason, never the content.

import type { Db } from '../../db/client.js';
import type { AuditService } from '../core/audit/audit-service.js';
import { type FieldError, judgeReport, normalizeReport, rejectedDigest, reportDigest } from './domain/report.js';
import type { FieldCode } from './domain/report.js';
import {
  findByDigest,
  insertAccepted,
  insertRejected,
  lockReports,
} from './repositories/report-write.js';

export const CATALOG_REPORT_SUBJECT_TYPE = 'catalog_report';

export interface ReportActor {
  actor_id: string;
  workspace_id: string;
}

export type ReportResult =
  | { kind: 'accepted'; reportId: string; replayed: boolean; current: boolean }
  | { kind: 'rejected'; reportId: string; replayed: boolean; fields: FieldError[] };

export interface ReportServiceDeps {
  db: Db;
  auditService: AuditService;
  now?: () => Date;
}

export function createReportService(deps: ReportServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function submit(actor: ReportActor, body: Buffer): Promise<ReportResult> {
    const judgment = judgeReport(body);
    const workspaceId = actor.workspace_id;

    if (!judgment.ok) {
      const digest = rejectedDigest(body);
      return deps.db.transaction(async (tx) => {
        await lockReports(tx, workspaceId);
        const existing = await findByDigest(tx, workspaceId, digest);
        if (existing) return replayOf(existing);
        const reportId = await insertRejected(tx, {
          workspaceId,
          actorId: actor.actor_id,
          digest,
          reason: judgment.reason,
          sourceSystem: judgment.sourceSystem,
        });
        await deps.auditService.record(tx, {
          workspace_id: workspaceId,
          actor_id: actor.actor_id,
          event_type: 'validation.catalog.rejected',
          subject_type: CATALOG_REPORT_SUBJECT_TYPE,
          subject_id: reportId,
          summary: 'validation catalog report rejected',
          detail: {
            sourceSystem: judgment.sourceSystem,
            outcome: 'rejected',
            rejectReason: judgment.reason,
            bodyBytes: body.byteLength,
            reportDigest: digest,
          },
        });
        return { kind: 'rejected', reportId, replayed: false, fields: judgment.fields };
      });
    }

    const normalized = normalizeReport(judgment.report);
    const digest = reportDigest(normalized);
    return deps.db.transaction(async (tx) => {
      await lockReports(tx, workspaceId);
      const existing = await findByDigest(tx, workspaceId, digest);
      if (existing) return replayOf(existing);
      const { reportId, supersededReportId } = await insertAccepted(tx, {
        workspaceId,
        actorId: actor.actor_id,
        digest,
        report: normalized,
        now: now(),
      });
      await deps.auditService.record(tx, {
        workspace_id: workspaceId,
        actor_id: actor.actor_id,
        event_type: 'validation.catalog.reported',
        subject_type: CATALOG_REPORT_SUBJECT_TYPE,
        subject_id: reportId,
        summary: 'validation catalog report accepted',
        detail: {
          sourceSystem: normalized.sourceSystem,
          validatorVersion: normalized.validatorVersion,
          outcome: 'accepted',
          ...judgment.counts,
          reportDigest: digest,
          supersededReportId,
        },
      });
      return { kind: 'accepted', reportId, replayed: false, current: true };
    });
  }

  return { submit };
}

export type ReportService = ReturnType<typeof createReportService>;

function replayOf(row: { id: string; outcome: string; rejectReason: string | null; supersededAt: Date | null }): ReportResult {
  if (row.outcome === 'rejected') {
    const code = (row.rejectReason ?? 'invalid_value') as FieldCode;
    return { kind: 'rejected', reportId: row.id, replayed: true, fields: [{ path: [], code }] };
  }
  return { kind: 'accepted', reportId: row.id, replayed: true, current: row.supersededAt === null };
}
