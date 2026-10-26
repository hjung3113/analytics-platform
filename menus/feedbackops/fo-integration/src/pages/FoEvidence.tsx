import type { ComponentProps } from 'react';
import { PlatformPage } from '@ap/components';
import { FoBridge, FoDetailDrawer, RejectedPage, evidenceRoute, operatorHostLinks, useEvidenceHere, useEvidenceSearch } from '@ap/fo-bridge';
import { EvidenceScreen } from '@fops/frontend/operator-screens/evidence';
import { isEvidenceSearchValueValid } from '@fops/frontend/operator-screens/integration-search';
import { useRejectedValue } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** The screen owns the selected Evidence and its close (`focus` is its `selected`), so the drawer's close is `requestClose`. */
const renderDetail: ComponentProps<typeof EvidenceScreen>['renderDetail'] = parts => <FoDetailDrawer parts={parts} onClose={parts.requestClose} />;

/** Evidence (ADR-0081, #762): FeedbackOps' Evidence list through the bridge; `focus` is the selected Evidence, rendered in the shell detail slot from the screen's own parts. */
export default function FoEvidence() {
  const rejected = useRejectedValue(evidenceRoute, isEvidenceSearchValueValid);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useEvidenceSearch} useHere={useEvidenceHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><EvidenceScreen renderDetail={renderDetail} /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
