// The RuleSet link state of each attempt of `logLifecycle.requestDetail` (#1496 R-f, design log-rules §6.3 «연동 표시»). The
// attempt's stored `ruleSetRevision` string is looked up in the current rule catalog through the log-rules `RuleCoveragePort`
// (structural type; this module never imports log-rules). The result is display information only: results are never
// re-judged, and an attempt that is not `matched` carries no link target. Lookups run once per distinct string.

import type { Tx } from '../../db/tx.js';
import type { AttemptOut, RequestDetail } from './repositories/queue-read.js';

export type AttemptRuleSet =
  /** The attempt carries no revision string. */
  | null
  | { state: 'matched'; ruleSetKey: string; revision: string; isCurrent: boolean; status: 'active' | 'retired' }
  | { state: 'ambiguous' | 'unknown' | 'no_catalog' }
  /** The catalog lookup failed: the link could not be checked (the Round itself is unaffected). */
  | { state: 'unavailable' };

/** What the Round read needs of `RuleCoveragePort.findRuleSetRevision`. */
export interface RuleSetLookup {
  findRuleSetRevision(
    tx: Tx,
    workspaceId: string,
    ref: string,
  ): Promise<
    | { state: 'matched'; ruleSetKey: string; revision: string; isCurrent: boolean; status: 'active' | 'retired' }
    | { state: 'ambiguous' | 'unknown' | 'no_catalog' }
  >;
}

export type AttemptWithRuleSet = AttemptOut & { ruleSet: AttemptRuleSet };
export type RequestDetailWithRuleSet = Omit<RequestDetail, 'attempts'> & { attempts: AttemptWithRuleSet[] };

/**
 * Optional enrichment: a rejected lookup never rejects the detail. Every attempt that needed the failed lookup carries
 * `{ state: 'unavailable' }`, and `onError` is called once with the first error (callers log a fixed text, never the error
 * message or any row data). Pass a handle that is not inside the core read's transaction: a failed Postgres statement aborts it.
 */
export async function withAttemptRuleSets(
  lookup: RuleSetLookup,
  tx: Tx,
  workspaceId: string,
  detail: RequestDetail,
  onError?: (error: unknown) => void,
): Promise<RequestDetailWithRuleSet> {
  let reported = false;
  const cache = new Map<string, Promise<AttemptRuleSet>>();
  const resolve = (ref: string): Promise<AttemptRuleSet> => {
    let found = cache.get(ref);
    if (!found) {
      found = lookup.findRuleSetRevision(tx, workspaceId, ref).then((r): AttemptRuleSet =>
        r.state === 'matched'
          ? { state: 'matched', ruleSetKey: r.ruleSetKey, revision: r.revision, isCurrent: r.isCurrent, status: r.status }
          : { state: r.state },
      ).catch((error: unknown): AttemptRuleSet => {
        if (!reported) {
          reported = true;
          onError?.(error);
        }
        return { state: 'unavailable' };
      });
      cache.set(ref, found);
    }
    return found;
  };
  const attempts = await Promise.all(
    detail.attempts.map(async (a): Promise<AttemptWithRuleSet> => ({ ...a, ruleSet: a.ruleSetRevision === null ? null : await resolve(a.ruleSetRevision) })),
  );
  return { ...detail, attempts };
}
