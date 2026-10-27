import { CoverageRoute } from '@/features/integration/routes/CoverageRoute';
import { validateIntegrationCoverageSearch } from '@/features/integration/routes/integration-search';
import { createFileRoute } from '@tanstack/react-router';

export {
  integrationCoverageSearchSchema,
  validateIntegrationCoverageSearch,
} from '@/features/integration/routes/integration-search';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the shell exported for
// tests while letting the route component split into its own chunk.
const IntegrationCoverageRouteShellSplit = IntegrationCoverageRouteShell;

export const Route = createFileRoute('/_authed/integration/coverage')({
  validateSearch: validateIntegrationCoverageSearch,
  component: IntegrationCoverageRouteShellSplit,
});

export function IntegrationCoverageRouteShell() {
  return <CoverageRoute />;
}
