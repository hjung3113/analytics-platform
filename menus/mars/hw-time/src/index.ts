/** @ap/menu-hw-time — hwTime group manifests. One linked-panel HW Time screen; the four menus it replaced are retired in the app assembly (`retiredMenus`, #2330). */
import { lazy } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { HW_TIME_CONTEXT } from './endpoints';
import { HW_TIME_FILTER_HIDDEN_KEYS, HW_TIME_FILTER_KEYS, HW_TIME_FILTER_REPEATED_KEYS } from './shared/useHwTimeFilter';

const PAGE_KEYS = ['drillModule', 'drillMotion', 'row', 'align', 'sort', 'page', 'focus', ...Object.values(HW_TIME_FILTER_KEYS)];
const DRILL = { levels: [{ key: 'drillModule', label: { ko: 'Module', en: 'Module' } }, { key: 'drillMotion', label: { ko: 'Motion', en: 'Motion' } }], resetKeys: ['focus'] };

const GROUP = groupId('hwTime');
const PERMISSION = menuPermission('analytics:view');

export const manifests: MenuEntry[] = [
  {
    id: 'hw-time', primary: true, group: GROUP,
    label: { ko: 'HW Time', en: 'HW Time' },
    description: { ko: '연결된 패널에서 설비 동작시간을 분석합니다.', en: 'Analyze operation time with linked panels.' },
    path: '/hw-time', icon: LayoutDashboard, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities(HW_TIME_CONTEXT), pageType: 'analysis',
    features: { ...NO_FEATURES, board: true, export: true },
    pageKeys: PAGE_KEYS,
    repeatedPageKeys: HW_TIME_FILTER_REPEATED_KEYS,
    hiddenPageKeys: HW_TIME_FILTER_HIDDEN_KEYS,
    contextResetKeys: ['drillModule', 'drillMotion', 'row', 'page', 'focus'],
    drill: DRILL,
    component: lazy(() => import('./HwTimePage')),
  },
];
