/** Deterministic server-side synthetic averages and runs, never real equipment names or observations. */
import { formatDateTime, parseDateTime, type GlobalContext } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint, type Equipment } from '@ap/mock-server';
import {
  HW_TIME_MODULE_TYPES, HW_TIME_MOTION_COLOR_BY_ID, HW_TIME_OVERVIEW_MAX_ROWS, hwTimeOverview,
  type HwTimeMatrix, type HwTimeMatrixParams, type HwTimeMotionParams, type HwTimeMotionStats, type HwTimeRunParams, type HwTimeRuns, type HwTimeRunObservation,
} from '../endpoints';
import { htmBounds, judge, rollUp } from './htm';

const MAX_SYNTHETIC_EQUIPMENT = 24;
const SYNTHETIC_PER_EQUIPMENT = 3;
const RUNS_PER_EQUIPMENT = 24;
const SAMPLE_LIMIT = 400;
const WALL_CLOCK_SECOND_MS = 1_000;

/** Same population convention as hwTime.ts: only equipment resolved by applied Scope/Condition/Selection contributes. */
function syntheticEquipmentIds(equipment: readonly Equipment[]): string[] {
  const count = Math.min(MAX_SYNTHETIC_EQUIPMENT, equipment.length * SYNTHETIC_PER_EQUIPMENT);
  return Array.from({ length: count }, (_, i) => `EQ-${String(i + 1).padStart(3, '0')}`);
}

function validate(params: HwTimeMatrixParams & Partial<HwTimeRunParams>, drill: 'none' | 'module' | 'motion'): string | null {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === params.moduleType);
  if (!type) return 'moduleType must name a supported Module type';
  if (drill !== 'none' && !(type.modules as readonly unknown[]).includes(params.drillModule)) return 'drillModule must belong to moduleType';
  if (drill === 'motion' && !(type.motions as readonly unknown[]).includes(params.drillMotion)) return 'drillMotion must belong to moduleType';
  return null;
}

/** Caption: LK demonstrates future Recipe-split HTM judgement (over and weaker under); other types remain Recipe-unsplit. */
function runValues(equipmentId: string, params: HwTimeRunParams): number[] {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === params.moduleType)!;
  const motionIndex = (type.motions as readonly string[]).indexOf(params.drillMotion);
  const moduleIndex = (type.modules as readonly string[]).indexOf(params.drillModule);
  const equipmentNumber = Number(equipmentId.slice('EQ-'.length));
  const bounds = htmBounds(params.moduleType, params.drillMotion);
  return Array.from({ length: RUNS_PER_EQUIPMENT }, (_, run) => {
    const jitter = ((equipmentNumber * 7 + moduleIndex * 11 + motionIndex * 3 + run * 5) % 17) / 100;
    if (!bounds) return 2 + moduleIndex * 0.7 + motionIndex * 0.5 + equipmentNumber * 0.08 + jitter;
    // The smallest excursions that still move the all-equipment Motion averages out of bound (one row in three): a piece stays
    // readable beside its neighbours instead of one stretched piece next to a vanished one.
    // Spread over the upper bound (+1.36 … +5.04 s) instead of one stacked value: each run takes a distinct step of a per-equipment
    // permutation of 0…23 (5 is coprime with 24), so the mean excursion, the averages and every judgement stay as before.
    if (equipmentNumber % 3 === 0 && motionIndex === 0) return bounds.upper + 3.2 + (((run * 5 + equipmentNumber) % RUNS_PER_EQUIPMENT) - (RUNS_PER_EQUIPMENT - 1) / 2) * 0.16 + jitter;
    if (equipmentNumber % 3 === 0 && motionIndex === 1) return bounds.lower - 0.6 - jitter;
    if (run === 0 && equipmentNumber % 2 === 0) return bounds.upper + 0.5 + jitter;
    if (run === 1 && equipmentNumber % 2 === 0) return bounds.lower - 0.5 - jitter;
    return bounds.lower + 0.1 + jitter + moduleIndex * 0.1;
  });
}

function motionAverage(ids: readonly string[], params: HwTimeRunParams) {
  const values = ids.flatMap(id => runValues(id, params));
  const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  return judge(params.moduleType, params.drillMotion, average);
}

function matrix(ids: string[], params: HwTimeMatrixParams): HwTimeMatrix {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === params.moduleType)!;
  return {
    equipment: ids, modules: [...type.modules],
    motions: type.motions.map(id => ({ id, color: HW_TIME_MOTION_COLOR_BY_ID[id]! })),
    cells: ids.flatMap(equipmentId => type.modules.map(moduleId => {
      const motions = Object.fromEntries(type.motions.map(motion => [motion, motionAverage([equipmentId], { ...params, drillModule: moduleId, drillMotion: motion })]));
      const values = Object.values(motions);
      const total = values.some(j => j.value === null) ? null : values.reduce((sum, j) => sum + j.value!, 0);
      return { equipmentId, moduleId, motions, module: rollUp(total, values) };
    })),
    limits: { maxRows: HW_TIME_OVERVIEW_MAX_ROWS },
  };
}

function motionStats(ids: string[], params: HwTimeMotionParams): HwTimeMotionStats {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === params.moduleType)!;
  return { rows: ids.length ? type.motions.map(motion => ({ motion, judgement: motionAverage(ids, { ...params, drillMotion: motion }) })) : [] };
}

/** Daily means come from all observations, never the biased outlier-preserving scatter sample. */
function dailyMeans(points: readonly HwTimeRunObservation[], params: HwTimeRunParams): HwTimeRunObservation[] {
  const days = new Map<string, HwTimeRunObservation[]>();
  for (const point of points) {
    const key = `${point.equipmentId}.${point.at.slice(0, 10)}`;
    const group = days.get(key) ?? [];
    group.push(point); days.set(key, group);
  }
  return [...days.entries()].map(([id, group]) => {
    const first = group[0]!;
    const motions = Object.fromEntries(Object.keys(first.motions).map(motion => {
      const mean = group.reduce((sum, point) => sum + point.motions[motion]!.value!, 0) / group.length;
      return [motion, judge(params.moduleType, motion, mean)];
    }));
    const judgement = motions[params.drillMotion]!;
    const values = Object.values(motions);
    return { id, equipmentId: first.equipmentId, moduleId: first.moduleId, motion: params.drillMotion,
      at: `${first.at.slice(0, 10)}T00:00:00`, seconds: judgement.value!, judgement, motions,
      module: rollUp(values.reduce((sum, j) => sum + j.value!, 0), values) };
  });
}

/** Server sample retains outliers of every aligned Motion, so Module roll-up outliers also survive local value changes. */
export function overviewRuns(ids: readonly string[], params: HwTimeRunParams, context: GlobalContext, { sample }: { sample: boolean }): HwTimeRuns {
  const bounds = htmBounds(params.moduleType, params.drillMotion);
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === params.moduleType)!;
  const from = parseDateTime(context.from!, 'from').getTime();
  const span = parseDateTime(context.to!, 'to').getTime() - from;
  const points: HwTimeRunObservation[] = ids.flatMap(equipmentId => {
    const vectors = type.motions.map(motion => ({ motion, values: runValues(equipmentId, { ...params, drillMotion: motion }) }));
    return Array.from({ length: RUNS_PER_EQUIPMENT }, (_, run) => {
      const motions = Object.fromEntries(vectors.map(({ motion, values }) => [motion, judge(params.moduleType, motion, values[run]!)]));
      const judgement = motions[params.drillMotion]!;
      const values = Object.values(motions);
      return {
        id: `${equipmentId}.${params.drillModule}.${params.drillMotion}.${run}`, equipmentId, moduleId: params.drillModule,
        motion: params.drillMotion, seconds: judgement.value!, judgement, motions,
        module: rollUp(values.reduce((sum, j) => sum + j.value!, 0), values),
        at: formatDateTime(new Date(from + Math.floor(span * (run + 0.5) / RUNS_PER_EQUIPMENT / WALL_CLOCK_SECOND_MS) * WALL_CLOCK_SECOND_MS)),
      };
    });
  });
  const outside = (point: HwTimeRunObservation) => Object.values(point.motions).some(j => j.status === 'over' || j.status === 'under');
  const mandatory = points.filter(outside);
  // The bounded synthetic source guarantees <= 400 outliers; refuse rather than silently lose any if that invariant changes.
  if (mandatory.length > SAMPLE_LIMIT) throw new Error('Synthetic outliers exceed the sample budget');
  let shown = points;
  if (sample && points.length > SAMPLE_LIMIT) {
    const normal = points.filter(point => !outside(point));
    const slots = SAMPLE_LIMIT - mandatory.length;
    const picked = new Set(mandatory.map(point => point.id));
    for (let i = 0; i < slots; i++) picked.add(normal[Math.floor(i * normal.length / slots)]!.id);
    shown = points.filter(point => picked.has(point.id));
  }
  return { points: shown, daily: dailyMeans(points, params), shown: shown.length, total: points.length,
    bounds: ids.map(equipmentId => ({ equipmentId, moduleId: params.drillModule, motion: params.drillMotion, lower: bounds?.lower ?? null, upper: bounds?.upper ?? null })) };
}

export const hwTimeOverviewMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(hwTimeOverview.matrix, {
    validate: ({ params }) => validate(params, 'none'),
    handle: ({ params, equipment }) => matrix(syntheticEquipmentIds(equipment), params),
    isEmpty: data => data.cells.length === 0,
  }),
  defineMockEndpoint(hwTimeOverview.motionStats, {
    validate: ({ params }) => validate(params, 'module'),
    handle: ({ params, equipment }) => motionStats(syntheticEquipmentIds(equipment), params),
    isEmpty: data => data.rows.length === 0,
  }),
  defineMockEndpoint(hwTimeOverview.runs, {
    validate: ({ params }) => validate(params, 'motion'),
    handle: ({ params, context, equipment }) => overviewRuns(syntheticEquipmentIds(equipment), params, context, { sample: true }),
    isEmpty: data => data.points.length === 0,
  }),
];
