import { PlatformPage } from '@ap/components';
import { FoBridge, RejectedPage, coverageRoute, operatorHostLinks, useCoverageHere, useCoverageSearch } from '@ap/fo-bridge';
import { CoverageScreen } from '@fops/frontend/operator-screens/coverage';
import { isIntegrationCoverageSearchValueValid } from '@fops/frontend/operator-screens/integration-search';
import { useRejectedValue } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;

/** 커버리지 (ADR-0081, #762): FeedbackOps' coverage report through the bridge; `view` is its tab, there is no detail. Its `/admin/settings#coverage` hop stays unlinked until #764 (D9). */
export default function FoCoverage() {
  const rejected = useRejectedValue(coverageRoute, isIntegrationCoverageSearchValueValid);
  // A value FeedbackOps would drop is rejected and preserved, not replaced by a default query (06 §6.4); nothing is requested for it.
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useCoverageSearch} useHere={useCoverageHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><CoverageScreen /></div>
      </div>
    </FoBridge>
  </PlatformPage>;
}
