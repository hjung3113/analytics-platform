// Negative check fixture — undeclared-permission: a menu naming a permission the assembly never declared is rejected (§10.5).
import { expect, it } from 'vitest';
import { buildRegistry } from '@ap/app-host';
import { menuPermission } from '@ap/contracts';
import { declarations } from '../../menus';

it('undeclared-permission: createRegistry rejects a menu permission that was never declared', () => {
  const menus = declarations.menus.map((menu) => (menu.id === 'kit-overview' ? { ...menu, permission: menuPermission('kit:not-declared') } : menu));
  expect(() => buildRegistry({ ...declarations, menus })).toThrow(/permission "kit:not-declared" is not a platform permission/);
});
