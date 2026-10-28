import { FeatureDetailDrawer } from '@ap/feature-bridge';
import { useClusterDetailParts } from '@ap/feature-screens/operator-screens/voc-clusters';

/**
 * The operator cluster detail in the shell detail slot. It renders inside `FeatureBridge` (the FeedbackOps providers) and portals into the slot through
 * `FeatureDetailDrawer`. The cluster parts have no unsent-draft guard, so `onClose` is the close itself. Key it on the cluster.
 */
export function ClusterDetailDrawer({ clusterId, onClose }: { clusterId: string; onClose: () => void }) {
  const parts = useClusterDetailParts({ clusterId });
  return <FeatureDetailDrawer parts={parts} onClose={onClose} />;
}
