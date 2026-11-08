// The state of a suite run (design log-test-datasets §3.5): DERIVED from the states of its items' execution requests, never stored. Pure.
// `queued`: every request waits; `running`: some request is being worked, or some finished while others still wait; once none waits or
// is worked the run is `failed` (a request failed or its attempts expired), else `cancelled` (a request was cancelled), else `succeeded`.
// `succeeded` means every request ended with a result; the verdicts and the comparison with the baseline are node d's.

export const REQUEST_STATE_NAMES = ['queued', 'claimed', 'succeeded', 'failed', 'cancelled', 'expired'] as const;
export type RequestStateName = (typeof REQUEST_STATE_NAMES)[number];
export const SUITE_RUN_STATES = ['queued', 'running', 'succeeded', 'failed', 'cancelled'] as const;
export type SuiteRunState = (typeof SUITE_RUN_STATES)[number];

export type RequestStateCounts = Record<RequestStateName, number>;

export function countRequestStates(states: readonly string[]): RequestStateCounts {
  const counts: RequestStateCounts = { queued: 0, claimed: 0, succeeded: 0, failed: 0, cancelled: 0, expired: 0 };
  for (const state of states) if ((REQUEST_STATE_NAMES as readonly string[]).includes(state)) counts[state as RequestStateName] += 1;
  return counts;
}

export function deriveRunState(counts: RequestStateCounts): SuiteRunState {
  const total = REQUEST_STATE_NAMES.reduce((n, name) => n + counts[name], 0);
  if (counts.claimed > 0) return 'running';
  if (counts.queued > 0) return counts.queued === total ? 'queued' : 'running';
  if (counts.failed > 0 || counts.expired > 0) return 'failed';
  if (counts.cancelled > 0) return 'cancelled';
  return total === 0 ? 'queued' : 'succeeded';
}

/** A run still holds a worker slot while any of its requests waits or is worked: the unit of the per-user concurrent-run cap. */
export const isActiveRun = (state: SuiteRunState): boolean => state === 'queued' || state === 'running';

/** The start value of the per-user cap on concurrent suite runs (design D7: measure, then adjust). */
export const SUITE_RUN_CONCURRENT_LIMIT = 3;
