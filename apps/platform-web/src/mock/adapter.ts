/**
 * Mock implementation of the kernel port (@ap/contracts PlatformAdapter). The kernel never imports mock/*;
 * main.tsx injects this. A real server adapter replaces this file, not the kernel.
 */
import type { PlatformAdapter, Session } from '@ap/contracts';
import { checkScope, getRole, matchesCondition, subscribeServer, validateScope } from './server';
import { DEFAULT_RANGE_TO, EQUIPMENT, PUBLISHED_METRICS, SITES, USERS, type RoleId } from './world';

/** Short async hop so the shell exercises its loading path, as it would against a real server. */
function pause(signal?: AbortSignal, ms = 80) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('aborted', 'AbortError')); });
  });
}

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
  contextOptions: async (scopeId, signal) => {
    const role = getRole();
    await pause(signal);
    // Only values present on equipment the session may see: a forbidden or partly granted site must not leak
    // groups, teams or models from denied rooms.
    const granted = checkScope(role, scopeId).grantedRooms;
    const rows = EQUIPMENT.filter(e => e.site === scopeId && granted.includes(e.room));
    const makerModel = new Map(rows.map(e => [`${e.maker}/${e.model}`, { maker: e.maker, model: e.model }]));
    return {
      stgroup: [...new Set(rows.map(e => e.stgroup))].sort(),
      team: [...new Set(rows.map(e => e.team))].sort(),
      makerModel: [...makerModel.values()].sort((a, b) => `${a.maker}${a.model}`.localeCompare(`${b.maker}${b.model}`)),
    };
  },
  evaluateSelection: async ({ scopeId, roomNames, condition, selection }, signal) => {
    const role = getRole();
    await pause(signal);
    // Grants come from the session on the server, not from anything the client sends.
    const granted = checkScope(role, scopeId).grantedRooms;
    const inCondition = EQUIPMENT
      .filter(e => e.site === scopeId && granted.includes(e.room) && (roomNames === null || roomNames.includes(e.room)) && matchesCondition(e, condition))
      .map(e => ({ equipmentId: e.equipmentId, room: e.room, model: e.model }));
    const outOfCondition = (selection ?? []).filter(id => !inCondition.some(e => e.equipmentId === id));
    return { inCondition, outOfCondition };
  },
  subscribe: subscribeServer,
};
