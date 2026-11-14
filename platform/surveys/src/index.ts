/**
 * @ap/menu-surveys — surveys group manifests (feature space Surveys: Survey 관리 and its hidden builder, results and follow-up screens; ADR-0081, #764 p1).
 * The feature operator Survey screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`surveysRoute`, `surveyBuilderRoute`, `surveyResultsRoute`, `surveyFollowUpRoute`; pinned by the manifests test),
 * and the app-declared carry set carries `managedSystem` (#1099b, replacing ADR-0081 decision 4). `focus` is the selected Survey on the list and the selected response on the follow-up (06 §13). The reporter `설문` menus own `/surveys` and `/surveys/:id/respond`; these paths never alias them.
 */
import { lazy } from 'react';
import { ClipboardCheck, ClipboardList, FileSpreadsheet, PencilRuler } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('surveys');

export const manifests: MenuEntry[] = [
  {
    id: 'survey-management', primary: true, group: GROUP, label: { ko: '설문 관리', en: 'Survey management' },
    description: { ko: '설문 생성 · 상태·후속 조치 필요 여부별 조회', en: 'Survey creation · Search by status and follow-up need' },
    path: '/flow/survey-management', icon: ClipboardList, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'area', 'status', 'follow_up', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureSurveys')),
  },
  {
    id: 'survey-builder', group: GROUP, label: { ko: '설문 빌더', en: 'Survey builder' }, navHidden: true, parent: 'survey-management',
    description: { ko: '설문 질문 편집 · 시작', en: 'Survey question editing · Launch' },
    path: '/flow/survey-builder/:surveyId', icon: PencilRuler, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['area', 'status', 'follow_up', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureSurveyBuilder')),
  },
  {
    id: 'survey-results', group: GROUP, label: { ko: '설문 결과', en: 'Survey results' }, navHidden: true, parent: 'survey-management',
    description: { ko: '설문 응답 요약', en: 'Survey response summary' },
    path: '/flow/survey-results/:surveyId', icon: FileSpreadsheet, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['area', 'status', 'follow_up', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureSurveyResults')),
  },
  {
    id: 'survey-follow-up', group: GROUP, label: { ko: '설문 후속 조치', en: 'Survey follow-up' }, navHidden: true, parent: 'survey-management',
    description: { ko: '응답별 후속 조치 검토 · 결정', en: 'Follow-up review and decisions by response' },
    path: '/flow/survey-follow-up/:surveyId', icon: ClipboardCheck, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'area', 'status', 'follow_up', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureSurveyFollowUp')),
  },
];
