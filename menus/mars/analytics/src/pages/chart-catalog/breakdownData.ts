import { formatText } from '@ap/kernel';
import { ANALYTICS_MESSAGES } from '../../messages';
import type { LegendTreeNode } from '@ap/components';
import type { ThemeColorToken } from '@ap/ui/theme';

type Label = { ko: string; en: string };
export type StateId = 'run' | 'idle' | 'stop';
export const STATES: readonly { id: StateId; label: Label; color: ThemeColorToken }[] = [
  { id: 'run', label: ANALYTICS_MESSAGES.breakdownDataRunning, color: 'chart-series-1' },
  { id: 'idle', label: ANALYTICS_MESSAGES.breakdownDataIdle, color: 'chart-series-2' },
  { id: 'stop', label: ANALYTICS_MESSAGES.breakdownDataStopped, color: 'chart-series-3' },
];
type Minutes = Record<StateId, number>;
export type ShiftId = 'day' | 'swing' | 'night';
export const SHIFTS: readonly { id: ShiftId; label: Label; color: ThemeColorToken }[] = [
  { id: 'day', label: ANALYTICS_MESSAGES.breakdownDataDayUtilization, color: 'chart-series-4' },
  { id: 'swing', label: ANALYTICS_MESSAGES.breakdownDataSwingUtilization, color: 'chart-blue' },
  { id: 'night', label: ANALYTICS_MESSAGES.breakdownDataNightUtilization, color: 'chart-series-3' },
];
/** Utilization of a shift is productive time over planned time. The planned time differs per shift and place, so the ratios cannot be added or averaged. */
type Rate = { num: number; den: number };
type Rates = Record<ShiftId, Rate>;
type Measures = { minutes: Minutes; rates: Rates };
type Place = { id: string; label: Label; children?: Place[]; measures?: Measures };

export const ROOT_PLACE = 'loc';
/** Uneven depth on purpose: 전체 → 그룹 A → 라인 A1 → 공정 A1a/A1b, but 전체 → 그룹 B → 라인 B1 stops there. Synthetic ids and numbers. */
const leaf = (id: string, label: Label, minutes: Minutes, day: [number, number], swing: [number, number], night: [number, number]): Place => ({
  id, label, measures: { minutes, rates: { day: { num: day[0], den: day[1] }, swing: { num: swing[0], den: swing[1] }, night: { num: night[0], den: night[1] } } },
});
const PLACES: Place = { id: ROOT_PLACE, label: ANALYTICS_MESSAGES.breakdownDataAll, children: [
  { id: 'A', label: ANALYTICS_MESSAGES.breakdownDataGroupA, children: [
    { id: 'A1', label: ANALYTICS_MESSAGES.breakdownDataLineA1, children: [
      leaf('A1a', ANALYTICS_MESSAGES.breakdownDataProcessA1a, { run: 620, idle: 180, stop: 40 }, [520, 600], [430, 540], [300, 480]),
      leaf('A1b', ANALYTICS_MESSAGES.breakdownDataProcessA1b, { run: 540, idle: 240, stop: 90 }, [450, 600], [330, 420], [240, 360]),
    ] },
  ] },
  { id: 'B', label: ANALYTICS_MESSAGES.breakdownDataGroupB, children: [
    leaf('B1', ANALYTICS_MESSAGES.breakdownDataLineB1, { run: 700, idle: 120, stop: 20 }, [560, 600], [380, 480], [200, 240]),
  ] },
  { id: 'C', label: ANALYTICS_MESSAGES.breakdownDataGroupC, children: [
    leaf('C1', ANALYTICS_MESSAGES.breakdownDataLineC1, { run: 410, idle: 260, stop: 150 }, [300, 480], [260, 600], [150, 360]),
  ] },
  { id: 'D', label: ANALYTICS_MESSAGES.breakdownDataGroupD, children: [
    leaf('D1', ANALYTICS_MESSAGES.breakdownDataLineD1, { run: 150, idle: 90, stop: 310 }, [120, 360], [90, 240], [40, 300]),
  ] },
  { id: 'E', label: ANALYTICS_MESSAGES.breakdownDataGroupE, children: [
    leaf('E1', ANALYTICS_MESSAGES.breakdownDataLineE1, { run: 480, idle: 140, stop: 60 }, [400, 540], [300, 420], [180, 300]),
  ] },
] };

function find(place: Place, id: string): Place | null {
  return placePath(id, place)?.at(-1) ?? null;
}
function placePath(id: string, place: Place = PLACES): Place[] | null {
  if (place.id === id) return [place];
  for (const child of place.children ?? []) { const hit = placePath(id, child); if (hit) return [place, ...hit]; }
  return null;
}
export function isPlaceId(value: unknown): value is string {
  return typeof value === 'string' && find(PLACES, value) !== null;
}
/** Ids from the root down to the node, or empty for an unknown id. */
export function placeIdPath(id: string): string[] {
  return placePath(id)?.map(place => place.id) ?? [];
}
const STATE_IDS = STATES.map(state => state.id);
const SHIFT_IDS = SHIFTS.map(shift => shift.id);
function measure(place: Place): Measures {
  if (place.measures) return place.measures;
  const total: Measures = { minutes: { run: 0, idle: 0, stop: 0 }, rates: { day: { num: 0, den: 0 }, swing: { num: 0, den: 0 }, night: { num: 0, den: 0 } } };
  for (const child of place.children ?? []) {
    const part = measure(child);
    for (const id of STATE_IDS) total.minutes[id] += part.minutes[id];
    for (const id of SHIFT_IDS) { total.rates[id].num += part.rates[id].num; total.rates[id].den += part.rates[id].den; }
  }
  return total;
}
/** The first `weight` share of a measure; numerators and denominators are scaled alike. */
function scale(base: Measures, weight: number): Measures {
  const cut = (value: number) => Math.round(value * weight);
  return {
    minutes: { run: cut(base.minutes.run), idle: cut(base.minutes.idle), stop: cut(base.minutes.stop) },
    rates: { day: { num: cut(base.rates.day.num), den: cut(base.rates.day.den) }, swing: { num: cut(base.rates.swing.num), den: cut(base.rates.swing.den) }, night: { num: cut(base.rates.night.num), den: cut(base.rates.night.den) } },
  };
}
const percent = (num: number, den: number) => Math.round(num / den * 1000) / 10;

export type BreakdownRow = {
  id: string; label: string; minutes: Minutes; total: number;
  /** Utilization percent per shift: Σ numerator / Σ denominator of this row, not a share of one whole. */
  utilization: Record<ShiftId, number>;
  /** The server's ratio of sums over the shifts (Σ numerator / Σ denominator), not the sum or mean of `utilization`; null where the server gave none. */
  serverUtilizationTotal: number | null;
};
const UNIT_WEIGHTS = [0.35, 0.25, 0.25, 0.15];
/** The rows of a node: its children, or four units of a node without a deeper level. The first row has a server total, the others none. */
export function breakdownRows(nodeId: string, lang: 'ko' | 'en'): BreakdownRow[] {
  const place = find(PLACES, nodeId) ?? PLACES;
  const parts: { id: string; label: string; measures: Measures }[] = place.children
    ? place.children.map(child => ({ id: child.id, label: child.label[lang], measures: measure(child) }))
    : UNIT_WEIGHTS.map((weight, index) => ({ id: `${place.id}-${index + 1}`, label: `${formatText(ANALYTICS_MESSAGES.breakdownDataUnit, lang)} ${place.id}-${index + 1}`, measures: scale(measure(place), weight) }));
  return parts.map(({ id, label, measures }, index) => {
    const { minutes, rates } = measures;
    const all = SHIFT_IDS.reduce((sum, shift) => ({ num: sum.num + rates[shift].num, den: sum.den + rates[shift].den }), { num: 0, den: 0 });
    return {
      id, label, minutes, total: minutes.run + minutes.idle + minutes.stop,
      utilization: { day: percent(rates.day.num, rates.day.den), swing: percent(rates.swing.num, rates.swing.den), night: percent(rates.night.num, rates.night.den) },
      serverUtilizationTotal: index === 0 ? percent(all.num, all.den) : null,
    };
  });
}

export function breakdownTree(tx: (label: Label) => string): LegendTreeNode[] {
  const places = (place: Place): LegendTreeNode => ({ id: place.id, label: tx(place.label), drillOnly: true, ...(place.children ? { children: place.children.map(places) } : {}) });
  return [
    { id: 'states', label: tx(ANALYTICS_MESSAGES.breakdownDataState), children: STATES.map(state => ({ id: state.id, label: tx(state.label), color: state.color })) },
    { id: 'shifts', label: tx(ANALYTICS_MESSAGES.breakdownDataShiftUtilization), children: SHIFTS.map(shift => ({ id: shift.id, label: tx(shift.label), color: shift.color })) },
    places(PLACES),
  ];
}
