/**
 * @ap/menu-my-activity — myActivity group manifests (내 활동, ADR-0070, #594).
 * 알림 and 설문 are FeedbackOps screens through the bridge (ADR-0071, #651, #653); permission requests are planned (#657).
 */
import { lazy } from 'react';
import { Bell, ClipboardList, KeyRound } from 'lucide-react';
import type { MenuEntry } from '@ap/kernel';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';

const GROUP = groupId('myActivity');

export const manifests: MenuEntry[] = [
  {
    id: 'notifications', primary: true, group: GROUP, label: { ko: '알림', en: 'Notifications' },
    description: { ko: 'VOC 상태 변경·권한 결정·설문 요청 알림', en: 'Notifications for VOC status, permission decisions and survey requests' },
    path: '/notifications', icon: Bell, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/Notifications')),
  },
  {
    id: 'surveys', group: GROUP, label: { ko: '설문', en: 'Surveys' },
    description: { ko: '응답할 설문과 응답 기록', en: 'Surveys to answer and your responses' },
    path: '/surveys', icon: ClipboardList, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/Surveys')),
  },
  {
    id: 'survey-respond', group: GROUP, parent: 'surveys', navHidden: true, label: { ko: '설문 응답', en: 'Survey response' },
    description: { ko: '설문 하나에 응답합니다.', en: 'Answer one survey.' },
    path: '/surveys/:surveyId/respond', icon: ClipboardList, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['returnTo'],
    component: lazy(() => import('./pages/SurveyRespond')),
  },
  {
    id: 'permission-requests', group: GROUP, label: { ko: '권한 요청', en: 'Permission requests' },
    description: { ko: '권한 요청·철회와 내 요청 상태', en: 'Request or withdraw access and see your requests' },
    path: '/permission-requests', icon: KeyRound, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
  },
];
