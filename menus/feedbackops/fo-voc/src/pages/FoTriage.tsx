import { PlatformPage } from '@ap/components';
import { FoBridge, operatorHostLinks, useTriageHere, useTriageSearch } from '@ap/fo-bridge';
import { TriageScreen } from '@fops/frontend/operator-screens/voc-triage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;

/** Triage (ADR-0081, #761): FeedbackOps' VOC triage workbench through the bridge; its selected VOC (`focus`) opens in the screen's own inline panel. */
export default function FoTriage() {
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useTriageSearch} useHere={useTriageHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><TriageScreen /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
