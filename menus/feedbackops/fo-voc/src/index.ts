/**
 * @ap/menu-fo-voc — foVoc group manifests (FeedbackOps space VOC: 수신함, Triage, Clusters; ADR-0081, #761).
 * The FeedbackOps operator VOC screens through the bridge; the page keys equal the route tables in `@ap/fo-bridge` (`inboxRoute`, `triageRoute`, `clustersRoute`; pinned by the page tests),
 * and the space carries `managedSystem` (ADR-0081 decision 4). `focus` is the selected VOC (06 §13).
 */
import { lazy } from 'react';
import { Inbox, Layers, ListChecks } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const GROUP = groupId('foVoc');

export const manifests: MenuEntry[] = [
  {
    id: 'fo-inbox', primary: true, group: GROUP, label: { ko: '수신함', en: 'Inbox' },
    description: { ko: '접수된 VOC를 큐별로 보고 하나씩 처리합니다', en: 'Work through incoming VOCs by queue' },
    path: '/feedbackops/vocs', icon: Inbox, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'q', 'tab', 'sort', 'severity', 'reporterStatus', 'owner', 'area', 'managedSystem', 'returnTo'],
    navViews: [{ id: 'no-link', label: { ko: '연결 없음', en: 'No link' }, page: { tab: 'no-link' } }],
    component: lazy(() => import('./pages/FoInbox')),
  },
  {
    id: 'fo-triage', group: GROUP, label: { ko: 'Triage', en: 'Triage' },
    description: { ko: '미배정·높음·연결 없음 VOC를 분류하고 담당을 정합니다', en: 'Classify unassigned, high and unlinked VOCs and decide owners' },
    path: '/feedbackops/triage', icon: ListChecks, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'tab', 'managedSystem', 'area', 'returnTo'],
    navViews: [
      { id: 'high', label: { ko: '높음', en: 'High' }, page: { tab: 'high' } },
      { id: 'unassigned', label: { ko: '미배정', en: 'Unassigned' }, page: { tab: 'unassigned' } },
    ],
    component: lazy(() => import('./pages/FoTriage')),
  },
  {
    id: 'fo-clusters', group: GROUP, label: { ko: 'Clusters', en: 'Clusters' },
    description: { ko: '비슷한 VOC를 묶은 Cluster를 보고 확정합니다', en: 'Review and confirm clusters of similar VOCs' },
    path: '/feedbackops/clusters', icon: Layers, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoClusters')),
  },
];
