import { PermissionBlockedPanel } from '@ap/ui';
import type { ReactNode, Ref } from 'react';

import { ListAccessRequestPanel, type ListAccessRequest } from './ListAccessRequestPanel';

export function ScopedListDenialCard({
  category,
  reason,
  returnRouteIntent,
  request,
  deniedRef,
  recoveryAction,
}: {
  category: string;
  reason: string;
  returnRouteIntent: string;
  request?: ListAccessRequest | undefined;
  deniedRef: Ref<HTMLDivElement>;
  recoveryAction?: ReactNode;
}) {
  return (
    <div ref={deniedRef} tabIndex={-1} className="space-y-3">
      {request ? (
        <ListAccessRequestPanel {...{ category, reason, returnRouteIntent, request }} />
      ) : (
        <PermissionBlockedPanel layout="card" announceBody state="denied" category={category} reason={reason} />
      )}
      {recoveryAction}
    </div>
  );
}
