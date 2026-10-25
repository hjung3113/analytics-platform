import { useI18n } from '@ap/kernel';
import { DetailDrawer } from '@ap/components';
import { useClusterDetailParts } from '@fops/frontend/operator-screens/voc-clusters';

/**
 * The operator cluster detail in the shell detail slot. It renders inside `FoBridge` (the FeedbackOps providers) and portals into the slot through
 * `DetailDrawer`. The cluster parts have no unsent-draft guard, so `onClose` is the close itself. Key it on the cluster.
 */
export function ClusterDetailDrawer({ clusterId, onClose }: { clusterId: string; onClose: () => void }) {
  const { lang } = useI18n();
  const parts = useClusterDetailParts({ clusterId });
  return <DetailDrawer title={parts.title} {...(parts.subtitle !== undefined ? { subtitle: parts.subtitle } : {})} {...(parts.headerActions !== undefined ? { headerActions: parts.headerActions } : {})}
    onClose={onClose}
    tabs={[{ id: 'detail', label: lang === 'ko' ? '상세' : 'Details', content: <div className="fo-voc-detail flex min-h-0 flex-1 flex-col">{parts.body}</div> }]} />;
}
