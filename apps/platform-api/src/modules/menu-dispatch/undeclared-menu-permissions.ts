// Menus whose required permission the server does not declare (#1846, ADR-0146 decisions 3 and 4).
//
// A session's permission list is the kernel table plus the bundle's declared `permission -> capability` rows. A menu whose
// permission is in neither is in nobody's list, so the menu is hidden for everyone, operators included. That closed failure
// is intended and stays; this only makes it visible. An undeclared endpoint permission already refuses boot; a menu
// permission has no such check, so it is reported here as a warning (never a boot failure).

import { PLATFORM_PERMISSION_TABLE } from '../platform-port/permissions.js';

export interface UndeclaredMenuPermission {
  menuId: string;
  permission: string;
  reason: string;
}

/** The menus whose `permission` is neither a kernel permission nor one of `declaredPermissions`, in menu order. */
export function undeclaredMenuPermissions(
  menus: readonly { id: string; permission: string }[],
  declaredPermissions: Iterable<string>,
): UndeclaredMenuPermission[] {
  const declared = new Set<string>([...PLATFORM_PERMISSION_TABLE.map((entry) => entry.permission), ...declaredPermissions]);
  return menus
    .filter((menu) => !declared.has(menu.permission))
    .map((menu) => ({
      menuId: menu.id,
      permission: menu.permission,
      reason: `permission ${menu.permission} is not declared on the server (no permission -> capability row, not a kernel permission): the menu is hidden for everyone`,
    }));
}

/** One warning line per mismatch. */
export function undeclaredMenuPermissionLines(found: readonly UndeclaredMenuPermission[]): string[] {
  return found.map((row) => `menu ${row.menuId}: ${row.reason}`);
}
