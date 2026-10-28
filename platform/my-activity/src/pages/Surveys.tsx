import { PlatformPage } from '@ap/components';
import { SurveyParticipationScreen } from '@ap/feature-screens/global-screens';
import { FeatureBridge, canSurveyLink, SurveyLink } from '@ap/feature-bridge';

/** 설문 (ADR-0070 decision 6, ADR-0071): FeedbackOps' participation list through the bridge; the title is the manifest label. */
export default function Surveys() {
  return <PlatformPage>
    <FeatureBridge canLink={canSurveyLink} Link={SurveyLink}><SurveyParticipationScreen variant="embedded" /></FeatureBridge>
  </PlatformPage>;
}
