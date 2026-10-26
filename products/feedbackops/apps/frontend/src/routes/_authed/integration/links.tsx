import { LinksRoute } from '@/features/integration/routes/LinksRoute';
import { validateIntegrationLinksSearch } from '@/features/integration/routes/integration-search';
import { createFileRoute } from '@tanstack/react-router';

export {
  integrationLinksSearchSchema,
  validateIntegrationLinksSearch,
} from '@/features/integration/routes/integration-search';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check). The alias keeps the shell exported for
// tests while letting the route component split into its own chunk.
const IntegrationLinksRouteShellSplit = IntegrationLinksRouteShell;

export const Route = createFileRoute('/_authed/integration/links')({
  validateSearch: validateIntegrationLinksSearch,
  component: IntegrationLinksRouteShellSplit,
});

export function IntegrationLinksRouteShell() {
  return <LinksRoute />;
}
