import { expect, it, vi } from 'vitest';
import { menuPermissions } from '@ap/contracts';
import { getRole, setRole } from '@ap/mock-server';
import { registry } from '../../menus';
import { createAssembly } from '../mock-assembly';

it('gives the mock engineer the other owner’s MARS cycle-time request', async () => {
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
  });
  const previous = getRole();
  try {
    setRole('engineer');
    const assembly = await createAssembly({ registry });
    if (!('adapter' in assembly) || !assembly.savedViews) throw new Error('Missing mock Saved View store');
    const { user } = assembly.adapter.session();
    const menu = registry.menuById('cycle-time');
    expect(user.id).toBe('engineer');
    expect(menu.features.savedView).toBe(true);
    expect(user.permissions).toEqual(expect.arrayContaining([...menuPermissions(menu)]));
    expect(registry.spaceOf(menu)?.id).toBe('mars');
    expect(await assembly.savedViews.listApprovalRequests({ menuId: menu.id, userId: user.id })).toEqual([
      expect.objectContaining({ viewId: 'u-yoondohyun|cycle-time|2', requestedBy: 'u-yoondohyun', approverSpace: 'mars' }),
    ]);
  } finally {
    setRole(previous);
    vi.unstubAllGlobals();
  }
});
