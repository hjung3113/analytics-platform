/**
 * @ap/menu-feature-admin — flowSettings group manifests (업무 흐름 space 설정: 시스템 (Managed System), 분석 영역 (Analytics Area), 흐름 정책 (feature settings); ADR-0081, #764 p2, ADR-0110).
 * The feature admin screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`managedSystemsRoute`, `analyticsAreasRoute`, `settingsRoute`; pinned by the manifests test)
 * plus the two carry-set keys (`managedSystem`, `returnTo`; #1099b, replacing ADR-0081 decision 4). The group id `flowSettings` turns the 목록 범위 picker off (`ScopeControl`, decision 4), so the screens ignore the carried `managedSystem`.
 * `focus` is the selected row (06 §13); `system` is Analytics Area's own Managed System filter. The paths never alias `/admin/*` (the 운영 콘솔 space owns it).
 * `console:access` (the `workspace-admin` rule) AND `features:access` (declared redundantly while the feature space still gates it; it stays when the space goes) keep the section out of reach for non-admins; the screens' own `PermissionGate` stays a display hint (the backend decides).
 * The 권한 요청 검토 and 부여 목록 menus live in `@ap/menu-access` (a package owns one space group).
 */
import { lazy } from 'react';
import { Network, Server, SlidersHorizontal } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('flowSettings');

export const manifests: MenuEntry[] = [
  {
    id: 'managed-systems', primary: true, group: GROUP, label: { ko: '시스템', en: 'Systems' },
    description: { ko: 'Managed System의 기본 담당자·검토자와 활성 상태를 관리합니다', en: 'Manage Managed Systems, their default owners and reviewers, and their active state' },
    path: '/flow/managed-systems', icon: Server, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureManagedSystems')),
  },
  {
    id: 'analytics-areas', group: GROUP, label: { ko: '분석 영역', en: 'Analytics areas' },
    description: { ko: 'Analytics Area를 Managed System별로 보고 관리합니다', en: 'See and manage Analytics Areas by Managed System' },
    path: '/flow/analytics-areas', icon: Network, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['system', 'includeArchived', 'focus', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureAnalyticsAreas')),
  },
  {
    id: 'settings', group: GROUP, label: { ko: '흐름 정책', en: 'Workflow policy' },
    description: { ko: '커버리지 기준 등 워크스페이스 설정을 관리합니다', en: 'Manage workspace settings such as the coverage thresholds' },
    path: '/flow/settings', icon: SlidersHorizontal, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['section', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureSettings')),
  },
];
