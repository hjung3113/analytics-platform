import { SurveyFollowUpScreen } from '@/features/surveys/routes/SurveyFollowUpScreen';
import { SurveyResultsScreen } from '@/features/surveys/routes/SurveyResultsScreen';
import { HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/test/host-adapters/lib/host/tanstack-host';
// Small test-only router: no authentication, bootstrap, app layout or generated registration.
import { DetailPanelSlotProvider, WorkbenchShell, useDetailPanelSlotHost } from '@ap/ui';
import type { QueryClient } from '@tanstack/react-query';
import { Outlet, createRootRouteWithContext, createRoute, useParams } from '@tanstack/react-router';
import { SurveyDetailRoute, validateSurveyDetailSearch } from './detail';
import { SurveysIndexRoute, validateSurveysSearch } from './screen';

function TestHost() {
  const { ref } = useDetailPanelSlotHost();
  return (
    <HostSeamProvider value={tanstackHost}>
      <Outlet />
      <div ref={ref} />
    </HostSeamProvider>
  );
}
const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <DetailPanelSlotProvider>
      <TestHost />
    </DetailPanelSlotProvider>
  ),
});
const list = createRoute({
  getParentRoute: () => root,
  path: '/surveys',
  validateSearch: validateSurveysSearch,
  component: SurveysIndexRoute,
});
const detail = createRoute({
  getParentRoute: () => root,
  path: '/surveys/$surveyId',
  validateSearch: validateSurveyDetailSearch,
  component: SurveyDetailRoute,
});
function SurveyResultsPage() {
  const { surveyId } = useParams({ strict: false }) as { surveyId: string };
  return <SurveyResultsScreen surveyId={surveyId} />;
}
function SurveyFollowUpPage() {
  const { surveyId } = useParams({ strict: false }) as { surveyId: string };
  return (
    <WorkbenchShell>
      <div className="flex h-full min-h-0 flex-col">
        <SurveyFollowUpScreen surveyId={surveyId} />
      </div>
    </WorkbenchShell>
  );
}
const results = createRoute({
  getParentRoute: () => detail,
  path: '/results',
  component: SurveyResultsPage,
});
const followUp = createRoute({
  getParentRoute: () => detail,
  path: '/follow-up',
  component: SurveyFollowUpPage,
});
export const routeTree = root.addChildren([list, detail.addChildren([results, followUp])]);
