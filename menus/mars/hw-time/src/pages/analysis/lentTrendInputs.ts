import type { LentPanelProps } from '@ap/kernel';
import { HW_TIME_MODULE_TYPES, type HwTimeRunQueryParams } from '../../endpoints';

export function readLentTrendInputs({ page, context }: LentPanelProps['inputs']): { params: HwTimeRunQueryParams } | { missing: string } {
  const equipmentId = context.selection?.length === 1 ? context.selection[0] : undefined;
  if (!equipmentId) return { missing: 'selection' };
  const moduleType = HW_TIME_MODULE_TYPES.find(type => type.id === page.moduleType);
  if (!moduleType) return { missing: 'moduleType' };
  const drillModule = moduleType.modules.find(module => module === page.drillModule);
  if (!drillModule) return { missing: 'drillModule' };
  const drillMotion = moduleType.motions.find(motion => motion === page.drillMotion);
  if (!drillMotion) return { missing: 'drillMotion' };
  return { params: { equipmentId, moduleType: moduleType.id, drillModule, drillMotion } };
}
