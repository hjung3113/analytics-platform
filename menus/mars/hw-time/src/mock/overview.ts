/** Deterministic server-side synthetic averages and runs, never real equipment names or observations. */
import { formatDateTime, normalizeSet, parseDateTime, type GlobalContext } from '@ap/contracts';
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import {
  HW_TIME_MODULE_TYPES, HW_TIME_MOTION_COLOR_BY_ID, HW_TIME_OVERVIEW_MAX_ROWS, hwTimeOverview, verdictCodec, validPanelDate,
  type HwTimeDistribution, type HwTimeMatrix, type HwTimeMatrixParams, type HwTimeMotionParams, type HwTimeMotionStats, type HwTimeRunParams, type HwTimeRuns, type HwTimeRunObservation,
} from '../endpoints';
import { htmBounds, judge, rollUp } from './htm';
import { syntheticEquipmentIds, syntheticUpperTail } from './syntheticEquipment';

const RUNS_PER_EQUIPMENT = 24;
const SAMPLE_LIMIT = 400;
const WALL_CLOCK_SECOND_MS = 1_000;
/** Fixed server bin width in seconds, anchored at multiples of a quarter second. */
const DISTRIBUTION_BIN_WIDTH = 0.25;
/** Six seeded uniforms give the central population a bell-like spread inside the HTM band. */
const SPREAD_SAMPLES = 6;
const BAND_CENTRE = 0.48;
const BAND_SPREAD = 0.24;
const UNDER_EQUIPMENT = 6;
const UNDER_WARMUP_RUNS = 2;
/** Stable row/column offsets in HTM-band fractions; ordinary observations stay inside the bounds. */
const EQUIPMENT_OFFSET_STEP = 0.07;
const EQUIPMENT_OFFSET_PERIOD = 5;
const MODULE_OFFSET_STEP = 0.06;
const NEAR_LIMIT_EQUIPMENT = [5, 18];
const NEAR_LIMIT_CENTRE = 0.88;
const MIN_BAND_POSITION = 0.04;
const MAX_BAND_POSITION = 0.96;
/** Two isolated observations per full population, beyond the ordinary near-bound tail. */
const RARE_TAIL_EQUIPMENT_INTERVAL = 12;

/** MurmurHash3's 32-bit finalizer, scaled to [0, 1); no ambient random state. */
function seededUnit(seed: number): number {
  let hash = Math.imul(seed ^ (seed >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return ((hash ^ (hash >>> 16)) >>> 0) / 0x100000000;
}

function validate(params: HwTimeMatrixParams & Partial<HwTimeRunParams>, drill: 'none' | 'module' | 'motion', context?: GlobalContext): string | null {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === params.moduleType);
  if (!type) return 'moduleType must name a supported Module type';
  if (drill === 'motion' && !(type.motions as readonly unknown[]).includes(params.drillMotion)) return 'drillMotion must belong to moduleType';
  if (drill !== 'none' && !(type.modules as readonly unknown[]).includes(params.drillModule)) return 'drillModule must belong to moduleType';
  if (params.verdict !== undefined && !verdictCodec.decode(params.verdict)) return 'Invalid verdict';
  if (params.date !== undefined && !validPanelDate(params.date, context?.from, context?.to)) return 'Invalid date';
  return null;
}

/** Caption: LK demonstrates future Recipe-split HTM judgement (over and weaker under); other types remain Recipe-unsplit. */
function runValues(equipmentId: string, params: HwTimeRunParams): number[] {
  const type = HW_TIME_MODULE_TYPES.find(t => t.id === params.moduleType)!;
  const motionIndex = (type.motions as readonly string[]).indexOf(params.drillMotion);
  const moduleIndex = (type.modules as readonly string[]).indexOf(params.drillModule);
  const equipmentNumber = Number(equipmentId.match(/\d+$/)?.[0]);
  const bounds = htmBounds(params.moduleType, params.drillMotion);
  return Array.from({ length: RUNS_PER_EQUIPMENT }, (_, run) => {
    const jitter = ((equipmentNumber * 7 + moduleIndex * 11 + motionIndex * 3 + run * 5) % 17) / 100;
    if (!bounds) return 2 + moduleIndex * 0.7 + motionIndex * 0.5 + equipmentNumber * 0.08 + jitter;
    if (run === RUNS_PER_EQUIPMENT - 1 && equipmentNumber % RARE_TAIL_EQUIPMENT_INTERVAL === 0) return bounds.upper + 2 + jitter;
    // Deterministic Module-Motion tail: means, runs, daily means and distribution use the same observations.
    if (syntheticUpperTail(equipmentNumber, moduleIndex, motionIndex)) return bounds.upper + 0.25 + jitter;
    if (equipmentNumber === UNDER_EQUIPMENT) return run < UNDER_WARMUP_RUNS ? bounds.lower + 0.1 + jitter : bounds.lower - 0.25 - jitter;
    if (run === 0 && equipmentNumber % 2 === 0) return bounds.upper + 0.5 + jitter;
    if (run === 1 && equipmentNumber % 2 === 0) return bounds.lower - 0.5 - jitter;
    const seed = ((equipmentNumber * type.modules.length + moduleIndex) * type.motions.length + motionIndex) * RUNS_PER_EQUIPMENT + run;
    let spread = 0;
    for (let i = 0; i < SPREAD_SAMPLES; i++) spread += seededUnit(seed * SPREAD_SAMPLES + i);
    const equipmentOffset = ((equipmentNumber - 1) % EQUIPMENT_OFFSET_PERIOD - (EQUIPMENT_OFFSET_PERIOD - 1) / 2) * EQUIPMENT_OFFSET_STEP;
    const moduleOffset = (moduleIndex - (type.modules.length - 1) / 2) * MODULE_OFFSET_STEP;
    const centre = NEAR_LIMIT_EQUIPMENT.includes(equipmentNumber) ? NEAR_LIMIT_CENTRE : BAND_CENTRE;
    const position = centre + equipmentOffset + moduleOffset + (spread - SPREAD_SAMPLES / 2) * BAND_SPREAD;
    return bounds.lower + (bounds.upper - bounds.lower) * Math.max(MIN_BAND_POSITION, Math.min(MAX_BAND_POSITION, position));
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
  const source: HwTimeRunObservation[] = ids.flatMap(equipmentId => {
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
  const points = source.filter(point => (!params.verdict || point.judgement.status === params.verdict) && (!params.date || point.at.slice(0, 10) === params.date));
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

function distribution(ids: readonly string[], params: HwTimeRunParams, context: GlobalContext): HwTimeDistribution {
  const full = overviewRuns(ids, params, context, { sample: false });
  // Same Motion criteria as motionStats/judge; synthetic bounds do not vary by equipment.
  const criteria = htmBounds(params.moduleType, params.drillMotion);
  const counts = new Map<number, number>();
  for (const point of full.points) {
    const index = Math.floor(point.seconds / DISTRIBUTION_BIN_WIDTH);
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  const indices = [...counts.keys()];
  const bins: HwTimeDistribution['bins'] = [];
  if (indices.length) {
    for (let index = Math.min(...indices); index <= Math.max(...indices); index++) {
      bins.push({ start: index * DISTRIBUTION_BIN_WIDTH, end: (index + 1) * DISTRIBUTION_BIN_WIDTH, count: counts.get(index) ?? 0 });
    }
  }
  return { bins, total: full.total, equipment: ids.length, bounds: { lower: criteria?.lower ?? null, upper: criteria?.upper ?? null } };
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
    validate: ({ params, context }) => {
      const { equipmentId } = params;
      if (equipmentId !== undefined) {
        if (typeof equipmentId !== 'string') return 'Invalid equipmentId';
        try {
          normalizeSet([equipmentId], 'equipmentId');
        } catch {
          return 'Invalid equipmentId';
        }
        // The shared server checks access and answers explicit empty intersections before reading data.
        if (context.selection?.length !== 0 && (context.selection?.length !== 1 || context.selection[0] !== equipmentId)) {
          return 'equipmentId must match the single selected equipment';
        }
      }
      return validate(params, 'motion', context);
    },
    handle: ({ params, context, equipment }) => {
      const ids = params.equipmentId === undefined ? syntheticEquipmentIds(equipment)
        : equipment.filter(item => item.equipmentId === params.equipmentId).map(item => item.equipmentId);
      return overviewRuns(ids, params, context, { sample: true });
    },
    isEmpty: data => data.points.length === 0,
  }),
  defineMockEndpoint(hwTimeOverview.distribution, {
    validate: ({ params, context }) => validate(params, 'motion', context),
    handle: ({ params, context, equipment }) => distribution(syntheticEquipmentIds(equipment), params, context),
    isEmpty: data => data.total === 0,
  }),
];
