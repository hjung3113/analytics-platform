import { usePlatform } from '@ap/kernel';
import { FeatureScreenPage, clustersRoute, useClustersHere, useClustersSearch } from '@ap/feature-bridge';
import { ClusterListScreen, isVocClustersSearchValueValid } from '@ap/feature-screens/operator-screens/voc-clusters';
import { ClusterDetailDrawer } from './ClusterDetailDrawer';

/** screen's `ListShell` would hand a returned node to the shell slot, which renders outside the feature providers; the page draws the detail itself, inside `FeatureBridge`. */
const noDetail = () => undefined;

/**
 * Clusters (ADR-0081, #761): the feature screens' VOC cluster list through the bridge; `focus` opens the cluster detail in the shell detail slot.
 * The cluster schema's own strict check, not the VOC one: `managedSystem` here is a uuid (or `all`), `focus` a uuid (06 §6.4: reject and preserve; nothing is requested).
 */
export default function FeatureClusters() {
  const { pageParam, setPage } = usePlatform();
  const focus = pageParam('focus');
  return <FeatureScreenPage route={clustersRoute} isValid={isVocClustersSearchValueValid} useSearch={useClustersSearch} useHere={useClustersHere}
    detail={focus !== null && <ClusterDetailDrawer key={focus} clusterId={focus} onClose={() => setPage({ focus: null })} />}>
    <ClusterListScreen renderDetail={noDetail} onCreated={id => setPage({ focus: id })} />
  </FeatureScreenPage>;
}
