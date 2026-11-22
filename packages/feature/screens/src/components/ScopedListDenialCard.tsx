import { PermissionBlockedPanel } from '@ap/ui';
import type { ReactNode, RefObject } from 'react';

import { PERMISSION_BLOCKED_REASONS } from '../lib/copy/permission-reasons';
import { useIsArchivedSystem } from '../lib/cross-system/useIsArchivedSystem';
import { useHostPermissionLinks, useHostSeam } from '../lib/host/host-seam';
import { ListAccessRequestPanel, ListDenialFocus, type ListAccessRequest } from './ListAccessRequestPanel';
import { MyVocsRecoveryLink } from './MyVocsRecoveryLink';
import { PermissionDeniedCard } from './PermissionDeniedCard';
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
  recoverToMyVocs,
  recoveryAction,
  restoreFocus,
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
  recoverToMyVocs?: boolean;
  recoveryAction?: ReactNode;
  restoreFocus?: boolean | undefined;
}) {
  const { lang = 'ko' } = useHostSeam();
  const { permissionHomeHref } = useHostPermissionLinks();
  // No permission opens an archived System, so the capability card names the archive instead.
  const archivedSystem = useIsArchivedSystem(
    !request && !roleRequired && capability !== undefined ? managedSystemId : undefined,
  );
  const extraExitAction = recoverToMyVocs ? <MyVocsRecoveryLink /> : null;
  let panel: ReactNode;
  if (request) {
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
      extraExitAction={extraExitAction}
    />;
  } else {
    panel = <PermissionBlockedPanel layout="card" announceBody state="denied" category={category} reason={reason} />;
  }

  return (
    <ListDenialFocus container={deniedRef} className="space-y-3" restoreFocus={restoreFocus}>
      {panel}
      {recoveryAction ? <div className="flex justify-center">{recoveryAction}</div> : null}
    </ListDenialFocus>
  );
}
