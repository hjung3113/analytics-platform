import type { PageProps } from '@ap/kernel';
import { surveyBuilderRoute, useSurveyBuilderHere, useSurveyBuilderSearch } from '@ap/feature-bridge';
import { SurveyBuilderScreen } from '@ap/feature-screens/operator-screens/survey-builder';
import { SurveyChildPage } from './SurveyChildPage';

/**
 * Survey 빌더 (ADR-0081, #764 p1), hidden under Survey 관리: Back (and a launch) returns to the list with this Survey selected and the list context kept.
 * The screen's own Back confirms an unsaved draft, and leaving by the menu or the browser asks through the shell's unsaved guard (#2533).
 */
export default function FeatureSurveyBuilder({ params }: PageProps) {
  return <SurveyChildPage surveyId={params.surveyId!} route={surveyBuilderRoute} useSearch={useSurveyBuilderSearch} useHere={useSurveyBuilderHere}>
    {({ surveyId, backToList }) => <SurveyBuilderScreen surveyId={surveyId} onBack={backToList} />}
  </SurveyChildPage>;
}
