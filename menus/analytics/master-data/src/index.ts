/**
 * @ap/menu-master-data — masterData group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { FlaskConical, Route } from 'lucide-react';
import { NO_FEATURES, contextCapabilities } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

export const manifests: MenuEntry[] = [
  {
    id: 'master-process', primary: true, group: 'masterData', label: { ko: '공정 마스터', en: 'Process master' },
    description: { ko: '공정 기준정보 목록/상세 (예정)', en: 'Process reference data (planned)' },
    path: '/master/process', icon: Route, permission: 'master:view', requiresScope: true, pageType: 'management',
    context: contextCapabilities({ roomNames: 'apply' }), features: NO_FEATURES, pageKeys: [],
  },
  {
    id: 'master-recipe', group: 'masterData', label: { ko: '레시피 마스터', en: 'Recipe master' },
    description: { ko: '레시피 기준정보 목록/상세 (예정)', en: 'Recipe reference data (planned)' },
    path: '/master/recipe', icon: FlaskConical, permission: 'master:view', requiresScope: true, pageType: 'management',
    context: contextCapabilities({ roomNames: 'apply', recipe: 'apply', ppid: 'reference' }), features: NO_FEATURES, pageKeys: [],
  },
];
