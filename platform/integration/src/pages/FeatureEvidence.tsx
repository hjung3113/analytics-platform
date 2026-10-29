import type { ComponentProps } from 'react';
import { FeatureDetailDrawer, FeatureScreenPage, evidenceRoute, useEvidenceHere, useEvidenceSearch } from '@ap/feature-bridge';
import { EvidenceScreen } from '@ap/feature-screens/operator-screens/evidence';
import { isEvidenceSearchValueValid } from '@ap/feature-screens/operator-screens/integration-search';

/** The screen owns the selected Evidence and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: ComponentProps<typeof EvidenceScreen>['renderDetail'] = parts => <FeatureDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Evidence (ADR-0081, #762): the feature screens' Evidence list through the bridge; `focus` is the selected Evidence (a UUID for the feature screens' 연동 search schema; `managedSystem` a UUID or `all`), rendered in the shell detail slot from the screen's own parts. */
export default function FeatureEvidence() {
  return <FeatureScreenPage route={evidenceRoute} isValid={isEvidenceSearchValueValid} useSearch={useEvidenceSearch} useHere={useEvidenceHere}><EvidenceScreen renderDetail={renderDetail} /></FeatureScreenPage>;
}
