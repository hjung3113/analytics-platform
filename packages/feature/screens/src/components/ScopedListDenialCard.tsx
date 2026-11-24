import { Button, PermissionBlockedPanel } from '@ap/ui';
import type { ReactNode, RefObject } from 'react';

import { PERMISSION_BLOCKED_REASONS } from '../lib/copy/permission-reasons';
import { PERMISSION_REQUEST_FLOW_COPY } from '../lib/copy/permission-requests';
import { useArchivedSystemCheck } from '../lib/cross-system/useIsArchivedSystem';
import type { ScopedEmptyListPermission } from '../lib/cross-system/useListDenial';
import { useHostPermissionLinks, useHostSeam } from '../lib/host/host-seam';
import { ListAccessRequestPanel, ListDenialFocus, type ListAccessRequest } from './ListAccessRequestPanel';
import { MyVocsRecoveryLink } from './MyVocsRecoveryLink';
import { PermissionDeniedCard } from './PermissionDeniedCard';
import { PermissionRecheckAction } from './PermissionRecheckAction';
import { permissionCardExitAction } from './permission-card-actions';

export function ScopedListDenialCard({
  category,
  reason,
  returnRouteIntent,
  request,
  roleRequired,
  deniedRef,
  capability,
  managedSystemId,
  roleHeading,
  headingLevel,
  recoverToMyVocs,
  recoveryAction,
  restoreFocus,
  recheck,
}: {
  category: string;
  reason: string;
  returnRouteIntent: string;
  request?: ListAccessRequest | null | undefined;
  roleRequired?: boolean;
  deniedRef: RefObject<HTMLDivElement | null>;
  capability?: string;
  managedSystemId?: string | undefined;
  roleHeading?: { category: string; level: 2 };
  /** Heading level of the plain denied card, for a card that replaces its section title. */
  headingLevel?: 2;
  recoverToMyVocs?: boolean;
  recoveryAction?: ReactNode;
  restoreFocus?: boolean | undefined;
  recheck?: Extract<ScopedEmptyListPermission, { state: 'checking' | 'error' }> | undefined;
}) {
  const { lang = 'ko' } = useHostSeam();
  const { permissionHomeHref } = useHostPermissionLinks();
  // No permission opens an archived System, so the capability card names the archive instead.
  const archive = useArchivedSystemCheck(
    !recheck && !request && !roleRequired && capability !== undefined ? managedSystemId : undefined,
    { retryOnMount: false },
  );
  const archivedSystem = archive.archived;
  // Without the catalog the archive is unknown: the card keeps the permission copy and offers the read again, first in its button row.
  const catalogRetry = archive.failed ? (
    <Button variant="secondary" size="sm" onClick={archive.retry}>{PERMISSION_REQUEST_FLOW_COPY[lang].retry}</Button>
  ) : null;
  const extraExitAction = recoverToMyVocs ? <MyVocsRecoveryLink /> : null;
  let panel: ReactNode;
  let label: string | undefined;
  if (recheck) {
    const home = permissionCardExitAction(permissionHomeHref, lang);
    panel = <PermissionBlockedPanel layout="card" state="denied" lang={lang}
      headingLevel={roleHeading?.level ?? headingLevel ?? 4} category={category} description={reason}
      requestAction={<PermissionRecheckAction status={recheck.state === 'checking' ? 'pending' : 'error'}
        retry={() => { if (recheck.state === 'error') recheck.retry(); }} />}
      exitAction={extraExitAction ? <>{home}{extraExitAction}</> : home}
    />;
  } else if (request) {
    panel = <ListAccessRequestPanel {...{ category, reason, returnRouteIntent, request, extraExitAction }} />;
  } else if (roleRequired) {
    const home = permissionCardExitAction(permissionHomeHref, lang);
    panel = <PermissionBlockedPanel
      layout="card"
      state="blocked_not_requestable"
      lang={lang}
      headingLevel={roleHeading?.level ?? 4}
      category={roleHeading?.category ?? category}
      description={reason}
      reason={PERMISSION_BLOCKED_REASONS.listRoleRequired}
      announceBody
      exitAction={extraExitAction ? <>{home}{extraExitAction}</> : home}
    />;
  } else if (capability !== undefined) {
    const missing = managedSystemId === undefined ? { capability } : { capability, managedSystemId };
    panel = <PermissionDeniedCard
      layout="card"
      category={category}
      description={archivedSystem ? PERMISSION_BLOCKED_REASONS.archivedSystem : reason}
      {...(archivedSystem ? {} : missing)}
      announceBody
      leadingAction={catalogRetry}
      extraExitAction={extraExitAction}
    />;
  } else {
    // A section-title card gets focus handed to itself (recovery queue detail close), so it carries the title as its name.
    label = headingLevel ? category : undefined;
    panel = <PermissionBlockedPanel layout="card" announceBody state="denied" headingLevel={headingLevel ?? 4} category={category} reason={reason} />;
  }

  return (
    <ListDenialFocus container={deniedRef} className="space-y-3" restoreFocus={restoreFocus} label={label}>
      {panel}
      {recoveryAction ? <div className="flex justify-center">{recoveryAction}</div> : null}
    </ListDenialFocus>
  );
}
