import { parseDateTime, PortError, type AxisOptionsInput, type EquipmentAxisDescriptor, type EquipmentSearchInput, type EquipmentSummary, type PlatformAdapter } from '@ap/contracts';
import { contextShapeError } from '../access/context-validation';
import { checkScope, getRole, subscribeServer } from '../server';
import { EQUIPMENT, type Equipment } from '../world';

/** Server-owned defaults. Provider descriptors are not a transport to the server. */
let authorizationRevision = 0;
subscribeServer(() => { authorizationRevision++; });

const defaults: readonly EquipmentAxisDescriptor[] = [
  { id: 'stgroup', label: { ko: 'StGroup', en: 'StGroup' }, membershipHistory: false },
  { id: 'team', label: { ko: 'Team', en: 'Team' }, membershipHistory: false },
  { id: 'maker', label: { ko: 'Maker', en: 'Maker' }, membershipHistory: false },
  { id: 'model', label: { ko: 'Model', en: 'Model' }, membershipHistory: false, dependsOn: 'maker' },
];
const fieldValues = (e: Equipment): Record<string, string> => ({ stgroup: e.stgroup, team: e.team, maker: e.maker, model: e.model, chamberType: e.chamberType });
const plain = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x) && [Object.prototype, null].includes(Object.getPrototypeOf(x));
const id = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0;
const ids = (x: unknown): x is string[] => Array.isArray(x) && x.every(id);
function invalid(field: string): never { throw new PortError('invalid_input', `Invalid ${field}`, field); }
function outer(x: unknown, allowed: readonly string[], required: readonly string[]): asserts x is Record<string, unknown> {
  if (!plain(x)) invalid('input');
  for (const key of Object.keys(x)) if (!allowed.includes(key)) invalid(key);
  for (const key of required) if (!Object.hasOwn(x, key)) invalid(key);
  if (!id(x.scopeId)) invalid('scopeId');
}
/** Object keys / set values normalized; IDs themselves are never rewritten. */
function normalized(value: unknown): unknown {
  if (Array.isArray(value)) return [...new Set(value)].sort();
  if (plain(value)) return Object.fromEntries(Object.keys(value).sort().map(k => [k, normalized(value[k])]));
  return value;
}
function temporal(input: AxisOptionsInput | EquipmentSearchInput, axes: readonly EquipmentAxisDescriptor[], used: string[], prc = false) {
  if (input.membershipBasis !== undefined && input.membershipBasis !== null && input.membershipBasis !== 'asOf') invalid('membershipBasis');
  const period = input.period;
  if (period != null) {
    try {
      if (!plain(period) || Object.keys(period).length !== 2 || typeof period.from !== 'string' || typeof period.to !== 'string' || parseDateTime(period.from, 'from') >= parseDateTime(period.to, 'to')) throw new Error();
    } catch { throw new PortError('invalid_period', 'Use a complete increasing wall-clock period', 'period'); }
  }
  if (input.membershipBasis !== 'asOf') return; // Valid optional period is ignored for current membership.
  if (period == null) throw new PortError('invalid_period', 'asOf requires a period', 'period');
  if (prc || used.some(key => !axes.find(a => a.id === key)?.membershipHistory)) throw new PortError('membership_basis_unsupported', 'Mock has no history for a requested membership', 'membershipBasis');
}
function granted(scopeId: string, roomNames?: readonly string[] | null) {
  const check = checkScope(getRole(), scopeId);
  if (check.status !== 'valid') throw new PortError(check.status === 'unknown_scope' ? 'unknown_scope' : 'scope_forbidden', 'Scope is not granted', 'scopeId');
  if (roomNames?.some(room => !check.grantedRooms.includes(room))) throw new PortError('room_forbidden', 'Room is not granted', 'roomNames');
  return check.grantedRooms;
}
function pageInput(x: Record<string, unknown>) {
  if (typeof x.limit !== 'number' || !Number.isFinite(x.limit) || !Number.isInteger(x.limit)) invalid('limit');
  if (x.query !== undefined && typeof x.query !== 'string') invalid('query');
  if (x.cursor !== undefined && x.cursor !== null && !id(x.cursor)) invalid('cursor');
}

export function createSelectionPorts(equipmentAxes: readonly EquipmentAxisDescriptor[] = defaults): Pick<PlatformAdapter, 'listAxisOptions' | 'searchEquipment' | 'resolveSelection'> {
  const supported = new Map(equipmentAxes.map(a => [a.id, a]));
  for (const axis of equipmentAxes) {
    if (!Object.hasOwn(fieldValues(EQUIPMENT[0]), axis.id) || (axis.dependsOn && !supported.has(axis.dependsOn))) throw new Error(`Unsupported mock descriptor: ${axis.id}`);
    const visited = new Set<string>([axis.id]);
    let parent = axis.dependsOn;
    while (parent) {
      if (visited.has(parent)) throw new Error('Cyclic mock descriptors');
      visited.add(parent); parent = supported.get(parent)?.dependsOn;
    }
  }
  const globalFields: Record<string, keyof Equipment> = { roomNames: 'room', lineNames: 'line', prcGroups: 'prcGroup' };
  const globalValue = (e: Equipment, key: string) => String(e[globalFields[key]]);
  const isGlobalOption = (key: string) => key === 'lineNames' || key === 'prcGroups';
  const summary = (e: Equipment): EquipmentSummary => ({ equipmentId: e.equipmentId, room: e.room, axes: { ...Object.fromEntries(equipmentAxes.map(a => [a.id, [fieldValues(e)[a.id]]])), lineNames: [e.line], prcGroups: [e.prcGroup] } });
  // Opaque issued tokens bind normalized inputs and authorization state. No expiry; limit may change.
  // Lexicographic JS string order (UTF-16), keyset by last ID; no naked live offset.
  const tokens = new Map<string, { identity: string; last: string }>();
  let sequence = 0;
  function page<T>(port: string, input: AxisOptionsInput | EquipmentSearchInput, rows: T[], rowId: (row: T) => string, rooms: string[]) {
    const { cursor, limit, ...base } = input;
    const identity = JSON.stringify(normalized({ port, base: { ...base, query: input.query ?? '', period: input.membershipBasis === 'asOf' ? input.period : null, membershipBasis: input.membershipBasis ?? null }, user: getRole(), authorizationRevision, rooms }));
    let last = '';
    if (cursor != null) {
      const saved = tokens.get(cursor);
      if (!saved || saved.identity !== identity) throw new PortError('invalid_cursor', 'Restart this search', 'cursor');
      last = saved.last;
    }
    const sorted = rows.filter(row => rowId(row) > last).sort((a, b) => rowId(a) < rowId(b) ? -1 : rowId(a) > rowId(b) ? 1 : 0);
    const items = sorted.slice(0, Math.max(1, Math.min(200, limit)));
    let nextCursor: string | null = null;
    if (sorted.length > items.length) {
      nextCursor = btoa(`selection-page:${++sequence}`);
      tokens.set(nextCursor, { identity, last: rowId(items[items.length - 1]) });
    }
    return { items, nextCursor };
  }
  function axis(key: string) {
    if (!supported.has(key)) throw new PortError('unknown_axis', 'Unsupported axis', 'axisId');
  }
  const cancelled = (signal?: AbortSignal) => { if (signal?.aborted) throw new DOMException('aborted', 'AbortError'); };
  return {
    async listAxisOptions(input, signal) {
      cancelled(signal);
      outer(input, ['scopeId', 'axisId', 'query', 'parents', 'membershipBasis', 'period', 'cursor', 'limit'], ['scopeId', 'axisId', 'limit']);
      if (!id(input.axisId)) invalid('axisId');
      pageInput(input);
      const global = isGlobalOption(input.axisId);
      if (!global) axis(input.axisId);
      if (input.parents !== undefined && !plain(input.parents)) invalid('parents');
      const parents = input.parents ?? {};
      const ancestors = new Set<string>();
      let parent = supported.get(input.axisId)?.dependsOn;
      while (parent) { ancestors.add(parent); parent = supported.get(parent)?.dependsOn; }
      for (const [key, values] of Object.entries(parents)) {
        if (global) {
          if (!Object.hasOwn(globalFields, key)) { axis(key); invalid('parents'); }
          if (key === input.axisId || !ids(values)) invalid('parents');
        } else { axis(key); if (!ancestors.has(key) || !ids(values)) invalid('parents'); }
      }
      temporal(input, equipmentAxes, [input.axisId, ...Object.keys(parents)]);
      const rooms = granted(input.scopeId);
      const values = new Set(EQUIPMENT.filter(e => e.site === input.scopeId && rooms.includes(e.room) && Object.entries(parents).every(([k, v]) => v.includes(global ? globalValue(e, k) : fieldValues(e)[k]))).map(e => global ? globalValue(e, input.axisId) : fieldValues(e)[input.axisId]));
      return page('options', input, [...values].filter(v => v.toLowerCase().includes((input.query ?? '').toLowerCase())).map(v => ({ id: v, label: v })), v => v.id, rooms);
    },
    async searchEquipment(input, signal) {
      cancelled(signal);
      outer(input, ['scopeId', 'roomNames', 'lineNames', 'prcGroups', 'condition', 'membershipBasis', 'period', 'query', 'cursor', 'limit'], ['scopeId', 'roomNames', 'lineNames', 'prcGroups', 'condition', 'membershipBasis', 'limit']);
      pageInput(input);
      const error = contextShapeError(input);
      if (error) invalid(error);
      for (const key of Object.keys(input.condition ?? {})) axis(key);
      temporal(input, equipmentAxes, Object.keys(input.condition ?? {}), input.prcGroups !== null);
      const rooms = granted(input.scopeId, input.roomNames);
      const rows = EQUIPMENT.filter(e => e.site === input.scopeId && rooms.includes(e.room)
        && (input.roomNames === null || input.roomNames.includes(e.room))
        && (input.lineNames === null || input.lineNames.includes(e.line))
        && (input.prcGroups === null || input.prcGroups.includes(e.prcGroup))
        && Object.entries(input.condition ?? {}).every(([key, values]) => values.includes(fieldValues(e)[key]))
        && e.equipmentId.toLowerCase().includes((input.query ?? '').toLowerCase()));
      return { ...page('search', input, rows.map(summary), e => e.equipmentId, rooms), total: rows.length };
    },
    async resolveSelection(input, signal) {
      cancelled(signal);
      outer(input, ['scopeId', 'ids'], ['scopeId', 'ids']);
      if (!ids(input.ids)) invalid('ids');
      const rooms = granted(input.scopeId);
      return { items: [...new Set(input.ids)].map(id => {
        const row = EQUIPMENT.find(e => e.site === input.scopeId && e.equipmentId === id);
        if (!row) return { id, status: 'not_found' as const };
        if (!rooms.includes(row.room)) return { id, status: 'forbidden' as const };
        return { id, status: 'ok' as const, summary: summary(row) };
      }) };
    },
  };
}
