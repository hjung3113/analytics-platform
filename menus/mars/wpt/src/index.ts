/** @ap/menu-wpt — planned MARS menu. */
import { Waves } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId, menuPermission } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'wpt', primary: true, group: groupId('wpt'), label: { ko: 'WPT', en: 'WPT' },
    description: { ko: '웨이퍼 사이클 분석 (예정)', en: 'Wafer cycle (planned)' },
    path: '/wpt', icon: Waves, permission: menuPermission('analytics:view'), requiresScope: false, pageType: 'analysis',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
