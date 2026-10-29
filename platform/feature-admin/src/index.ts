/**
 * @ap/menu-feature-admin — featureAdmin group manifests (feature space 관리자: Managed System, Analytics Area, 권한 요청 검토, 부여 목록, 기능 설정; ADR-0081, #764 p2).
 * The feature admin screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`managedSystemsRoute`, `analyticsAreasRoute`, `permissionRequestsRoute`, `permissionGrantsRoute`, `settingsRoute`; pinned by the manifests test)
 * plus the two carry-set keys (`managedSystem`, `returnTo`; #1099b, replacing ADR-0081 decision 4). The group id `featureAdmin` turns the 목록 범위 picker off (`ScopeControl`, decision 4), so the screens ignore the carried `managedSystem`.
 * `focus` is the selected row (06 §13); `system` is Analytics Area's own Managed System filter. The paths never alias `/admin/*` (the operations space owns it).
 * `console:access` (the `workspace-admin` rule) AND `features:access` (declared redundantly while the feature space still gates it; it stays when the space goes) keep the section out of reach for non-admins; the screens' own `PermissionGate` stays a display hint (the backend decides).
 */
import { lazy } from 'react';
import { KeyRound, FileCheck2, Network, Server, SlidersHorizontal } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('featureAdmin');

export const manifests: MenuEntry[] = [
  {
    id: 'managed-systems', primary: true, group: GROUP, label: { ko: 'Managed System', en: 'Managed System' },
    description: { ko: 'Managed System의 기본 담당자·검토자와 활성 상태를 관리합니다', en: 'Manage Managed Systems, their default owners and reviewers, and their active state' },
    path: '/operations/managed-systems', icon: Server, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureManagedSystems')),
  },
  {
    id: 'analytics-areas', group: GROUP, label: { ko: 'Analytics Area', en: 'Analytics Area' },
    description: { ko: 'Analytics Area를 Managed System별로 보고 관리합니다', en: 'See and manage Analytics Areas by Managed System' },
    path: '/operations/analytics-areas', icon: Network, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['system', 'includeArchived', 'focus', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureAnalyticsAreas')),
  },
  {
    id: 'permission-request-review', group: GROUP, label: { ko: '권한 요청 검토', en: 'Permission request review' },
    description: { ko: '워크스페이스 권한 요청을 검토하고 결정합니다', en: 'Review and decide workspace permission requests' },
    path: '/operations/permission-request-review', icon: FileCheck2, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['tab', 'focus', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeaturePermissionRequests')),
  },
  {
    id: 'permission-grants', group: GROUP, label: { ko: '부여 목록', en: 'Grants' },
    description: { ko: '활성 권한과 명시적 거부를 보고 회수하거나 해제합니다', en: 'See active grants and explicit denies, then revoke or lift them' },
    path: '/operations/permission-grants', icon: KeyRound, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['tab', 'focus', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeaturePermissionGrants')),
  },
  {
    id: 'settings', group: GROUP, label: { ko: '기능 설정', en: 'Feature settings' },
    description: { ko: '커버리지 기준 등 워크스페이스 설정을 관리합니다', en: 'Manage workspace settings such as the coverage thresholds' },
    path: '/operations/settings', icon: SlidersHorizontal, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['section', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureSettings')),
  },
];
