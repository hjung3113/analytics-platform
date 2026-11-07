// The status flow of a knowledge draft (#1198, design v0.6 §6.4). Pure. The DB guard trigger `knowledge.draft_guard`
// (migration of #1198 a) and the services use the same table: `LEGAL_DRAFT_STATUS_PAIRS` is the union of every move the
// guard accepts and its SQL twin sits between the `LEGAL_DRAFT_STATUS_PAIRS begin/end` comments of the migration;
// `draft-transitions.test.ts` pins them together. Node a's service moves a draft only through `canSubmit` and
// `canWithdraw`; the moves out of `submitted` to `approved` / `rejected` / `changes_requested` are the review decisions
// of node b (the guard allows them now, no caller exists yet). `approved`, `rejected` and `withdrawn` are final.

export const DRAFT_STATUSES = ['draft', 'submitted', 'changes_requested', 'approved', 'rejected', 'withdrawn'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];
export const FINAL_DRAFT_STATUSES = ['approved', 'rejected', 'withdrawn'] as const satisfies readonly DraftStatus[];

export const isDraftStatus = (value: unknown): value is DraftStatus =>
  typeof value === 'string' && (DRAFT_STATUSES as readonly string[]).includes(value);
export const isFinalDraftStatus = (status: string): boolean => (FINAL_DRAFT_STATUSES as readonly string[]).includes(status);

/** Every move the guard trigger accepts, `from -> allowed tos` (SQL order). */
export const LEGAL_DRAFT_STATUS_PAIRS: Readonly<Record<DraftStatus, readonly DraftStatus[]>> = {
  draft: ['submitted', 'withdrawn'],
  // node b: approved / rejected / changes_requested are the review decisions.
  submitted: ['approved', 'rejected', 'changes_requested', 'withdrawn'],
  changes_requested: ['submitted', 'withdrawn'],
  approved: [],
  rejected: [],
  withdrawn: [],
};

/** Statuses in which the author may still edit the proposal (an edit during review makes the reviewer's digest stale). */
export const isEditableStatus = (status: string): boolean => !isFinalDraftStatus(status);

export const canSubmit = (from: string): boolean => from === 'draft' || from === 'changes_requested';
export const canWithdraw = (from: string): boolean => from === 'draft' || from === 'submitted' || from === 'changes_requested';
