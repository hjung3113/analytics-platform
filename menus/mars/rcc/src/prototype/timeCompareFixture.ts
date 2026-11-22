import { periodFromDates, type EquipmentSummary, type GlobalContext } from '@ap/contracts';
import { customGroupMembers } from '@ap/kernel';

// The fixture stands in for the upstream daily and period read models.
export type Cohort = { id: string; ppid: string; layer: number; recipe: string };
export const COHORTS = [
  { id: '204-2-042', ppid: 'PPID-204', layer: 2, recipe: 'RCP-042' },
  { id: '318-3-057', ppid: 'PPID-318', layer: 3, recipe: 'RCP-057' },
  { id: '204-1-031', ppid: 'PPID-204', layer: 1, recipe: 'RCP-031' },
  { id: '318-1-042', ppid: 'PPID-318', layer: 1, recipe: 'RCP-042' },
  { id: '427-1-081', ppid: 'PPID-427', layer: 1, recipe: 'RCP-081' },
  { id: '427-2-091', ppid: 'PPID-427', layer: 2, recipe: 'RCP-091' },
] as const satisfies readonly Cohort[];
type Period = 14 | 7 | 1 | readonly string[];
export type Structure = 'A' | 'B';

const DAY_COUNT = 14;
// Cover the fortnight ending on the mock shell's default calendar day (September 25).
const FIRST_DAY = 12;
const STEP_COUNT = 18;
const TYPE_A_COUNT = 9;
const WAFERS_PER_DAY_MIN = 3;
const WAFER_COUNT_VARIATION = 3;
const SLOW_STEP_DELAY = 5.4;
const SLOW_L1_DELAY = 18;
const STEP_VARIATION = [-0.08, -0.055, -0.035, -0.015, 0.015, 0.035, 0.055, 0.075, 0.085];

export const DAYS = Array.from({ length: DAY_COUNT }, (_, i) => `2026-09-${FIRST_DAY + i}`);
const dayRanges = DAYS.map(day => ({ day, ...periodFromDates({ start: day, end: day })! }));

export function daysInPeriod(from: string | null, to: string | null): string[] {
  if (!from || !to) return [];
  return dayRanges.filter(range => from <= range.from && range.to <= to).map(range => range.day);
}

// Stable aliases for the mock shell's MEM equipment. Facts still determine grant and target membership.
const TARGET_IDS = [
  'MEM-PHOTO-0103', 'MEM-PHOTO-0105', 'MEM-PHOTO-0106', 'MEM-PHOTO-0107',
  'MEM-PHOTO-0108', 'MEM-PHOTO-0111', 'MEM-PHOTO-0114', 'MEM-PHOTO-0116',
  'MEM-PHOTO-0119', 'MEM-PHOTO-0120', 'MEM-ETCH-0122', 'MEM-ETCH-0123',
];
export const EQUIPMENT = TARGET_IDS.map((targetId, i) => ({
  id: `EQ-${String(i + 1).padStart(3, '0')}`,
  structure: i < TYPE_A_COUNT ? 'A' as const : 'B' as const,
  targetId,
}));

export function equipmentForTarget(
  facts: readonly EquipmentSummary[],
  { roomNames, prcGroups, condition, selection }: Pick<GlobalContext, 'roomNames' | 'prcGroups' | 'condition' | 'selection'>,
) {
  const rule = {
    ...condition,
    ...(roomNames ? { roomNames } : {}),
    ...(prcGroups ? { prcGroups } : {}),
  };
  const fixed = selection === null ? facts : facts.filter(item => selection.includes(item.equipmentId));
  const members = new Set(customGroupMembers({ rule }, fixed));
  return { equipment: EQUIPMENT.filter(item => members.has(item.targetId)), targetCount: members.size };
}
export const STRUCTURE_TYPES = ['A', 'B'] as const;

export type Step = { id: string; no: number; seq: number };
function steps(kind: Structure): Step[] {
  return Array.from({ length: STEP_COUNT }, (_, i) => {
    let no = i + 1 <= 2 ? (i + 1) * 10 : i * 10;
    if (kind === 'B' && i === 5) no += 5;
    if (kind === 'B' && i === 11) no += 5;
    const seq = i + 1;
    return { id: `${no}:${seq}`, no, seq };
  });
}
export const STRUCTURES = { A: steps('A'), B: steps('B') };

type DailyValue = { value: number; count?: number };
type Daily = { day: string; total: DailyValue; layer: DailyValue; steps: Record<string, DailyValue> };

const round = (value: number) => Math.round(value * 100) / 100;
const dailyForCohort = (cohortIndex: number) => new Map(EQUIPMENT.map((equipment, equipmentIndex) => {
  const isSlow = equipment.id === 'EQ-008' || equipment.id === 'EQ-009';
  const dailyRows: Daily[] = DAYS.map((day, dayIndex) => {
    const count = WAFERS_PER_DAY_MIN + (equipmentIndex + dayIndex) % WAFER_COUNT_VARIATION;
    const values = STRUCTURES[equipment.structure].map(step => {
      const base = (4.2 + (step.seq % 5) * 0.66) * (1 + cohortIndex * 0.1);
      // Rotate the offsets by Step so the equipment order varies across rows after rollup.
      const variationIndex = (equipmentIndex * 4 + step.seq * 5 + cohortIndex * 2) % STEP_VARIATION.length;
      const variation = STEP_VARIATION[variationIndex]!;
      const shift = ((equipmentIndex + dayIndex * 2 + step.seq) % 9 - 4) * 0.06;
      const delay = isSlow && [3, 8, 13].includes(step.seq) ? SLOW_STEP_DELAY : 0;
      return [step.id, { value: round(base * (1 + variation) + shift + delay), count }] as const;
    });
    // L1 measures its own interval and has its own daily value.
    const total = round(134 + cohortIndex * 14 + equipmentIndex * 1.2 + ((dayIndex + equipmentIndex) % 5) * 0.6 + (isSlow ? SLOW_L1_DELAY : 0));
    const layer = round(116 + cohortIndex * 9 + equipmentIndex * 0.95 + dayIndex * 0.15 + (isSlow ? SLOW_L1_DELAY : 0));
    return { day, total: { value: total, count }, layer: { value: layer, count }, steps: Object.fromEntries(values) };
  });
  return [equipment.id, new Map(dailyRows.map(row => [row.day, row]))] as const;
}));
const daily = new Map<string, ReturnType<typeof dailyForCohort>>(COHORTS.map((cohort, index) => [cohort.id, dailyForCohort(index)]));

export function periodValue(values: readonly DailyValue[]): number {
  if (values.length === 1) return values[0]!.value;
  const counts = values.map(row => row.count ?? 0);
  if (counts.every(count => count > 0)) {
    const count = counts.reduce((sum, value) => sum + value, 0);
    return values.reduce((sum, row, i) => sum + row.value * counts[i]!, 0) / count;
  }
  return values.reduce((sum, row) => sum + row.value, 0) / values.length;
}

function median(values: number[]): number {
  const sorted = values.sort((left, right) => left - right);
  const low = sorted[Math.floor((sorted.length - 1) / 2)]!;
  const high = sorted[Math.floor(sorted.length / 2)]!;
  return (low + high) / 2;
}

const periodDays = (period: Period) => typeof period === 'number' ? DAYS.slice(-period) : period;
const dailyRow = (cohort: Cohort, id: string, day: string) => daily.get(cohort.id)!.get(id)!.get(day)!;

export function comparisonFor(period: Period, structure: Structure, baselineId: string | null, cohort: Cohort = COHORTS[0], targets: readonly typeof EQUIPMENT[number][] = EQUIPMENT) {
  const days = periodDays(period);
  const equipment = targets.map(item => {
    const rows = days.map(day => dailyRow(cohort, item.id, day));
    const held = item.structure !== structure;
    const steps = held ? [] : STRUCTURES[structure].map(step =>
      [step.id, periodValue(rows.map(row => row.steps[step.id]!))] as const);
    return { ...item, held, total: periodValue(rows.map(row => row.total)), steps: Object.fromEntries(steps) };
  });
  const eligible = equipment.filter(item => !item.held);
  const baseline = eligible.find(item => item.id === baselineId);
  const totalBaseline = baseline?.total ?? median(eligible.map(item => item.total));
  const stepBaseline = Object.fromEntries(STRUCTURES[structure].map(step =>
    [step.id, baseline?.steps[step.id] ?? median(eligible.map(item => item.steps[step.id]!))]));
  return { equipment, totalBaseline, stepBaseline };
}

export function layerTimes(period: Period, usages: readonly Cohort[], targets: readonly typeof EQUIPMENT[number][]) {
  const days = periodDays(period);
  return usages.map(usage => ({
    ...usage,
    points: targets.map(({ id }): [string, number] => [id, periodValue(days.map(day => dailyRow(usage, id, day).layer))]),
  }));
}

export function totalTimes(period: Period, usages: readonly Cohort[], structure: Structure, baselineId: string | null, targets: readonly typeof EQUIPMENT[number][]) {
  const days = periodDays(period);
  const rows = targets.map(item => ({
    ...item, held: item.structure !== structure,
    total: periodValue(usages.flatMap(usage => days.map(day => dailyRow(usage, item.id, day).total))),
  }));
  const eligible = rows.filter(item => !item.held);
  const chosen = eligible.find(item => item.id === baselineId);
  const baseline = eligible.length ? chosen?.total ?? median(eligible.map(item => item.total)) : null;
  return { rows, baseline };
}

export type Run = { id: string; equipment: string; lot: string; wafer: string; startedAt: string; seconds: number };

export function evidenceFor(period: Period, structure: Structure, step: string, focus: string | null, baseline: string | null = null, cohort: Cohort = COHORTS[0], targets: readonly typeof EQUIPMENT[number][] = EQUIPMENT) {
  const days = periodDays(period);
  const eligible = targets.filter(item => item.structure === structure);
  const selected = eligible.find(item => item.id === focus);
  const selectedById = eligible.find(item => item.id === baseline);
  const scatterRuns = eligible.flatMap(item => days.flatMap(day => {
    const row = dailyRow(cohort, item.id, day);
    const entry = row.steps[step]!;
    const count = entry.count!;
    return Array.from({ length: count }, (_, i): Run => {
      const lot = `LOT-${cohort.id}-${row.day.slice(-2)}-${item.id.slice(-3)}`;
      const wafer = `W-${String(i + 1).padStart(2, '0')}`;
      const offset = (i - (count - 1) / 2) * 0.38;
      return {
        id: `${lot}/${wafer}/${step}`, equipment: item.id, lot, wafer,
        startedAt: `${row.day} ${String(8 + i).padStart(2, '0')}:00`,
        seconds: round(entry.value + offset),
      };
    });
  })).sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  const seriesIds = new Set([selectedById?.id ?? 'median']);
  if (selected) seriesIds.add(selected.id);
  const trends = [...seriesIds].map(id => {
    const values = days.map((day): [string, number] => {
      if (id !== 'median') return [day, dailyRow(cohort, id, day).steps[step]!.value];
      return [day, median(eligible.map(item => dailyRow(cohort, item.id, day).steps[step]!.value))];
    });
    return { id, values };
  });
  const runs = selected ? scatterRuns.filter(run => run.equipment === selected.id) : scatterRuns;
  return { runs, scatterRuns, trends, equipment: eligible.map(item => item.id) };
}
