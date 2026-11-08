// The read port log-datasets uses to compare a suite run item with its baseline (#1480 D-d, design log-test-datasets §3.6). It returns, per
// request, the rule results of the LATEST `succeeded` attempt: rule ids, result names and the required flag only — never an expected/observed
// text, an evidence location or an excerpt. Lifecycle rows stay this module's; everything runs on the caller's transaction.

import { and, desc, eq, inArray } from 'drizzle-orm';

import { executionAttempts, ruleResults } from '../../db/schema/log-lifecycle.js';
import type { Tx } from '../../db/tx.js';

export interface SuiteObservedRule {
  ruleId: string;
  result: string;
  required: boolean;
}

export interface SuiteObservedResult {
  requestId: string;
  attemptId: string;
  attemptNo: number;
  ruleSetRevision: string | null;
  rules: SuiteObservedRule[];
}

export interface SuiteResultReadPort {
  /**
   * The observed results of the given requests of this workspace: the latest attempt whose outcome is `succeeded`. A request with no succeeded
   * attempt (queued, running, failed, cancelled, expired) is absent from the map; a succeeded attempt with no rules is present with `rules: []`.
   */
  latestSucceeded(tx: Tx, workspaceId: string, requestIds: readonly string[]): Promise<Map<string, SuiteObservedResult>>;
}

const a = executionAttempts;
const rr = ruleResults;

export const lifecycleSuiteResults: SuiteResultReadPort = {
  async latestSucceeded(tx, workspaceId, requestIds) {
    const out = new Map<string, SuiteObservedResult>();
    if (requestIds.length === 0) return out;
    const attempts = await tx
      .select({ id: a.id, requestId: a.requestId, attemptNo: a.attemptNo, ruleSetRevision: a.ruleSetRevision })
      .from(a)
      .where(and(eq(a.workspaceId, workspaceId), inArray(a.requestId, [...requestIds]), eq(a.outcome, 'succeeded')))
      .orderBy(desc(a.attemptNo));
    // Ordered by attempt_no desc: the first attempt seen per request is its latest.
    for (const row of attempts) {
      if (!out.has(row.requestId)) out.set(row.requestId, { requestId: row.requestId, attemptId: row.id, attemptNo: row.attemptNo, ruleSetRevision: row.ruleSetRevision, rules: [] });
    }
    const chosen = [...out.values()];
    if (chosen.length === 0) return out;
    const byAttempt = new Map(chosen.map((x) => [x.attemptId, x]));
    const rules = await tx
      .select({ attemptId: rr.attemptId, ruleId: rr.ruleId, result: rr.result, required: rr.required })
      .from(rr)
      .where(and(eq(rr.workspaceId, workspaceId), inArray(rr.attemptId, [...byAttempt.keys()])))
      .orderBy(rr.ruleId);
    for (const rule of rules) byAttempt.get(rule.attemptId)?.rules.push({ ruleId: rule.ruleId, result: rule.result, required: rule.required });
    return out;
  },
};
