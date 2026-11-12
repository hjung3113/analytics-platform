/// <reference types="vite/client" />
// Server boundary conformance of this kit's menus, judged against the mock adapter (README «적합성 검사»).
// The cases are every menu folder's conformance.ts, found here — a copied menu is covered without editing this file.
// The in-house side runs the same cases with the same harness shape over its own adapter and accounts; that result
// stays in-house. A pass here is «mock 통과» only: the mock is not the in-house server.
import { expect, it } from 'vitest';
import { getRole, setRole, type RoleId } from '@ap/mock-server';
import { describeServerConformance, type ConformanceCase, type PortMethod } from '@ap/server-conformance';
import { buildRegistry } from '@ap/app-host';
import { spaceId, type Permission } from '@ap/contracts';
import { declarations } from '../menus';
import { createAssembly } from '../mock/assembly';

const menuCases = import.meta.glob<{ cases: readonly ConformanceCase[] }>('../menus/*/conformance.ts', { eager: true });
const cases = Object.values(menuCases).flatMap((module) => module.cases);

const registry = buildRegistry(declarations);
const { adapter } = createAssembly({ registry });

/**
 * What this harness judges: the menu query boundary (every case) and the session. The other port methods (entity,
 * annotations, usage, console reads …) are the platform's, not a menu's; their checks stay visible skips with
 * «not implemented», never a pass.
 */
const IMPLEMENTED: readonly PortMethod[] = ['menuQuery', 'session'];

/** Mock roles: engineer is the granted session (sites MEM and FDRY), admin the console and second user. */
const GRANTED: RoleId = 'engineer';
const SECOND: RoleId = 'admin';

async function asRole<T>(role: RoleId, fn: () => Promise<T>): Promise<T> {
  const previous = getRole();
  setRole(role);
  try {
    return await fn();
  } finally {
    setRole(previous);
  }
}

it('every menu package of the kit declares at least one conformance case', () => {
  const pageMenus = registry.menus.filter((menu) => menu.component !== undefined).map((menu) => menu.id);
  const covered = new Set(cases.map((one) => one.spec.menuId));
  expect(pageMenus.filter((id) => !covered.has(id))).toEqual([]);
});

const sampleMenu = registry.menus.find((menu) => menu.component !== undefined) ?? registry.menus[0]!;

describeServerConformance('server boundary conformance — mock adapter (mock 통과)', {
  adapter,
  implemented: IMPLEMENTED,
  cases,
  // A granted mock site and an absolute wall-clock period; XIA is a mock site the granted role holds no grant for.
  context: { scopeId: 'MEM', from: '2026-01-05T09:00:00', to: '2026-01-06T09:00:00' },
  foreignScopeId: 'XIA',
  // Placeholders the planned checks need by type; every check using them is a skip under IMPLEMENTED.
  ports: {
    entity: { ref: { type: 'equipment', id: 'kit-entity', scopeId: 'MEM' }, permission: 'platform:view' as Permission },
    annotation: { chartId: 'kit-chart', from: '2026-01-05T10:00:00', to: '2026-01-05T11:00:00', permission: 'platform:view' as Permission },
    usage: { name: 'entry', menuId: sampleMenu.id, spaceId: spaceId('kit'), path: sampleMenu.path, at: Date.now(), sessionId: 'kit-conformance' },
    clientError: { correlationId: 'kit-conformance', menuId: sampleMenu.id, spaceId: spaceId('kit'), path: sampleMenu.path, name: 'TypeError' },
    otherGrantedScopeId: 'FDRY',
  },
  asGranted: (fn) => asRole(GRANTED, fn),
  // The granted session minus one permission: the mock session's own permission list, restored afterwards.
  withoutPermission: (permission: Permission, fn) =>
    asRole(GRANTED, async () => {
      const permissions = adapter.session().user.permissions as Permission[];
      const kept = [...permissions];
      permissions.splice(0, permissions.length, ...kept.filter((held) => held !== permission));
      try {
        return await fn();
      } finally {
        permissions.splice(0, permissions.length, ...kept);
      }
    }),
  asConsole: (fn) => asRole(SECOND, fn),
  asOtherAnnotator: (fn) => asRole(SECOND, fn),
});
