import { RequestAccessButton } from '@/features/admin/public';
import type { RenderRecoveryAccess } from '@/features/integration/recovery/RecoveryPanel';

export const renderRecoveryRequestAccess: RenderRecoveryAccess = (permission, returnTo) => (
  <RequestAccessButton
    capability={permission.permission}
    managedSystemId={permission.managed_system_id}
    returnRouteIntent={returnTo}
  />
);
