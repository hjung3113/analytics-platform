import type { Equipment } from '@ap/mock-server';

/** Applied Scope/Condition/Selection resolves equipment first. Three synthetic IDs per resolved equipment,
 * capped at 24; numbering stays stable when the population shrinks. No resolved equipment means no rows. */
export function syntheticEquipmentIds(equipment: readonly Equipment[]): string[] {
  const count = Math.min(24, equipment.length * 3);
  return Array.from({ length: count }, (_, index) => `EQ-${String(index + 1).padStart(3, '0')}`);
}
