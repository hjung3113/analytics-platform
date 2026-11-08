// 기준 낡음 (design log-test-datasets §3.4): whether an APPROVED baseline's reference points changed since it was approved. Pure: the caller
// reads the current values (Source check, effective spec pin) and passes what it learned. Computed at read time, never stored, and it never
// changes the approval — it is a badge.
//
// The rule that matters: a value that could not be read is `unknown`, never `stale`. Staleness is asserted only from a comparison that
// actually ran. So `state` is `stale` only when `reasons` is not empty; otherwise `unknown` when some reference could not be judged, else
// `fresh`.

import type { FileCheckState } from './availability.js';
import type { ProfilePin } from './baseline-input.js';

export const STALE_REASONS = ['file_hash_changed', 'file_unavailable', 'spec_pin_changed', 'rule_set_changed', 'parser_changed', 'engine_profile_changed'] as const;
export type StaleReason = (typeof STALE_REASONS)[number];
/** The reference points a baseline can be judged on. */
export const STALE_ASPECTS = ['files', 'spec_pin', 'rule_set', 'parser', 'engine_profile'] as const;
export type StaleAspect = (typeof STALE_ASPECTS)[number];

export interface StaleSummary {
  state: 'fresh' | 'stale' | 'unknown';
  /** Asserted reasons (a comparison ran and differed). */
  reasons: StaleReason[];
  /** Reference points that could not be judged (no port, access denied, not readable, no engine capability read yet). */
  unknown: StaleAspect[];
}

export interface CurrentSpecPin {
  revisionId: string;
  changeSetDigest: string;
}

export interface StaleInput {
  /** Per-file check states of the baseline's revision; `null` = no check was made (no Source port). */
  files: readonly FileCheckState[] | null;
  /** The baseline's pin. */
  pin: ProfilePin;
  /** The effective spec now for the pinned model/software; `null` = it could not be read (no published spec, unknown model). Ignored without a pinned spec. */
  currentSpecPin: CurrentSpecPin | null;
}

export function computeStale(input: StaleInput): StaleSummary {
  const reasons: StaleReason[] = [];
  const unknown: StaleAspect[] = [];

  // Files: a mismatch or an absence is asserted from the file that showed it; a file the check could not settle (access denied, hash not
  // readable, port without support, error) makes the files aspect unknown unless another file already asserted a reason.
  if (input.files === null) unknown.push('files');
  else {
    const states = input.files;
    if (states.includes('hash_mismatch')) reasons.push('file_hash_changed');
    if (states.includes('absent')) reasons.push('file_unavailable');
    const unsettled = states.some((s) => s !== 'match' && s !== 'hash_mismatch' && s !== 'absent');
    if (unsettled) unknown.push('files');
  }

  const pinned = input.pin.specPin;
  if (pinned) {
    if (input.currentSpecPin === null) unknown.push('spec_pin');
    else if (input.currentSpecPin.revisionId !== pinned.revisionId || input.currentSpecPin.changeSetDigest !== pinned.changeSetDigest) reasons.push('spec_pin_changed');
  }

  // No engine capability read exists yet (design §9): a pinned value cannot be compared, so it is unknown. An unpinned one has nothing to compare.
  if (input.pin.ruleSetRevision !== undefined) unknown.push('rule_set');
  if (input.pin.parserVersion !== undefined) unknown.push('parser');
  if (input.pin.engineProfileRef !== undefined) unknown.push('engine_profile');

  const state = reasons.length > 0 ? 'stale' : unknown.length > 0 ? 'unknown' : 'fresh';
  return { state, reasons, unknown };
}
