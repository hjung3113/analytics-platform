// Test-local host adapter over retained Screen exports.
import { CoverageRoute } from '@/test/screen-host/features/integration/routes/CoverageRoute';

export {
  integrationCoverageSearchSchema,
  validateIntegrationCoverageSearch,
} from '@/features/integration/routes/integration-search';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the shell exported for
// tests while letting the route component split into its own chunk.

export function IntegrationCoverageRouteShell() {
  return <CoverageRoute />;
}
