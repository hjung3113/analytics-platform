/** @ap/menu-clas — CLAS equipment operation time (#590). Synthetic sample contract; the real CLAS server owns the data. */
import { defineEndpoint } from '@ap/contracts';
import { PERMISSION } from './permission';

export const OPERATION_KINDS = ['process', 'transfer', 'wait'] as const;
export type OperationKind = typeof OPERATION_KINDS[number];
/** Operation time per equipment in minutes, largest first. */
export type OperationRankRow = { equipmentId: string; room: string; minutes: number };
/** One module lane of the shown equipment; `start`/`end` are wall-clock instants in ms. */
export type OperationLane = { id: string; label: string; segments: { id: string; start: number; end: number; kind: OperationKind }[] };
export type OperationTimeData = {
  ranking: OperationRankRow[];
  /** Equipment whose operation flow `lanes` shows: the requested one when it is in scope, else the top of `ranking`. */
  equipmentId: string | null;
  lanes: OperationLane[];
};

/** Prototype guard against unbounded analytics, same bound as the analytics sample menus. */
const MAX_QUERY_HOURS = 2160;

/** `eqp` is the page key; '' means "no equipment chosen". */
export const operationTimeEndpoint = defineEndpoint<{ eqp: string }, OperationTimeData>({
  id: 'clas.operationTime',
  menuId: 'operation-time',
  paramKeys: { eqp: true },
  permission: PERMISSION,
  requiresScope: true,
  context: { time: 'apply', roomNames: 'apply' },
  kinds: ['collection', 'coverage'],
  limits: { maxHours: MAX_QUERY_HOURS },
  mergeTimeDomain: true,
});
