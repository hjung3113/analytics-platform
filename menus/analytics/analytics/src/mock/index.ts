/**
 * Mock server half of the productivity-overview endpoints (#114). The app composition root
 * registers this list via `@ap/menu-analytics/mock` → `createMockAdapter({ endpoints, registry })`;
 * pages never import this module. Handlers reproduce the previous page-side compute,
 * `isEmpty` and `metricVersion` exactly — only the data path changed, not the numbers.
 */
import { shift } from '@ap/contracts';
import { defineMockEndpoint, periodHours, type AnyMockEndpoint } from '@ap/mock-server';
import {
  METRIC_VERSIONS, attentionEndpoint, breakdownEndpoint, drillEndpoint, kpisEndpoint, trendEndpoint,
  type DrillData, type KpisData, type TrendData,
} from '../endpoints';
import { attentionRows, computeKpis, drillEquipmentRows, drillStgroupRows, occupancyBreakdown, trendBuckets } from './productivity';
import { executionOccurrence } from './execution';
import { cycleMock } from './cycle';

/** Kernel period gate makes a null period unreachable; degrade to empty data instead of crashing a raw engine call. */
const EMPTY_KPIS: KpisData = {
  current: { equipmentCount: 0, knownBuckets: 0, occupancy: null, dwell: null, cycle: { jobs: 0, p50: null, p95: null }, throughput: { jobs: 0, started: 0 } },
  previous: null,
};

export const analyticsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(kpisEndpoint, {
    handle: ({ equipment, context }): KpisData => {
      const { from, to } = context;
      if (from === null || to === null) return EMPTY_KPIS;
      const hours = periodHours(context);
      return {
        current: computeKpis(equipment, from, to),
        previous: hours !== null ? computeKpis(equipment, shift(from, -hours), from) : null,
      };
    },
    isEmpty: d => d.current.equipmentCount === 0 || d.current.knownBuckets === 0,
    metricVersion: () => `occupancy v${METRIC_VERSIONS.occupancy} · dwell v${METRIC_VERSIONS.dwell} · cycleTime v${METRIC_VERSIONS.cycleTime} · throughput v${METRIC_VERSIONS.throughput}`,
  }),
  defineMockEndpoint(trendEndpoint, {
    handle: ({ equipment, context, params }): TrendData => {
      const { from, to } = context;
      if (from === null || to === null) return { equipmentCount: equipment.length, current: [], previous: [] };
      const hours = periodHours(context);
      return {
        equipmentCount: equipment.length,
        current: trendBuckets(equipment, from, to, params.granularity),
        previous: hours !== null ? trendBuckets(equipment, shift(from, -hours), from, params.granularity) : [],
      };
    },
    isEmpty: d => d.equipmentCount === 0 || d.current.length === 0 || d.current.every(b => !b.known),
    metricVersion: ({ params }) => (Object.hasOwn(METRIC_VERSIONS, params.kpi) ? METRIC_VERSIONS[params.kpi] : undefined),
  }),
  defineMockEndpoint(breakdownEndpoint, {
    handle: ({ equipment, context, params }) => {
      const { from, to } = context;
      if (from === null || to === null) return [];
      return occupancyBreakdown(equipment, from, to, params.axis);
    },
    isEmpty: rows => rows.length === 0,
    metricVersion: () => METRIC_VERSIONS.occupancy,
  }),
  defineMockEndpoint(drillEndpoint, {
    handle: ({ equipment, context, params }): DrillData => {
      const inRoom = equipment.filter(row => row.room === params.room);
      const { from, to } = context;
      if (from === null || to === null || inRoom.length === 0) {
        return { roomFound: inRoom.length > 0, stgroupFound: false, kpi: EMPTY_KPIS.current, stgroups: [], equipment: [] };
      }
      if (params.level === 'stgroup') {
        return {
          roomFound: true,
          stgroupFound: false,
          kpi: computeKpis(inRoom, from, to),
          stgroups: drillStgroupRows(inRoom, from, to),
          equipment: [],
        };
      }
      const inGroup = inRoom.filter(row => row.stgroup === params.stgroup);
      if (inGroup.length === 0) {
        return { roomFound: true, stgroupFound: false, kpi: EMPTY_KPIS.current, stgroups: [], equipment: [] };
      }
      return {
        roomFound: true,
        stgroupFound: true,
        kpi: computeKpis(inGroup, from, to),
        stgroups: [],
        equipment: drillEquipmentRows(inGroup, from, to),
      };
    },
    // A miss stays ok so the page can show "없는 값" instead of the generic empty state.
    isEmpty: () => false,
    metricVersion: () => METRIC_VERSIONS.occupancy,
    validate: ({ params }) => {
      if (params.level !== 'stgroup' && params.level !== 'equipment') return 'level must be stgroup or equipment';
      if (typeof params.room !== 'string' || typeof params.stgroup !== 'string') return 'room and stgroup must be strings';
      return null;
    },
  }),
  defineMockEndpoint(attentionEndpoint, {
    handle: ({ equipment, context }) => {
      const { from, to } = context;
      if (from === null || to === null) return [];
      return attentionRows(equipment, from, to);
    },
    isEmpty: rows => rows.length === 0,
    metricVersion: () => `dwell v${METRIC_VERSIONS.dwell} · cycleTime v${METRIC_VERSIONS.cycleTime}`,
  }),
  executionOccurrence,
  ...cycleMock,
];
