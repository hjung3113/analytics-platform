/**
 * @ap/menu-log-knowledge — PROTOTYPE (#1194, throwaway branch, never merged).
 * One planned management menu `카탈로그 관리` with three `?variant=` layouts on a synthetic in-component fixture.
 */
import { lazy } from 'react';
import { Library } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const GROUP = groupId('logKnowledge');

export const manifests: MenuEntry[] = [
  {
    id: 'log-knowledge-catalog', primary: true, group: GROUP, label: { ko: '카탈로그 관리', en: 'Catalog' },
    description: { ko: '제조사·공정·모델·SW 버전을 등록하고 고칩니다. 지우지 않고 비활성화합니다.', en: 'Register and edit makers, processes, models and SW versions. Deactivate, never delete.' },
    path: '/log/knowledge/catalog', icon: Library, permission: 'platform:view', requiresScope: false, pageType: 'management',
    context: contextCapabilities(), features: NO_FEATURES, pageKeys: ['variant', 'state'],
    component: lazy(() => import('./pages/CatalogPrototype')),
  },
];
