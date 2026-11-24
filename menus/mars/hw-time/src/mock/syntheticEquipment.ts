import { EQUIPMENT, type Equipment } from '@ap/mock-server';

/** Rows per response: the first equipment the server resolved for the applied Scope/Condition/Selection. */
export const MAX_EQUIPMENT_ROWS = 24;

/** Applied Scope/Condition/Selection resolves equipment first; the rows are those master IDs (at most 24, master order), so a
 * shown row can become the equipment condition and a narrowed population keeps its rows (#2868). No resolved equipment means no rows. */
export function syntheticEquipmentIds(equipment: readonly Equipment[]): string[] {
  return equipment.slice(0, MAX_EQUIPMENT_ROWS).map(item => item.equipmentId);
}

const NUMBER_BY_ID = new Map<string, number>();
for (const site of new Set(EQUIPMENT.map(item => item.site))) {
  EQUIPMENT.filter(item => item.site === site).forEach((item, index) => NUMBER_BY_ID.set(item.equipmentId, index + 1));
}

/** The synthetic values' seed: the equipment's 1-based position in its Site's master list, stable however the population
 * is narrowed. MEM's first 24 are the former `EQ-001`…`EQ-024`, so the default screen keeps its examples. */
export function equipmentNumber(equipmentId: string): number {
  const number = NUMBER_BY_ID.get(equipmentId);
  if (number === undefined) throw new Error(`Unknown equipment ${equipmentId}`);
  return number;
}

/** Synthetic long-tail membership per Module-Motion pair, stable when the resolved population shrinks.
 * Number 3 (MEM-PHOTO-0106) retains the Pump example; numbers 1 and 6 retain the normal/under examples. */
export function syntheticUpperTail(equipmentNumber: number, moduleIndex: number, motionIndex: number): boolean {
  const counts = [3, 2, 1, 1, 2, 1, 1, 1];
  const motionsPerModule = 4;
  const count = counts[(moduleIndex * motionsPerModule + motionIndex) % counts.length]!;
  const equipment = motionIndex === 0 ? [3, 10, 16] : [10, 16, 22];
  return equipment.slice(0, count).includes(equipmentNumber);
}
