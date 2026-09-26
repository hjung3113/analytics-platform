/**
 * @ap/menu-admin — admin group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { ClipboardList, FileClock, Users } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'admin-roles', primary: true, group: 'admin', label: { ko: '권한/역할 관리', en: 'Roles & access' },
    description: { ko: '메뉴 × 데이터 Scope 권한', en: 'Menu × data-scope permissions' },
    path: '/admin/roles', icon: Users, permission: 'admin:manage', requiresScope: false, pageType: 'management', context: none, features: noFeatures, pageKeys: [],
  },
  {
    id: 'admin-audit', group: 'admin', label: { ko: '변경 감사', en: 'Audit trail' },
    description: { ko: '전역 Audit Trail (각 상세에도 탭으로 노출)', en: 'Global audit trail (also a tab on each detail)' },
    path: '/admin/audit', icon: FileClock, permission: 'admin:manage', requiresScope: false, pageType: 'management', context: none, features: noFeatures, pageKeys: [],
  },
  {
    id: 'admin-usage', group: 'admin', label: { ko: '메뉴 활용률', en: 'Menu usage' },
    description: { ko: 'Menu Registry 활용 계측 (Kernel 관측 기능)', en: 'Menu registry usage instrumentation (kernel observability)' },
    path: '/admin/usage', icon: ClipboardList, permission: 'admin:manage', requiresScope: false, pageType: 'overview', context: none, features: noFeatures, pageKeys: [],
  },
];
