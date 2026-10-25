import { PlatformPage } from '@ap/components';
import { FoBridge, operatorHostLinks, triageRoute, useTriageHere, useTriageSearch } from '@ap/fo-bridge';
import { TriageScreen } from '@fops/frontend/operator-screens/voc-triage';
import { RejectedPage, useRejectedValue } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;

/** Triage (ADR-0081, #761): FeedbackOps' VOC triage workbench through the bridge; its selected VOC (`focus`) opens in the screen's own inline panel. */
export default function FoTriage() {
  const rejected = useRejectedValue(triageRoute);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useTriageSearch} useHere={useTriageHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><TriageScreen /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
