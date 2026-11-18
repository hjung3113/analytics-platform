import type { GlobalContext } from '@ap/contracts';
import type { ConfigurationLending, LinkedMotion } from './endpoints';

export const HW_TIME_TREND = 'hw-time/trend';

type HwTimeTrendValues = LinkedMotion & { equipmentIds?: string[]; equipmentLabels?: Record<string, string> };

export function hwTimeTrendBinding(
  response: ConfigurationLending | null,
  columns: readonly string[],
  selection: GlobalContext['selection'],
): { values: HwTimeTrendValues | undefined; unmappedLabels: string[]; incomplete: boolean } {
  const motion = response?.linkedMotion;
  if (!motion) return { values: undefined, unmappedLabels: [], incomplete: false };
  const byId = new Map(response.equipmentColumns.map(column => [column.id, column]));
  const unmappedLabels: string[] = [];
  const selected: [string, string][] = [];
  let incomplete = false;
  for (const id of columns) {
    const column = byId.get(id);
    const equipmentId = column?.equipmentId;
    if (!column || typeof equipmentId !== 'string' || !equipmentId.trim()) {
      incomplete = true;
      if (column?.label) unmappedLabels.push(column.label);
    } else if (selection === null || selection.includes(equipmentId)) {
      selected.push([equipmentId, column.label]);
    }
  }
  if (incomplete) return { values: motion, unmappedLabels, incomplete };
  return {
    values: { ...motion, equipmentIds: selected.map(([id]) => id), equipmentLabels: Object.fromEntries(selected) },
    unmappedLabels, incomplete,
  };
}
