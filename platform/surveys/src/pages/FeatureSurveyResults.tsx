import type { PageProps } from '@ap/kernel';
import { surveyResultsRoute, useSurveyResultsHere, useSurveyResultsSearch } from '@ap/feature-bridge';
import { SurveyResultsScreen } from '@ap/feature-screens/operator-screens/survey-results';
import { SurveyChildPage } from './SurveyChildPage';

/** Survey 결과 (ADR-0081, #764 p1), hidden under Survey 관리: the result summary of one Survey; its header links go through the bridge's host links. */
export default function FeatureSurveyResults({ params }: PageProps) {
  return <SurveyChildPage surveyId={params.surveyId!} route={surveyResultsRoute} useSearch={useSurveyResultsSearch} useHere={useSurveyResultsHere}>
    {({ surveyId }) => <SurveyResultsScreen surveyId={surveyId} />}
  </SurveyChildPage>;
}
