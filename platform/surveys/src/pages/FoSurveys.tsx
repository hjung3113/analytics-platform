import { usePlatform } from '@ap/kernel';
import { FeatureScreenPage, surveysRoute, useSurveysHere, useSurveysSearch } from '@ap/feature-bridge';
import { SurveysScreen } from '@ap/feature-screens/operator-screens/surveys';
import { isSurveysSearchValueValid } from '@ap/feature-screens/operator-screens/surveys-search';
import { SurveyDetailDrawer } from './SurveyDrawer';

/** FO's `ListShell` would hand a returned node to the shell slot, which renders it outside the FeedbackOps providers (and over the list's denied and empty states); the page draws the detail itself, inside `FeatureBridge`. */
const noDetail = () => undefined;

/**
 * Survey 관리 (ADR-0081, #764 p1): the FeedbackOps Surveys list; `focus` opens the Survey detail in the shell detail slot (URL-only selection, nothing auto-selects).
 * A value FeedbackOps' Surveys search schema refuses is rejected (`focus` is its `selected`, a UUID; `managedSystem` a UUID or `all`; `area` a UUID or `unset`).
 */
export default function FoSurveys() {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  return <FeatureScreenPage route={surveysRoute} isValid={isSurveysSearchValueValid} useSearch={useSurveysSearch} useHere={useSurveysHere}
    detail={focus !== null && <SurveyDetailDrawer key={focus} surveyId={focus} onClose={() => setPage({ focus: null })} />}>
    <SurveysScreen renderDetail={noDetail} />
  </FeatureScreenPage>;
}
