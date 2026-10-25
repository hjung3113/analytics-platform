import { FoDetailDrawer } from '@ap/fo-bridge';
import { useClusterDetailParts } from '@fops/frontend/operator-screens/voc-clusters';

/**
 * The operator cluster detail in the shell detail slot. It renders inside `FoBridge` (the FeedbackOps providers) and portals into the slot through
 * `FoDetailDrawer`. The cluster parts have no unsent-draft guard, so `onClose` is the close itself. Key it on the cluster.
 */
export function ClusterDetailDrawer({ clusterId, onClose }: { clusterId: string; onClose: () => void }) {
  const parts = useClusterDetailParts({ clusterId });
  return <FoDetailDrawer parts={parts} onClose={onClose} />;
}
