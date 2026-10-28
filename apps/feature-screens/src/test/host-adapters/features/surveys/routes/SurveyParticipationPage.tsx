import {
  RespondSurveyScreen,
  SurveyParticipationScreen,
} from '@/features/surveys/components/participation/SurveyParticipationScreens';
import { useSurveyRespondentForm } from '@/features/surveys/hooks/useSurveys';
import { HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/test/host-adapters/lib/host/tanstack-host';
import { useDocumentTitle } from '@/test/host-adapters/lib/router/document-title';

export function SurveyParticipationPage() {
  return (
    <HostSeamProvider value={tanstackHost}>
      <SurveyParticipationScreen />
    </HostSeamProvider>
  );
}

export function RespondSurveyPage({ surveyId }: { surveyId: string }) {
  const form = useSurveyRespondentForm(surveyId);
  useDocumentTitle(
    form.isSuccess && !form.isFetching && form.data?.survey.id === surveyId
      ? form.data.survey.title
      : null,
  );
  return (
    <HostSeamProvider value={tanstackHost}>
      <RespondSurveyScreen key={surveyId} surveyId={surveyId} />
    </HostSeamProvider>
  );
}
