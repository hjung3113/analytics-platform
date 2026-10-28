/**
 * @ap/menu-feature-admin — foAdmin group manifests (FeedbackOps space 관리자: Managed System, Analytics Area, 권한 요청 검토, 부여 목록, FeedbackOps 설정; ADR-0081, #764 p2).
 * The FeedbackOps admin screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`managedSystemsRoute`, `analyticsAreasRoute`, `permissionRequestsRoute`, `permissionGrantsRoute`, `settingsRoute`; pinned by the manifests test)
 * plus the two keys the space carries (`managedSystem`, `returnTo`; ADR-0081 decision 4). The group id `foAdmin` turns the 목록 범위 picker off (`ScopeControl`, decision 4), so the screens ignore the carried `managedSystem`.
 * `focus` is the selected row (06 §13); `system` is Analytics Area's own Managed System filter. The paths never alias `/admin/*` (the operations space owns it).
 * `console:access` (the `workspace-admin` rule) keeps the section out of reach for non-admins; the screens' own `PermissionGate` stays a display hint (the backend decides).
 */
import { lazy } from 'react';
import { KeyRound, FileCheck2, Network, Server, SlidersHorizontal } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const GROUP = groupId('foAdmin');

export const manifests: MenuEntry[] = [
  {
    id: 'fo-managed-systems', primary: true, group: GROUP, label: { ko: 'Managed System', en: 'Managed System' },
    description: { ko: 'Managed System의 기본 담당자·검토자와 활성 상태를 관리합니다', en: 'Manage Managed Systems, their default owners and reviewers, and their active state' },
    path: '/feedbackops/managed-systems', icon: Server, permission: 'console:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoManagedSystems')),
  },
  {
    id: 'fo-analytics-areas', group: GROUP, label: { ko: 'Analytics Area', en: 'Analytics Area' },
    description: { ko: 'Analytics Area를 Managed System별로 보고 관리합니다', en: 'See and manage Analytics Areas by Managed System' },
    path: '/feedbackops/analytics-areas', icon: Network, permission: 'console:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['system', 'includeArchived', 'focus', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoAnalyticsAreas')),
  },
  {
    id: 'fo-permission-requests', group: GROUP, label: { ko: '권한 요청 검토', en: 'Permission request review' },
    description: { ko: '워크스페이스 권한 요청을 검토하고 결정합니다', en: 'Review and decide workspace permission requests' },
    path: '/feedbackops/permission-requests', icon: FileCheck2, permission: 'console:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['tab', 'focus', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoPermissionRequests')),
  },
  {
    id: 'fo-permission-grants', group: GROUP, label: { ko: '부여 목록', en: 'Grants' },
    description: { ko: '활성 권한과 명시적 거부를 보고 회수하거나 해제합니다', en: 'See active grants and explicit denies, then revoke or lift them' },
    path: '/feedbackops/permission-grants', icon: KeyRound, permission: 'console:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['tab', 'focus', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoPermissionGrants')),
  },
  {
    id: 'fo-settings', group: GROUP, label: { ko: 'FeedbackOps 설정', en: 'FeedbackOps settings' },
    description: { ko: '커버리지 기준 등 워크스페이스 설정을 관리합니다', en: 'Manage workspace settings such as the coverage thresholds' },
    path: '/feedbackops/settings', icon: SlidersHorizontal, permission: 'console:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['section', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoSettings')),
  },
];
