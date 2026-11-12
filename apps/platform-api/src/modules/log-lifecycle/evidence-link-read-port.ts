import { type Viewer, ref } from '../log-knowledge/index.js';
import { attemptVisibleSql } from './repositories/access-visibility.js';
// The read port the log explorer uses for the reverse lookup of an evidence location (#1470, log-explorer D4): which rule results
// cite `(fileRef, line, fileSha256)` and which Rounds those results belong to. Reads only the side table `rule_result_evidence`
// and its rule result / attempt / request / Round rows, all filtered by the caller's workspace and by object access for the
// caller's `Viewer` (#1504; the same visibility as the lifecycle request reads, `platform:view` judged by the caller's endpoint). Locations and ids only: no excerpt, no log text.
// Three statements, not four (#1850): both totals come from ONE statement, because each of these statements embeds the multi-KB
// nested-`exists` visibility predicate and Postgres re-parses and re-plans it every time — that planner CPU (measured #1850:
// ~30 ms per statement on near-empty tables vs ~2 ms execution), not row work, is what stalled the reads under CI load.
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
  citingResults: number;
  lastCitedAt: string;
}
export interface EvidenceLinks {
  results: { total: number; rows: EvidenceLinkResult[] };
  rounds: { total: number; rows: EvidenceLinkRound[] };
}

/** `lifecycleEvidenceRead.findEvidenceLinks` (log-explorer D4). */
export interface LifecycleEvidenceRead {
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
    const location = and(eq(ev.workspaceId, workspaceId), eq(ev.fileRef, query.fileRef), eq(ev.line, query.line), eq(ev.fileSha256, query.fileSha256));
    const visible = sql`exists (select 1 from log_lifecycle.rule_result acl_rr where acl_rr.workspace_id = ${workspaceId}::uuid and acl_rr.id = ${ref(ev.ruleResultId)} and ${attemptVisibleSql(viewer, sql`acl_rr.attempt_id`)})`;
    const match = and(location, visible);
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
    // One statement for both totals (#1850): the same visibility predicate, as scalar subqueries over the side table.
    const [totals] = await tx
      .select({
        results: sql<number>`(select count(*) from log_lifecycle.rule_result_evidence where ${and(location, sql`exists (select 1 from log_lifecycle.rule_result acl_rr where acl_rr.workspace_id = ${workspaceId}::uuid and acl_rr.id = rule_result_evidence.rule_result_id and ${attemptVisibleSql(viewer, sql`acl_rr.attempt_id`)})`)})`,
        rounds: sql<number>`(select count(distinct execution_request.round_id) from log_lifecycle.rule_result_evidence join log_lifecycle.rule_result on rule_result.workspace_id = rule_result_evidence.workspace_id and rule_result.id = rule_result_evidence.rule_result_id join log_lifecycle.execution_attempt on execution_attempt.workspace_id = rule_result.workspace_id and execution_attempt.id = rule_result.attempt_id join log_lifecycle.execution_request on execution_request.workspace_id = execution_attempt.workspace_id and execution_request.id = execution_attempt.request_id where ${and(location, sql`exists (select 1 from log_lifecycle.rule_result acl_rr where acl_rr.workspace_id = ${workspaceId}::uuid and acl_rr.id = rule_result_evidence.rule_result_id and ${attemptVisibleSql(viewer, sql`acl_rr.attempt_id`)})`)})`,
      })
      .from(sql`(select 1) as totals_one`);

    return {
      results: {
        total: Number(totals?.results ?? 0),
        rows: rows.map((r) => ({ ...r, at: iso(new Date(r.at)) })),
      },
      rounds: {
        total: Number(totals?.rounds ?? 0),
        rows: roundRows.map((r) => ({ roundId: r.roundId, projectId: r.projectId, seq: r.seq, status: r.status, citingResults: Number(r.citing), lastCitedAt: iso(new Date(r.last)) })),
      },
    };
  },
};
