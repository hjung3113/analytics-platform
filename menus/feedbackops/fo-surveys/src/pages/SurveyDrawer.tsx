import { FoDetailDrawer } from '@ap/fo-bridge';
import { useSurveyDetailParts } from '@fops/frontend/operator-screens/survey-detail';

/**
 * The Survey detail in the shell detail slot. It renders inside `FoBridge` (the FeedbackOps providers) and portals into the slot through `FoDetailDrawer`;
 * `onClose` drops `focus` (it is also the not-found button's action). Key it on the Survey.
 */
export function SurveyDetailDrawer({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const parts = useSurveyDetailParts({ surveyId, onClose });
  return <FoDetailDrawer parts={parts} onClose={onClose} />;
}
