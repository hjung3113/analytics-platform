import { FeatureScreenPage, triageRoute, useTriageHere, useTriageSearch } from '@ap/feature-bridge';
import { TriageScreen } from '@ap/feature-screens/operator-screens/voc-triage';
import { isVocSearchValueValid } from '@ap/feature-screens/operator-screens/voc-search';

/** Triage (ADR-0081, #761): the feature screens' VOC triage workbench through the bridge; its selected VOC (`focus`, a UUID for the feature screens' VOC search schema) opens in the screen's own inline panel. */
export default function FeatureTriage() {
  return <FeatureScreenPage route={triageRoute} isValid={isVocSearchValueValid} useSearch={useTriageSearch} useHere={useTriageHere}><TriageScreen /></FeatureScreenPage>;
}
