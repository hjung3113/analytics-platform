import { HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/lib/host/tanstack-host';
import { useDocumentTitle } from '@/lib/router/document-title';
import {
  RespondSurveyScreen,
  SurveyParticipationScreen,
} from '../components/participation/SurveyParticipationScreens';
import { useSurveyRespondentForm } from '../hooks/useSurveys';

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
