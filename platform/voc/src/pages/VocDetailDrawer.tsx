import { FoDetailDrawer } from '@ap/feature-bridge';
import { useVocDetailParts } from '@ap/feature-screens/operator-screens/voc-detail';

/**
 * The operator VOC detail in the shell detail slot. It renders inside `FoBridge` (the FeedbackOps providers) and portals into the slot through
 * `FoDetailDrawer`; `onClose` is the confirmed close (`requestClose` asks first while a composer holds an unsent draft). Key it on the VOC.
 */
export function VocDetailDrawer({ vocId, managedSystemId, onClose }: { vocId: string; managedSystemId?: string; onClose: () => void }) {
  const parts = useVocDetailParts({ vocId, onClose, ...(managedSystemId !== undefined ? { managedSystemId } : {}) });
  return <FoDetailDrawer parts={parts} onClose={onClose} requestClose={parts.requestClose} />;
}
