import { ROLE_LEVEL_DISPLAY_LABELS } from '../../../lib/copy/enum-labels';
import { FeatureTimestamp } from '../../../components/FeatureTimestamp';
import { OriginalDisclosure } from '../../../components/OriginalDisclosure';
import { useHostSeam } from '../../../lib/host/host-seam';
import { PERMISSION_GROUP_COPY } from '../../../lib/copy/permission-groups';

import { OutlineBadge } from '../../../ui/index';
import { Button, DetailPanelFullscreenToggle, FieldRow, PanelSectionTitle } from '@ap/ui';
import * as React from 'react';

import { ADMIN_PERMISSIONS_COPY, PERMISSION_REVIEW_TEXT as COPY } from '../../../lib/copy/admin-permissions';
import { UNDECLARED_CAPABILITY_LABEL } from '../../../lib/copy/capabilities';
import { grantedScopeTargetLabel, requestedScopeTargetLabel } from '../../../lib/copy/permission-scope';
import { formatDateOnly } from '../../../lib/format/datetime';
import type { ClosableDetailParts } from '../../../lib/host/detail-parts';
import { type PermissionRequestAdminDetail, grantOpensScreensFor } from '@ap/feature-shared';

import { ReviewCapabilityName } from './declared-capability-name.js';
import { hasPermissionDecisionActions } from './permission-decision-actions';
import { PermissionRequestDecisionForm, type SystemNamesRead } from './permission-request-decision-form.js';
import { permissionRequestStatusText } from '../../../lib/copy/enum-labels';

export function PermissionRequestDetail({
  request,
  batch,
  actorName,
  managedSystemName,
  managedSystemNames,
  approvalSystemNames,
  systemNamesRead,
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
  approvalSystemNames?: Record<string, string> | undefined;
  systemNamesRead?: SystemNamesRead | undefined;
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
  const { lang = 'ko' } = useHostSeam();
  const names = { ...managedSystemNames };
  if (request.requested_managed_system_id && managedSystemName) names[request.requested_managed_system_id] = managedSystemName;
  const requester = actorName || COPY.unknownName[lang];
  const scope = requestedScopeTargetLabel(request) ??
    (request.requested_managed_system_id ? (managedSystemName ?? COPY.system[lang]) : COPY.all[lang]);
  const staleAlertRef = React.useRef<HTMLParagraphElement>(null);
  const [decisionFooter, setDecisionFooter] = React.useState<HTMLDivElement | null>(null);
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
      <section className="flex flex-col gap-2 break-keep">
        <PanelSectionTitle>{COPY.requestInfo[lang]}</PanelSectionTitle>
        <FieldRow label={COPY.requester[lang]} inset="none">{requester}</FieldRow>
        <FieldRow label={COPY.capability[lang]} inset="none">
          {batch ? <span>{batch.items.map((item, index) => <React.Fragment key={item.id}>
            {index > 0 && ', '}<ReviewCapabilityName id={item.requested_capability} />
          </React.Fragment>)}</span> :
            <span className="flex flex-wrap items-center gap-2">
              <ReviewCapabilityName id={request.requested_capability} />
              {request.in_declarations === false ? <OutlineBadge>{UNDECLARED_CAPABILITY_LABEL}</OutlineBadge> : null}
            </span>}
        </FieldRow>
        <FieldRow label={COPY.scope[lang]} inset="none">{scope}</FieldRow>
        <FieldRow label={COPY.expiration[lang]} inset="none">
          {request.requested_expiration ? formatDateOnly(request.requested_expiration.slice(0, 10)) : COPY.noExpiration[lang]}
        </FieldRow>
        <FieldRow label={COPY.submittedAt[lang]} inset="none">
          <FeatureTimestamp at={request.created_at} notation="summary" className="tabular-nums break-keep" />
        </FieldRow>
        <OriginalDisclosure>
          <pre className="whitespace-pre-wrap break-all font-mono">{JSON.stringify({
            ...(batch ? { batch_id: batch.id } : {}),
            requests: (batch?.items ?? [request]).map(item => ({
              id: item.id,
              requester_actor_id: item.requester_actor_id,
              requested_capability: item.requested_capability,
              requested_managed_system_id: item.requested_managed_system_id,
              approval_candidate_system_ids: item.approval_scope_candidates.flatMap(candidate =>
                candidate.managed_system_id ? [candidate.managed_system_id] : []),
              requested_scope_kind: item.requested_scope_kind,
              requested_scope_site: item.requested_scope_site,
              requested_scope_room: item.requested_scope_room,
            })),
          }, null, 2)}</pre>
        </OriginalDisclosure>
      </section>
      <section className="flex flex-col gap-2">
        <PanelSectionTitle>{COPY.reason[lang]}</PanelSectionTitle>
        <p className="whitespace-pre-wrap text-sm text-text-primary">{request.reason}</p>
      </section>
      <PermissionRequestRiskReview
        request={request}
        {...(batch ? { items: batch.items } : {})}
        managedSystemNames={names}
      />
      {batch && batchDecided ? <section className="flex flex-col gap-2"><PanelSectionTitle>{PERMISSION_GROUP_COPY.count(batch.items.length)}</PanelSectionTitle><ul>{batch.items.map(item => <li key={item.id}><ReviewCapabilityName id={item.requested_capability} /> · {permissionRequestStatusText[item.status][lang]}</li>)}</ul><p>{PERMISSION_GROUP_COPY.outcome(batch.items.filter(item => item.status === 'approved').length, batch.items.filter(item => item.status === 'rejected').length)}</p></section> : null}
      <PermissionRequestDecisionForm
        scopeRadios={renderDetail !== undefined}
        key={`${request.id}:${request.revision}:${reviewEpoch}`}
        request={request}
        {...(renderDetail ? { footerTarget: decisionFooter } : {})}
        {...(batch ? { batch } : {})}
        actorName={actorName}
        approvalSystemNames={approvalSystemNames}
        systemNamesRead={systemNamesRead}
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
  const title = <>{requester} · <ReviewCapabilityName id={request.requested_capability} /></>;

  if (renderDetail) {
    return renderDetail({
      title,
      titleLines: 2,
      subtitle: COPY.request[lang],
      headerActions: <OutlineBadge className="shrink-0 whitespace-nowrap">{permissionRequestStatusText[request.status][lang]}</OutlineBadge>,
      body,
      footer: hasPermissionDecisionActions(request) ? <div ref={setDecisionFooter} /> : undefined,
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
          <p className="text-xs font-medium text-text-muted">{COPY.request[lang]}</p>
          <p className="truncate text-sm font-medium text-text-primary">
            {title}
          </p>
        </div>
        <OutlineBadge>{permissionRequestStatusText[request.status][lang]}</OutlineBadge>
        <div className="flex items-center gap-1">
          <DetailPanelFullscreenToggle />
          <Button type="button" variant="ghost" size="sm" onClick={onClose} aria-label={COPY.closePanel[lang]}>
            {COPY.close[lang]}
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
  const headingId = React.useId();
  return <section className="flex flex-col gap-2" data-testid="permission-request-risk-review">
    <PanelSectionTitle>{copy.title}</PanelSectionTitle>
    {items ? <>
      {items.some(item => item.risk_indicators.some(indicator => indicator.code === 'no_expiration')) ? <p className="text-sm text-text-muted">{copy.noExpiration}</p> : null}
      {items.map(item => <section key={item.id} aria-labelledby={`${headingId}-${item.id}`} className="flex flex-col gap-2">
        <p id={`${headingId}-${item.id}`} className="text-sm font-medium"><ReviewCapabilityName id={item.requested_capability} /></p>
        <PermissionMemberRiskReview request={{ ...item, risk_indicators: item.risk_indicators.filter(indicator => indicator.code !== 'no_expiration') }} managedSystemNames={managedSystemNames} />
      </section>)}
    </> : <PermissionMemberRiskReview request={request} managedSystemNames={managedSystemNames} />}
    <FieldRow label={copy.requesterRole} inset="none">{ROLE_LEVEL_DISPLAY_LABELS[request.requester.role_level]}</FieldRow>
    <FieldRow label={copy.reviewAuthority} inset="none">
      <ReviewCapabilityName id={request.administrative_authority.capability} /> · {request.administrative_authority.allowed ? copy.allowed : copy.forbidden}
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
  const roleRequired = !grantOpensScreensFor(request.requested_capability, requesterRole);
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
          {copy.sensitiveCapability} · <ReviewCapabilityName id={indicator.evidence.capability} />
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
  return name ?? PERMISSION_GROUP_COPY.system;
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
