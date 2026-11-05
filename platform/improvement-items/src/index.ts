/** Global, direct improvement menu; node d uses the menu-query transport rather than the feature REST bridge. */
import { lazy } from 'react';
import { ListChecks } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';
import { IMPROVEMENT_ITEMS_MENU_ID } from './endpoints';
const shared = { group: groupId('improvementItems'), icon: ListChecks, permission: 'platform:view' as const, requiresScope: false, context: contextCapabilities(), pageType: 'management' as const, features: NO_FEATURES };
export const manifests: PlatformMenuEntry[] = [
  { ...shared, id: IMPROVEMENT_ITEMS_MENU_ID, primary: true, label: { ko: '개선 아이템', en: 'Improvement items' }, description: { ko: '분석에서 발견한 문제와 조치, 효과 확인의 기록', en: 'Problems from analysis, actions and effect checks' }, path: '/improvement-items', pageKeys: ['view', 'q', 'filter', 'page', 'sort', 'focus', 'origin'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'], contextResetKeys: ['page'], component: lazy(() => import('./pages/ImprovementItems')) },
  { ...shared, id: 'improvement-item', parent: IMPROVEMENT_ITEMS_MENU_ID, navHidden: true, label: { ko: '개선 아이템 상세', en: 'Improvement item detail' }, description: { ko: '조치와 효과를 확인하고 상태를 변경합니다', en: 'Review actions and effects and change status' }, path: '/improvement-items/:itemId', pageKeys: ['returnTo'], component: lazy(() => import('./pages/ImprovementDetail')) },
];
