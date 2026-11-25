/** @ap/menu-clas — CLAS equipment operation time (#590). Synthetic sample contract; the real CLAS server owns the data. */
import { defineEndpoint, periodFromDates, wallClockEpochMs, type GlobalContext } from '@ap/contracts';
import { PERMISSION } from './permission';

export const OPERATION_KINDS = ['process', 'transfer', 'wait'] as const;
export type OperationKind = typeof OPERATION_KINDS[number];
/** Operation time per equipment in minutes, largest first. */
export type OperationRankRow = { equipmentId: string; room: string; minutes: number };
/** One module lane of the shown equipment; `start`/`end` are wall-clock instants in ms. */
export type OperationLane = { id: string; label: string; segments: { id: string; start: number; end: number; kind: OperationKind }[] };
export type OperationTimeData = {
  ranking: OperationRankRow[];
  /** Equipment whose operation flow `lanes` shows: the requested one when it is in scope, the top of `ranking` when none was requested, else null. */
  equipmentId: string | null;
  /** The requested `eqp` that is not in the current Scope and room conditions. It is never replaced by another equipment: `lanes` is empty and the page says so. */
  missingEquipment: string | null;
  /** The shown equipment's own row when it ranks below the `ranking` cap (not in `ranking`); otherwise absent. Its value is real, never invented. */
  equipmentRow?: OperationRankRow;
  lanes: OperationLane[];
};

/** Prototype guard against unbounded analytics, same bound as the analytics sample menus. */
const MAX_QUERY_HOURS = 2160;

type OperationPeriod = { from: string; to: string };
type AppliedPeriod = Pick<GlobalContext, 'from' | 'to'>;
const MONTH_DAY = /^\d{2}-\d{2}$/;
const MIDNIGHT = 'T00:00:00';
const FULL_DATE = /^\d{4}-\d{2}-\d{2}$/;

function withinAppliedPeriod(range: OperationPeriod, applied: AppliedPeriod): boolean {
  return applied.from !== null && applied.to !== null && applied.from <= range.from && range.from < range.to && range.to <= applied.to;
}

/** Resolve inclusive HW Time category labels to a whole-day wall-clock query interval. */
export function resolveOperationDays(days: OperationPeriod, applied: AppliedPeriod): OperationPeriod | null {
  const dayLike = (value: string) => MONTH_DAY.test(value) || FULL_DATE.test(value);
  if (!applied.from || !applied.to || !dayLike(days.from) || !dayLike(days.to)) return null;
  // Start with the applied start year. A query spanning New Year can also contain dates in its end year.
  const years = new Set([applied.from.slice(0, 4), applied.to.slice(0, 4)]);
  const resolveDay = (monthDay: string) => {
    // A dated range (a lent chart's output carried by a link, #2763) names its year.
    if (FULL_DATE.test(monthDay)) {
      const day = periodFromDates({ start: monthDay, end: monthDay });
      return day && withinAppliedPeriod(day, applied) ? day : null;
    }
    for (const year of years) {
      const date = `${year}-${monthDay}`;
      const day = periodFromDates({ start: date, end: date });
      if (day && withinAppliedPeriod(day, applied)) return day;
    }
    return null;
  };
  const start = resolveDay(days.from);
  const end = resolveDay(days.to);
  return start && end && start.from < end.to ? { from: start.from, to: end.to } : null;
}

/** Recheck the optional request interval at the mock boundary and when labeling an accepted result. */
export function readOperationDays(value: unknown, applied: AppliedPeriod): OperationPeriod | null {
  if (typeof value !== 'string' || value === '') return null;
  const [from, to, extra] = value.split('/');
  if (extra !== undefined || !from?.endsWith(MIDNIGHT) || !to?.endsWith(MIDNIGHT)) return null;
  if (wallClockEpochMs(from) === null || wallClockEpochMs(to) === null) return null;
  const range = { from, to };
  return withinAppliedPeriod(range, applied) ? range : null;
}

/** `eqp` is the page key; '' means "no equipment chosen". `days` is an optional half-open wall-clock interval, with '' for no narrowing. */
export const operationTimeEndpoint = defineEndpoint<{ eqp: string; days?: string }, OperationTimeData>({
  id: 'clas.operationTime',
  menuId: 'operation-time',
  paramKeys: { eqp: true, days: true },
  permission: PERMISSION,
  requiresScope: true,
  context: { time: 'apply', roomNames: 'apply' },
  kinds: ['collection', 'coverage'],
  limits: { maxHours: MAX_QUERY_HOURS },
  mergeTimeDomain: true,
});
