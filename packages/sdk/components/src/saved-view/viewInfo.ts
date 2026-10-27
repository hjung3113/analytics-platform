import type { ApprovalRequestInfo as StoredApprovalRequest, ChangeLine, Result } from '@ap/contracts';
import type { DiagnoseReason } from '@ap/kernel';

/** What `diagnoseSavedView` found for one entry; its result is passed in as it is. A plain string is shown as written. */
export type ViewDiagnosis = {
  status: 'ok' | 'stale' | 'denied';
  reasons: readonly (DiagnoseReason | string)[];
  /** A meaning-preserving upgrade; the preview is shown before the user confirms. Absent = re-select with the stored condition kept. */
  migration?: { preview: readonly ChangeLine[] };
};

/** The pending application behind an approval state (the contract's request without its view id, which the caller keys by). */
export type ApprovalRequestInfo = Omit<StoredApprovalRequest, 'viewId'>;

export type ViewActionOutcome = Result<unknown>;
export type ViewDecideHandler = (id: string, decision: 'approve' | 'reject', note: string | undefined, expectedVersion: number) => Promise<ViewActionOutcome>;
export type ViewRevokeHandler = (id: string, expectedVersion: number) => Promise<ViewActionOutcome>;

const KST = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
/** Wall-clock time of the platform (KST), the default when the caller gives no formatter. */
export const formatKst = (ms: number): string => KST.format(new Date(ms));

export const APPROVAL_TONE = { none: 'neutral', pending: 'warning', approved: 'success', rejected: 'danger' } as const;
