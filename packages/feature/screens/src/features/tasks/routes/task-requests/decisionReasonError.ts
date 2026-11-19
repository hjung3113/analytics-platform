import { TASK_REQUEST_COPY } from '../../../../lib/copy/task-requests';
import type { DecisionAction } from './TaskRequestDecisionDialog';

/** The one required-reason rule and message source for decision forms and submission. */
export function decisionReasonError(
  action: DecisionAction,
  isSelfApproval: boolean,
  value: string,
): string | null {
  if (value.trim() !== '') return null;
  if (action === 'approve') {
    return isSelfApproval ? TASK_REQUEST_COPY.selfApprovalReasonRequired : null;
  }
  if (action === 'request-more-evidence') return TASK_REQUEST_COPY.evidenceNoteRequired;
  return TASK_REQUEST_COPY.rejectReasonRequired;
}
