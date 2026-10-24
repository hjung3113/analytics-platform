/** @ap/menu-hw-time — hwTime group manifests (planned menus have no component). */
import { LayoutDashboard } from 'lucide-react';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { HW_TIME_CONTEXT } from './endpoints';

const GROUP = groupId('hwTime');
const PERMISSION = menuPermission('analytics:view');

export const manifests: MenuEntry[] = [
  {
    id: 'hw-time', primary: true, group: GROUP,
    label: { ko: '동작시간분석', en: 'Operation time analysis' },
    description: { ko: '동작시간분석', en: 'Operation time analysis' },
    path: '/hw-time', icon: LayoutDashboard, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities(HW_TIME_CONTEXT), pageType: 'overview',
    features: NO_FEATURES, pageKeys: [],
  },
];
