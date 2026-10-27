/** @ap/menu-rcc — planned MARS menu. */
import { Workflow } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId, menuPermission } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'rcc', primary: true, group: groupId('rcc'), label: { ko: 'RCC', en: 'RCC' },
    description: { ko: '프로세스 시간 분석 (예정)', en: 'Process time (planned)' },
    path: '/rcc', icon: Workflow, permission: menuPermission('analytics:view'), requiresScope: false, pageType: 'analysis',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
