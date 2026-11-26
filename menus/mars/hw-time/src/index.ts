/** @ap/menu-hw-time — hwTime group manifests. One linked-panel HW Time screen; the four menus it replaced are retired in the app assembly (`retiredMenus`, #2330). */
import { lazy } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { contextCapabilities, groupId, menuPermission, NO_FEATURES, type SavedViewSupport } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { panelDeclarations, TREND_RANGE_OUTPUT } from './panels';
import { HW_TIME_CONTEXT, MOTION_EQUIPMENT_KEY } from './endpoints';
import { HW_TIME_DRILL, MOTION_BASIS_KEY } from './shared/historySummary';
import { HW_TIME_FILTER_HIDDEN_KEYS, HW_TIME_FILTER_KEYS, HW_TIME_FILTER_REPEATED_KEYS } from './shared/useHwTimeFilter';

// S0: data only; panel implementations retain their lazy route boundary.
export { panelDeclarations } from './panels';

const OPTION_KEYS = ['barsSort', 'barsGroup', 'barsMinMax', 'align', 'trend', 'pins'];
const PAGE_KEYS = ['drillModule', 'drillMotion', MOTION_BASIS_KEY, 'row', 'sort', 'page', 'focus', 'verdict', 'date', ...OPTION_KEYS, ...Object.values(HW_TIME_FILTER_KEYS)];
const SAVED_VIEW_SUPPORT: SavedViewSupport = {
  menuId: 'hw-time', menuSchemaVersion: 1, contextKeys: ['time', 'roomNames', 'prcGroup', 'condition', 'selection'],
  pageKeys: PAGE_KEYS.filter(key => key !== 'page' && key !== 'focus'),
};

const GROUP = groupId('hwTime');
const PERMISSION = menuPermission('analytics:view');

export const manifests: MenuEntry[] = [
  {
    id: 'hw-time', primary: true, group: GROUP,
    label: { ko: 'HW Time', en: 'HW Time' },
    searchAliases: ['동작시간', '동작 시간', 'operation time'],
    paletteDescription: { ko: '연결된 패널로 설비 동작시간을 분석합니다.', en: 'Analyze equipment operation time with linked panels.' },
    description: { ko: '연결된 패널에서 설비 동작시간을 분석합니다.', en: 'Analyze operation time with linked panels.' },
    path: '/hw-time', icon: LayoutDashboard, permission: PERMISSION,
    requiresScope: true, context: contextCapabilities(HW_TIME_CONTEXT), pageType: 'analysis',
    query: { mode: 'apply', autoApplyDefault: true, applyPeriodOnLegacyEntry: true },
    savedViewSupport: SAVED_VIEW_SUPPORT,
    features: { ...NO_FEATURES, board: true, export: true },
    pageKeys: [...PAGE_KEYS, MOTION_EQUIPMENT_KEY, TREND_RANGE_OUTPUT.key],
    repeatedPageKeys: [...HW_TIME_FILTER_REPEATED_KEYS, 'pins', MOTION_EQUIPMENT_KEY],
    hiddenPageKeys: [...HW_TIME_FILTER_HIDDEN_KEYS, ...OPTION_KEYS],
    contextResetKeys: ['date', 'moduleType', 'drillMotion', MOTION_BASIS_KEY, 'drillModule', 'row', 'page', 'focus', 'trend', MOTION_EQUIPMENT_KEY, TREND_RANGE_OUTPUT.key],
    drill: HW_TIME_DRILL,
    panels: Object.values(panelDeclarations),
    component: lazy(() => import('./HwTimePage')),
  },
];
