import type { EquipmentAxisDescriptor } from '@ap/contracts';

/** Host-owned classification vocabulary (ADR-0059); Line and PRC group are separate Context keys. */
export const EQUIPMENT_AXES: readonly EquipmentAxisDescriptor[] = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
