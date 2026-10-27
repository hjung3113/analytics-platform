/** @ap/menu-hw-time — hwTime group manifests. All four HW Time menus share the endpoints; the steps menu owns them. */
import { lazy } from 'react';
import { Columns2, LayoutDashboard, LayoutGrid, Table2 } from 'lucide-react';
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
    id: 'hw-time-compare', group: GROUP,
    label: { ko: 'HW Time 비교', en: 'HW Time compare' },
    description: { ko: 'Module 전체 문맥과 고른 Motion 상세를 나란히 비교합니다.', en: 'Compare the whole Module context with the selected Motion side by side.' },
    path: '/hw-time/compare', icon: Columns2, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities(HW_TIME_CONTEXT), pageType: 'analysis',
    features: { ...NO_FEATURES, board: true },
    pageKeys: ['drillModule', 'drillMotion', 'trend', 'sort', 'row', 'scroll', 'minmax', 'align'],
    contextResetKeys: ['drillModule', 'drillMotion', 'trend', 'row'],
    drill: { levels: [{ key: 'drillModule', label: { ko: 'Module', en: 'Module' } }, { key: 'drillMotion', label: { ko: 'Motion', en: 'Motion' } }], resetKeys: ['row'] },
    component: lazy(() => import('./pages/compare/ComparePage')),
  },
  {
    id: 'hw-time-overview', group: GROUP,
    label: { ko: 'HW Time 개요', en: 'HW Time overview' },
    description: { ko: '순위·현재 단계·문맥·상세·추세·범례를 한 화면에 쌓아 봅니다.', en: 'See ranking, current level, context, detail, trend and legend stacked on one screen.' },
    path: '/hw-time/overview', icon: LayoutGrid, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities(HW_TIME_CONTEXT), pageType: 'analysis',
    features: { ...NO_FEATURES, board: true },
    pageKeys: ['drillModule', 'drillMotion', 'trend', 'sort', 'row', 'minmax', 'align'],
    contextResetKeys: ['drillModule', 'drillMotion', 'trend', 'row'],
    drill: { levels: [{ key: 'drillModule', label: { ko: 'Module', en: 'Module' } }, { key: 'drillMotion', label: { ko: 'Motion', en: 'Motion' } }], resetKeys: ['row'] },
    component: lazy(() => import('./pages/overview/OverviewPage')),
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
