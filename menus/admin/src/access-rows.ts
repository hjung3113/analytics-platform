/**
 * Pure helpers for the console access directory (issue #49). The server returns each principal's
 * permissions and per-site room grants only — the menu list is this client's registry joined to that
 * permission set ("this registry declares this menu for this permission"), never an authorization proof.
 */
import type { AccessPrincipal, Permission, SpaceId, Text } from '@ap/contracts';
import type { MenuEntry, Registry } from '@ap/kernel';

/** The "Room grants" column cell and the grantCount sort basis: rooms held across sites over known rooms across sites. */
export function grantTotals(principal: AccessPrincipal): { granted: number; total: number } {
  return {
    granted: principal.sites.reduce((sum, site) => sum + site.grantedRooms.length, 0),
    total: principal.sites.reduce((sum, site) => sum + site.totalRooms, 0),
  };
}

export type MenuForPermission = {
  id: string;
  label: Text;
  path: string;
  /** The menu's own declared permission — the key the drawer groups menus under. */
  permission: Permission;
  /** The menu's space itself gates entry behind a permission the principal lacks (06 §9.1): held menu, gated space. A global utility menu is never space-gated. */
  spaceGated: boolean;
  spaceId: SpaceId | null;
  spaceLabel: Text;
};

/** Menus the registry declares for this permission set, sorted by menu id. Space entry is client-side:
 *  group → GroupDef.space → SpaceDef.permission; a space with no permission is open to every signed-in user.
 *  A global utility group (`space: null`) is menu permission only. */
function spaceFields(menu: MenuEntry, registry: Registry): { spaceId: SpaceId | null; spaceLabel: Text } {
  const space = registry.spaceOf(menu);
  return space === null
    ? { spaceId: null, spaceLabel: { ko: '전역', en: 'Global' } }
    : { spaceId: space.id, spaceLabel: { ko: space.id, en: space.id } };
}

export function menusForPermissions(registry: Registry, permissions: readonly Permission[]): MenuForPermission[] {
  return registry.menus
    .filter(menu => permissions.includes(menu.permission))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(menu => {
      const space = registry.spaceOf(menu);
      const fields = spaceFields(menu, registry);
      return {
        id: menu.id,
        label: menu.label,
        path: menu.path,
        permission: menu.permission,
        spaceGated: space !== null && space.permission !== undefined && !permissions.includes(space.permission),
        spaceId: fields.spaceId,
        spaceLabel: fields.spaceLabel,
      };
    });
}
