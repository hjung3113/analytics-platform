import {
  evidenceSearchSchema,
  integrationCoverageSearchSchema,
} from '@/features/integration/routes/integration-search';
import { scopeSwitchClears } from '@/lib/host/scope-switch';
import { ManagedSystemScopeControl } from '@/operator-screens/scope-picker/ManagedSystemScopeControl';
// A memory-router host for retained screen scope/history assertions; no auth or app layout.
import { Outlet, useNavigate, useRouterState } from '@tanstack/react-router';
export function ScopeHost() {
  const location = useRouterState({ select: (state) => state.location });
  const navigate = useNavigate();
  const schema =
    location.pathname === '/integration/evidence'
      ? evidenceSearchSchema
      : location.pathname === '/integration/coverage'
        ? integrationCoverageSearchSchema
        : undefined;
  return (
    <>
      <ManagedSystemScopeControl
        value={
          typeof location.search.managedSystem === 'string' &&
          location.search.managedSystem !== 'all'
            ? location.search.managedSystem
            : undefined
        }
        onChange={(id) => {
          const clears = scopeSwitchClears({
            nextSystem: id,
            area: location.search['filter.analytics_area'] as string | undefined,
            declaresArea: 'filter.analytics_area' in location.search,
            declaresCursor: schema !== undefined && 'cursor' in schema.shape,
          });
          void navigate({
            to: location.pathname as never,
            search: ((previous: Record<string, unknown>) => ({
              ...previous,
              managedSystem: id,
              ...(clears.area ? { 'filter.analytics_area': undefined } : {}),
              ...(clears.cursor ? { cursor: undefined } : {}),
            })) as never,
          });
        }}
      />
      <Outlet />
    </>
  );
}
