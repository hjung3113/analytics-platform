import { FoDetailDrawer } from '@ap/feature-bridge';
import { useFindingDetailParts } from '@ap/feature-screens/operator-screens/finding-detail';

/**
 * The Finding detail in the shell detail slot. It renders inside `FoBridge` (the FeedbackOps providers) and portals into the slot through `FoDetailDrawer`;
 * `onClose` drops `focus` (it is also the not-found button's action). Key it on the Finding.
 */
export function FindingDetailDrawer({ findingId, onClose }: { findingId: string; onClose: () => void }) {
  const parts = useFindingDetailParts({ findingId, onClose });
  return <FoDetailDrawer parts={parts} onClose={onClose} />;
}
