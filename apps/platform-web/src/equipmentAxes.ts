import type { EquipmentAxisDescriptor } from '@ap/contracts';

/** Host-owned classification vocabulary (ADR-0059); Line and PRC group are separate Context keys. */
export const EQUIPMENT_AXES: readonly EquipmentAxisDescriptor[] = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false, dependsOn: 'roomNames' },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false, dependsOn: 'stgroup' },
  { id: 'maker', label: { ko: '설비사', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
