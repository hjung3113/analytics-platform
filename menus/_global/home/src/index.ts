/**
 * @ap/menu-home — overview group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { lazy } from 'react';
import { House } from 'lucide-react';
import type { MenuEntry } from '@ap/kernel';
import { groupId, type Capability, type ContextKey } from '@ap/contracts';

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'home', primary: true, group: groupId('overview'), label: { ko: '플랫폼 홈', en: 'Platform home' },
    description: { ko: '접근 가능한 메뉴, 즐겨찾기와 최근 방문으로 작업에 복귀합니다.', en: 'Return to work through accessible menus, favorites and recent pages.' },
    path: '/', icon: House, permission: 'platform:view', requiresScope: false, context: none, pageType: 'overview', features: noFeatures, pageKeys: [],
    component: lazy(() => import('./pages/OperationsHome')),
  },
];
