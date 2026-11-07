// The state table of a validation request (ADR-0117 decision 2). Pure. The guard trigger
// `log_lifecycle.request_guard` carries the same pairs between the LEGAL_REQUEST_PAIRS markers (drift test).
//   queued -> claimed (claim) · claimed -> succeeded (result ok) · claimed -> failed (fail)
//   claimed -> queued (lease expired, attempts left) · claimed -> expired (lease expired, attempts used up)
//   queued | claimed -> cancelled (human). A terminal state never moves again.
//   queued -> succeeded | failed only for the late result / fail of the latest, lease-expired attempt (decision 4).

export const REQUEST_STATES = ['queued', 'claimed', 'succeeded', 'failed', 'cancelled', 'expired'] as const;
export type RequestState = (typeof REQUEST_STATES)[number];

export const TERMINAL_REQUEST_STATES: readonly RequestState[] = ['succeeded', 'failed', 'cancelled', 'expired'];

export const LEGAL_REQUEST_PAIRS: Readonly<Record<RequestState, readonly RequestState[]>> = {
  // queued -> succeeded | failed: the late result / fail of an attempt whose lease expired while nobody else took the request (decision 4).
  queued: ['claimed', 'cancelled', 'succeeded', 'failed'],
  claimed: ['succeeded', 'failed', 'queued', 'expired', 'cancelled'],
  succeeded: [],
  failed: [],
  cancelled: [],
  expired: [],
};

export const ATTEMPT_OUTCOMES = ['running', 'succeeded', 'failed', 'lease_expired'] as const;
export type AttemptOutcome = (typeof ATTEMPT_OUTCOMES)[number];

export const VERDICTS = ['pass', 'fail', 'incomplete'] as const;
export type Verdict = (typeof VERDICTS)[number];

export function canMoveRequest(from: RequestState, to: RequestState): boolean {
  return LEGAL_REQUEST_PAIRS[from].includes(to);
}

export function isTerminalRequest(state: RequestState): boolean {
  return TERMINAL_REQUEST_STATES.includes(state);
}

/** What a lease expiry does: back to `queued` while attempts remain, else `expired`. */
export function stateAfterLeaseExpiry(attemptCount: number, maxAttempts: number): 'queued' | 'expired' {
  return attemptCount >= maxAttempts ? 'expired' : 'queued';
}

export const PRIORITY_MIN = 0;
export const PRIORITY_MAX = 2;
export const MAX_ATTEMPTS_DEFAULT = 3;
export const MAX_ATTEMPTS_LIMIT = 10;
