/** @ap/menu-configuration — planned MARS menu. */
import { Settings } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'configuration', primary: true, group: groupId('configuration'), label: { ko: 'Configuration', en: 'Configuration' },
    description: { ko: '파라미터 분석 (예정)', en: 'Parameter analysis (planned)' },
    path: '/configuration', icon: Settings, permission: 'platform:view', requiresScope: false, pageType: 'analysis',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
