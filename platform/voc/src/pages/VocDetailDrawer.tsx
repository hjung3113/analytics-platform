import { FeatureDetailDrawer } from '@ap/feature-bridge';
import { useVocDetailParts } from '@ap/feature-screens/operator-screens/voc-detail';

/**
 * The operator VOC detail in the shell detail slot. It renders inside `FeatureBridge` (the FeedbackOps providers) and portals into the slot through
 * `FeatureDetailDrawer`; `onClose` is the confirmed close (`requestClose` asks first while a composer holds an unsent draft). Key it on the VOC.
 */
export function VocDetailDrawer({ vocId, managedSystemId, onClose }: { vocId: string; managedSystemId?: string; onClose: () => void }) {
  const parts = useVocDetailParts({ vocId, onClose, ...(managedSystemId !== undefined ? { managedSystemId } : {}) });
  return <FeatureDetailDrawer parts={parts} onClose={onClose} requestClose={parts.requestClose} />;
}
