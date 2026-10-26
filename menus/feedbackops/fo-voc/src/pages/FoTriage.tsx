import { FoScreenPage, triageRoute, useTriageHere, useTriageSearch } from '@ap/fo-bridge';
import { TriageScreen } from '@fops/frontend/operator-screens/voc-triage';
import { isVocSearchValueValid } from '@fops/frontend/operator-screens/voc-search';

/** Triage (ADR-0081, #761): FeedbackOps' VOC triage workbench through the bridge; its selected VOC (`focus`, a UUID for FeedbackOps' VOC search schema) opens in the screen's own inline panel. */
export default function FoTriage() {
  return <FoScreenPage route={triageRoute} isValid={isVocSearchValueValid} useSearch={useTriageSearch} useHere={useTriageHere}><TriageScreen /></FoScreenPage>;
}
