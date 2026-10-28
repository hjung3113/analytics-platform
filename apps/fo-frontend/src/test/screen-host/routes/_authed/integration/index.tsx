// Test-local host adapter over retained Screen exports.
import { RequestAccessButton } from '@/features/admin/public';
import type { RenderRecoveryAccess } from '@/features/integration/public';
import { IntegrationDashboardRoute } from '@/test/screen-host/features/integration/routes/IntegrationDashboardRoute';

export {
  integrationDashboardSearchSchema,
  validateIntegrationDashboardSearch,
} from '@/features/integration/routes/integration-search';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the shell exported for
// tests while letting the route component split into its own chunk.

const renderRequestAccess: RenderRecoveryAccess = (permission, returnTo) => (
  <RequestAccessButton
    capability={permission.permission}
    managedSystemId={permission.managed_system_id}
    returnRouteIntent={returnTo}
  />
);

export function IntegrationDashboardRouteShell() {
  return <IntegrationDashboardRoute renderRequestAccess={renderRequestAccess} />;
}
