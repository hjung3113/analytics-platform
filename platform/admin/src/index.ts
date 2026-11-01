/**
 * @ap/menu-admin — admin group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { lazy } from 'react';
import { ClipboardList, FileClock, Library, Users } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const GROUP = groupId('admin');

export const manifests: MenuEntry[] = [
  {
    id: 'admin-roles', primary: true, group: GROUP, label: { ko: '권한/역할 관리', en: 'Roles & access' },
    description: { ko: '메뉴 × 데이터 Scope 권한', en: 'Menu × data-scope permissions' },
    path: '/admin/roles', icon: Users, permission: 'console:access', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES,
    // `role`/`permission` are the old single keys, read as aliases of `filter` for one release (ADR-0105 §6, P8).
    pageKeys: ['filter', 'role', 'permission', 'sort', 'page', 'focus', 'tab'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'],
    component: lazy(() => import('./pages/AccessDirectory')),
  },
  {
    id: 'admin-audit', group: GROUP, label: { ko: '변경 감사', en: 'Audit trail' },
    description: { ko: '전역 Audit Trail (각 상세에도 탭으로 노출)', en: 'Global audit trail (also a tab on each detail)' },
    path: '/admin/audit', icon: FileClock, permission: 'console:access', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES,
    // The seven filter keys are the old single keys, read as aliases of `filter` for one release (ADR-0105 §6, P8).
    pageKeys: ['filter', 'type', 'actor', 'action', 'source', 'fromAt', 'toAt', 'targetId', 'sort', 'page'], repeatedPageKeys: ['filter'], hiddenPageKeys: ['filter'],
    component: lazy(() => import('./pages/AuditTrail')),
  },
  {
    id: 'admin-usage', group: GROUP, label: { ko: '메뉴 활용률', en: 'Menu usage' },
    description: { ko: 'Menu Registry 활용 계측 (Kernel 관측 기능)', en: 'Menu registry usage instrumentation (kernel observability)' },
    path: '/admin/usage', icon: ClipboardList, permission: 'console:access', requiresScope: false, pageType: 'management', context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['sort', 'page'],
    component: lazy(() => import('./pages/UsageOverview')),
  },
  {
    id: 'admin-registry', group: GROUP, label: { ko: '메뉴 레지스트리', en: 'Menu registry' },
    description: { ko: '등록된 메뉴 선언을 조회합니다.', en: 'Registered menu declarations.' },
    path: '/admin/registry', icon: Library, permission: 'console:access', requiresScope: false, pageType: 'catalog', context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['sort', 'page', 'focus'],
    component: lazy(() => import('./pages/RegistryCatalog')),
  },
];
