import { FeatureDetailDrawer } from '@ap/feature-bridge';
import { useFindingDetailParts } from '@ap/feature-screens/operator-screens/finding-detail';
import type { RefObject } from 'react';

/**
 * The Finding detail in the shell detail slot. It renders inside `FeatureBridge` (the feature providers) and portals into the slot through `FeatureDetailDrawer`;
 * `onClose` drops `focus` (it is also the not-found button's action). Key it on the Finding.
 */
export function FindingDetailDrawer({ findingId, onClose, isInList, listFocusRef }: {
  findingId: string; onClose: () => void; isInList: boolean | undefined;
  listFocusRef: RefObject<HTMLElement | null>;
}) {
  const parts = useFindingDetailParts({ findingId, onClose, titleInHeader: true });
  return <FeatureDetailDrawer parts={parts} onClose={onClose} isInList={isInList} listFocusRef={listFocusRef} />;
}
