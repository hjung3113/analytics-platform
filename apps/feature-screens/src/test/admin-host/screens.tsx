// Test-local host composition: exercise retained screens with real history and permission checks.
import { PermissionGate } from '@/features/admin/permissions/permission-gate';
import { PermissionRequestsScreen } from '@/features/admin/permissions/permission-requests-screen';
export { AnalyticsAreasAdminPage } from '@/features/admin/analytics-areas/AnalyticsAreasScreen';
export { analyticsAreasSearchSchema } from '@/features/admin/analytics-areas/search';
export { ManagedSystemsAdminPage } from '@/features/admin/managed-systems/ManagedSystemsScreen';
export { permissionRequestsSearchSchema } from '@/features/admin/permissions/permission-requests-search';

export function PermissionRequestsConsolePage() {
  return (
    <PermissionGate capability="workspace.admin">
      <PermissionRequestsScreen />
    </PermissionGate>
  );
}

import { PermissionGrantsScreen } from '@/features/admin/permissions/permission-grants-screen';
import { WorkspaceSettingsScreen } from '@/features/admin/settings/WorkspaceSettingsScreen';
export function AdminSettingsPage() {
  return (
    <PermissionGate capability="workspace.admin">
      <WorkspaceSettingsScreen />
    </PermissionGate>
  );
}
export function PermissionGrantsConsolePage() {
  return (
    <PermissionGate capability="workspace.admin">
      <PermissionGrantsScreen />
    </PermissionGate>
  );
}
