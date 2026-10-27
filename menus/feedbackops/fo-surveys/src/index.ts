/**
 * @ap/menu-fo-surveys — foSurveys group manifests (FeedbackOps space Surveys: Survey 관리 and its hidden builder, results and follow-up screens; ADR-0081, #764 p1).
 * The FeedbackOps operator Survey screens through the bridge; the page keys equal the route tables in `@ap/fo-bridge` (`surveysRoute`, `surveyBuilderRoute`, `surveyResultsRoute`, `surveyFollowUpRoute`; pinned by the manifests test),
 * and the space carries `managedSystem` (ADR-0081 decision 4). `focus` is the selected Survey on the list and the selected response on the follow-up (06 §13). The reporter `설문` menus own `/surveys` and `/surveys/:id/respond`; these paths never alias them.
 */
import { lazy } from 'react';
import { ClipboardCheck, ClipboardList, FileSpreadsheet, PencilRuler } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const GROUP = groupId('foSurveys');

export const manifests: MenuEntry[] = [
  {
    id: 'fo-surveys', primary: true, group: GROUP, label: { ko: 'Survey 관리', en: 'Survey management' },
    description: { ko: 'Survey를 만들고 상태와 후속 조치 필요 여부로 찾아 봅니다', en: 'Create Surveys and find them by status and follow-up need' },
    path: '/feedbackops/surveys', icon: ClipboardList, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'area', 'status', 'follow_up', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoSurveys')),
  },
  {
    id: 'fo-survey-builder', group: GROUP, label: { ko: 'Survey 빌더', en: 'Survey builder' }, navHidden: true, parent: 'fo-surveys',
    description: { ko: 'Survey의 질문을 편집하고 시작합니다', en: 'Edit a Survey\'s questions and launch it' },
    path: '/feedbackops/surveys/:surveyId/builder', icon: PencilRuler, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['area', 'status', 'follow_up', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoSurveyBuilder')),
  },
  {
    id: 'fo-survey-results', group: GROUP, label: { ko: 'Survey 결과', en: 'Survey results' }, navHidden: true, parent: 'fo-surveys',
    description: { ko: 'Survey 응답을 요약해 봅니다', en: 'See a summary of a Survey\'s responses' },
    path: '/feedbackops/surveys/:surveyId/results', icon: FileSpreadsheet, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['area', 'status', 'follow_up', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoSurveyResults')),
  },
  {
    id: 'fo-survey-follow-up', group: GROUP, label: { ko: 'Survey 후속 조치', en: 'Survey follow-up' }, navHidden: true, parent: 'fo-surveys',
    description: { ko: '응답별로 후속 조치를 검토하고 결정합니다', en: 'Review each response and decide the follow-up' },
    path: '/feedbackops/surveys/:surveyId/follow-up', icon: ClipboardCheck, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'area', 'status', 'follow_up', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoSurveyFollowUp')),
  },
];
