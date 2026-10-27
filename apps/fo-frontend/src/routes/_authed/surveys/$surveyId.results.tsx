import { SurveyResultsScreen } from '@/features/surveys/routes/SurveyResultsScreen';
import { createFileRoute } from '@tanstack/react-router';

// #982: the router plugin skips code-splitting when the route component is an
// exported local (hasExport check), so the route component is not exported.
// Nothing imports SurveyResultsRoute. Route itself must stay exported — the
// route generator drops files whose Route is not exported.
export const Route = createFileRoute('/_authed/surveys/$surveyId/results')({
  component: SurveyResultsRoute,
});

function SurveyResultsRoute() {
  const { surveyId } = Route.useParams();
  return <SurveyResultsScreen surveyId={surveyId} />;
}
