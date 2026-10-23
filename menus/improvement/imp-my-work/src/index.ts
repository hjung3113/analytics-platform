/**
 * @ap/menu-imp-my-work — impMyWork group manifests (개선 실행 — 내 작업, #252, ADR-0065).
 * Planned menus only: the screens are built in-house later (docs/15 §2).
 */
import { Inbox } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'imp-my-tasks', primary: true, group: groupId('impMyWork'), label: { ko: '내 과제', en: 'My tasks' },
    description: { ko: '나에게 배정된 개선 과제 (예정)', en: 'Improvement tasks assigned to me (planned)' },
    path: '/improvement/my-tasks', icon: Inbox, permission: 'platform:view', requiresScope: false, pageType: 'overview',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
