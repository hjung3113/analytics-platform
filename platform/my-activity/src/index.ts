/**
 * @ap/menu-my-activity — myActivity group manifests (내 활동, ADR-0070, #594). 내 VOC·설문 (and their hidden children) sit in the global `noticeVoc` group (소통, ADR-0110): a global group may receive screens from another Consumer, and `@ap/menu-notice-voc` declares none of them.
 * 알림, 내 VOC and 설문 are feature screens through the bridge (ADR-0071, #651, #654, #653); 권한 요청 is the requester page through the bridge too (#657); approval stays a feature admin screen.
 */
import { lazy } from 'react';
import { Bell, ClipboardList, KeyRound, MessageSquareWarning } from 'lucide-react';
import type { MenuEntry } from '@ap/kernel';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';

const GROUP = groupId('myActivity');
const COMMUNICATION = groupId('noticeVoc');

export const manifests: MenuEntry[] = [
  {
    id: 'notifications', primary: true, group: GROUP, label: { ko: '알림', en: 'Notifications' },
    description: { ko: 'VOC 답변·배정, Task 요청 결정, 권한 결정 알림', en: 'Notifications for VOC replies and assignments, Task request decisions and permission decisions' },
    path: '/notifications', icon: Bell, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/Notifications')),
  },
  {
    // The Kernel permission literal `voc:view` (ADR-0069 maps it to every signed-in actor): a menu move does not change it.
    id: 'voc', group: COMMUNICATION, label: { ko: 'VOC', en: 'VOC' },
    description: { ko: '범위 안의 VOC와 처리 상태·담당자 답변', en: 'VOCs in your reach, their status and replies' },
    path: '/voc', icon: MessageSquareWarning, permission: 'voc:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['q', 'status', 'sort', 'focus', 'mine', 'system'],
    component: lazy(() => import('./pages/MyVoc')),
  },
  {
    id: 'voc-detail', group: COMMUNICATION, parent: 'voc', navHidden: true, label: { ko: 'VOC 상세', en: 'VOC detail' },
    description: { ko: 'VOC 하나의 처리 상태와 담당자 답변', en: 'Status and replies of one VOC' },
    path: '/voc/:vocId', icon: MessageSquareWarning, permission: 'voc:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['returnTo'],
    component: lazy(() => import('./pages/VocDetail')),
  },
  {
    id: 'surveys', group: COMMUNICATION, label: { ko: '설문', en: 'Surveys' },
    description: { ko: '응답할 설문과 응답 기록', en: 'Surveys to answer and your responses' },
    path: '/survey', aliases: ['/surveys'], icon: ClipboardList, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/Surveys')),
  },
  {
    id: 'survey-respond', group: COMMUNICATION, parent: 'surveys', navHidden: true, label: { ko: '설문 응답', en: 'Survey response' },
    description: { ko: '설문 하나에 응답합니다.', en: 'Answer one survey.' },
    path: '/survey/:surveyId/respond', aliases: ['/surveys/:surveyId/respond'], icon: ClipboardList, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['returnTo'],
    component: lazy(() => import('./pages/SurveyRespond')),
  },
  {
    id: 'permission-requests', group: GROUP, label: { ko: '권한 요청', en: 'Permission requests' },
    description: { ko: '권한 요청·철회와 내 요청 상태', en: 'Request or withdraw access and see your requests' },
    path: '/permission-requests', icon: KeyRound, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: [],
    component: lazy(() => import('./pages/PermissionRequests')),
  },
];
