import { mapUnknownError } from '@/lib/api/errorMapper';
import { mintIdempotencyKey } from '@/lib/api/idempotency';
import { fetchPermissionCheckViaClient } from '@/lib/api/permission-reads';
import {
  approveTaskRequest,
  rejectTaskRequest,
  requestMoreEvidenceForTaskRequest,
} from '@/lib/api/task-requests';
import type { ApiError } from '@/lib/api/types';
import { TASK_REQUEST_COPY } from '@/lib/copy/task-requests';
import { useHostNavigate, useHostNotice, useHostSeam } from '@/lib/host/host-seam';
import { searchHref } from '@/lib/host/search';
import { invalidateNavCounts } from '@/lib/query/navCounts';
import { draftRecord, draftString, useSessionDraft } from '@/lib/session-draft/useSessionDraft';
import type { TaskRequestDto } from '@ap/feature-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as React from 'react';

import type { DecisionAction, DecisionDialogState } from './TaskRequestDecisionDialog';
import {
  canApproveTaskRequest,
  canRejectTaskRequest,
  canRequestEvidenceForTaskRequest,
} from './predicates';

export interface UseTaskRequestDecisionArgs {
  item: TaskRequestDto;
  currentActorId: string | null;
  currentRole: string | null;
  /** Called after the approve toast action navigates, so the queue follows the reopened request. */
  onReopen?: ((id: string) => void) | undefined;
}

export interface UseTaskRequestDecisionResult {
  dialog: DecisionDialogState | null;
  isSubmitting: boolean;
  isPending: boolean;
  /** Last decision mutation's settled result, independent of dialog/toast state. */
  result: TaskRequestDto | null;
  /** Last decision mutation's settled error, independent of dialog/toast state. */
  error: ApiError | null;
  isSelfApproval: boolean;
  canApprove: boolean;
  canReject: boolean;
  canRequestEvidence: boolean;
  canSelfApprove: boolean;
  approve: () => void;
  requestEvidence: () => void;
  reject: () => void;
  submitDecision: (event: React.FormEvent<HTMLFormElement>) => void;
  changeValue: (value: string) => void;
  close: () => void;
}

export function useTaskRequestDecision({
  item,
  currentActorId,
  currentRole,
  onReopen,
}: UseTaskRequestDecisionArgs): UseTaskRequestDecisionResult {
  const queryClient = useQueryClient();
  const navigate = useHostNavigate();
  const { notify } = useHostNotice();
  const { canLink, notifyError } = useHostSeam();
  const isSelfApproval = currentActorId === item.requester_actor_id;
  const [decisionDialog, setDecisionDialog] = React.useState<DecisionDialogState | null>(null);
  const [isDecisionSubmitting, setIsDecisionSubmitting] = React.useState(false);
  const decisionSubmittingRef = React.useRef(false);
  const lastItemRef = React.useRef(item);
  // One Idempotency-Key per open dialog until success, so a retry after a lost response replays the same request.
  const keyRef = React.useRef<string | null>(null);
  // The last submitted action + normalized body. A retry reuses the key only for an identical payload (a lost response must
  // replay); a different payload under the same key would be rejected as key reuse, so only then is the key rotated.
  const sentRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (lastItemRef.current === item) return;
    lastItemRef.current = item;
    keyRef.current = null;
    sentRef.current = null;
    setDecisionDialog(null);
    setIsDecisionSubmitting(false);
    decisionSubmittingRef.current = false;
  }, [item]);

  // The open decision and its typed reason are kept across a session expiry (#1887) and reopen for the same request.
  const { discard: discardDraft } = useSessionDraft({
    key: `task-request-decision:${item.id}`,
    read: () =>
      decisionDialog !== null && decisionDialog.requestId === item.id && decisionDialog.value !== ''
        ? { action: decisionDialog.action, value: decisionDialog.value }
        : null,
    parse: (value) => {
      const record = draftRecord(value);
      const action = record === null ? null : draftString(record, 'action');
      const text = record === null ? null : draftString(record, 'value');
      const decision: DecisionAction | null =
        action === 'approve' || action === 'request-more-evidence' || action === 'reject' ? action : null;
      return text !== null && decision !== null ? { action: decision, value: text } : null;
    },
    restore: (draft) => setDecisionDialog({ requestId: item.id, action: draft.action, value: draft.value, error: null }),
  });

  const selfApprovalCheck = useQuery({
    queryKey: ['permission-check', 'task_request.self_approve', item.primary_managed_system_id],
    queryFn: ({ signal }) =>
      fetchPermissionCheckViaClient('task_request.self_approve', {
        managedSystemId: item.primary_managed_system_id,
        signal,
      }),
    enabled: isSelfApproval && currentRole !== 'admin',
    staleTime: 60 * 1000,
  });
  const canSelfApprove = currentRole === 'admin' || selfApprovalCheck.data?.state === 'approved';
  const canApprove = canApproveTaskRequest(item.status);
  const canReject = canRejectTaskRequest(item.status);
  const canRequestEvidence = canRequestEvidenceForTaskRequest(item.status);

  const decisionMutation = useMutation<
    TaskRequestDto,
    ApiError,
    { action: 'approve' | 'reject' | 'request-more-evidence'; reason?: string; note?: string }
  >({
    mutationFn: async (vars) => {
      const payload = JSON.stringify(vars);
      if (sentRef.current !== null && sentRef.current !== payload) keyRef.current = mintIdempotencyKey();
      const key = (keyRef.current ??= mintIdempotencyKey());
      sentRef.current = payload;
      if (vars.action === 'approve') {
        return approveTaskRequest(item.id, vars.reason ? { reason: vars.reason } : {}, key);
      }
      if (vars.action === 'reject') {
        return rejectTaskRequest(item.id, { reason: vars.reason ?? '' }, key);
      }
      return requestMoreEvidenceForTaskRequest(item.id, { note: vars.note ?? '' }, key);
    },
    onSuccess: (_result, variables) => {
      decisionSubmittingRef.current = false;
      setIsDecisionSubmitting(false);
      keyRef.current = null;
      sentRef.current = null;
      setDecisionDialog(null);
      discardDraft();
      invalidateNavCounts(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['task-request'] });
      void queryClient.invalidateQueries({ queryKey: ['home-pending-task-requests'] });
      void queryClient.invalidateQueries({ queryKey: ['home-my-tasks'] });
      const href = searchHref('/tasks', { view: 'requests', param: item.id });
      notify({
        tone: 'success',
        message: TASK_REQUEST_COPY.decisions[variables.action],
        ...(variables.action === 'approve' && canLink(href)
          ? {
              action: {
                label: TASK_REQUEST_COPY.convertToTask,
                onAction: () => {
                  navigate(href);
                  onReopen?.(item.id);
                },
              },
            }
          : {}),
      });
    },
    onError: (err) => {
      decisionSubmittingRef.current = false;
      setIsDecisionSubmitting(false);
      // #561: computed outside the updater; React runs updaters during render, so a throw
      // there (a non-ApiError has no envelope) would take down the whole screen.
      const message = mapUnknownError(err).message;
      // Only a validation rejection points at the reason field; 409/404/429/network do not.
      const reasonInvalid =
        err.code === 'validation.failed' || err.code === 'validation.sensitive_reason_required';
      if (err.status === 409 || err.status === 404) {
        void queryClient.invalidateQueries({ queryKey: ['task-requests'] });
        void queryClient.invalidateQueries({ queryKey: ['task-request'] });
      }
      setDecisionDialog((current) => {
        if (current) return { ...current, error: message, reasonInvalid };
        notifyError(message);
        return current;
      });
    },
  });

  function approve(): void {
    if (isSelfApproval && !canSelfApprove) {
      notifyError('본인 승인에는 범위가 지정된 권한이 필요합니다.');
      return;
    }
    keyRef.current = mintIdempotencyKey();
    sentRef.current = null;
    setDecisionDialog({ requestId: item.id, action: 'approve', value: '', error: null });
  }

  function requestEvidence(): void {
    keyRef.current = mintIdempotencyKey();
    sentRef.current = null;
    setDecisionDialog({
      requestId: item.id,
      action: 'request-more-evidence',
      value: '',
      error: null,
    });
  }

  function reject(): void {
    keyRef.current = mintIdempotencyKey();
    sentRef.current = null;
    setDecisionDialog({ requestId: item.id, action: 'reject', value: '', error: null });
  }

  function submitDecision(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (!decisionDialog || decisionSubmittingRef.current) return;
    const value = decisionDialog.value.trim();
    const error =
      decisionDialog.action === 'approve' && isSelfApproval && value.length === 0
        ? '본인 승인 사유를 입력해 주세요.'
        : decisionDialog.action === 'request-more-evidence' && value.length === 0
          ? '근거 메모를 입력해 주세요.'
          : decisionDialog.action === 'reject' && value.length === 0
            ? '반려 사유를 입력해 주세요.'
            : null;
    if (error) {
      setDecisionDialog((current) =>
        current ? { ...current, error, reasonInvalid: true } : current,
      );
      return;
    }
    decisionSubmittingRef.current = true;
    setIsDecisionSubmitting(true);
    if (decisionDialog.action === 'approve') {
      decisionMutation.mutate(value ? { action: 'approve', reason: value } : { action: 'approve' });
      return;
    }
    decisionMutation.mutate(
      decisionDialog.action === 'reject'
        ? { action: 'reject', reason: value }
        : { action: 'request-more-evidence', note: value },
    );
  }

  function changeValue(value: string): void {
    setDecisionDialog((current) => (current ? { ...current, value, error: null } : current));
  }

  function close(): void {
    if (decisionSubmittingRef.current) return;
    setDecisionDialog(null);
    discardDraft();
  }

  return {
    dialog: decisionDialog,
    isSubmitting: isDecisionSubmitting,
    isPending: decisionMutation.isPending,
    result: decisionMutation.data ?? null,
    error: decisionMutation.error ?? null,
    isSelfApproval,
    canApprove,
    canReject,
    canRequestEvidence,
    canSelfApprove,
    approve,
    requestEvidence,
    reject,
    submitDecision,
    changeValue,
    close,
  };
}
