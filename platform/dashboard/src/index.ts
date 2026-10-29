/**
 * @ap/menu-dashboard — dashboard group manifests (feature space 대시보드, ADR-0081, #759).
 * The feature operator dashboard through the bridge; the app-declared carry set carries `managedSystem` (#1099b, replacing ADR-0081 decision 4).
 */
import { lazy } from 'react';
import { ListTodo } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, carrySetId, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

/** The app's `features` carry set (`managedSystem` list scope + `returnTo`); declared in the app's registry call, joined here per menu. */
const FEATURES_CARRY_SET = carrySetId('features');

export const manifests: MenuEntry[] = [
  {
    id: 'dashboard', primary: true, group: groupId('dashboard'), label: { ko: '대시보드', en: 'Dashboard' },
    description: { ko: '처리할 VOC·Task·권한 요청과 설문 현황', en: 'VOC, Task, permission request and survey work to handle' },
    path: '/operations/dashboard', icon: ListTodo, permission: 'features:access', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['managedSystem', 'returnTo'], carrySet: FEATURES_CARRY_SET,
    component: lazy(() => import('./pages/FeatureDashboard')),
  },
];
