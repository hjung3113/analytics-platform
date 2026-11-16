import type { Equipment } from '@ap/mock-server';

/** Applied Scope/Condition/Selection resolves equipment first. Three synthetic IDs per resolved equipment,
 * capped at 24; numbering stays stable when the population shrinks. No resolved equipment means no rows. */
export function syntheticEquipmentIds(equipment: readonly Equipment[]): string[] {
  const count = Math.min(24, equipment.length * 3);
  return Array.from({ length: count }, (_, index) => `EQ-${String(index + 1).padStart(3, '0')}`);
}

/** Synthetic long-tail membership per Module-Motion pair, stable when the resolved population shrinks.
 * EQ-003 retains the Pump example; EQ-001 and EQ-006 retain the normal/under examples. */
export function syntheticUpperTail(equipmentNumber: number, moduleIndex: number, motionIndex: number): boolean {
  const counts = [3, 2, 1, 1, 2, 1, 1, 1];
  const motionsPerModule = 4;
  const count = counts[(moduleIndex * motionsPerModule + motionIndex) % counts.length]!;
  const equipment = motionIndex === 0 ? [3, 10, 16] : [10, 16, 22];
  return equipment.slice(0, count).includes(equipmentNumber);
}
