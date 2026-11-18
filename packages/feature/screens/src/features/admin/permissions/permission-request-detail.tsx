import { ROLE_LEVEL_DISPLAY_LABELS } from '../../../lib/copy/enum-labels';
import { GLOSSARY } from '../../../lib/copy/glossary';
import { PERMISSION_GROUP_COPY } from '../../../lib/copy/permission-groups';

import { OutlineBadge } from '../../../ui/index';
import { Button, DetailPanelFullscreenToggle, FieldRow, PanelSectionTitle } from '@ap/ui';
import * as React from 'react';

import { ADMIN_PERMISSIONS_COPY } from '../../../lib/copy/admin-permissions';
import { UNDECLARED_CAPABILITY_LABEL, getCapabilityDisplayLabel } from '../../../lib/copy/capabilities';
import { grantedScopeTargetLabel, requestedScopeTargetLabel } from '../../../lib/copy/permission-scope';
import { formatDateOnly, formatDateTime } from '../../../lib/format/datetime';
import type { ClosableDetailParts } from '../../../lib/host/detail-parts';
import { shortId } from '../../../lib/identity';
import { type PermissionRequestAdminDetail, grantOpensScreensFor, isDeclaredCapabilityId } from '@ap/feature-shared';

import { DeclaredCapabilityName } from './declared-capability-name.js';
import { PermissionRequestDecisionForm } from './permission-request-decision-form.js';
import { permissionRequestStatusLabel } from './permission-requests-search.js';

export function PermissionRequestDetail({
  request,
  batch,
  actorName,
  managedSystemName,
  managedSystemNames,
  staleNotice,
  discardedReason,
  onDraftChanged,
  onStaleConflict,
  onDecisionSucceeded,
  onActionPicked,
  onClose,
  renderDetail,
}: {
  request: PermissionRequestAdminDetail;
  batch?: { id: string; items: PermissionRequestAdminDetail[] };
  actorName?: string | undefined;
  managedSystemName?: string | undefined;
  managedSystemNames?: Record<string, string> | undefined;
  staleNotice?: boolean;
  discardedReason?: string;
  onDraftChanged?: (draft: { revision: number; nonEmpty: boolean; reason: string }) => void;
  onStaleConflict?: () => void;
  onDecisionSucceeded?: (result: { id: string; revision: number }) => void;
  onActionPicked?: () => void;
  onClose: () => void;
  /** Absent = the standalone panel. Present = the host draws the parts (its own header, close and fullscreen). */
  renderDetail?: (parts: ClosableDetailParts) => React.ReactNode;
}) {
  const resolvedManagedSystemNames = { ...managedSystemNames };
  // Batch review labels capabilities and known systems; unavailable names must not expose raw IDs.
  for (const item of batch?.items ?? []) {
    const systemIds = [item.requested_managed_system_id, item.effective_access.granted_managed_system_id,
      ...(item.effective_access.scope.kind === 'scoped' ? item.effective_access.scope.managed_system_ids : []),
      ...item.risk_indicators.flatMap(indicator => indicator.code === 'active_deny' ? indicator.evidence.denies.map(deny => deny.managed_system_id) : [])];
    for (const id of systemIds) if (id && !resolvedManagedSystemNames[id]) resolvedManagedSystemNames[id] = PERMISSION_GROUP_COPY.system;
  }
  // ADR-0157 decision 9: a declared capability shows its display name with its id beside it.
  const isDeclared = isDeclaredCapabilityId(request.requested_capability);
  const staleAlertRef = React.useRef<HTMLParagraphElement>(null);
  // Explicit success boundary: a completed review remounts the decision form
  // with a clean draft even when the refetched detail keeps the same revision.
  // ID/revision changes remount via the panel key; unchanged reads never bump
  // the epoch, so an ordinary background refetch preserves the draft.
  const [reviewEpoch, setReviewEpoch] = React.useState(0);
  // Focus follows the latched stale notice, including right after the
  // revision-change remount this panel performs.
  React.useEffect(() => {
    if (staleNotice) staleAlertRef.current?.focus();
  }, [staleNotice]);
  const batchDecided = batch?.items.some(item => item.status !== 'pending' && item.status !== 'needs_more_info') ?? false;
  const body = (
    <div className="flex flex-col gap-5">
      {staleNotice ? (
        <p
          ref={staleAlertRef}
          role="alert"
          tabIndex={-1}
          className="text-sm text-accent-danger outline-hidden"
          data-testid="permission-request-stale-alert"
        >
          {ADMIN_PERMISSIONS_COPY.reviewAgain}
        </p>
      ) : null}
      {/* A batch shares requester, reason and expiry, so its review notes show once (#2408); held rows show in the checklist. */}
      <PermissionRequestRiskReview
        request={request}
        {...(batch ? { items: batch.items } : {})}
        managedSystemNames={resolvedManagedSystemNames}
      />
      {batch && batchDecided ? <section className="flex flex-col gap-2"><PanelSectionTitle>{PERMISSION_GROUP_COPY.count(batch.items.length)}</PanelSectionTitle><ul>{batch.items.map(item => <li key={item.id}>{getCapabilityDisplayLabel(item.requested_capability)} · {permissionRequestStatusLabel[item.status]}</li>)}</ul><p>{PERMISSION_GROUP_COPY.outcome(batch.items.filter(item => item.status === 'approved').length, batch.items.filter(item => item.status === 'rejected').length)}</p></section> : null}
      <section className="flex flex-col gap-2">
        <PanelSectionTitle>요청 정보</PanelSectionTitle>
        <FieldRow label="요청자" inset="none">
          <span className="flex flex-col gap-0.5">
            <span>{actorName ?? GLOSSARY.unknownUser}</span>
            {actorName || batch ? null : (
              <span className="font-mono text-xs text-text-muted">
                {shortId(request.requester_actor_id)}
              </span>
            )}
          </span>
        </FieldRow>
        {batch ? null : <FieldRow label="요청 ID" inset="none">
          <span className="font-mono text-xs text-text-muted">{shortId(request.id)}</span>
        </FieldRow>}
        <FieldRow label="요청 권한" inset="none">
          {batch ? (
            <span>{batch.items.map(item => getCapabilityDisplayLabel(item.requested_capability)).join(', ')}</span>
          ) : isDeclared ? (
            <span className="flex flex-col gap-0.5">
              <DeclaredCapabilityName id={request.requested_capability} />
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-text-muted">{request.requested_capability}</span>
                {request.in_declarations === false ? <OutlineBadge>{UNDECLARED_CAPABILITY_LABEL}</OutlineBadge> : null}
              </span>
            </span>
          ) : (
            <span>{getCapabilityDisplayLabel(request.requested_capability)}</span>
          )}
        </FieldRow>
        <FieldRow label="범위" inset="none">
          <span className="flex flex-col gap-0.5">
            <span>
              {requestedScopeTargetLabel(request) ??
                (request.requested_managed_system_id
                  ? (managedSystemName ?? '시스템')
                  : '전체')}
            </span>
            {request.requested_managed_system_id && !managedSystemName && !batch && (
              <span className="font-mono text-xs text-text-muted">
                {shortId(request.requested_managed_system_id)}
              </span>
            )}
          </span>
        </FieldRow>
        <FieldRow label="요청 만료일" inset="none">
          <span>
            {request.requested_expiration
              ? formatDateOnly(request.requested_expiration.slice(0, 10))
              : '만료 없음'}
          </span>
        </FieldRow>
        <FieldRow label="요청 일시" inset="none">
          <span>{formatDateTime(request.created_at)}</span>
        </FieldRow>
      </section>
      <section className="flex flex-col gap-2">
        <PanelSectionTitle>요청 사유</PanelSectionTitle>
        <p className="whitespace-pre-wrap text-sm text-text-primary">{request.reason}</p>
      </section>
      <PermissionRequestDecisionForm
        key={`${request.id}:${request.revision}:${reviewEpoch}`}
        request={request}
        {...(batch ? { batch } : {})}
        actorName={actorName}
        managedSystemName={managedSystemName}
        {...(staleNotice ? { staleNoticeShown: true } : {})}
        {...(discardedReason !== undefined ? { discardedReason } : {})}
        {...(onDraftChanged ? { onDraftChanged } : {})}
        {...(onStaleConflict ? { onStaleConflict } : {})}
        {...(onDecisionSucceeded ? { onDecisionSucceeded } : {})}
        {...(onActionPicked ? { onActionPicked } : {})}
        onReviewCompleted={() => setReviewEpoch((epoch) => epoch + 1)}
      />
    </div>
  );
  const title = `${actorName ?? GLOSSARY.unknownUser} · ${getCapabilityDisplayLabel(request.requested_capability)}`;

  if (renderDetail) {
    return renderDetail({
      title,
      subtitle: '권한 요청',
      headerActions: <OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>,
      body,
      requestClose: onClose,
    });
  }

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-surface-detail"
      data-testid="permission-request-detail-panel"
    >
      <header className="flex h-toolbar items-center gap-3 border-b border-border-subtle px-6">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-text-muted">권한 요청</p>
          <p className="truncate text-sm font-medium text-text-primary">
            {actorName ?? GLOSSARY.unknownUser}
            {' · '}
            {getCapabilityDisplayLabel(request.requested_capability)}
          </p>
        </div>
        <OutlineBadge>{permissionRequestStatusLabel[request.status]}</OutlineBadge>
        <div className="flex items-center gap-1">
          <DetailPanelFullscreenToggle />
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label="패널 닫기">
            닫기
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-6">{body}</div>
    </aside>
  );
}

function PermissionRequestRiskReview({
  request,
  managedSystemNames,
  items,
}: {
  request: PermissionRequestAdminDetail;
  managedSystemNames: Record<string, string>;
  items?: PermissionRequestAdminDetail[];
}) {
  const copy = ADMIN_PERMISSIONS_COPY.riskReview;
  return <section className="flex flex-col gap-2" data-testid="permission-request-risk-review">
    <PanelSectionTitle>{copy.title}</PanelSectionTitle>
    {items ? <>
      {items.some(item => item.risk_indicators.some(indicator => indicator.code === 'no_expiration')) ? <p className="text-sm text-text-muted">{copy.noExpiration}</p> : null}
      {items.map(item => <section key={item.id} aria-label={getCapabilityDisplayLabel(item.requested_capability)} className="flex flex-col gap-2">
        <p className="text-sm font-medium">{getCapabilityDisplayLabel(item.requested_capability)}</p>
        <PermissionMemberRiskReview request={{ ...item, risk_indicators: item.risk_indicators.filter(indicator => indicator.code !== 'no_expiration') }} managedSystemNames={managedSystemNames} />
      </section>)}
    </> : <PermissionMemberRiskReview request={request} managedSystemNames={managedSystemNames} />}
    <FieldRow label={copy.requesterRole} inset="none">{ROLE_LEVEL_DISPLAY_LABELS[request.requester.role_level]}</FieldRow>
    <FieldRow label={copy.reviewAuthority} inset="none">
      {getCapabilityDisplayLabel(request.administrative_authority.capability)} · {request.administrative_authority.allowed ? copy.allowed : copy.forbidden}
    </FieldRow>
    {request.administrative_authority.is_requester ? <FieldRow label={copy.selfRequest} inset="none">
      {request.administrative_authority.permission_self_approval === 'allowed' ? copy.selfApprovalAllowed : copy.selfApprovalForbidden}
      {' · '}{request.administrative_authority.self_approval_required ? copy.selfApprovalReasonRequired : copy.selfApprovalReasonOptional}
    </FieldRow> : null}
  </section>;
}

function PermissionMemberRiskReview({ request, managedSystemNames }: {
  request: PermissionRequestAdminDetail;
  managedSystemNames: Record<string, string>;
}) {
  const copy = ADMIN_PERMISSIONS_COPY.riskReview;
  const { role_level: requesterRole } = request.requester;
  const roleRequired = requesterRole === 'user' &&
    !grantOpensScreensFor(request.requested_capability, requesterRole);
  const accessDecision = request.effective_access.decision;
  const effectiveDecision = accessDecision.allow
    ? `${copy.allowed} · ${
        accessDecision.via === 'direct_grant'
          ? copy.directGrant
          : accessDecision.via === 'role'
            ? copy.roleAccess
            : copy.managedSystemAccess
      }`
    : copy.accessReasons[accessDecision.reason];

  return (
    <div className="flex flex-col gap-2">
      {request.status !== 'pending' && request.status !== 'needs_more_info' ? (
        <p className="text-sm text-text-muted">{copy.currentState}</p>
      ) : null}
      {request.risk_indicators.length === 0 && !roleRequired ? (
        <output className="text-sm text-text-muted">{copy.noSignals}</output>
      ) : null}
      {request.risk_indicators.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {request.risk_indicators.map((indicator, index) => (
            // eslint-disable-next-line react/no-array-index-key -- risk indicator codes can repeat within one request and the list is rendered once, never reordered; the index disambiguates the key
            <li className="border-l-2 border-border-subtle pl-3" key={`${indicator.code}:${index}`}>
              <PermissionRiskIndicatorItem
                indicator={indicator}
                managedSystemNames={managedSystemNames}
              />
            </li>
          ))}
        </ul>
      ) : null}
      {roleRequired ? <p className="text-sm text-text-secondary">{copy.findingRoleRequired}</p> : null}
      <div className="flex flex-col gap-1">
        <FieldRow label={copy.effectiveDecision} inset="none">
          {effectiveDecision}
          {request.effective_access.scope.kind === 'all' ||
          request.effective_access.scope.managed_system_ids.length > 0 ? (
            <>
              {' · '}
              {copy.effectiveScope}:{' '}
              {formatEffectiveScope(request.effective_access.scope, managedSystemNames)}
            </>
          ) : null}
          {accessDecision.allow && accessDecision.via === 'direct_grant' ? (
            <>
              {' · '}
              {copy.effectiveGrantScope}:{' '}
              {grantedScopeTargetLabel(request.effective_access) ??
                formatManagedSystemScope(
                  request.effective_access.granted_managed_system_id,
                  managedSystemNames,
                )}
            </>
          ) : null}
          {accessDecision.allow ? (
            <>
              {' · '}
              {request.effective_access.expires_at
                ? `${copy.expiration} ${formatDateOnly(request.effective_access.expires_at.slice(0, 10))}`
                : copy.noAccessExpiration}
            </>
          ) : null}
        </FieldRow>
      </div>
    </div>
  );
}

function PermissionRiskIndicatorItem({
  indicator,
  managedSystemNames,
}: {
  indicator: PermissionRequestAdminDetail['risk_indicators'][number];
  managedSystemNames: Record<string, string>;
}) {
  const copy = ADMIN_PERMISSIONS_COPY.riskReview;
  switch (indicator.code) {
    case 'sensitive_capability':
      return (
        <p className="text-sm font-medium text-text-primary">
          {copy.sensitiveCapability} · {getCapabilityDisplayLabel(indicator.evidence.capability)}
        </p>
      );
    case 'workspace_scope':
      return <p className="text-sm font-medium text-text-primary">{copy.workspaceScope}</p>;
    case 'no_expiration':
      return <p className="text-sm font-medium text-text-primary">{copy.noExpiration}</p>;
    case 'active_deny':
      return (
        <p className="text-sm font-medium text-text-primary">
          {copy.activeDeny} {indicator.evidence.denies.length}건 ·{' '}
          {indicator.evidence.denies
            .map((deny) => formatManagedSystemScope(deny.managed_system_id, managedSystemNames))
            .join(' · ')}
        </p>
      );
  }
}

function formatManagedSystemScope(
  managedSystemId: string | null,
  managedSystemNames: Record<string, string>,
): string {
  if (managedSystemId === null) return ADMIN_PERMISSIONS_COPY.riskReview.allScope;
  const name = managedSystemNames[managedSystemId];
  return name ? name : `시스템 (${shortId(managedSystemId)})`;
}

function formatEffectiveScope(
  scope: PermissionRequestAdminDetail['effective_access']['scope'],
  managedSystemNames: Record<string, string>,
): string {
  if (scope.kind === 'all') return ADMIN_PERMISSIONS_COPY.riskReview.allScope;
  if (scope.managed_system_ids.length === 0) return ADMIN_PERMISSIONS_COPY.riskReview.noScope;
  return scope.managed_system_ids
    .map((managedSystemId) => formatManagedSystemScope(managedSystemId, managedSystemNames))
    .join(' · ');
}
