// The state table of a human validation issue (#1808 H3). Pure. The guard trigger
// `log_lifecycle.validation_issue_transition_guard` carries the same pairs between the LEGAL_ISSUE_PAIRS markers of its
// migration (drift test). The current state is the last transition's `to_state`, or `reported` when there is none.
// No rule result, verdict, opinion or Gate is ever an input here: a PASS never closes and a FAIL never reopens.

export const ISSUE_STATES = ['reported', 'investigating', 'fix_requested', 'vendor_inquiry', 'on_hold', 'fix_verified', 'by_design', 'waived', 'dismissed'] as const;
export type IssueState = (typeof ISSUE_STATES)[number];
export const INITIAL_ISSUE_STATE: IssueState = 'reported';
/** `on_hold` stays open: it is still counted unresolved. */
export const OPEN_ISSUE_STATES = ['reported', 'investigating', 'fix_requested', 'vendor_inquiry', 'on_hold'] as const satisfies readonly IssueState[];
export const CLOSED_ISSUE_STATES = ['fix_verified', 'by_design', 'waived', 'dismissed'] as const satisfies readonly IssueState[];

/** Every move the guard trigger accepts, `from -> allowed tos` (SQL order). Terminal: by_design, waived, dismissed. */
export const LEGAL_ISSUE_PAIRS: Readonly<Record<IssueState, readonly IssueState[]>> = {
  reported: ['investigating', 'dismissed'],
  investigating: ['fix_requested', 'vendor_inquiry', 'on_hold', 'by_design', 'waived', 'dismissed'],
  fix_requested: ['investigating', 'vendor_inquiry', 'on_hold', 'waived', 'fix_verified'],
  vendor_inquiry: ['investigating', 'fix_requested', 'on_hold', 'by_design', 'waived'],
  on_hold: ['investigating'],
  // Recurrence after a verified fix: a person reopens; nothing reopens automatically.
  fix_verified: ['investigating'],
  by_design: [],
  waived: [],
  dismissed: [],
};

export const isIssueState = (value: unknown): value is IssueState => typeof value === 'string' && (ISSUE_STATES as readonly string[]).includes(value);
export const isOpenIssueState = (state: IssueState): boolean => (OPEN_ISSUE_STATES as readonly string[]).includes(state);
export const canMoveIssue = (from: IssueState, to: IssueState): boolean => LEGAL_ISSUE_PAIRS[from].includes(to);
export const currentIssueState = (lastToState: string | null | undefined): IssueState => (isIssueState(lastToState) ? lastToState : INITIAL_ISSUE_STATE);

export interface TransitionInput {
  reason: string | null;
  assigneeActorId: string | null;
  basisCommentId: string | null;
  occurrenceId: string | null;
  duplicateOfIssueId: string | null;
}
export type TransitionField = keyof TransitionInput;
export interface TransitionRefusal { path: TransitionField | 'toState'; code: 'illegal_transition' | 'required' | 'not_allowed' }

/** Which inputs a move needs or forbids. `seq` is the new transition's sequence (1 = the first transition). */
export function transitionRequirements(from: IssueState, to: IssueState, seq: number): Record<TransitionField, 'required' | 'optional' | 'forbidden'> {
  return {
    // Every transition except the first (reported -> investigating) carries a reason; dismissed always does.
    reason: seq === 1 && to !== 'dismissed' ? 'optional' : 'required',
    // From `investigating` on, someone owns the issue (self-assignment allowed). `dismissed` from `reported` has no owner yet.
    assigneeActorId: to === 'dismissed' && from === 'reported' ? 'optional' : 'required',
    // The vendor is not a platform user: its answer is a thread comment the assignee cites.
    basisCommentId: to === 'on_hold' || to === 'waived' || (to === 'by_design' && from === 'vendor_inquiry') ? 'required' : 'optional',
    occurrenceId: to === 'fix_verified' ? 'required' : 'forbidden',
    duplicateOfIssueId: to === 'dismissed' ? 'optional' : 'forbidden',
  };
}

/** Legality and required/forbidden inputs, in one place; the DB CHECKs and guard repeat them. */
export function judgeTransition(from: IssueState, to: IssueState, seq: number, input: TransitionInput): TransitionRefusal[] {
  if (!canMoveIssue(from, to)) return [{ path: 'toState', code: 'illegal_transition' }];
  const rules = transitionRequirements(from, to, seq);
  const refusals: TransitionRefusal[] = [];
  for (const field of Object.keys(rules) as TransitionField[]) {
    if (rules[field] === 'required' && input[field] === null) refusals.push({ path: field, code: 'required' });
    if (rules[field] === 'forbidden' && input[field] !== null) refusals.push({ path: field, code: 'not_allowed' });
  }
  return refusals;
}

/**
 * The single permission rule of a transition (advisor, owner-delegated, reversible): every move needs
 * `lifecycle.issue.triage`; `waived` additionally needs `lifecycle.gate.decide` held by an `internal_member` human in a
 * session. `on_hold` needs triage only. Flip the rule here and nowhere else.
 */
export function transitionPolicy(to: IssueState): { capabilities: readonly ('lifecycle.issue.triage' | 'lifecycle.gate.decide')[]; humanOnly: boolean } {
  return to === 'waived'
    ? { capabilities: ['lifecycle.issue.triage', 'lifecycle.gate.decide'], humanOnly: true }
    : { capabilities: ['lifecycle.issue.triage'], humanOnly: false };
}
