/** @ap/menu-rcc — MARS process time comparison prototype. */
import { lazy } from 'react';
import { Workflow } from 'lucide-react';
import { NO_FEATURES, contextCapabilities, groupId, menuPermission, type SavedViewSupport } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { RCC_DRILL, RCC_FACET_KEYS } from './pageKeys';

// This host mode loads the mock app assembly. Real and built assemblies keep the planned entry.
// Declared here so app typechecks that do not include Vite's client types still compile this menu (#2496).
// Until real RCC data is bound, the synthetic screen exists only in the mock development assembly.
declare global {
  interface ImportMetaEnv { DEV: boolean; MODE: string }
  interface ImportMeta { readonly env: ImportMetaEnv }
}
const prototypeEnabled = typeof import.meta.env !== 'undefined' && import.meta.env.DEV && import.meta.env.MODE === 'development';
const drillKeys = RCC_DRILL.levels.map(level => level.key);
const facetKeys = Object.values(RCC_FACET_KEYS);
// Saved conditions use the shared shell store; the menu only declares which keys a saved view restores.
// The focused equipment is a transient pick, so it is not saved (same rule as HW Time's focus key).
const SAVED_VIEW_SUPPORT: SavedViewSupport = {
  menuId: 'rcc', menuSchemaVersion: 1, contextKeys: ['time', 'roomNames', 'prcGroup', 'condition', 'selection'],
  pageKeys: ['mode', ...facetKeys, 'structure', 'baseline', ...drillKeys],
};

export const manifests: MenuEntry[] = [
  {
    id: 'rcc', primary: true, group: groupId('rcc'), label: { ko: 'RCC', en: 'RCC' },
    description: { ko: '프로세스 시간 분석 (예정)', en: 'Process time (planned)' },
    path: '/rcc', icon: Workflow, permission: menuPermission('analytics:view'), requiresScope: prototypeEnabled, pageType: 'analysis',
    context: contextCapabilities(prototypeEnabled ? {
      time: 'apply', roomNames: 'apply', prcGroup: 'apply', condition: 'apply', selection: 'apply',
    } : {}),
    query: prototypeEnabled ? { mode: 'apply', autoApplyDefault: true, applyPeriodOnLegacyEntry: true } : { mode: 'live' },
    savedViewSupport: prototypeEnabled ? SAVED_VIEW_SUPPORT : undefined,
    features: NO_FEATURES,
    pageKeys: prototypeEnabled ? ['mode', ...facetKeys, 'structure', 'baseline', ...drillKeys, ...RCC_DRILL.resetKeys] : [],
    repeatedPageKeys: prototypeEnabled ? facetKeys : undefined,
    contextResetKeys: prototypeEnabled ? [...drillKeys, 'structure', 'baseline', ...RCC_DRILL.resetKeys] : undefined,
    drill: prototypeEnabled ? RCC_DRILL : undefined,
    component: prototypeEnabled ? lazy(() => import('./pages/RccTimeCompare')) : undefined,
  },
];
