import type { GlobalContext } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint, type Equipment } from '@ap/mock-server';
import { HW_TIME_MODULE_TYPES, hwTimeOverview, type HwTimeBoundHistoryEvent, type HwTimeEquipmentDays, type HwTimePanelParams } from '../endpoints';
import { syntheticEquipmentIds } from './syntheticEquipment';
import { rollUp } from './htm';
import { overviewRuns } from './overview';

function validate(params: HwTimePanelParams): string | null {
  const type = HW_TIME_MODULE_TYPES.find(type => type.id === params.moduleType);
  if (params.moduleType !== undefined && !type) return 'Unknown Module type';
  if (params.drillMotion && !type?.motions.some(id => id === params.drillMotion)) return 'Unknown Motion';
  if (params.drillModule && !type?.modules.some(id => id === params.drillModule)) return 'Unknown Module';
  return null;
}
export function equipmentDays(equipment: readonly Equipment[], params: HwTimePanelParams, context: GlobalContext): HwTimeEquipmentDays {
  const ids = syntheticEquipmentIds(equipment);
  const groups = new Map<string, { equipmentId: string; date: string; judgements: import('../endpoints').HtmJudgement[] }>();
  for (const type of HW_TIME_MODULE_TYPES.filter(type => !params.moduleType || type.id === params.moduleType)) {
    for (const module of type.modules.filter(id => !params.drillModule || id === params.drillModule)) {
      const motion = params.drillMotion ?? type.motions[0];
      const data = overviewRuns(ids, { moduleType: type.id, drillModule: module, drillMotion: motion }, context, { sample: false });
      for (const point of data.daily) {
        const date = point.at.slice(0, 10), key = `${point.equipmentId}/${date}`;
        const group = groups.get(key) ?? { equipmentId: point.equipmentId, date, judgements: [] };
        group.judgements.push(params.drillMotion ? point.judgement : point.module);
        groups.set(key, group);
      }
    }
  }
  return { rows: [...groups.values()].map(({ equipmentId, date, judgements }) => {
    const value = judgements.some(judgement => judgement.value === null) ? null : judgements.reduce((sum, judgement) => sum + judgement.value!, 0) / judgements.length;
    return { equipmentId, date, judgement: rollUp(value, judgements) };
  }) };
}
/** Mock history lives behind the same permission/Scope/Context endpoint gate as the other panels. */
function history(params: HwTimePanelParams, context: GlobalContext): HwTimeBoundHistoryEvent[] {
  return [{ id: 'synthetic-htm-bound-change', at: `${context.from}Z`, actor: 'synthetic-engineer', action: 'update', source: 'user',
    actorName: { ko: '합성 작업자', en: 'Synthetic engineer' },
    target: { type: 'htm-bound', id: [params.moduleType, params.drillModule, params.drillMotion].filter(Boolean).join('/') || 'HTM', scopeId: context.scopeId },
    changes: { upper: ['6', '7'], lower: ['1', '2'] } }];
}
export const hwTimeNewPanelMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(hwTimeOverview.equipmentDays, { validate: ({ params }) => validate(params),
    handle: ({ equipment, params, context }) => equipmentDays(equipment, params, context), isEmpty: data => data.rows.length === 0 }),
  defineMockEndpoint(hwTimeOverview.boundHistory, { validate: ({ params }) => validate(params),
    handle: ({ equipment, params, context }) => equipment.length ? history(params, context) : [], isEmpty: data => data.length === 0 }),
];
