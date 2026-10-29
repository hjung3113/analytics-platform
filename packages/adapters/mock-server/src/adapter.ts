/**
 * Mock implementation of the kernel port (@ap/contracts PlatformAdapter). The kernel never imports mock/*;
 * The app's mock assembly (apps/platform-web/src/dev/mock-assembly.tsx, ADR-0009) hands the object returned by
 * createMockAdapter to main.tsx through `#platform-assembly`; production builds never contain it. A real server adapter replaces this file, not the kernel.
 */
import type { AuditEvent, EquipmentAxisDescriptor, ContextKey, MenuMeta, Permission, PlatformAdapter, Session } from '@ap/contracts';
import { instantEpochMs, requiredContextError } from '@ap/contracts';
import { createSelectionPorts } from './query/selection-ports';
import { contextShapeError } from './access/context-validation';
import { checkScope, getEntity, getRole, matchesCondition, recordUsage, reportClientError, subscribeServer, usageSummary, validateScope } from './server';
import { AUDIT_TYPES, auditTrail, entityAudit } from './audit/audit';
import { AUDIT_EVENTS } from './audit/audit-fixtures';
import { accessDirectory } from './access/access';
import { deleteAnnotation, listAnnotations, saveAnnotation } from './audit/annotations';
import { DEFAULT_RANGE_TO, EQUIPMENT, PUBLISHED_METRICS, SITES, installWorld, type RoleId, type World } from './world';
import { MockRegistrationError, serveEndpoint, type AnyMockEndpoint } from './query/endpoints';
import { deleteNotice, importPreferences, listNotices, lookupPeople, patchPreferences, readPreferences, saveNotice } from './services/services';
import { serveAction, type AnyMockAction } from './actions/actions';

const siteBoundContextKeys = new Set<ContextKey>(['roomNames', 'line', 'prcGroup', 'condition', 'selection', 'lot', 'recipe', 'ppid']);

/** Short async hop so the shell exercises its loading path, as it would against a real server. */
function pause(signal?: AbortSignal, ms = 80) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(id); reject(new DOMException('aborted', 'AbortError')); });
  });
}

// One Session object per role per world, so the kernel's store snapshot only changes when the role does.
function sessionsOf(world: World) {
  const sessions = new Map<RoleId, Session>();
  return (role: RoleId): Session => {
    let session = sessions.get(role);
    if (!session) {
      const u = world.users[role];
      session = {
        user: { id: u.role, name: u.name, title: u.title, permissions: u.permissions },
        scopes: SITES.filter(s => u.grants[s.id]?.length).map(s => ({ id: s.id, label: s.label, grantedRooms: u.grants[s.id].length, totalRooms: s.rooms.length })),
      };
      sessions.set(role, session);
    }
    return session;
  };
}

/**
 * Menu-owned audit seeds (ADR-0048) are checked once at registration, like endpoints: a declared target type,
 * a canonical instant, no id collision, and no site on a metric (a metric has none — `entityAudit` rejects one).
 */
function checkAuditSeeds(seeds: readonly AuditEvent[]): void {
  const seen = new Set(AUDIT_EVENTS.map(event => event.id));
  for (const event of seeds) {
    if (seen.has(event.id)) throw new MockRegistrationError(`audit seed ${event.id}: duplicate id`);
    seen.add(event.id);
    if (!AUDIT_TYPES.includes(event.target.type) || event.target.type === 'equipment') {
      throw new MockRegistrationError(`audit seed ${event.id}: target type ${event.target.type} is not a seedable audit type`);
    }
    if (event.target.type === 'metric' && event.target.scopeId !== null) throw new MockRegistrationError(`audit seed ${event.id}: a metric has no scope`);
    try { instantEpochMs(event.at); } catch { throw new MockRegistrationError(`audit seed ${event.id}: at must be an instant with a zone`); }
  }
}

export function createMockAdapter(o: {
  endpoints: readonly AnyMockEndpoint[];
  equipmentAxes?: readonly EquipmentAxisDescriptor[];
  /** Declared writes (ADR-0054); registered like endpoints. */
  actions?: readonly AnyMockAction[];
  registry: { menus: readonly (Omit<MenuMeta, 'group' | 'permission'> & { permission: string })[] };
  /** Audit events of menu-owned destinations, from the app's mock assembly (ADR-0048). */
  auditEvents?: readonly AuditEvent[];
  /**
   * The app's permission vocabulary (`registry.permissions`: kernel + declared). The mock roles are built from it:
   * admin holds all, engineer all but console/feature menus, viewer only its explicit grants. Omit for the sample four.
   */
  permissions?: readonly Permission[];
}): PlatformAdapter {
  const world = installWorld(o.permissions);
  const sessionFor = sessionsOf(world);
  const seeds = o.auditEvents ?? [];
  checkAuditSeeds(seeds);
  const endpoints = new Map<string, AnyMockEndpoint>();
  for (const endpoint of o.endpoints) {
    const { spec } = endpoint;
    if (endpoints.has(spec.id)) throw new MockRegistrationError(`endpoint ${spec.id}: duplicate id`);

    const owner = o.registry.menus.find(menu => menu.id === spec.menuId);
    if (!owner) throw new MockRegistrationError(`endpoint ${spec.id}: menu ${spec.menuId} is not registered`);
    if (!o.registry.menus.some(menu => menu.permission === spec.permission)) {
      throw new MockRegistrationError(`endpoint ${spec.id}: permission ${spec.permission} is not declared by any menu`);
    }

    const requiredError = requiredContextError(spec.requiredContext ?? [], spec.context);
    if (requiredError) throw new MockRegistrationError(`endpoint ${spec.id}: ${requiredError}`);
    if (owner.query?.mode === 'apply') {
      const menuRequired = new Set(owner.query.required?.context ?? []);
      const endpointRequired = new Set(spec.requiredContext ?? []);
      for (const key of new Set([...menuRequired, ...endpointRequired])) {
        if (spec.context[key] === 'apply' && menuRequired.has(key) !== endpointRequired.has(key)) {
          throw new MockRegistrationError(`endpoint ${spec.id}: required Context ${key} differs from menu ${spec.menuId}`);
        }
      }
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

    // Rule 7 (#175): a row cap judges the whole result, so it makes sense only on a non-paged row-array endpoint.
    if (spec.limits?.maxRows !== undefined) {
      const { maxRows } = spec.limits;
      if (!Number.isInteger(maxRows) || maxRows <= 0) {
        throw new MockRegistrationError(`endpoint ${spec.id}: limits.maxRows must be a positive integer`);
      }
      if ('page' in spec.paramKeys || 'pageSize' in spec.paramKeys || 'cursor' in spec.paramKeys) {
        throw new MockRegistrationError(`endpoint ${spec.id}: limits.maxRows is declared on a paged endpoint (page·pageSize·cursor paramKeys are all paging; rows are bounded by paging)`);
      }
    }

    endpoints.set(spec.id, endpoint);
  }

  const actions = new Map<string, AnyMockAction>();
  for (const action of o.actions ?? []) {
    const { spec } = action;
    if (actions.has(spec.id)) throw new MockRegistrationError(`action ${spec.id}: duplicate id`);
    const owner = o.registry.menus.find(menu => menu.id === spec.menuId);
    if (!owner) throw new MockRegistrationError(`action ${spec.id}: menu ${spec.menuId} is not registered`);
    if (!o.registry.menus.some(menu => menu.permission === spec.permission)) {
      throw new MockRegistrationError(`action ${spec.id}: permission ${spec.permission} is not declared by any menu`);
    }
    if (owner.requiresScope && !spec.requiresScope) throw new MockRegistrationError(`action ${spec.id}: menu ${spec.menuId} requires scope`);
    const foreign = spec.invalidates.find(query => endpoints.get(query.id)?.spec.menuId !== spec.menuId);
    if (foreign) throw new MockRegistrationError(`action ${spec.id}: invalidates ${foreign.id}, which is not a registered endpoint of menu ${spec.menuId}`);
    if (spec.concurrency === 'version' && !action.version) throw new MockRegistrationError(`action ${spec.id}: concurrency version needs a version handler`);
    actions.set(spec.id, action);
  }

  return {
    ...createSelectionPorts(o.equipmentAxes),
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
    evaluateSelection: async ({ scopeId, roomNames, lineNames, prcGroups, membershipBasis, condition, selection }, signal) => {
      const role = getRole();
      await pause(signal);
      const invalidContext = contextShapeError({ roomNames, lineNames, prcGroups, membershipBasis, condition, selection });
      if (invalidContext) throw new Error(invalidContext);
      if (membershipBasis === 'asOf' && condition !== null) throw new Error('membership_basis_unsupported');
      // PRC-only asOf uses current membership in this mock (no history data).
      // Grants come from the session on the server, not from anything the client sends.
      const granted = checkScope(role, scopeId).grantedRooms;
      const inCondition = EQUIPMENT
        .filter(e => e.site === scopeId && granted.includes(e.room) && (roomNames === null || roomNames.includes(e.room)) && (lineNames === null || lineNames.includes(e.line)) && (prcGroups === null || prcGroups.includes(e.prcGroup)) && matchesCondition(e, condition))
        .map(e => ({ equipmentId: e.equipmentId, room: e.room, model: e.model }));
      const outOfCondition = (selection ?? []).filter(id => !inCondition.some(e => e.equipmentId === id));
      return { inCondition, outOfCondition };
    },
    subscribe: subscribeServer,
    getEntity: (ref, signal) => getEntity(ref, signal),
    menuQuery: (req, signal) => serveEndpoint(endpoints, req, signal),
    menuAction: (req, signal) => serveAction(actions, req, signal),
    // opts (test role pin, latency) stay server-side: the adapter passes the port arguments only.
    auditTrail: (query, signal) => auditTrail(query, signal, { seeds }),
    entityAudit: (req, signal) => entityAudit(req, signal, { seeds }),
    accessDirectory: (query, signal) => accessDirectory(query, signal),
    listAnnotations: (ref, signal) => listAnnotations(ref, signal),
    saveAnnotation: (input, signal) => saveAnnotation(input, signal),
    deleteAnnotation: (ref, signal) => deleteAnnotation(ref, signal),
    readPreferences: signal => readPreferences(signal),
    patchPreferences: (patch, signal) => patchPreferences(patch, signal),
    importPreferences: (input, signal) => importPreferences(input, signal),
    lookupPeople: (ids, signal) => lookupPeople(ids, signal),
    listNotices: signal => listNotices(signal),
    saveNotice: (input, signal) => saveNotice(input, signal),
    deleteNotice: (input, signal) => deleteNotice(input, signal),
    // Fire-and-forget telemetry: the kernel never awaits these and passes no AbortSignal.
    recordUsage: events => recordUsage(events),
    reportClientError: report => reportClientError(report),
    usageSummary: (range, signal) => usageSummary(range, signal),
    // opts (test role pin, latency) stay server-side: the adapter passes the port arguments only.
  };
}
