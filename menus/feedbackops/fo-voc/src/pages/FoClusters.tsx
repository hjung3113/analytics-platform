import { PlatformPage } from '@ap/components';
import { usePlatform } from '@ap/kernel';
import { FoBridge, clustersRoute, operatorHostLinks, useClustersHere, useClustersSearch } from '@ap/fo-bridge';
import { ClusterListScreen, isVocClustersSearchValueValid } from '@fops/frontend/operator-screens/voc-clusters';
import { ClusterDetailDrawer } from './ClusterDetailDrawer';
import { RejectedPage } from './RejectedPage';

/** Module level: `FoBridge` memoizes its seam on these identities. */
const { canLink, Link, targetOf, useNavigate } = operatorHostLinks;
/** FO's `ListShell` would hand a returned node to the shell slot, which renders outside the FeedbackOps providers; the page draws the detail itself, inside `FoBridge`. */
const noDetail = () => undefined;

/** Clusters (ADR-0081, #761): FeedbackOps' VOC cluster list through the bridge; `focus` opens the cluster detail in the shell detail slot. */
export default function FoClusters() {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  // The cluster schema's own strict check, not the VOC one: `managedSystem` here is a uuid (or `all`), `focus` a uuid (06 §6.4: reject and preserve; nothing is requested).
  const rejected = clustersRoute.rejectedKey(pageParam, isVocClustersSearchValueValid);
  if (rejected !== null) return <RejectedPage rejected={rejected} />;
  return <PlatformPage layout="fill">
    <FoBridge canLink={canLink} Link={Link} targetOf={targetOf} useNavigate={useNavigate} useSearch={useClustersSearch} useHere={useClustersHere}>
      <div className="relative h-full">
        <div className="absolute inset-0 flex flex-col"><ClusterListScreen renderDetail={noDetail} onCreated={id => setPage({ focus: id })} /></div>
      </div>
      {focus !== null && <ClusterDetailDrawer key={focus} clusterId={focus} onClose={() => setPage({ focus: null })} />}
    </FoBridge>
  </PlatformPage>;
}
