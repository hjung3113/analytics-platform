import { contextCapabilities, defineEndpoint, groupId, KERNEL_PERMISSIONS, menuPermission, spaceId, type EquipmentAxisDescriptor, type MeasureMeta } from '@ap/contracts';

export const MENU_ID = 'kit-round-trip';
export const permission = menuPermission('kit:inhouse-view');
export const permissions = [...KERNEL_PERMISSIONS, permission];
export const axes: readonly EquipmentAxisDescriptor[] = [
  { id: 'chamberType', label: { ko: 'Chamber type', en: 'Chamber type' }, membershipHistory: false },
  { id: 'team', label: { ko: 'Team', en: 'Team' }, membershipHistory: false },
];
export const menu = {
  id: MENU_ID, group: groupId('kit'), primary: true,
  label: { ko: 'Kit round trip', en: 'Kit round trip' }, description: { ko: 'Kit round trip menu', en: 'Kit round trip menu' },
  path: '/inhouse', permission, requiresScope: false, context: contextCapabilities(),
  pageType: 'management' as const, pageKeys: ['rtFilter', 'rtAxis'],
  features: { export: false, savedView: false, annotate: false, compare: false },
};
export const space = { id: spaceId('kit'), label: { ko: 'Kit', en: 'Kit' }, description: { ko: 'Kit synthetic space', en: 'Kit synthetic space' }, homeMenuId: MENU_ID };
export type Rows = { rows: { group: string; name: string; value: number }[]; measure: MeasureMeta };
export const endpoint = defineEndpoint<{ filter: string; axis: string }, Rows>({
  id: 'kit.round-trip', menuId: MENU_ID, permission, requiresScope: false,
  paramKeys: { filter: true, axis: true }, context: {}, kinds: [], mergeTimeDomain: false,
});
