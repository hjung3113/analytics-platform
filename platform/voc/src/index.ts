/**
 * @ap/menu-voc — voc group manifests (feature space VOC: 수신함, Triage, Clusters; ADR-0081, #761).
 * The feature operator VOC screens through the bridge; the page keys equal the route tables in `@ap/feature-bridge` (`inboxRoute`, `triageRoute`, `clustersRoute`; pinned by the page tests),
 * and the app-declared carry set carries `managedSystem` (#1099b, replacing ADR-0081 decision 4). `focus` is the selected VOC (06 §13).
 */
import { lazy } from 'react';
import { Inbox, Layers, ListChecks } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('voc');

export const manifests: MenuEntry[] = [
  {
    id: 'inbox', primary: true, group: GROUP, label: { ko: '수신함', en: 'Inbox' },
    description: { ko: '접수된 VOC를 큐별로 보고 하나씩 처리합니다', en: 'Work through incoming VOCs by queue' },
    path: '/operations/inbox', icon: Inbox, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'q', 'tab', 'sort', 'severity', 'reporterStatus', 'owner', 'area', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    navViews: [{ id: 'no-link', label: { ko: '연결 없음', en: 'No link' }, page: { tab: 'no-link' } }],
    component: lazy(() => import('./pages/FeatureInbox')),
  },
  {
    id: 'triage', group: GROUP, label: { ko: 'Triage', en: 'Triage' },
    description: { ko: '미배정·높음·연결 없음 VOC를 분류하고 담당을 정합니다', en: 'Classify unassigned, high and unlinked VOCs and decide owners' },
    path: '/operations/triage', icon: ListChecks, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'tab', 'managedSystem', 'area', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    navViews: [
      { id: 'high', label: { ko: '높음', en: 'High' }, page: { tab: 'high' } },
      { id: 'unassigned', label: { ko: '미배정', en: 'Unassigned' }, page: { tab: 'unassigned' } },
    ],
    component: lazy(() => import('./pages/FeatureTriage')),
  },
  {
    id: 'clusters', group: GROUP, label: { ko: 'Clusters', en: 'Clusters' },
    description: { ko: '비슷한 VOC를 묶은 Cluster를 보고 확정합니다', en: 'Review and confirm clusters of similar VOCs' },
    path: '/operations/clusters', icon: Layers, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureClusters')),
  },
];
