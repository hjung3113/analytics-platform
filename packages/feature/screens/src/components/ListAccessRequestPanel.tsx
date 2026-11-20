import { PermissionBlockedPanel } from '@ap/ui';
import { RequestAccessButton } from './request-access-button';

export type ListAccessRequest = { capability: string; managedSystemId?: string; pending?: boolean };

export function ListAccessRequestPanel({ category, reason, returnRouteIntent, request }: {
  category: string;
  reason: string;
  returnRouteIntent: string;
  request: ListAccessRequest;
}) {
  return (
    <RequestAccessButton
      layout="card"
      {...request}
      returnRouteIntent={returnRouteIntent}
      renderTrigger={(_onRequestAccess, panel) => (
        <PermissionBlockedPanel
          layout="card"
          state="request_access"
          category={category}
          reason={reason}
          {...panel}
        />
      )}
    />
  );
}
