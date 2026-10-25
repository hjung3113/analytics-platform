import type { EquipmentAxisDescriptor } from '@ap/contracts';

/** The axes the app declares (apps/platform-web equipmentAxes.ts); the Provider rejects a manifest preset naming an axis outside this list. */
export const TEST_AXES: readonly EquipmentAxisDescriptor[] = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: '분임조', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
