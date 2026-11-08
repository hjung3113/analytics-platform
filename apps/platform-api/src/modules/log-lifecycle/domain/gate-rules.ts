// The Gate decision rules (#1446 e, design §3). Pure and DB-free. The Gate is a HUMAN business approval recorded next to
// the machine verdicts, never instead of them: nothing here reads or changes a verdict, a rule result or an AI opinion
// (there is none). Self approval (decider = requester) is NOT refused (owner 2026-11-07, D3): `isSelfApproved` only marks it.

import type { FieldError } from '../../menu-dispatch/types.js';
import type { Verdict } from './request-states.js';
import { gateTargetFor } from './stage-transitions.js';

export const GATE_DECISIONS = ['approved', 'rejected', 'exception'] as const;
export type GateDecisionKind = (typeof GATE_DECISIONS)[number];

/** A decision that moves the project's stage. `rejected` records the refusal and leaves the stage. */
export const movesStage = (decision: GateDecisionKind): boolean => decision !== 'rejected';

export interface GateAttempt {
  attemptId: string;
  attemptNo: number;
  requestId: string;
  verdict: Verdict;
  ruleSetRevision: string | null;
  inputManifestDigest: string;
  endedAt: string;
}

/** The attempt the decision rests on: the most recent `succeeded` one (the list is oldest first, as the read returns it). */
export function decisiveAttempt<T extends { verdict: string }>(succeededOldestFirst: readonly T[]): T | null {
  return succeededOldestFirst.length === 0 ? null : (succeededOldestFirst[succeededOldestFirst.length - 1] as T);
}

export interface GateJudgement {
  decision: GateDecisionKind;
  /** Verdict of the decisive attempt; null = the Round has no succeeded attempt. */
  verdict: Verdict | null;
}

/**
 * `approved` only with a `pass`; `fail`, `incomplete` or no attempt pass only through `exception` (the exception fields
 * themselves are the input parser's); an `exception` over a `pass` is refused, so an exception always means "the
 * machine did not pass" in the history. `rejected` is always allowed.
 */
export function judgeDecision({ decision, verdict }: GateJudgement): FieldError | null {
  if (decision === 'approved' && verdict !== 'pass') return { path: ['decision'], code: 'verdict_not_pass' };
  if (decision === 'exception' && verdict === 'pass') return { path: ['decision'], code: 'exception_not_needed' };
  return null;
}

export type TargetJudgement = { ok: true } | { ok: false; error: FieldError };

/**
 * The target must be the project's next stage; `beta -> completed` also needs a software on the project, but only when
 * the decision moves the stage (`movesStage`): a rejection leaves the stage unchanged and is always recordable.
 */
export function judgeTarget(from: string, target: string, softwareId: string | null, movesTheStage = true): TargetJudgement {
  if (gateTargetFor(from) !== target) return { ok: false, error: { path: ['targetStage'], code: 'illegal_transition' } };
  if (movesTheStage && from === 'beta' && target === 'completed' && softwareId === null) {
    return { ok: false, error: { path: ['targetStage'], code: 'software_required' } };
  }
  return { ok: true };
}

/**
 * Self approval: the decider is the requester of the Round's latest 검증 요청, or, when the Round has none, its opener.
 * The mark is stored with the decision and shown in the history; it never blocks.
 */
export function isSelfApproved(deciderId: string, latestRequesterId: string | null, roundOpenerId: string): boolean {
  return deciderId === (latestRequesterId ?? roundOpenerId);
}

export interface GateBasisInput {
  /** Every `succeeded` attempt of the Round, oldest first. */
  attempts: readonly GateAttempt[];
  specPin: unknown;
  sampleManifestDigest: string;
  /** Digest of the request the decisive attempt belongs to, else of the latest request; null = no request. */
  requestDigest: string | null;
  /** 수동 검증 첨부: attachment ids and link times only (no file name, size or content). */
  evidenceLinks: readonly { attachmentId: string; linkedAt: string }[];
}

export interface GateBasis {
  version: 1;
  attempts: GateAttempt[];
  decisiveAttemptId: string | null;
  decisiveVerdict: Verdict | null;
  specPin: unknown;
  sampleManifestDigest: string;
  requestDigest: string | null;
  evidenceLinks: { attachmentId: string; linkedAt: string }[];
}

/**
 * The evidence snapshot, frozen with the decision. Everything a later staleness comparison needs (`spec_pin`,
 * `rule_set_revision`, `input_manifest_digest`) is in it, so adding that calculation never edits a past row (design §9).
 */
export function buildBasis(input: GateBasisInput): GateBasis {
  const decisive = decisiveAttempt(input.attempts);
  return {
    version: 1,
    attempts: input.attempts.map((a) => ({ ...a })),
    decisiveAttemptId: decisive?.attemptId ?? null,
    decisiveVerdict: decisive?.verdict ?? null,
    specPin: input.specPin ?? null,
    sampleManifestDigest: input.sampleManifestDigest,
    requestDigest: input.requestDigest,
    evidenceLinks: input.evidenceLinks.map((l) => ({ attachmentId: l.attachmentId, linkedAt: l.linkedAt })),
  };
}
