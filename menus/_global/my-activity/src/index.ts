/**
 * @ap/menu-my-activity — myActivity group manifests (내 활동, ADR-0070, #594).
 * 알림 is the FeedbackOps InboxPanel through the bridge (ADR-0071, #651); surveys and permission requests are planned (#653, #657).
 */
import { lazy } from 'react';
import { Bell, ClipboardList, KeyRound } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', line: 'unsupported', prcGroup: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'notifications', primary: true, group: 'myActivity', label: { ko: '알림', en: 'Notifications' },
    description: { ko: 'VOC 상태 변경·권한 결정·설문 요청 알림', en: 'Notifications for VOC status, permission decisions and survey requests' },
    path: '/notifications', icon: Bell, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: none, features: noFeatures, pageKeys: [],
    component: lazy(() => import('./pages/Notifications')),
  },
  {
    id: 'surveys', group: 'myActivity', label: { ko: '설문', en: 'Surveys' },
    description: { ko: '응답할 설문과 응답 기록', en: 'Surveys to answer and your responses' },
    path: '/surveys', icon: ClipboardList, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: none, features: noFeatures, pageKeys: [],
  },
  {
    id: 'permission-requests', group: 'myActivity', label: { ko: '권한 요청', en: 'Permission requests' },
    description: { ko: '권한 요청·철회와 내 요청 상태', en: 'Request or withdraw access and see your requests' },
    path: '/permission-requests', icon: KeyRound, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: none, features: noFeatures, pageKeys: [],
  },
];
