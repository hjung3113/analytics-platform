import type { GlobalContext } from '@ap/contracts';
import { EQUIPMENT } from './endpoints';

export const HW_TIME_TREND = 'hw-time/trend';

type Motion = { moduleType: string; module: string; motion: string };
export type HwTimeTrendValues = Motion & { equipmentIds?: string[]; equipmentLabels?: Record<string, string> };

const motionByItem = new Map<string, Motion>([
  ['cfg-000000', { moduleType: 'LK', module: 'LK1', motion: 'Pump' }],
  ['cfg-000001', { moduleType: 'LK', module: 'LK2', motion: 'Pump' }],
]);

// Synthetic inventory IDs in equipment-column order. Unmapped columns are deliberately unavailable for lending.
const equipmentByScope = new Map<string, readonly string[]>([
  ['MEM', [
    'MEM-PHOTO-0103', 'MEM-PHOTO-0105', 'MEM-PHOTO-0108', 'MEM-PHOTO-0111', 'MEM-PHOTO-0112',
    'MEM-PHOTO-0115', 'MEM-PHOTO-0116', 'MEM-PHOTO-0117', 'MEM-PHOTO-0119', 'MEM-PHOTO-0122',
    'MEM-ETCH-0125', 'MEM-ETCH-0128', 'MEM-ETCH-0129', 'MEM-ETCH-0131', 'MEM-ETCH-0136',
    'MEM-ETCH-0138', 'MEM-ETCH-0139', 'MEM-ETCH-0141', 'MEM-CVD-0144', 'MEM-CVD-0146',
  ]],
  ['FDRY', [
    'FDRY-PHOTO-0200', 'FDRY-PHOTO-0202', 'FDRY-PHOTO-0203', 'FDRY-PHOTO-0204', 'FDRY-PHOTO-0206',
    'FDRY-PHOTO-0208', 'FDRY-PHOTO-0211', 'FDRY-PHOTO-0214', 'FDRY-PHOTO-0217', 'FDRY-PHOTO-0218',
    'FDRY-PHOTO-0221', 'FDRY-PHOTO-0224', 'FDRY-PHOTO-0230',
  ]],
  ['XIA', [
    'XIA-PHOTO-0285', 'XIA-PHOTO-0287', 'XIA-PHOTO-0290', 'XIA-PHOTO-0291', 'XIA-PHOTO-0293',
    'XIA-PHOTO-0295', 'XIA-PHOTO-0297', 'XIA-PHOTO-0298', 'XIA-PHOTO-0299', 'XIA-PHOTO-0312',
    'XIA-ETCH-0313', 'XIA-ETCH-0314', 'XIA-ETCH-0315', 'XIA-ETCH-0316', 'XIA-ETCH-0319',
    'XIA-ETCH-0321', 'XIA-ETCH-0323', 'XIA-ETCH-0324', 'XIA-ETCH-0326', 'XIA-ETCH-0329',
  ]],
]);

export const hasLinkedMotion = (id: string) => motionByItem.has(id);

export function hwTimeTrendValues(itemId: string | null, columns: readonly string[], context: Pick<GlobalContext, 'scopeId' | 'selection'>): HwTimeTrendValues | undefined {
  const motion = itemId === null ? undefined : motionByItem.get(itemId);
  if (!motion) return undefined;
  const inventory = equipmentByScope.get(context.scopeId ?? '');
  const mapped = columns.map(column => ({ column, id: inventory?.[EQUIPMENT.indexOf(column)] }));
  if (!mapped.every(entry => entry.id !== undefined)) return motion;
  const { selection } = context;
  const selected = mapped.flatMap(({ id, column }) => id !== undefined && (selection === null || selection.includes(id)) ? [[id, column] as const] : []);
  return { ...motion, equipmentIds: selected.map(([id]) => id), equipmentLabels: Object.fromEntries(selected) };
}
