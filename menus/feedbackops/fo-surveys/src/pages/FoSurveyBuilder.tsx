import type { PageProps } from '@ap/kernel';
import { surveyBuilderRoute, useSurveyBuilderHere, useSurveyBuilderSearch } from '@ap/fo-bridge';
import { SurveyBuilderScreen } from '@fops/frontend/operator-screens/survey-builder';
import { SurveyChildPage } from './SurveyChildPage';

/**
 * Survey 빌더 (ADR-0081, #764 p1), hidden under Survey 관리: Back (and a launch) returns to the list with this Survey selected and the list context kept.
 * Leaving by the menu or the browser drops an unsaved draft (plan D3, `.planning/backlog.md`); the screen's own Back confirms it.
 */
export default function FoSurveyBuilder({ params }: PageProps) {
  return <SurveyChildPage surveyId={params.surveyId!} route={surveyBuilderRoute} useSearch={useSurveyBuilderSearch} useHere={useSurveyBuilderHere}>
    {({ surveyId, backToList }) => <SurveyBuilderScreen surveyId={surveyId} onBack={backToList} />}
  </SurveyChildPage>;
}
