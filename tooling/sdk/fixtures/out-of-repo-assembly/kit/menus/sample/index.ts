// The sample menu package: copy this folder to start a menu (README «둘째 메뉴»).
// Exports the manifest (registered in ../../menus.ts). The mock list ./mock.ts is registered by ../../mock/assembly.ts only,
// so a real-adapter assembly never bundles mock code.
import { lazy } from 'react';
import { LayoutList } from 'lucide-react';
import { contextCapabilities, groupId } from '@ap/contracts';
import type { MenuEntry } from '@ap/kernel';
import { MENU_ID, MENU_LABEL, MENU_PATH, MENU_PERMISSION } from './menu';

export const manifests: readonly MenuEntry[] = [{
  id: MENU_ID, group: groupId('kit'), primary: false, label: MENU_LABEL,
  description: { ko: '', en: '' }, path: MENU_PATH, icon: LayoutList, permission: MENU_PERMISSION, requiresScope: false,
  context: contextCapabilities(), pageType: 'overview',
  features: { export: false, savedView: false, annotate: false, compare: false }, pageKeys: [],
  component: lazy(() => import('./SamplePage')),
}];
