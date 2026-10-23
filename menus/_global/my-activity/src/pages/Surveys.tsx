import { PlatformPage } from '@ap/components';
import { SurveyParticipationScreen } from '@fops/frontend/global-screens';
import { FoBridge } from '../fo/FoBridge';
import { canSurveyLink, SurveyLink } from '../fo/survey-links';

/** 설문 (ADR-0070 decision 6, ADR-0071): FeedbackOps' participation list through the bridge; the title is the manifest label. */
export default function Surveys() {
  return <PlatformPage>
    <FoBridge canLink={canSurveyLink} Link={SurveyLink}><SurveyParticipationScreen variant="embedded" /></FoBridge>
  </PlatformPage>;
}
