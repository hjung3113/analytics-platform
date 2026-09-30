/**
 * Mock implementation of the kernel port (@ap/contracts PlatformAdapter). The kernel never imports mock/*;
 * main.tsx injects the object returned by createMockAdapter. A real server adapter replaces this file, not the kernel.
 */
import type { ContextKey, MenuMeta, PlatformAdapter, Session } from '@ap/contracts';
import { checkScope, getEntity, getRole, matchesCondition, recordUsage, reportClientError, subscribeServer, usageSummary, validateScope } from './server';
import { auditTrail, entityAudit } from './audit';
import { accessDirectory } from './access';
import { listAnnotations, saveAnnotation } from './annotations';
import { mySurveyHistory, myVocHistory } from './my-voc';
import { DEFAULT_RANGE_TO, EQUIPMENT, PUBLISHED_METRICS, SITES, USERS, type RoleId } from './world';
import { MockRegistrationError, serveEndpoint, type AnyMockEndpoint } from './endpoints';

const siteBoundContextKeys = new Set<ContextKey>(['roomNames', 'condition', 'selection', 'lot', 'recipe', 'ppid']);

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

export function createMockAdapter(o: {
  endpoints: readonly AnyMockEndpoint[];
  registry: { menus: readonly MenuMeta[] };
}): PlatformAdapter {
  const endpoints = new Map<string, AnyMockEndpoint>();
  for (const endpoint of o.endpoints) {
    const { spec } = endpoint;
    if (endpoints.has(spec.id)) throw new MockRegistrationError(`endpoint ${spec.id}: duplicate id`);

    const owner = o.registry.menus.find(menu => menu.id === spec.menuId);
    if (!owner) throw new MockRegistrationError(`endpoint ${spec.id}: menu ${spec.menuId} is not registered`);
    if (!o.registry.menus.some(menu => menu.permission === spec.permission)) {
      throw new MockRegistrationError(`endpoint ${spec.id}: permission ${spec.permission} is not declared by any menu`);
    }

    const unsupportedContext = Object.entries(spec.context).find(([key, capability]) =>
      capability === 'apply' && owner.context[key as keyof typeof owner.context] !== 'apply');
    if (unsupportedContext) {
      throw new MockRegistrationError(`endpoint ${spec.id}: menu ${spec.menuId} does not apply context ${unsupportedContext[0]}`);
    }
    if (owner.requiresScope && !spec.requiresScope) {
      throw new MockRegistrationError(`endpoint ${spec.id}: menu ${spec.menuId} requires scope`);
    }

    if (!spec.requiresScope) {
      const siteBoundContext = Object.entries(spec.context).find(([key, capability]) =>
        capability === 'apply' && siteBoundContextKeys.has(key as ContextKey));
      if (siteBoundContext) {
        throw new MockRegistrationError(`endpoint ${spec.id}: scope-free endpoint cannot apply site-bound context ${siteBoundContext[0]}`);
      }
    }

    endpoints.set(spec.id, endpoint);
  }

  return {
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
    getEntity: (ref, signal) => getEntity(ref, signal),
    menuQuery: (req, signal) => serveEndpoint(endpoints, req, signal),
    // opts (test role pin, latency) stay server-side: the adapter passes the port arguments only.
    auditTrail: (query, signal) => auditTrail(query, signal),
    entityAudit: (ref, signal) => entityAudit(ref, signal),
    accessDirectory: (query, signal) => accessDirectory(query, signal),
    listAnnotations: (ref, signal) => listAnnotations(ref, signal),
    saveAnnotation: (input, signal) => saveAnnotation(input, signal),
    // Fire-and-forget telemetry: the kernel never awaits these and passes no AbortSignal.
    recordUsage: events => recordUsage(events),
    reportClientError: report => reportClientError(report),
    usageSummary: (range, signal) => usageSummary(range, signal),
    // opts (test role pin, latency) stay server-side: the adapter passes the port arguments only.
    myVocHistory: (query, signal) => myVocHistory(query, signal),
    mySurveyHistory: signal => mySurveyHistory(signal),
  };
}
