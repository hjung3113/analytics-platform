/** Mock server half of the CLAS endpoints (@ap/menu-clas, #126). The app composition
 * root registers this list via '@ap/menu-clas/mock' → createMockAdapter({ endpoints, registry });
 * pages never import this module. */
import { parseDateTime } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { OPERATION_KINDS, operationTimeEndpoint, type OperationLane, type OperationTimeData } from '../endpoints';

const MODULES = ['LL1', 'TM', 'CH1', 'CH2', 'CH3', 'LL2'];
const RANK_LIMIT = 30;
const SEGMENTS_PER_LANE = 12;

/** Stable small hash so a given equipment always gets the same synthetic numbers. */
function seed(text: string): number {
  let h = 7;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return h;
}

export const operationTimeMock = defineMockEndpoint(operationTimeEndpoint, {
  handle: ({ context, equipment, params }): OperationTimeData => {
    const empty: OperationTimeData = { ranking: [], equipmentId: null, missingEquipment: null, lanes: [] };
    if (context.from === null || context.to === null || equipment.length === 0) return empty;
    const start = parseDateTime(context.from, 'from').getTime();
    const duration = parseDateTime(context.to, 'to').getTime() - start;
    if (duration <= 0) return empty;
    const hours = duration / 3_600_000;
    const all = equipment
      .map(row => ({ equipmentId: row.equipmentId, room: row.room, minutes: Math.round(hours * (18 + seed(row.equipmentId) % 37)) }))
      .sort((a, b) => b.minutes - a.minutes || a.equipmentId.localeCompare(b.equipmentId));
    const ranking = all.slice(0, RANK_LIMIT);
    // A requested equipment outside the conditions is reported, not replaced (kernel §6: no automatic substitute). No request (`''`) is the only case that picks the top of the ranking.
    if (params.eqp !== '' && !equipment.some(row => row.equipmentId === params.eqp)) return { ranking, equipmentId: null, missingEquipment: params.eqp, lanes: [] };
    const shown = params.eqp === '' ? ranking[0].equipmentId : params.eqp;
    const base = seed(shown);
    const slot = duration / SEGMENTS_PER_LANE;
    const lanes: OperationLane[] = MODULES.map((module, m) => ({
      id: module, label: module,
      segments: Array.from({ length: SEGMENTS_PER_LANE }, (_, j) => {
        const offset = ((base + m * 13 + j * 7) % 40) / 100;
        const length = 0.35 + ((base + m * 5 + j * 11) % 50) / 100;
        return { id: `${module}-${j}`, start: start + slot * (j + offset), end: start + slot * Math.min(j + offset + length, j + 1), kind: OPERATION_KINDS[(base + m + j) % 3] };
      }),
    }));
    const below = ranking.some(row => row.equipmentId === shown) ? undefined : all.find(row => row.equipmentId === shown);
    return { ranking, equipmentId: shown, missingEquipment: null, ...(below ? { equipmentRow: below } : {}), lanes };
  },
  isEmpty: data => data.ranking.length === 0,
  metricVersion: () => 'synthetic v1',
});

export const clasMock: readonly AnyMockEndpoint[] = [operationTimeMock];
