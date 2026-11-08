/**
 * @ap/menu-access — access group manifests (운영 콘솔 space 권한: 권한 요청 검토, 부여 목록, 서비스 토큰; ADR-0081, #764 p2, ADR-0110).
 * The feature admin screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`permissionRequestsRoute`, `permissionGrantsRoute`; pinned by the manifests test)
 * plus the two carry-set keys (`managedSystem`, `returnTo`; #1099b). The group `access` is not list-scoped, so the screens ignore the carried `managedSystem`. `focus` is the selected row (06 §13).
 * `console:access` (the `workspace-admin` rule) AND `features:access` (declared redundantly while the feature space still gates it; it stays when the space goes) keep the section out of reach for non-admins; the screens' own `PermissionGate` stays a display hint (the backend decides).
 * 권한 요청 검토 is the group's one primary menu. The paths stay under `/operations/` (the 운영 콘솔 space) and never alias `/admin/*`.
 */
import { lazy } from 'react';
import { KeyRound, FileCheck2, KeySquare } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('access');

export const manifests: MenuEntry[] = [
  {
    id: 'permission-request-review', primary: true, group: GROUP, label: { ko: '권한 요청 검토', en: 'Permission request review' },
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
    id: 'service-tokens', group: GROUP, label: { ko: '서비스 토큰', en: 'Service tokens' },
    description: { ko: '워크스페이스 토큰 조회·폐기와 system Actor 토큰 발급', en: 'Review workspace tokens and issue system Actor tokens' },
    path: '/operations/service-tokens', icon: KeySquare, permission: 'console:access', additionalPermissions: ['features:access'], requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['noExpiry', 'kind'],
    component: lazy(() => import('./pages/ServiceTokens')),
  },
];
