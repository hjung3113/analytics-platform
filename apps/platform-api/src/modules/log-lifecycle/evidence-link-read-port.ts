import type { Viewer } from '../log-knowledge/index.js';
import { attemptVisibleSql } from './repositories/access-visibility.js';
// The read port the log explorer uses for the reverse lookup of an evidence location (#1470, log-explorer D4): which rule results
// cite `(fileRef, line, fileSha256)` and which Rounds those results belong to. Reads only the side table `rule_result_evidence`
// and its rule result / attempt / request / Round rows, all filtered by the caller's workspace and by object access for the
// caller's `Viewer` (#1504; the same visibility as the lifecycle request reads, `platform:view` judged by the caller's endpoint). Locations and ids only: no excerpt, no log text.
// ONE statement, and the visibility predicate in it ONCE (#1850). The predicate is ~13 nested `exists`; Postgres plans every copy
// on every read (≈5–10 ms CPU warm vs ≈0.3 ms execution), and a read's time grew with the number of copies it planned: four, in
// three statements, went from ≈30 ms to 0.6–1.3 s under a contended CPU while the request's other statements stayed fast. So the
// visible citations are judged once in a materialized CTE, and both pages and both totals are read from it.
// An unknown location, or one only another workspace cites, answers the same empty page.

import { sql } from 'drizzle-orm';

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

/** `lifecycleEvidenceRead.findEvidenceLinks` (log-explorer D4). */
export interface LifecycleEvidenceRead {
  /** Rule results and Rounds that cite the location in `workspaceId`, newest first, page-limited. */
  findEvidenceLinks(tx: Tx, workspaceId: string, query: EvidenceLinkQuery, viewer: Viewer): Promise<EvidenceLinks>;
}

const iso = (v: string | Date) => new Date(v).toISOString();

interface LinkRow {
  rule_result_id: string;
  rule_key: string;
  result: string;
  required: boolean;
  attempt_id: string;
  request_id: string;
  round_id: string;
  verdict: string | null;
  at: string;
}
interface RoundRow {
  round_id: string;
  project_id: string;
  seq: number;
  status: string;
  citing: number | string;
  last: string;
}
interface Answer {
  results_total: number;
  rounds_total: number;
  result_rows: LinkRow[] | null;
  round_rows: RoundRow[] | null;
}

export const lifecycleEvidenceRead: LifecycleEvidenceRead = {
  async findEvidenceLinks(tx, workspaceId, query, viewer) {
    const offset = query.page * query.pageSize;
    // `cited`: the location's side rows the viewer may see, with their chain (a visible attempt always has a request and a
    // Round, so the inner joins drop no visible row). Every page and total below reads only `cited`.
    const result = await tx.execute(sql`
      with cited as materialized (
        select rr.id as rule_result_id, rr.rule_id as rule_key, rr.result, rr.required, att.id as attempt_id, rq.id as request_id,
               rd.id as round_id, rd.project_id, rd.seq, rd.status, att.verdict, coalesce(att.ended_at, att.started_at) as at
          from log_lifecycle.rule_result_evidence ev
          join log_lifecycle.rule_result rr on rr.workspace_id = ev.workspace_id and rr.id = ev.rule_result_id
          join log_lifecycle.execution_attempt att on att.workspace_id = rr.workspace_id and att.id = rr.attempt_id
          join log_lifecycle.execution_request rq on rq.workspace_id = att.workspace_id and rq.id = att.request_id
          join log_lifecycle.validation_round rd on rd.workspace_id = rq.workspace_id and rd.id = rq.round_id
         where ev.workspace_id = ${workspaceId}::uuid and ev.file_ref = ${query.fileRef} and ev.line = ${query.line} and ev.file_sha256 = ${query.fileSha256}
           and ${attemptVisibleSql(viewer, sql`rr.attempt_id`)}
      )
      select
        (select count(*) from cited)::int as results_total,
        (select count(distinct round_id) from cited)::int as rounds_total,
        (select json_agg(p order by p.at desc, p.rule_result_id desc) from (
           select rule_result_id, rule_key, result, required, attempt_id, request_id, round_id, verdict, at
             from cited order by at desc, rule_result_id desc limit ${query.pageSize} offset ${offset}) p) as result_rows,
        (select json_agg(g order by g.last desc, g.round_id desc) from (
           select round_id, project_id, seq, status, count(*) as citing, max(at) as last
             from cited group by round_id, project_id, seq, status order by last desc, round_id desc limit ${query.pageSize} offset ${offset}) g) as round_rows`);
    const answer = result.rows[0] as unknown as Answer | undefined;

    return {
      results: {
        total: Number(answer?.results_total ?? 0),
        rows: (answer?.result_rows ?? []).map((r) => ({
          ruleResultId: r.rule_result_id,
          ruleKey: r.rule_key,
          result: r.result,
          required: r.required,
          attemptId: r.attempt_id,
          requestId: r.request_id,
          roundId: r.round_id,
          verdict: r.verdict,
          at: iso(r.at),
        })),
      },
      rounds: {
        total: Number(answer?.rounds_total ?? 0),
        rows: (answer?.round_rows ?? []).map((r) => ({ roundId: r.round_id, projectId: r.project_id, seq: Number(r.seq), status: r.status, citingResults: Number(r.citing), lastCitedAt: iso(r.last) })),
      },
    };
  },
};
