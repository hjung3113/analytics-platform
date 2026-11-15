import { afterEach, describe, expect, it } from 'vitest';
import { emptyGlobal, KERNEL_PERMISSIONS, menuPermission } from '@ap/contracts';
import { createMockAdapter } from '../adapter';
import { getRole, serve, setRole } from '../server';

const quality = menuPermission('quality:view');
const vocabulary = [...KERNEL_PERMISSIONS, quality];
const global = { ...emptyGlobal, scopeId: 'MEM', from: '2026-09-25T09:00:00', to: '2026-09-26T09:00:00' };
const gated = (role: 'admin' | 'engineer' | 'viewer') => serve({ role, permission: quality, global, latency: 0, mergeTimeDomain: false, compute: () => 1 });

const before = getRole();
afterEach(() => {
  setRole(before);
  createMockAdapter({ endpoints: [], registry: { menus: [] } }); // back to the default world for other tests
});

describe('a permission vocabulary handed to the mock adapter (ADR-0072)', () => {
  it('gives admin and engineer the declared permission, and viewer not', async () => {
    const adapter = createMockAdapter({ endpoints: [], registry: { menus: [] }, permissions: vocabulary });
    const held = (role: 'admin' | 'engineer' | 'viewer') => { setRole(role); return adapter.session().user.permissions; };
    expect(held('admin')).toContain(quality);
    expect(held('engineer')).toContain(quality);
    expect(held('viewer')).not.toContain(quality);
    expect(held('engineer')).not.toContain('console:access');
    expect(held('engineer')).not.toContain('features:access');
    expect(held('viewer')).toEqual(['platform:view', 'notice:view', 'voc:view']);
  });

  it('serves a request gated by the declared permission to admin and forbids viewer', async () => {
    createMockAdapter({ endpoints: [], registry: { menus: [] }, permissions: vocabulary });
    expect((await gated('admin')).outcome).toBe('ok');
    const denied = await gated('viewer');
    expect(denied.outcome).toBe('forbidden');
    expect(denied.message).toContain('quality:view');
  });

  it('accepts the declared permission as an access-directory filter and lists who holds it', async () => {
    const adapter = createMockAdapter({ endpoints: [], registry: { menus: [] }, permissions: vocabulary });
    setRole('admin');
    const res = await adapter.accessDirectory({ permission: quality });
    expect(res.outcome).toBe('ok');
    expect(res.data?.items.map(p => p.id).sort()).toEqual(['admin', 'engineer']);
  });

  it('rejects the permission without the vocabulary (the default world has no quality:view)', async () => {
    const adapter = createMockAdapter({ endpoints: [], registry: { menus: [] } });
    setRole('admin');
    expect((await adapter.accessDirectory({ permission: quality })).message).toBe('Invalid access filter');
  });
});
