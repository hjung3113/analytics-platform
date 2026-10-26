import type { ComponentProps } from 'react';
import { FoDetailDrawer, FoScreenPage, evidenceRoute, useEvidenceHere, useEvidenceSearch } from '@ap/fo-bridge';
import { EvidenceScreen } from '@fops/frontend/operator-screens/evidence';
import { isEvidenceSearchValueValid } from '@fops/frontend/operator-screens/integration-search';

/** The screen owns the selected Evidence and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: ComponentProps<typeof EvidenceScreen>['renderDetail'] = parts => <FoDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Evidence (ADR-0081, #762): FeedbackOps' Evidence list through the bridge; `focus` is the selected Evidence (a UUID for FeedbackOps' 연동 search schema; `managedSystem` a UUID or `all`), rendered in the shell detail slot from the screen's own parts. */
export default function FoEvidence() {
  return <FoScreenPage route={evidenceRoute} isValid={isEvidenceSearchValueValid} useSearch={useEvidenceSearch} useHere={useEvidenceHere}><EvidenceScreen renderDetail={renderDetail} /></FoScreenPage>;
}
