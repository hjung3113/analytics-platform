import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AccessDirectoryPage, AccessDirectoryQuery, AccessPrincipal, AccessSortField, ApiResponse, Permission } from '@ap/contracts';
import { accessDirectory } from './access';
import { getRole, setRole, setScenario } from './server';
import { EQUIPMENT, USERS, type RoleId } from './world';

const page = (res: ApiResponse<AccessDirectoryPage>) => res.data as AccessDirectoryPage;
const ids = (items: readonly AccessPrincipal[]) => items.map(p => p.id);
const body = (res: ApiResponse<unknown>) => JSON.stringify(res);
const grantTotal = (p: AccessPrincipal) => p.sites.reduce((sum, site) => sum + site.grantedRooms.length, 0);

let previousRole: RoleId;
beforeEach(() => { previousRole = getRole(); });
afterEach(() => {
  setScenario('normal');
  setRole(previousRole);
});

describe('accessDirectory (issue #49: the console access directory)', () => {
  it.each([
    ['engineer', 'timeout'],
    ['engineer', 'error'],
    ['engineer', 'forbidden'],
    ['engineer', 'empty'],
    ['viewer', 'timeout'],
    ['viewer', 'error'],
    ['viewer', 'forbidden'],
    ['viewer', 'empty'],
  ] as const)('forbids %s ahead of the %s scenario, with null data and no assessments', async (role, scenario) => {
    setScenario(scenario);
    const res = await accessDirectory({}, undefined, { role, latency: 0 });
    expect(res.outcome).toBe('forbidden');
    expect(res.message).toBe('No permission console:access');
    expect(res.trust).toBeNull();
    expect(res.assessments).toEqual([]);
    expect(res.data).toBeNull();
  });

  it('answers admin timeout, error and forbidden with that scenario, not the directory', async () => {
    setScenario('timeout');
    const timeout = await accessDirectory({}, undefined, { role: 'admin', latency: 0 });
    expect(timeout.outcome).toBe('timeout');
    expect(timeout.message).toBe('Query exceeded 30s budget');
    setScenario('error');
    const error = await accessDirectory({}, undefined, { role: 'admin', latency: 0 });
    expect(error.outcome).toBe('error');
    expect(error.message).toBe('Upstream mart query failed');
    setScenario('forbidden');
    const forbidden = await accessDirectory({}, undefined, { role: 'admin', latency: 0 });
    expect(forbidden.outcome).toBe('forbidden');
    expect(forbidden.message).toBe('Permission revoked (scenario)');
  });

  it('serves the page under partial and too_large, which do not apply', async () => {
    setScenario('partial');
    expect(page(await accessDirectory({}, undefined, { role: 'admin', latency: 0 })).items).toHaveLength(3);
    setScenario('too_large');
    expect(page(await accessDirectory({}, undefined, { role: 'admin', latency: 0 })).items).toHaveLength(3);
  });

  it.each([
    ['userId key', { userId: 'u-1' } as unknown as AccessDirectoryQuery],
    ['scopeId key', { scopeId: 'ICH' } as unknown as AccessDirectoryQuery],
    ['focus key', { focus: 'admin' } as unknown as AccessDirectoryQuery],
    ['unknown key', { extra: true } as unknown as AccessDirectoryQuery],
    ['bad permission', { permission: 'nope' as Permission }],
    ['bad sort field', { sort: { field: 'rooms' as AccessSortField, desc: true } }],
    ['desc not boolean', { sort: { field: 'name', desc: 'yes' } } as unknown as AccessDirectoryQuery],
    ['extra sort key', { sort: { field: 'name', desc: false, tie: 'id' } } as unknown as AccessDirectoryQuery],
    ['page 0', { page: 0 }],
    ['pageSize 101', { pageSize: 101 }],
    ['role with whitespace', { role: 'a b' }],
    ['empty role', { role: '' }],
  ])('rejects %s as Invalid access filter, without echoing a reason', async (_name, query) => {
    const res = await accessDirectory(query, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Invalid access filter');
    expect(body(res)).not.toContain('현업 문의자');
  });

  it('validates before the empty scenario', async () => {
    setScenario('empty');
    const res = await accessDirectory({ userId: 'u-1' } as unknown as AccessDirectoryQuery, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('error');
    expect(res.message).toBe('Invalid access filter');
  });

  it('answers a well-formed role that matches nobody with empty, not invalid', async () => {
    for (const role of ['ghost', 'Admin']) { // exact, case-sensitive token: 'Admin' is not 'admin'
      const res = await accessDirectory({ role }, undefined, { role: 'admin', latency: 0 });
      expect(res.outcome).toBe('empty');
      expect(res.data).toBeNull();
    }
  });

  it('defaults to role ascending with the id tie-break, trust null and no assessments', async () => {
    const res = await accessDirectory({}, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(ids(page(res).items)).toEqual(['admin', 'engineer', 'viewer']);
    expect(res.trust).toBeNull();
    expect(res.assessments).toEqual([]);
    expect(res.correlationId).toMatch(/^corr-/);
  });

  it('sorts server-side by master name, permissionCount and grantCount; desc flips only the field', async () => {
    const byName = page(await accessDirectory({ sort: { field: 'name', desc: false } }, undefined, { role: 'admin', latency: 0 }));
    expect(byName.items.map(p => p.name)).toEqual(['Field Requester', 'Platform Admin', 'Process Engineer']);
    const byNameDesc = page(await accessDirectory({ sort: { field: 'name', desc: true } }, undefined, { role: 'admin', latency: 0 }));
    expect(byNameDesc.items.map(p => p.name)).toEqual(['Process Engineer', 'Platform Admin', 'Field Requester']);
    const byPermissions = page(await accessDirectory({ sort: { field: 'permissionCount', desc: true } }, undefined, { role: 'admin', latency: 0 }));
    expect(byPermissions.items.map(p => p.permissions)).toEqual([USERS.admin.permissions, USERS.engineer.permissions, USERS.viewer.permissions]);
    const byGrants = page(await accessDirectory({ sort: { field: 'grantCount', desc: true } }, undefined, { role: 'admin', latency: 0 }));
    expect(byGrants.items.map(grantTotal)).toEqual([9, 4, 1]);
  });

  it('filters by permission exactly: console:access names admin only', async () => {
    const res = await accessDirectory({ permission: 'console:access' }, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(ids(page(res).items)).toEqual(['admin']);
  });

  it('pages with offset: pageSize 1 page 2 is the second default-order row with the true total', async () => {
    const res = await accessDirectory({ page: 2, pageSize: 1 }, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(ids(page(res).items)).toEqual(['engineer']);
    expect(page(res).total).toBe(3);
  });

  it('answers a page past the end with ok, an empty page and the true total', async () => {
    const res = await accessDirectory({ page: 2, pageSize: 25 }, undefined, { role: 'admin', latency: 0 });
    expect(res.outcome).toBe('ok');
    expect(page(res).items).toEqual([]);
    expect(page(res).total).toBe(3);
  });

  it('carries every site with the room-name grant list in site order, zeros included', async () => {
    const res = await accessDirectory({}, undefined, { role: 'admin', latency: 0 });
    const viewer = page(res).items.find(p => p.id === 'viewer')!;
    expect(viewer.sites).toEqual([
      { id: 'ICH', label: 'ICH · Site A', grantedRooms: ['PHOTO'], totalRooms: 4 },
      { id: 'CJU', label: 'CJU · Site B', grantedRooms: [], totalRooms: 3 },
      { id: 'XIA', label: 'XIA · Site C', grantedRooms: [], totalRooms: 2 },
    ]);
    const engineer = page(res).items.find(p => p.id === 'engineer')!;
    expect(engineer.sites.map(s => s.grantedRooms.length)).toEqual([3, 1, 0]);
  });

  it('leaks no equipment ids and never copies the USERS grants record onto a row', async () => {
    const res = await accessDirectory({}, undefined, { role: 'admin', latency: 0 });
    const text = body(res);
    for (const row of EQUIPMENT) expect(text).not.toContain(row.equipmentId);
    expect(text).not.toContain('"grants"');
    for (const principal of page(res).items) {
      expect(Object.keys(principal)).toEqual(['id', 'name', 'title', 'role', 'permissions', 'sites']);
    }
  });

  it('grades an in-flight request with the role it was sent as', async () => {
    setRole('admin');
    const pending = accessDirectory({}, undefined, { latency: 60 });
    setRole('viewer'); // no console:access; the pinned role must still decide
    const res = await pending;
    expect(res.outcome).toBe('ok');
    expect(page(res).items).toHaveLength(3);
  });
});
