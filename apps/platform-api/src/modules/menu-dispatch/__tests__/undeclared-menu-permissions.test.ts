import { describe, expect, it } from 'vitest';

import { undeclaredMenuPermissionLines, undeclaredMenuPermissions } from '../undeclared-menu-permissions.js';

// #1846: a menu permission missing from the server declaration hides the menu for everyone (closed failure, kept);
// the mismatch is reported, never refused. Synthetic identifiers only.
describe('undeclaredMenuPermissions (#1846)', () => {
  const menus = [
    { id: 'syn-a', permission: 'syn:view' },
    { id: 'syn-b', permission: 'syn:missing' },
    { id: 'syn-c', permission: 'platform:view' },
  ];

  it('reports a menu whose permission is neither declared nor a kernel permission', () => {
    const found = undeclaredMenuPermissions(menus, ['syn:view']);
    expect(found).toEqual([{ menuId: 'syn-b', permission: 'syn:missing', reason: expect.stringContaining('syn:missing') }]);
    expect(found[0]?.reason).toContain('hidden for everyone');
  });

  it('reports nothing when every menu permission is declared or kernel', () => {
    expect(undeclaredMenuPermissions(menus, ['syn:view', 'syn:missing'])).toEqual([]);
  });

  it('writes one line per mismatch, naming the menu and the permission', () => {
    const lines = undeclaredMenuPermissionLines(undeclaredMenuPermissions(menus, []));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^menu syn-a: .*syn:view/);
    expect(lines[1]).toMatch(/^menu syn-b: .*syn:missing/);
    expect(undeclaredMenuPermissionLines([])).toEqual([]);
  });
});
