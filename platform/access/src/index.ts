/** @ap/menu-access — access group. Scaffold: one primary menu, no domain data. */
import { lazy } from 'react';
import { LayoutDashboard } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { PlatformMenuEntry } from '@ap/kernel';

export const manifests: PlatformMenuEntry[] = [
  {
    id: 'access-scaffold', primary: true, group: groupId('access'),
    label: { ko: '권한', en: 'Access' },
    description: { ko: '권한', en: 'Access' },
    path: '/access', icon: LayoutDashboard, permission: 'platform:view',
    requiresScope: false, context: contextCapabilities(), pageType: 'management', features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/AccessScaffold')),
  },
];
