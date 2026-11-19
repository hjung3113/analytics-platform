import { CAPABILITY_LABELS, type DeclaredCapabilityItem, isCapability, isDeclaredCapabilityId } from '@ap/feature-shared';

export { CAPABILITY_LABELS, CAPABILITY_LABELS_EN } from '@ap/feature-shared';

/** Marker for a grant, deny or request whose declared capability the deployment bundle no longer declares (ADR-0157). */
export const UNDECLARED_CAPABILITY_LABEL = '선언에 없음';

/**
 * A declared capability (ADR-0157 decision 9) shows its display name with its id beside it; until the server read is
 * loaded, or when the bundle no longer declares it, the id alone. Display names are plain text only.
 */
export function getCapabilityDisplayLabel(
  capability: string,
  declared: readonly DeclaredCapabilityItem[] = [],
): string {
  if (isCapability(capability)) return CAPABILITY_LABELS[capability];
  if (isDeclaredCapabilityId(capability)) {
    const item = declared.find((entry) => entry.id === capability);
    return item && item.display_name !== item.id ? `${item.display_name} (${item.id})` : capability;
  }
  return '권한 요청';
}
