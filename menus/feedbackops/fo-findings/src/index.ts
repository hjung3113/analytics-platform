/**
 * @ap/menu-fo-findings — foFindings group manifest (FeedbackOps space Findings: 전체 Finding; ADR-0081, #762).
 * The FeedbackOps operator Findings screen through the bridge; the page keys equal the route table in `@ap/fo-bridge` (`findingsRoute`; pinned by the page tests),
 * and the space carries `managedSystem` (ADR-0081 decision 4). `focus` is the selected Finding (06 §13); the page draws its detail drawer.
 */
import { lazy } from 'react';
import { ListChecks } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const GROUP = groupId('foFindings');

export const manifests: MenuEntry[] = [
  {
    id: 'fo-findings', primary: true, group: GROUP, label: { ko: '전체 Finding', en: 'All Findings' },
    description: { ko: 'Finding을 목록에서 찾아 상세를 열고 Evidence와 Task를 연결합니다', en: 'Find Findings in a list, open the detail and link Evidence and Tasks' },
    path: '/feedbackops/findings', icon: ListChecks, permission: 'feedbackops:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'q', 'area', 'status', 'execution', 'assignment', 'managedSystem', 'returnTo'],
    component: lazy(() => import('./pages/FoFindings')),
  },
];
