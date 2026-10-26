import { PortError, type PlatformAdapter } from '@ap/contracts';
import type { OptionPortSamples } from '../plan/ports/selection-ports';

export const optionSamples: OptionPortSamples = {
  axisId: 'classification', knownValues: ['A', 'B'], query: 'A', queryValue: 'A',
  equipment: [
    { equipmentId: 'eq-1', room: 'PHOTO', axes: { classification: ['A'], parent: ['P'] } },
    { equipmentId: 'eq-2', room: 'PHOTO', axes: { classification: ['B'], parent: ['Q'] } },
  ],
  deniedRoomId: 'eq-denied', deniedRoom: 'DIFF', foreignSiteId: 'eq-foreign', absentId: 'eq-absent', deniedOption: { axisId: 'classification', value: 'DENIED' },
  parent: { axisId: 'parent', value: 'P', childValue: 'A' },
};
/** Independent literal reference; deliberately small and unrelated to the mock server's world. */
export function referenceSelectionPorts(sample: OptionPortSamples = optionSamples): Pick<PlatformAdapter, 'listAxisOptions' | 'searchEquipment' | 'resolveSelection'> {
  const check = (scope: string) => {
    if (scope === 'XIA') throw new PortError('scope_forbidden', 'denied');
    if (scope !== 'MEM' && scope !== 'FDRY') throw new PortError('unknown_scope', 'unknown');
  };
  const tokens = new Map<string, { key: string; last: string }>(); let seq = 0;
  function page<T>(input: { cursor?: string | null; limit: number }, key: string, items: T[], id: (item: T) => string) {
    if (!Number.isInteger(input.limit)) throw new PortError('invalid_input', 'limit');
    const token = input.cursor == null ? null : tokens.get(input.cursor);
    if (input.cursor != null && (!token || token.key !== key)) throw new PortError('invalid_cursor', 'cursor');
    const rest = items.filter(i => id(i) > (token?.last ?? '')).sort((a, b) => id(a).localeCompare(id(b)));
    const rows = rest.slice(0, Math.max(1, Math.min(200, input.limit)));
    const nextCursor = rest.length > rows.length ? `ref-${++seq}` : null;
    if (nextCursor) tokens.set(nextCursor, { key, last: id(rows[rows.length - 1]) });
    return { items: rows, nextCursor };
  }
  return {
    async listAxisOptions(input) {
      check(input.scopeId);
      if (input.axisId !== 'classification') throw new PortError('unknown_axis', 'axis');
      const values = input.parents?.parent ? (input.parents.parent.includes('P') ? ['A'] : []) : [...(sample.upperOptions ?? ['A', 'B'])];
      return page(input, JSON.stringify([input.scopeId, input.axisId, input.query, input.parents]), values.filter(id => id.toLowerCase().includes((input.query ?? '').toLowerCase())).map(id => ({ id, label: id })), i => i.id);
    },
    async searchEquipment(input) {
      check(input.scopeId);
      if (input.roomNames?.includes('DIFF')) throw new PortError('room_forbidden', 'room');
      for (const [axis, values] of Object.entries(input.condition ?? {})) {
        if (!values.length) throw new PortError('invalid_input', 'values');
        if (axis !== 'classification') throw new PortError('unknown_axis', 'axis');
      }
      const rows = sample.equipment.filter(e => e.equipmentId.includes(input.query ?? ''));
      return { ...page(input, JSON.stringify([input.scopeId, input.query]), rows, e => e.equipmentId), total: rows.length };
    },
    async resolveSelection(input) {
      check(input.scopeId);
      if (input.ids.some(id => typeof id !== 'string')) throw new PortError('invalid_input', 'ids');
      return { items: [...new Set(input.ids)].map(id => {
        const summary = sample.equipment.find(e => e.equipmentId === id);
        if (summary) return { id, status: 'ok' as const, summary };
        return { id, status: id === sample.deniedRoomId ? 'forbidden' as const : 'not_found' as const };
      }) };
    },
  };
}
