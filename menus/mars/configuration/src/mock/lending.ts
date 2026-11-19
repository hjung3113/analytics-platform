import { EQUIPMENT as INVENTORY, type Equipment } from '@ap/mock-server';
import { EQUIPMENT, type ConfigurationLending, type HistoryParams, type LinkedMotion } from '../endpoints';

const motionByItem = new Map<string, LinkedMotion>([
  ['cfg-000000', { moduleType: 'LK', module: 'LK1', motion: 'Pump' }],
  ['cfg-000001', { moduleType: 'LK', module: 'LK2', motion: 'Pump' }],
]);

// Synthetic inventory IDs in equipment-column order. A missing entry leaves the column unlinked.
const declaredByScope = new Map<string, readonly string[]>([
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

// Keep each declared ID that the mock inventory generates; replace the rest with the next unused inventory ID
// of the same site and room, so every column names real equipment and the room split stays as declared.
const equipmentByScope = new Map<string, readonly string[]>([...declaredByScope].map(([site, declared]) => {
  const known = new Set(INVENTORY.map(row => row.equipmentId));
  const used = new Set(declared.filter(id => known.has(id)));
  return [site, declared.map(id => {
    if (known.has(id)) return id;
    const room = id.split('-')[1];
    const next = INVENTORY.find(row => row.site === site && row.room === room && !used.has(row.equipmentId));
    if (!next) return id;
    used.add(next.equipmentId);
    return next.equipmentId;
  })];
}));

export const linkedMotionForItem = (itemId: string): LinkedMotion | null => motionByItem.get(itemId) ?? null;

export function configurationLending({ itemId, equipment }: HistoryParams, scopeId: string | null, authorizedEquipment: readonly Equipment[]): ConfigurationLending {
  const inventory = equipmentByScope.get(scopeId ?? '');
  const authorizedIds = new Set(authorizedEquipment.map(row => row.equipmentId));
  return {
    linkedMotion: linkedMotionForItem(itemId),
    equipmentColumns: equipment.map(id => {
      const mappedId = inventory?.[EQUIPMENT.indexOf(id)];
      const equipmentId = mappedId !== undefined && authorizedIds.has(mappedId) ? mappedId : null;
      return { id, label: id, equipmentId };
    }),
  };
}
