/**
 * Mock implementation of the kernel port (@ap/contracts PlatformAdapter). The kernel never imports mock/*;
 * main.tsx injects this. A real server adapter replaces this file, not the kernel.
 */
import type { PlatformAdapter, Session } from '@ap/contracts';
import { getRole, subscribeServer, validateScope } from './server';
import { DEFAULT_RANGE_TO, PUBLISHED_METRICS, SITES, USERS, type RoleId } from './world';

// One Session object per role, so the kernel's store snapshot only changes when the role does.
const sessions = new Map<RoleId, Session>();
function sessionFor(role: RoleId): Session {
  let session = sessions.get(role);
  if (!session) {
    const u = USERS[role];
    session = {
      user: { id: u.role, name: u.name, title: u.title, permissions: u.permissions },
      scopes: SITES.filter(s => u.grants[s.id]?.length).map(s => ({ id: s.id, label: s.label, grantedRooms: u.grants[s.id].length, totalRooms: s.rooms.length })),
    };
    sessions.set(role, session);
  }
  return session;
}

export const mockAdapter: PlatformAdapter = {
  session: () => sessionFor(getRole()),
  validateScope: (scopeId, signal) => validateScope(getRole(), scopeId, signal),
  publishedMetrics: () => PUBLISHED_METRICS,
  defaultRangeTo: () => DEFAULT_RANGE_TO,
  subscribe: subscribeServer,
};
