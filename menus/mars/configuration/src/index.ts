/** @ap/menu-configuration — synthetic equipment comparison consumer. */
import { lazy } from 'react';
import { Settings } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId, menuPermission } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { PAGE_KEYS } from './endpoints';

export const manifests: MenuEntry[] = [
  {
    id: 'configuration', primary: true, group: groupId('configuration'), label: { ko: 'Configuration', en: 'Configuration' },
    description: { ko: '설비별 설정값과 차이·규격·수집 상태 비교', en: 'Compare equipment settings, differences, specifications and collection status' },
    path: '/configuration', icon: Settings, permission: menuPermission('analytics:view'), requiresScope: false, pageType: 'analysis',
    context: contextCapabilities({ time: 'apply' }), query: { mode: 'apply' },
    features: { ...NO_FEATURES, export: true, savedView: true },
    pageKeys: PAGE_KEYS, repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'],
    component: lazy(() => import('./pages/Configuration')),
  },
];
