/**
 * External host modules mounted into the app (ADR-0053): the first one is EV's `eqv` (Top View, Focus), installed from its release
 * tarballs (EV ADR-0014). `menus.ts` composes the result at the registry call; GROUPS/MENUS stay platform-only.
 * Placement is provisional and lives in these two constants only; the owner confirms the space from captures.
 * `apps/platform-e2e/tests/eqv.spec.ts` holds the black-box copy of the path — update it with them.
 */
import { Map as MapIcon, Radar } from 'lucide-react';
import { menuPermission, spaceId, type Permission } from '@ap/contracts';
import { mountModule, type ModuleGroupDef, type ModuleMenuEntry, type Registry } from '@ap/kernel';
import { eqvManifest, eqvScreens } from '@eqv/platform-adapter';

export const EQV_SPACE = spaceId('clas');
export const EQV_PREFIX = '/clas/topview';

export const EQV_MODULE: { menus: ModuleMenuEntry[]; groups: ModuleGroupDef[] } = mountModule(eqvManifest, eqvScreens, {
  prefix: EQV_PREFIX,
  groupSpace: { 'eqv:equipment': EQV_SPACE },
  config: {},
  icons: { groups: { 'eqv:equipment': MapIcon }, screens: { topview: MapIcon, focus: Radar } },
});

/**
 * Permissions of the mounted modules (`menu.permission` of every module menu). The Registry checks them by their `<moduleId>:` prefix and the
 * app does not declare them (ADR-0072); the mock assembly adds them to its role vocabulary so a viewer is refused.
 */
export function modulePermissions(registry: Pick<Registry, 'menus'>): Permission[] {
  return [...new Set(registry.menus.flatMap(menu => ('module' in menu && menu.module !== undefined ? [menu.permission] : [])))].map(menuPermission);
}
