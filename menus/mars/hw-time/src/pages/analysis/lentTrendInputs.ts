import { normalizeSet } from '@ap/contracts';
import type { LentPanelProps } from '@ap/kernel';
import { HW_TIME_LENT_EQUIPMENT_LIMIT, HW_TIME_MODULE_TYPES, type HwTimeRunQueryParams } from '../../endpoints';

export function readLentTrendInputs({ page, context }: LentPanelProps['inputs']): { params: HwTimeRunQueryParams } | { missing: string } {
  const selection = context.selection;
  if (!selection?.length || selection.length > HW_TIME_LENT_EQUIPMENT_LIMIT) return { missing: 'selection' };
  let equipmentIds: string[];
  try {
    equipmentIds = normalizeSet(selection, 'selection');
  } catch {
    return { missing: 'selection' };
  }
  if (equipmentIds.length !== selection.length) return { missing: 'selection' };
  const moduleType = HW_TIME_MODULE_TYPES.find(type => type.id === page.moduleType);
  if (!moduleType) return { missing: 'moduleType' };
  const drillModule = moduleType.modules.find(module => module === page.drillModule);
  if (!drillModule) return { missing: 'drillModule' };
  const drillMotion = moduleType.motions.find(motion => motion === page.drillMotion);
  if (!drillMotion) return { missing: 'drillMotion' };
  const drill = { moduleType: moduleType.id, drillModule, drillMotion };
  return equipmentIds.length === 1 ? { params: { ...drill, equipmentId: equipmentIds[0]! } } : { params: { ...drill, equipmentIds } };
}
