/**
 * @ap/menu-findings — findings group manifest (feature space Findings: 전체 Finding; ADR-0081, #762).
 * The feature operator Findings screen through the bridge; the page keys equal the route table in `@ap/feature-bridge` (`findingsRoute`; pinned by the page tests),
 * and the app-declared carry set carries `managedSystem` (#1099b, replacing ADR-0081 decision 4). `focus` is the selected Finding (06 §13); the page draws its detail drawer.
 */
import { lazy } from 'react';
import { ListChecks } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

const GROUP = groupId('findings');

export const manifests: MenuEntry[] = [
  {
    id: 'findings', primary: true, group: GROUP, label: { ko: '전체 Finding', en: 'All Findings' },
    description: { ko: 'Finding을 목록에서 찾아 상세를 열고 Evidence와 Task를 연결합니다', en: 'Find Findings in a list, open the detail and link Evidence and Tasks' },
    path: '/operations/findings', icon: ListChecks, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES,
    pageKeys: ['focus', 'q', 'area', 'status', 'execution', 'assignment', 'managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureFindings')),
  },
];
