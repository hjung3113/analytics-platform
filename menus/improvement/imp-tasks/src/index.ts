/**
 * @ap/menu-imp-tasks — impTasks group manifests (개선 실행 — 과제, #252, ADR-0065).
 * Planned menus only: the screens are built in-house later (docs/15 §2).
 */
import { ClipboardList } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'imp-tasks', primary: true, group: groupId('impTasks'), label: { ko: '과제 목록', en: 'Tasks' },
    description: { ko: '개선 과제와 현장 적용·전후 실적·효과 검증 (예정)', en: 'Improvement tasks with field application, before/after results and effect check (planned)' },
    path: '/improvement/tasks', icon: ClipboardList, permission: 'platform:view', requiresScope: false, pageType: 'workflow',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
