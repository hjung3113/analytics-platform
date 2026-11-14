/**
 * @ap/menu-integration — integration group manifests (업무 흐름 space 연동: 연동 대시보드, 연결 관계, 커버리지; ADR-0081, #762).
 * The feature operator 연동 screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`integrationDashboardRoute`, `entityLinksRoute`, `coverageRoute`; pinned by the page tests),
 * and the app-declared carry set carries `managedSystem` (#1099b, replacing ADR-0081 decision 4). `focus` is the selected recovery item (06 §13); the screens draw their own detail drawer. the feature screens' Findings row in 연동 is dropped (ADR-0081 decision 3).
 */
import { lazy } from 'react';
import { Activity, Link2, Layers } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('integration');

export const manifests: MenuEntry[] = [
  {
    id: 'integration', primary: true, group: GROUP, label: { ko: '연동 대시보드', en: 'Integration dashboard' },
    description: { ko: '연동 복구 항목 확인 · 보류 · 숨기기 · 복원', en: 'Integration recovery items · Review · Snooze · Mute · Restore' },
    path: '/flow/integration', icon: Activity, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'category', 'presentation', 'history', 'cursor', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureIntegration')),
  },
  {
    id: 'entity-links', group: GROUP, label: { ko: '연결 관계', en: 'Entity links' },
    description: { ko: 'VOC·Finding·Task 연결 상태 · 유형', en: 'VOC, Finding and Task links · Status · Type' },
    path: '/flow/entity-links', icon: Link2, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['status', 'type', 'q', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureEntityLinks')),
  },
  {
    id: 'coverage', group: GROUP, label: { ko: '커버리지', en: 'Coverage' },
    description: { ko: '분석 영역별 연동 커버리지 요약 · 영역 표', en: 'Integration coverage by analytics area · Summary · Area table' },
    path: '/flow/coverage', icon: Layers, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['view', 'area', 'cursor', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureCoverage')),
  },
];
