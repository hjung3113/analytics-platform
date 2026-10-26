import { RequestAccessButton } from '@/features/admin/public';
import type { RenderRecoveryAccess } from '@/features/integration/public';
import { IntegrationDashboardRoute } from '@/features/integration/routes/IntegrationDashboardRoute';
import { validateIntegrationDashboardSearch } from '@/features/integration/routes/integration-search';
import { createFileRoute } from '@tanstack/react-router';

export {
  integrationDashboardSearchSchema,
  validateIntegrationDashboardSearch,
} from '@/features/integration/routes/integration-search';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the shell exported for
// tests while letting the route component split into its own chunk.
const IntegrationDashboardRouteShellSplit = IntegrationDashboardRouteShell;

export const Route = createFileRoute('/_authed/integration/')({
  validateSearch: validateIntegrationDashboardSearch,
  component: IntegrationDashboardRouteShellSplit,
});

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
