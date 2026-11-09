import { type Viewer, ref } from '../log-knowledge/index.js';
import { attemptVisibleSql } from './repositories/access-visibility.js';
// The read port the log explorer uses for the reverse lookup of an evidence location (#1470, log-explorer D4): which rule results
// cite `(fileRef, line, fileSha256)` and which Rounds those results belong to. Reads only the side table `rule_result_evidence`
// and its rule result / attempt / request / Round rows, all filtered by the caller's workspace and by object access for the
// caller's `Viewer` (#1504; the same visibility as the lifecycle request reads, `platform:view` judged by the caller's endpoint). Locations and ids only: no excerpt, no log text.
// An unknown location, or one only another workspace cites, answers the same empty page.

import { and, count, desc, eq, sql } from 'drizzle-orm';

import {
  executionAttempts,
  executionRequests,
  ruleResultEvidence,
  ruleResults,
  validationRounds,
} from '../../db/schema/log-lifecycle.js';
import type { Tx } from '../../db/tx.js';
import type { EvidenceLinkQuery } from './domain/evidence-link-params.js';

export interface EvidenceLinkResult {
  ruleResultId: string;
  ruleKey: string;
  /** The rule result value (PASS / FAIL / …). */
  result: string;
  required: boolean;
  attemptId: string;
  requestId: string;
  roundId: string;
  /** The attempt's verdict (pass / fail / incomplete), or null while it has none. */
  verdict: string | null;
  /** When the attempt ended, else started (ISO). */
  at: string;
}
export interface EvidenceLinkRound {
  roundId: string;
  projectId: string;
  seq: number;
  status: string;
  /** Rule results of this Round that cite the location. */
  citingResults: number;
  lastCitedAt: string;
}
export interface EvidenceLinks {
  results: { total: number; rows: EvidenceLinkResult[] };
  rounds: { total: number; rows: EvidenceLinkRound[] };
}

export interface LifecycleEvidenceRead {
  /** Rule results and Rounds that cite the location in `workspaceId`, newest first, page-limited. */
  findEvidenceLinks(tx: Tx, workspaceId: string, query: EvidenceLinkQuery, viewer: Viewer): Promise<EvidenceLinks>;
}

const ev = ruleResultEvidence;
const rr = ruleResults;
const at = executionAttempts;
const rq = executionRequests;
const rd = validationRounds;
const iso = (d: Date) => d.toISOString();

export const lifecycleEvidenceRead: LifecycleEvidenceRead = {
  async findEvidenceLinks(tx, workspaceId, query, viewer) {
    const match = and(eq(ev.workspaceId, workspaceId), eq(ev.fileRef, query.fileRef), eq(ev.line, query.line), eq(ev.fileSha256, query.fileSha256), sql`exists (select 1 from log_lifecycle.rule_result acl_rr where acl_rr.workspace_id = ${workspaceId}::uuid and acl_rr.id = ${ref(ev.ruleResultId)} and ${attemptVisibleSql(viewer, sql`acl_rr.attempt_id`)})`);
    const when = sql<Date>`coalesce(${at.endedAt}, ${at.startedAt})`;
    const offset = query.page * query.pageSize;

    const rows = await tx
      .select({
        ruleResultId: rr.id,
        ruleKey: rr.ruleId,
        result: rr.result,
        required: rr.required,
        attemptId: at.id,
        requestId: rq.id,
        roundId: rd.id,
        verdict: at.verdict,
        at: when,
      })
      .from(ev)
      .innerJoin(rr, and(eq(rr.workspaceId, ev.workspaceId), eq(rr.id, ev.ruleResultId)))
      .innerJoin(at, and(eq(at.workspaceId, rr.workspaceId), eq(at.id, rr.attemptId)))
      .innerJoin(rq, and(eq(rq.workspaceId, at.workspaceId), eq(rq.id, at.requestId)))
      .innerJoin(rd, and(eq(rd.workspaceId, rq.workspaceId), eq(rd.id, rq.roundId)))
      .where(match)
      .orderBy(desc(when), desc(rr.id))
      .limit(query.pageSize)
      .offset(offset);
    const [resultTotal] = await tx
      .select({ n: count() })
      .from(ev)
      .where(match);

    const lastCited = sql<Date>`max(coalesce(${at.endedAt}, ${at.startedAt}))`;
    const roundRows = await tx
      .select({ roundId: rd.id, projectId: rd.projectId, seq: rd.seq, status: rd.status, citing: count(), last: lastCited })
      .from(ev)
      .innerJoin(rr, and(eq(rr.workspaceId, ev.workspaceId), eq(rr.id, ev.ruleResultId)))
      .innerJoin(at, and(eq(at.workspaceId, rr.workspaceId), eq(at.id, rr.attemptId)))
      .innerJoin(rq, and(eq(rq.workspaceId, at.workspaceId), eq(rq.id, at.requestId)))
      .innerJoin(rd, and(eq(rd.workspaceId, rq.workspaceId), eq(rd.id, rq.roundId)))
      .where(match)
      .groupBy(rd.id)
      .orderBy(desc(lastCited), desc(rd.id))
      .limit(query.pageSize)
      .offset(offset);
    const [roundTotal] = await tx
      .select({ n: sql<number>`count(distinct ${rq.roundId})` })
      .from(ev)
      .innerJoin(rr, and(eq(rr.workspaceId, ev.workspaceId), eq(rr.id, ev.ruleResultId)))
      .innerJoin(at, and(eq(at.workspaceId, rr.workspaceId), eq(at.id, rr.attemptId)))
      .innerJoin(rq, and(eq(rq.workspaceId, at.workspaceId), eq(rq.id, at.requestId)))
      .where(match);

    return {
      results: {
        total: Number(resultTotal?.n ?? 0),
        rows: rows.map((r) => ({ ...r, at: iso(new Date(r.at)) })),
      },
      rounds: {
        total: Number(roundTotal?.n ?? 0),
        rows: roundRows.map((r) => ({ roundId: r.roundId, projectId: r.projectId, seq: r.seq, status: r.status, citingResults: Number(r.citing), lastCitedAt: iso(new Date(r.last)) })),
      },
    };
  },
};
