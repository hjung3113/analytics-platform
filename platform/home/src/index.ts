/**
 * @ap/menu-home — overview group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { createHomeComponent } from './launcher';
import { House } from 'lucide-react';
import type { MenuEntry } from '@ap/kernel';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';

export const manifests: MenuEntry[] = [
  {
    id: 'home', primary: true, group: groupId('overview'), label: { ko: '플랫폼 홈', en: 'Platform home' },
    description: { ko: '접근 가능한 메뉴, 즐겨찾기와 최근 방문으로 작업에 복귀합니다.', en: 'Return to work through accessible menus, favorites and recent pages.' },
    path: '/home', aliases: ['/'], icon: House, permission: 'platform:view', requiresScope: false, context: contextCapabilities(), pageType: 'overview', features: NO_FEATURES, pageKeys: [],
    component: createHomeComponent([]),
  },
];
