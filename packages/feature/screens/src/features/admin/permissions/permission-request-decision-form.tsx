import {
  type PermissionRequestAdminDetail,
  isCapability,
  isDeclaredCapabilityId,
  isSensitiveCapability,
} from '@ap/feature-shared';
import { OutlineBadge } from '../../../ui/index';
import {
  Button,
  Checkbox,
  DatePicker,
  FieldList,
  FieldRow,
  Input,
  PanelSectionTitle,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  ToggleGroup,
  ToggleGroupItem,
} from '@ap/ui';
import * as React from 'react';
import { createPortal } from 'react-dom';

import { scopeRoomsFor } from '../../../components/PermissionScopeTargetFields';
import { mintIdempotencyKey } from '../../../lib/api/idempotency';
import { useMeBridge } from '../../../lib/api/me';
import type { PermissionRequestDecisionAction } from '../../../lib/api/permission-admin';
import { ADMIN_PERMISSIONS_COPY, PERMISSION_APPROVAL_SCOPE_COPY } from '../../../lib/copy/admin-permissions';
import { PERMISSION_GROUP_COPY } from '../../../lib/copy/permission-groups';
import { GLOSSARY } from '../../../lib/copy/glossary';
import { usePermissionScopeCandidates } from '../../../lib/api/permission-scope-candidates';
import {
  PERMISSION_SCOPE_COPY,
  formatPermissionScopeTarget,
  requestedScopeTargetLabel,
} from '../../../lib/copy/permission-scope';
import { formatDateOnly } from '../../../lib/format/datetime';
import { useHostSeam } from '../../../lib/host/host-seam';

import { useWorkspaceSettings } from '../settings/use-workspace-settings.js';
import { ReviewCapabilityName } from './declared-capability-name.js';
import { hasPermissionDecisionActions } from './permission-decision-actions';
import { useDecidePermissionRequest } from './useDecidePermissionRequest.js';

const ACTIONS: Array<{
  value: PermissionRequestDecisionAction;
  label: string;
  needsReason: boolean;
}> = [
  { value: 'approve', label: '승인', needsReason: false },
  { value: 'need-more-info', label: '추가 정보 요청', needsReason: true },
  { value: 'reject', label: '거절', needsReason: true },
  { value: 'deny', label: '명시적 거부', needsReason: true },
];

type ApprovalExpirationMode = 'keep' | 'change' | 'clear';
type ManagedScopeChoice = { kind: 'requested' } | { kind: 'picked' | 'unavailable'; value: string };

// Approval keeps the requested Site·공정 target unless a Site request is narrowed to one 공정 of the same site,
// the only change the server allows (ADR-0154; permissions.md «Request and decision fields»).
const REQUESTED_SCOPE = 'requested';
const ROOM_PREFIX = 'room:';

const APPROVAL_EXPIRATION_ERROR = '만료일은 현재 시각보다 이후여야 합니다.';

function localDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function isFutureApprovalExpiration(date: string, now = Date.now()): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;

  const deadline = new Date(`${date}T23:59:59.000Z`);
  return (
    Number.isFinite(deadline.getTime()) &&
    deadline.toISOString().slice(0, 10) === date &&
    deadline.getTime() > now
  );
}

function hasExpirationFieldError(error: unknown): boolean {
  if (
    typeof error !== 'object' ||
    error === null ||
    !('code' in error) ||
    error.code !== 'validation.failed' ||
    !('detail' in error)
  ) {
    return false;
  }

  const detail = error.detail;
  if (typeof detail !== 'object' || detail === null || !('fields' in detail)) return false;

  const fields = detail.fields;
  return (
    Array.isArray(fields) &&
    fields.some(
      (field: unknown) =>
        typeof field === 'object' &&
        field !== null &&
        'path' in field &&
        Array.isArray(field.path) &&
        field.path.includes('expiration'),
    )
  );
}

export type SystemNamesRead = { isFetching: boolean; retry: () => void };

export function PermissionRequestDecisionForm({
  request,
  footerTarget,
  batch,
  actorName,
  approvalSystemNames,
  systemNamesRead,
  scopeRadios = false,
  staleNoticeShown,
  discardedReason,
  onDraftChanged,
  onStaleConflict,
  onDecisionSucceeded,
  onActionPicked,
  onReviewCompleted,
}: {
  request: PermissionRequestAdminDetail;
  /** Undefined keeps the submit action inline. Null waits for the hosted footer to mount. */
  footerTarget?: HTMLElement | null;
  batch?: { id: string; items: PermissionRequestAdminDetail[] };
  actorName?: string | undefined;
  approvalSystemNames?: Readonly<Record<string, string>> | undefined;
  systemNamesRead?: SystemNamesRead | undefined;
  scopeRadios?: boolean;
  staleNoticeShown?: boolean;
  discardedReason?: string;
  onDraftChanged?: (draft: { revision: number; nonEmpty: boolean; reason: string }) => void;
  onStaleConflict?: () => void;
  onDecisionSucceeded?: (result: { id: string; revision: number }) => void;
  onActionPicked?: () => void;
  onReviewCompleted?: () => void;
}) {
  const { lang = 'ko' } = useHostSeam();
  const copy = PERMISSION_APPROVAL_SCOPE_COPY[lang];
  const [reviewBlocked, setReviewBlocked] = React.useState(false);
  const batchDecidable = batch?.items.filter(item => item.status === 'pending' || item.status === 'needs_more_info') ?? [];
  const grantable = batchDecidable.filter(item => item.allowed_actions.includes('approve') && !item.effective_access.decision.allow);
  const [approveIds, setApproveIds] = React.useState(() => grantable.map(item => item.id));
  const selectedBatchItems = grantable.filter(item => approveIds.includes(item.id));
  const approvalScopeCandidates = batch
    ? (selectedBatchItems[0]?.approval_scope_candidates ?? []).filter(candidate => selectedBatchItems.every(item => item.approval_scope_candidates.some(other => other.managed_system_id === candidate.managed_system_id && other.scope_kind === candidate.scope_kind && other.scope_site === candidate.scope_site && other.scope_room === candidate.scope_room)))
    : request.approval_scope_candidates;
  const managedScopeCandidates = approvalScopeCandidates.filter(
    candidate => candidate.scope_kind === undefined || candidate.scope_kind === 'managed_system',
  );
  const [action, setAction] = React.useState<PermissionRequestDecisionAction | null>(null);
  const [reason, setReason] = React.useState('');
  const [reasonAttempted, setReasonAttempted] = React.useState(false);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  const [policyCitation, setPolicyCitation] = React.useState('');
  const [peerReviewerAbsence, setPeerReviewerAbsence] = React.useState('');
  const [expirationMode, setExpirationMode] = React.useState<ApprovalExpirationMode>('keep');
  const [expirationValidationAttempted, setExpirationValidationAttempted] = React.useState(false);
  const [expirationFieldTouched, setExpirationFieldTouched] = React.useState(false);
  const [expirationDraftValid, setExpirationDraftValid] = React.useState(true);
  const [expirationDate, setExpirationDate] = React.useState(
    request.requested_expiration?.slice(0, 10) ?? '',
  );
  const intent = React.useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = React.useRef(false);
  const [scopeChoice, setScopeChoice] = React.useState<ManagedScopeChoice>({ kind: 'requested' });
  const approvedItems = batch ? selectedBatchItems : [request];
  const candidateValue = (id: string | null) => id ?? 'workspace';
  const pickedScope = scopeChoice.kind === 'picked' ? scopeChoice.value : null;
  const pickedScopeUnsupported = pickedScope !== null && !managedScopeCandidates.some(
    candidate => candidateValue(candidate.managed_system_id) === pickedScope,
  );
  // Require another explicit choice even if a later checklist change or refresh brings this candidate back.
  if (pickedScopeUnsupported) setScopeChoice({ kind: 'unavailable', value: pickedScope });
  const scopeUnavailable = scopeChoice.kind === 'unavailable' || pickedScopeUnsupported;
  const scope = scopeUnavailable ? '' : pickedScope ?? REQUESTED_SCOPE;
  const hasManagedScope = approvedItems.some(item => requestedScopeTargetLabel(item) === null);
  const overriddenSystem = pickedScope === 'workspace' ? null : pickedScope;
  const grantedManagedSystemId = hasManagedScope && pickedScope !== null && !scopeUnavailable
    && approvedItems.some(item => item.requested_managed_system_id !== overriddenSystem)
    ? overriddenSystem : undefined;
  const effectiveSystemId = (item: PermissionRequestAdminDetail) =>
    grantedManagedSystemId === undefined ? item.requested_managed_system_id : grantedManagedSystemId;
  const needsName = (id: string | null) => id !== null && !approvalSystemNames?.[id];
  const unresolvedGrant = approvedItems.some(item =>
    requestedScopeTargetLabel(item) === null && needsName(effectiveSystemId(item)));
  const unresolvedCandidate = managedScopeCandidates.some(candidate => needsName(candidate.managed_system_id));
  const missingName = systemNamesRead?.isFetching ? copy.loading : copy.unavailable;
  const systemLabel = (id: string | null) => id === null ? copy.allSystems : approvalSystemNames?.[id] ?? missingName;
  const approvalTargetLabel = (item: PermissionRequestAdminDetail) =>
    requestedScopeTargetLabel(item) ?? systemLabel(effectiveSystemId(item));
  const pickScope = (value: string) =>
    setScopeChoice(value === REQUESTED_SCOPE ? { kind: 'requested' } : { kind: 'picked', value });
  const previewId = React.useId();
  const systemNameStatusId = React.useId();
  const scopeUnavailableId = React.useId();
  const showApprovalPreview = action === 'approve' && !scopeUnavailable
    && approvedItems.length > 0 && (batch !== undefined || hasManagedScope);
  let approvalDescriptionId: string | undefined;
  if (action === 'approve') {
    if (scopeUnavailable) approvalDescriptionId = scopeUnavailableId;
    else if (unresolvedGrant) approvalDescriptionId = systemNameStatusId;
    else if (showApprovalPreview) approvalDescriptionId = previewId;
  }
  // The batch endpoint only takes a Managed System override and preserves each Site or room target.
  const siteRequest =
    !batch && request.requested_scope_kind === 'site' && request.requested_scope_site
      ? request.requested_scope_site
      : null;
  const [scopeNarrow, setScopeNarrow] = React.useState(REQUESTED_SCOPE);
  React.useEffect(() => {
    onDraftChanged?.({
      revision: request.revision,
      nonEmpty:
        action !== null ||
        reason !== '' ||
        policyCitation !== '' ||
        peerReviewerAbsence !== '' ||
        expirationMode !== 'keep' ||
        expirationDate !== (request.requested_expiration?.slice(0, 10) ?? '') ||
        scopeChoice.kind !== 'requested' ||
        scopeNarrow !== REQUESTED_SCOPE,
      reason,
    });
  }, [
    onDraftChanged,
    request.revision,
    request.requested_expiration,
    request.requested_managed_system_id,
    action,
    reason,
    policyCitation,
    peerReviewerAbsence,
    expirationMode,
    expirationDate,
    scopeChoice,
    scopeNarrow,
  ]);
  const mutation = useDecidePermissionRequest(
    (succeeded) => {
      submitting.current = false;
      if (succeeded) {
        intent.current = null;
        onReviewCompleted?.();
      }
    },
    () => {
      setReviewBlocked(true);
      setAction(null);
      setReason('');
      setReasonAttempted(false);
      setPolicyCitation('');
      setPeerReviewerAbsence('');
      setExpirationMode('keep');
      setExpirationDate(request.requested_expiration?.slice(0, 10) ?? '');
      setExpirationValidationAttempted(false);
      setExpirationFieldTouched(false);
      setExpirationDraftValid(true);
      intent.current = null;
      onStaleConflict?.();
    },
    (result) => onDecisionSucceeded?.(result),
  );
  const me = useMeBridge();
  const siteCandidateOffered = approvalScopeCandidates.some(
    (candidate) => candidate.scope_kind === 'site' && candidate.scope_site === siteRequest,
  );
  const captureCopy = ADMIN_PERMISSIONS_COPY.selfApprovalCapture;
  const workspaceSettings = useWorkspaceSettings();
  const minExpirationDate = localDateInputValue(new Date());
  const selectedAction = ACTIONS.find((candidate) => candidate.value === action) ?? null;
  // A declared capability (ADR-0157): the server's registry marks it sensitive through the selected read's risk signals.
  const declaredSensitive =
    isDeclaredCapabilityId(request.requested_capability) &&
    request.risk_indicators.some((indicator) => indicator.code === 'sensitive_capability');
  const needsReason =
    (action === 'approve' && batch !== undefined && (batchDecidable.length > selectedBatchItems.length || selectedBatchItems.some(item => item.risk_indicators.some(indicator => indicator.code === 'sensitive_capability')))) ||
    (selectedAction?.needsReason ?? false) ||
    (action === 'approve' &&
      ((isCapability(request.requested_capability) &&
        isSensitiveCapability(request.requested_capability)) ||
        declaredSensitive));
  const hasDecisionActions = hasPermissionDecisionActions(request);
  const isSelfApproval = request.administrative_authority.is_requester;
  const selfApprovalBlockedByPolicy =
    isSelfApproval &&
    (request.administrative_authority.permission_self_approval === 'forbidden' ||
      workspaceSettings.data?.permission_self_approval === 'forbidden');
  const showSelfApprovalCapture = isSelfApproval && action === 'approve';
  const selfApprovalReady =
    !showSelfApprovalCapture ||
    (policyCitation.trim().length >= 8 && peerReviewerAbsence.trim().length >= 8);
  const selfApprovalForbidden = showSelfApprovalCapture && selfApprovalBlockedByPolicy;
  const approvalExpirationChanged =
    action === 'approve' &&
    (expirationMode === 'clear'
      ? request.requested_expiration !== null
      : expirationMode === 'change' &&
        `${expirationDate}T23:59:59.000Z` !== request.requested_expiration);
  const expirationNeedsValidation =
    action === 'approve' &&
    expirationMode === 'change' &&
    (!expirationDraftValid || !isFutureApprovalExpiration(expirationDate));
  const expirationDateError =
    expirationNeedsValidation &&
    !isFutureApprovalExpiration(expirationDate) &&
    (expirationValidationAttempted || expirationFieldTouched)
      ? APPROVAL_EXPIRATION_ERROR
      : action === 'approve' &&
          expirationMode === 'change' &&
          expirationDraftValid &&
          hasExpirationFieldError(mutation.error)
        ? APPROVAL_EXPIRATION_ERROR
        : null;
  const submitDisabled =
    !hasDecisionActions ||
    (action === 'approve' && (scopeUnavailable || unresolvedGrant)) ||
    reviewBlocked ||
    action === null ||
    !selfApprovalReady ||
    selfApprovalForbidden ||
    mutation.isPending ||
    mutation.isSuccess ||
    mutation.error?.code === 'conflict.stale_write';

  React.useEffect(() => {
    intent.current = null;
    setScopeChoice({ kind: 'requested' });
    setScopeNarrow(REQUESTED_SCOPE);
    setAction(null);
    setReason('');
    setReasonAttempted(false);
    setPolicyCitation('');
    setPeerReviewerAbsence('');
    setExpirationMode('keep');
    setExpirationValidationAttempted(false);
    setExpirationFieldTouched(false);
    setExpirationDraftValid(true);
    setExpirationDate(request.requested_expiration?.slice(0, 10) ?? '');
  }, [request.requested_expiration, request.requested_managed_system_id]);

  let reasonError: string | null = null;
  if (reasonAttempted && batch && action === 'approve' && !selectedBatchItems.length)
    reasonError = PERMISSION_GROUP_COPY.selectionRequired;
  else if (reasonAttempted && needsReason && !reason.trim())
    reasonError = action === 'reject' ? ADMIN_PERMISSIONS_COPY.rejectReasonRequired : ADMIN_PERMISSIONS_COPY.reasonRequired;

  function submit() {
    if (action === null || submitDisabled || submitting.current) return;
    if (batch && action === 'approve' && !selectedBatchItems.length) {
      setReasonAttempted(true);
      reasonRef.current?.focus();
      return;
    }
    if (needsReason && !reason.trim()) {
      setReasonAttempted(true);
      reasonRef.current?.focus();
      return;
    }
    if (
      action === 'approve' &&
      expirationMode === 'change' &&
      (!expirationDraftValid || !isFutureApprovalExpiration(expirationDate))
    ) {
      setExpirationValidationAttempted(true);
      return;
    }
    const args = {
      ...(batch ? { batch: { id: batch.id, revisions: Object.fromEntries(batchDecidable.map(item => [item.id, item.revision])), approveIds: selectedBatchItems.map(item => item.id) } } : {}),
      id: request.id,
      expectedRevision: request.revision,
      action,
      reason: reason.trim(),
      ...(action === 'approve' && grantedManagedSystemId !== undefined ? { grantedManagedSystemId } : {}),
      ...(action === 'approve' && siteRequest !== null && scopeNarrow.startsWith(ROOM_PREFIX)
        ? { grantedScope: { site: siteRequest, room: scopeNarrow.slice(ROOM_PREFIX.length) } }
        : {}),
      ...(approvalExpirationChanged
        ? {
            expiration: expirationMode === 'clear' ? null : `${expirationDate}T23:59:59.000Z`,
          }
        : {}),
      ...(showSelfApprovalCapture
        ? {
            selfApproval: {
              policy_citation: policyCitation.trim(),
              peer_reviewer_absence: peerReviewerAbsence.trim(),
            },
          }
        : {}),
    };
    const fingerprint = JSON.stringify(args);
    if (intent.current?.fingerprint !== fingerprint)
      intent.current = { fingerprint, key: mintIdempotencyKey() };
    submitting.current = true;
    mutation.mutate({ ...args, idempotencyKey: intent.current.key });
  }

  const resetNotice =
    discardedReason !== undefined ? (
      <output
        className="text-sm text-text-secondary"
        data-testid="permission-decision-reset-notice"
      >
        <span className="block">{ADMIN_PERMISSIONS_COPY.decisionDraftReset}</span>
        {discardedReason ? (
          <span className="block whitespace-pre-wrap">
            {ADMIN_PERMISSIONS_COPY.discardedDecisionReason}: {discardedReason}
          </span>
        ) : null}
      </output>
    ) : null;
  if (!hasDecisionActions)
    return resetNotice ? (
      <section data-testid="permission-decision-section">{resetNotice}</section>
    ) : null;

  const submitAction = (
    <div className="flex flex-col gap-3">
      <Button
        type="button"
        onClick={submit}
        loading={mutation.isPending}
        disabled={submitDisabled}
        aria-describedby={approvalDescriptionId}
        data-testid="permission-decision-submit"
      >
        {batch && action === 'approve' ? PERMISSION_GROUP_COPY.approve(selectedBatchItems.length) : showSelfApprovalCapture
          ? '직접 승인 확정 · 감사 캡처'
          : selectedAction
            ? `${selectedAction.label} 처리`
            : '결정을 선택하세요'}
      </Button>
      <p className="text-xs text-text-muted">
        승인은 차단된 액션을 자동으로 실행하지 않습니다. 요청자는 다시 동일 액션을 명시적으로
        실행해야 합니다.
      </p>
    </div>
  );

  return (
    <section
      className="flex flex-col gap-3 border-t border-border-subtle pt-5"
      data-testid="permission-decision-section"
    >
      <PanelSectionTitle>결정</PanelSectionTitle>
      {resetNotice}
      {/* The shared single-choice control, so the choices read as selectable and the pick shows (#2674). */}
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        appearance="filter"
        className="w-fit flex-wrap justify-start"
        aria-label="결정 선택"
        value={action ?? ''}
        disabled={
          reviewBlocked ||
          mutation.isPending ||
          mutation.isSuccess ||
          mutation.error?.code === 'conflict.stale_write'
        }
        onValueChange={(value) => {
          const picked = ACTIONS.find((candidate) => candidate.value === value);
          // A single choice stays picked: clicking the current one again does not clear it.
          if (!picked || picked.value === action) return;
          setAction(picked.value);
          setReasonAttempted(false);
          setExpirationValidationAttempted(false);
          mutation.reset();
          onActionPicked?.();
        }}
      >
        {ACTIONS.filter(
          (candidate) =>
            request.allowed_actions.includes(
              candidate.value === 'need-more-info' ? 'need_more_info' : candidate.value,
            ) &&
            // Site·공정 grants have no explicit deny (ADR-0154 decision 2); revocation does that job.
            !(candidate.value === 'deny' && request.requested_capability === 'scope.read'),
        ).filter(candidate => !batch || candidate.value !== 'deny').map((candidate) => (
          <ToggleGroupItem
            key={candidate.value}
            value={candidate.value}
            appearance="selected-filter"
            disabled={candidate.value === 'approve' && selfApprovalBlockedByPolicy}
          >
            {candidate.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {batch && action === 'approve' ? <fieldset className="flex flex-col gap-2"><legend className="text-sm font-medium">{PERMISSION_GROUP_COPY.checklist}</legend>{batch.items.map(item => <div key={item.id} className="flex items-center gap-2"><Checkbox id={`batch-approve-${item.id}`} checked={approveIds.includes(item.id) && grantable.some(candidate => candidate.id === item.id)} disabled={mutation.isPending || !grantable.some(candidate => candidate.id === item.id)} onCheckedChange={checked => {
        setApproveIds(previous => checked ? [...previous, item.id] : previous.filter(id => id !== item.id));
      }} /><label htmlFor={`batch-approve-${item.id}`}><ReviewCapabilityName id={item.requested_capability} />{item.effective_access.decision.allow ? ` · ${PERMISSION_GROUP_COPY.held}` : ''}</label></div>)}<p className="text-xs text-text-secondary">{PERMISSION_GROUP_COPY.unchecked}</p></fieldset> : null}
      {selfApprovalBlockedByPolicy ? (
        <p className="text-xs text-accent-danger">
          운영 정책에서 직접 승인을 금지합니다. 다른 관리자가 이 요청을 승인해야 합니다.
        </p>
      ) : null}
      <label
        className="flex flex-col gap-2 text-sm text-text-secondary"
        htmlFor="permission-decision-reason"
      >
        사유{needsReason ? ' · 필수' : ' · 선택'}
        <Textarea
          id="permission-decision-reason"
          ref={reasonRef}
          aria-invalid={reasonError !== null}
          {...(reasonError ? { 'aria-describedby': 'permission-decision-reason-error' } : {})}
          disabled={mutation.isPending || reviewBlocked}
          maxLength={2000}
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setReasonAttempted(false);
            onActionPicked?.();
          }}
          placeholder="검토 사유 또는 요청할 정보를 입력하세요."
        />
      </label>
      {reasonError ? (
        <p
          id="permission-decision-reason-error"
          role="alert"
          className="text-xs text-accent-danger"
        >
          {reasonError}
        </p>
      ) : null}
      {!staleNoticeShown && (reviewBlocked || mutation.error?.code === 'conflict.stale_write') ? (
        <p role="alert" className="text-sm text-accent-danger">
          {ADMIN_PERMISSIONS_COPY.reviewAgain}
        </p>
      ) : null}
      {action === 'approve' && siteRequest !== null && siteCandidateOffered ? (
        <SiteApprovalScopeSelect
          site={siteRequest}
          value={scopeNarrow}
          onChange={setScopeNarrow}
          disabled={mutation.isPending}
        />
      ) : null}
      {action === 'approve' && (scopeUnavailable || (hasManagedScope && managedScopeCandidates.length > 0)) && (
        scopeRadios ? (
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium text-text-secondary">{copy.scope}</legend>
            <RadioGroup aria-label={copy.scope} value={scope} onValueChange={pickScope} disabled={mutation.isPending || reviewBlocked}>
              <div className="flex items-center gap-2 text-sm text-text-secondary">
                <RadioGroupItem id="permission-approval-requested" value={REQUESTED_SCOPE} />
                <label htmlFor="permission-approval-requested">{copy.requestedScope}</label>
              </div>
              {managedScopeCandidates.map(candidate => {
                const value = candidateValue(candidate.managed_system_id);
                const id = `permission-approval-${value}`;
                return <div key={value} className="flex items-center gap-2 text-sm text-text-secondary">
                  <RadioGroupItem id={id} value={value} disabled={needsName(candidate.managed_system_id)} />
                  <label htmlFor={id}>{systemLabel(candidate.managed_system_id)}</label>
                </div>;
              })}
            </RadioGroup>
          </fieldset>
        ) : (
          <label htmlFor="permission-approval-scope" className="flex flex-col gap-2 text-sm text-text-secondary">
            {copy.scope}
            <Select value={scope} onValueChange={pickScope} disabled={mutation.isPending}>
              <SelectTrigger id="permission-approval-scope" aria-label={copy.scope}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={REQUESTED_SCOPE}>{copy.requestedScope}</SelectItem>
                  {managedScopeCandidates.map(candidate => {
                    const value = candidateValue(candidate.managed_system_id);
                    return <SelectItem key={value} value={value} disabled={needsName(candidate.managed_system_id)}>
                      {systemLabel(candidate.managed_system_id)}
                    </SelectItem>;
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </label>
        )
      )}
      {action === 'approve' && scopeUnavailable && (
        <p id={scopeUnavailableId} role="status" className="text-sm text-text-muted">{copy.reselectScope}</p>
      )}
      {action === 'approve' && (unresolvedGrant || (unresolvedCandidate && systemNamesRead && !systemNamesRead.isFetching)) && (
        <div className="flex flex-wrap items-center gap-2">
          <span id={systemNameStatusId} role="status" className="text-sm text-text-muted">{missingName}</span>
          {systemNamesRead && !systemNamesRead.isFetching && (
            <Button type="button" variant="ghost" size="sm" onClick={systemNamesRead.retry}>{copy.retry}</Button>
          )}
        </div>
      )}
      {showApprovalPreview && (
        <div id={previewId}>
          <FieldList>
            <FieldRow label={copy.opens} inset="none">
              {approvedItems.map(item => <div key={item.id}>
                <ReviewCapabilityName id={item.requested_capability} />{' · '}
                {approvalTargetLabel(item)}
              </div>)}
            </FieldRow>
          </FieldList>
        </div>
      )}
      {action === 'approve' ? (
        <fieldset className="flex flex-col gap-2" data-testid="permission-approval-expiration">
          {/* FR-PERM-002 adds expiration decisions beyond the prototype's static decision actions. */}
          <legend className="text-sm font-medium text-text-secondary">승인 만료일</legend>
          <RadioGroup
            aria-label="승인 만료일"
            disabled={mutation.isPending || reviewBlocked}
            value={expirationMode}
            onValueChange={(value) => {
              setExpirationMode(value as ApprovalExpirationMode);
              setExpirationValidationAttempted(false);
              setExpirationFieldTouched(false);
              mutation.reset();
            }}
          >
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <RadioGroupItem id="permission-approval-expiration-keep" value="keep" />
              <label htmlFor="permission-approval-expiration-keep" className="cursor-pointer">
                요청 만료일 유지 ·{' '}
                {request.requested_expiration
                  ? formatDateOnly(request.requested_expiration.slice(0, 10))
                  : '만료 없음'}
              </label>
            </div>
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <RadioGroupItem id="permission-approval-expiration-change" value="change" />
              <label htmlFor="permission-approval-expiration-change" className="cursor-pointer">
                만료일 변경
              </label>
            </div>
            <label
              className="flex flex-col gap-2 pl-6 text-sm text-text-secondary"
              htmlFor="permission-approval-expiration-date"
            >
              새 만료일
              <DatePicker
                id="permission-approval-expiration-date"
                min={minExpirationDate}
                aria-label="새 만료일"
                value={expirationDate}
                showValidation={expirationValidationAttempted || expirationFieldTouched}
                onBlur={() => setExpirationFieldTouched(true)}
                onValidityChange={setExpirationDraftValid}
                onChange={(value) => {
                  setExpirationDate(value ?? '');
                  setExpirationValidationAttempted(false);
                  mutation.reset();
                }}
                disabled={expirationMode !== 'change' || mutation.isPending || reviewBlocked}
                aria-invalid={expirationDateError !== null}
                {...(expirationDateError
                  ? { 'aria-describedby': 'permission-approval-expiration-error' }
                  : {})}
              />
            </label>
            {expirationDateError ? (
              <p
                id="permission-approval-expiration-error"
                role="alert"
                className="pl-6 text-xs text-accent-danger"
              >
                {expirationDateError}
              </p>
            ) : null}
            <div className="flex items-center gap-2 text-sm text-text-secondary">
              <RadioGroupItem id="permission-approval-expiration-clear" value="clear" />
              <label htmlFor="permission-approval-expiration-clear" className="cursor-pointer">
                만료 없음
              </label>
            </div>
          </RadioGroup>
        </fieldset>
      ) : null}
      {showSelfApprovalCapture ? (
        <section
          className="flex flex-col gap-3 rounded-md border border-border-selected bg-surface-field p-3"
          data-testid="self-approval-audit-capture"
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-text-primary">
              직접 승인 감사 기록
            </span>
            <OutlineBadge>민감</OutlineBadge>
          </div>
          <p className="text-xs leading-5 text-text-secondary">{captureCopy.intro}</p>
          <label
            className="flex flex-col gap-2 text-sm text-text-secondary"
            htmlFor="self-approval-policy-citation"
          >
            정책 근거 <span className="text-accent-danger">· 필수 (≥ 8자)</span>
            <Input
              id="self-approval-policy-citation"
              disabled={mutation.isPending || reviewBlocked}
              value={policyCitation}
              onChange={(event) => setPolicyCitation(event.target.value)}
              placeholder="예: task.self_approve_request 범위 내 권한 — 운영 정책 §4.3"
            />
          </label>
          <label
            className="flex flex-col gap-2 text-sm text-text-secondary"
            htmlFor="self-approval-peer-reviewer-absence"
          >
            동료 검토자 부재 사유 <span className="text-accent-danger">· 필수 (≥ 8자)</span>
            <Textarea
              id="self-approval-peer-reviewer-absence"
              disabled={mutation.isPending || reviewBlocked}
              value={peerReviewerAbsence}
              onChange={(event) => setPeerReviewerAbsence(event.target.value)}
              placeholder="예: 같은 범위의 다른 검토자가 모두 부재중이라 릴리스 마감까지 기다릴 수 없습니다."
              rows={2}
            />
          </label>
          <div className="flex flex-col gap-1 rounded bg-surface-detail p-3 text-xs text-text-secondary">
            <span className="uppercase tracking-wide text-text-muted">
              {captureCopy.previewTitle}
            </span>
            <span>{captureCopy.recordedAs}</span>
            <span>
              {captureCopy.approver}: {me.data?.actor.display_name ?? GLOSSARY.unknownUser}
              {' · '}
              {captureCopy.requester}: {actorName ?? GLOSSARY.unknownUser}
            </span>
            <span>
              {captureCopy.permission}: <ReviewCapabilityName id={request.requested_capability} />
            </span>
            {!scopeUnavailable && (
              <span>{captureCopy.scope}: {approvalTargetLabel(request)}</span>
            )}
            <span>
              {captureCopy.policyCitation}: {policyCitation || captureCopy.required}
            </span>
            <span>
              {captureCopy.peerReviewerAbsence}:{' '}
              {peerReviewerAbsence
                ? `"${peerReviewerAbsence.slice(0, 56)}${peerReviewerAbsence.length > 56 ? '…' : ''}"`
                : captureCopy.required}
            </span>
          </div>
          {selfApprovalForbidden ? (
            <p className="text-xs text-accent-danger">
              운영 정책에서 직접 승인을 금지합니다. 다른 관리자가 이 요청을 승인해야 합니다.
            </p>
          ) : null}
          <p className="text-xs text-text-muted">
            이 감사 기록은 관리자 감사 내역과 규정 준수 내보내기에 모두 포함됩니다.
            정책 근거가 모호하면 직접 승인 대신 추가 정보 요청을 선택하세요.
          </p>
        </section>
      ) : null}
      {footerTarget === undefined ? submitAction : footerTarget && createPortal(submitAction, footerTarget)}
    </section>
  );
}

// Room names for narrowing come only from the candidate read (ADR-0154 decision 5); the selected detail carries
// the requested target alone. Mounted only while a Site request is being approved.
function SiteApprovalScopeSelect({
  site,
  value,
  onChange,
  disabled,
}: {
  site: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const candidates = usePermissionScopeCandidates(true);
  const rooms = candidates.data ? scopeRoomsFor(candidates.data, site, 'grant') : [];
  return (
    <label
      htmlFor="permission-approval-scope"
      className="flex flex-col gap-2 text-sm text-text-secondary"
    >
      {ADMIN_PERMISSIONS_COPY.approvalScope}
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="permission-approval-scope" aria-label={ADMIN_PERMISSIONS_COPY.approvalScope}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectItem value={REQUESTED_SCOPE}>{formatPermissionScopeTarget('site', site)}</SelectItem>
            {rooms.map((room) => (
              <SelectItem key={room} value={`${ROOM_PREFIX}${room}`}>
                {formatPermissionScopeTarget('site_room', site, room)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {candidates.isError ? (
        <span className="text-xs text-accent-danger">{PERMISSION_SCOPE_COPY.loadError}</span>
      ) : null}
    </label>
  );
}
