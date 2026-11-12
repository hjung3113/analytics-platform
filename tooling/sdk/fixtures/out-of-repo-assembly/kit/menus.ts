// The kit's own declarations — the whole createRegistry input the Host builds the mounted app's Registry from.
// Public synthetic menu: a kernel permission ('platform:view'), so every session (the viewer role included) sees it.
import { Gauge, Wrench } from 'lucide-react';
import type { CreateRegistryInput } from '@ap/app-host';
import type { MenuEntry } from '@ap/kernel';
import { contextCapabilities, groupId, KERNEL_PERMISSIONS, menuPermission, spaceId, type EquipmentAxisDescriptor, type Permission } from '@ap/contracts';

const noContext = contextCapabilities();

const NO_FEATURES = { export: false, savedView: false, annotate: false, compare: false } as const;

const PUBLIC_MENUS: readonly MenuEntry[] = [{
  id: 'kit-overview', group: groupId('kit'), primary: true, label: { ko: '키트 개요', en: 'Kit overview' },
  description: { ko: '', en: '' }, path: '/', icon: Gauge, permission: 'platform:view', requiresScope: false,
  context: noContext, pageType: 'overview', features: NO_FEATURES, pageKeys: [],
}];

// kit:inhouse-start — the in-house-role menu: a menu permission only the in-house session holds.
// sdk-consumer-check's removal self-test replaces this block with an empty list (keep the markers).
const IN_HOUSE_MENUS: readonly MenuEntry[] = [{
  id: 'kit-inhouse-work', group: groupId('kit'), primary: false, label: { ko: '사내 업무', en: 'In-house work' },
  description: { ko: '', en: '' }, path: '/inhouse', icon: Wrench, permission: menuPermission('kit:inhouse-view'), requiresScope: false,
  context: noContext, pageType: 'management', features: NO_FEATURES, pageKeys: [],
}];
// kit:inhouse-end

/** The kit's menu permissions on top of the kernel's. Declaring is not granting: the mock server's roles decide who holds them. */
export const KIT_PERMISSIONS = [menuPermission('kit:inhouse-view')] as const;

/** The vocabulary handed to the mock world: the mock roles are built from it (viewer never gets the in-house permission). */
export const VOCABULARY: readonly Permission[] = [...KERNEL_PERMISSIONS, ...KIT_PERMISSIONS];

/** The kit injects no equipment axis of its own. */
export const KIT_AXES: readonly EquipmentAxisDescriptor[] = [];
export const declarations: CreateRegistryInput = {
  spaces: [{ id: spaceId('kit'), label: { ko: '키트', en: 'Kit' }, description: { ko: '시작 키트의 합성 메뉴', en: 'Synthetic menus of the start kit' }, homeMenuId: 'kit-overview' }],
  groups: [{ id: groupId('kit'), label: { ko: '키트', en: 'Kit' }, icon: Gauge, space: spaceId('kit'), hideLabelWhenSingle: true }],
  menus: [...PUBLIC_MENUS, ...IN_HOUSE_MENUS],
  permissions: [...KIT_PERMISSIONS],
};
