/** @ap/menu-hw-time — hwTime group manifests. All four HW Time menus share the endpoints; the steps menu owns them. */
import { lazy } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { HW_TIME_CONTEXT } from './endpoints';

const GROUP = groupId('hwTime');
const PERMISSION = menuPermission('analytics:view');

export const manifests: MenuEntry[] = [
  {
    id: 'hw-time-steps', primary: true, group: GROUP,
    label: { ko: 'HW Time 단계별', en: 'HW Time by level' },
    description: { ko: 'Module·Motion 단계로 설비 동작시간을 분석합니다.', en: 'Analyze equipment operation time by Module and Motion.' },
    path: '/hw-time/steps', icon: LayoutDashboard, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities(HW_TIME_CONTEXT), pageType: 'analysis',
    features: { ...NO_FEATURES, board: true },
    pageKeys: ['drillModule', 'drillMotion', 'trend', 'benchmark', 'sort', 'grouped'],
    contextResetKeys: ['drillModule', 'drillMotion', 'trend'],
    drill: { levels: [{ key: 'drillModule', label: { ko: 'Module', en: 'Module' } }, { key: 'drillMotion', label: { ko: 'Motion', en: 'Motion' } }] },
    component: lazy(() => import('./pages/steps/StepsPage')),
  },
];
