/**
 * @ap/menu-integration — integration group manifests (FeedbackOps space 연동: 연동 액션 대시보드, Evidence, 엔티티 링크, 커버리지; ADR-0081, #762).
 * The FeedbackOps operator 연동 screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`integrationDashboardRoute`, `evidenceRoute`, `entityLinksRoute`, `coverageRoute`; pinned by the page tests),
 * and the app-declared carry set carries `managedSystem` (#1099b, replacing ADR-0081 decision 4). `focus` is the selected recovery item or Evidence (06 §13); the screens draw their own detail drawer. FeedbackOps' Findings row in 연동 is dropped (ADR-0081 decision 3).
 */
import { lazy } from 'react';
import { Activity, FileBarChart, Link2, Layers } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('integration');

export const manifests: MenuEntry[] = [
  {
    id: 'integration', primary: true, group: GROUP, label: { ko: '연동 액션 대시보드', en: 'Integration action dashboard' },
    description: { ko: '연동 복구 항목을 확인하고 보류하거나 숨기거나 다시 복원합니다', en: 'Check integration recovery items and snooze, mute or restore them' },
    path: '/operations/integration', icon: Activity, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'category', 'presentation', 'history', 'cursor', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoIntegration')),
  },
  {
    id: 'evidence', group: GROUP, label: { ko: 'Evidence', en: 'Evidence' },
    description: { ko: 'Finding에 연결된 Evidence를 출처별로 찾아 봅니다', en: 'Find Evidence linked to Findings by source' },
    path: '/operations/evidence', icon: FileBarChart, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'source', 'q', 'cursor', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoEvidence')),
  },
  {
    id: 'entity-links', group: GROUP, label: { ko: '엔티티 링크', en: 'Entity links' },
    description: { ko: '엔티티 사이의 연결을 상태와 유형별로 봅니다', en: 'See links between entities by status and type' },
    path: '/operations/entity-links', icon: Link2, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['status', 'type', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoEntityLinks')),
  },
  {
    id: 'coverage', group: GROUP, label: { ko: '커버리지', en: 'Coverage' },
    description: { ko: '분석 영역별 연동 커버리지를 요약과 영역 표로 봅니다', en: 'See integration coverage per analytics area as a summary and an area table' },
    path: '/operations/coverage', icon: Layers, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['view', 'area', 'cursor', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FoCoverage')),
  },
];
