import { FeatureDetailDrawer } from '@ap/feature-bridge';
import { useSurveyDetailParts } from '@ap/feature-screens/operator-screens/survey-detail';

/**
 * The Survey detail in the shell detail slot. It renders inside `FeatureBridge` (the feature providers) and portals into the slot through `FeatureDetailDrawer`;
 * `onClose` drops `focus` (it is also the not-found button's action). Key it on the Survey.
 */
export function SurveyDetailDrawer({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const parts = useSurveyDetailParts({ surveyId, onClose });
  return <FeatureDetailDrawer parts={parts} onClose={onClose} />;
}
