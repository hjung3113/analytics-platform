import { SurveyFollowUpScreen } from '@/features/surveys/routes/SurveyFollowUpScreen';
import { WorkbenchShell } from '@ap/ui';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/_authed/surveys/$surveyId/follow-up')({
  component: SurveyFollowUpFileRoute,
});

function SurveyFollowUpFileRoute() {
  const { surveyId } = Route.useParams();
  return (
    <WorkbenchShell>
      <div className="flex h-full min-h-0 flex-col">
        <SurveyFollowUpScreen surveyId={surveyId} />
      </div>
    </WorkbenchShell>
  );
}
