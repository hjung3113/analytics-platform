/** @ap/menu-hw-time — hwTime group manifests. All four HW Time menus share the endpoints; the steps menu owns them. */
import { lazy } from 'react';
import { LayoutDashboard, Table2 } from 'lucide-react';
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
    pageKeys: ['drillModule', 'drillMotion', 'trend', 'sort', 'align', 'minmax'],
    contextResetKeys: ['drillModule', 'drillMotion', 'trend'],
    drill: { levels: [{ key: 'drillModule', label: { ko: 'Module', en: 'Module' } }, { key: 'drillMotion', label: { ko: 'Motion', en: 'Motion' } }] },
    component: lazy(() => import('./pages/steps/StepsPage')),
  },
  {
    id: 'hw-time-table', group: GROUP,
    label: { ko: 'HW Time 표', en: 'HW Time table' },
    description: { ko: 'EquipmentID·하위 항목별 동작시간을 표로 보고 행 상세를 엽니다.', en: 'Browse operation time per EquipmentID and sub-item in a table and open row details.' },
    path: '/hw-time/table', icon: Table2, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities(HW_TIME_CONTEXT), pageType: 'analysis',
    features: { ...NO_FEATURES, export: true, board: true },
    pageKeys: ['drillModule', 'drillMotion', 'sort', 'page', 'focus'],
    contextResetKeys: ['drillModule', 'drillMotion', 'page', 'focus'],
    drill: { levels: [{ key: 'drillModule', label: { ko: 'Module', en: 'Module' } }, { key: 'drillMotion', label: { ko: 'Motion', en: 'Motion' } }] },
    component: lazy(() => import('./pages/table/TablePage')),
  },
];
