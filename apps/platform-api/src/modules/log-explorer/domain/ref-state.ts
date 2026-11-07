// The state an EvidenceRef carries when an investigation is read (#1468 b, design §3.2): a stored ref is never deleted
// when access is lost, it is shown with a state instead (`no_access` = «권한 없음»). Node b knows two causes, both
// about the READER: the investigation capability (`explorer.investigate`) is no longer held, or the Round a
// round-origin investigation points at cannot be resolved for the reader. The Source ACL (`explorer.source.read` on
// `sourceOwner`) needs the SourceReadPort of nodes a/c and is NOT judged here: every ref says `sourceAccess:
// 'unchecked'`, so a client never mistakes `available` for «the Source would open it». Node c fills that seam.
// Pure and DB-free.

export type RefNoAccessReason = 'capability_lost' | 'round_not_visible';
export type RefState = { code: 'available' } | { code: 'no_access'; reason: RefNoAccessReason };

export interface RefStateInput {
  /** The reader holds `explorer.investigate` now. */
  holdsInvestigate: boolean;
  /** `origin='standalone'`, or the Round resolved for the reader. */
  setResolved: boolean;
}

/** One state for every ref of an investigation: the causes above apply to all of its refs alike. */
export function refStateOf(input: RefStateInput): RefState {
  if (!input.holdsInvestigate) return { code: 'no_access', reason: 'capability_lost' };
  if (!input.setResolved) return { code: 'no_access', reason: 'round_not_visible' };
  return { code: 'available' };
}
