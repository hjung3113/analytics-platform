/**
 * @ap/menu-master-data — masterData group manifests (docs/06 §5, §9).
 * Menus declare, the kernel's createRegistry validates and the shell consumes.
 */
import { FlaskConical, Route } from 'lucide-react';
import type { Capability, ContextKey } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';

const none: Record<ContextKey, Capability> = { time: 'unsupported', roomNames: 'unsupported', condition: 'unsupported', selection: 'unsupported', lot: 'unsupported', ppid: 'unsupported', recipe: 'unsupported', metric: 'unsupported' };
const noFeatures = { export: false, savedView: false, annotate: false, compare: false };

export const manifests: MenuEntry[] = [
  {
    id: 'master-process', primary: true, group: 'masterData', label: { ko: '공정 마스터', en: 'Process master' },
    description: { ko: '공정 기준정보 목록/상세 (10 wireframe)', en: 'Process reference data (wireframe 10)' },
    path: '/master/process', icon: Route, permission: 'master:view', requiresScope: true, pageType: 'management',
    context: { ...none, roomNames: 'apply' }, features: noFeatures, pageKeys: [],
  },
  {
    id: 'master-recipe', group: 'masterData', label: { ko: '레시피 마스터', en: 'Recipe master' },
    description: { ko: '레시피 기준정보 목록/상세 (10 wireframe)', en: 'Recipe reference data (wireframe 10)' },
    path: '/master/recipe', icon: FlaskConical, permission: 'master:view', requiresScope: true, pageType: 'management',
    context: { ...none, roomNames: 'apply', recipe: 'apply', ppid: 'reference' }, features: noFeatures, pageKeys: [],
  },
];
