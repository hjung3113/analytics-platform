import {
  RespondSurveyScreen,
  SurveyParticipationScreen,
} from '@/features/surveys/components/participation/SurveyParticipationScreens';
import { HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/test/host-adapters/lib/host/tanstack-host';

export function SurveyParticipationPage() {
  return (
    <HostSeamProvider value={tanstackHost}>
      <SurveyParticipationScreen />
    </HostSeamProvider>
  );
}

export function RespondSurveyPage({ surveyId }: { surveyId: string }) {
  return (
    <HostSeamProvider value={tanstackHost}>
      <RespondSurveyScreen key={surveyId} surveyId={surveyId} />
    </HostSeamProvider>
  );
}
