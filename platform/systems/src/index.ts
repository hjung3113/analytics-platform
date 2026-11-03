/** @ap/menu-systems — systems group. Scaffold: one primary menu, no domain data. */
import { lazy } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';

export const manifests: PlatformMenuEntry[] = [
  {
    id: 'systems', primary: true, group: groupId('systems'),
    label: { ko: '시스템', en: 'Systems' },
    description: { ko: '시스템', en: 'Systems' },
    path: '/operations/systems', icon: LayoutDashboard, permission: 'platform:view',
    requiresScope: false, context: contextCapabilities(), pageType: 'catalog', features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/Systems')),
  },
];
