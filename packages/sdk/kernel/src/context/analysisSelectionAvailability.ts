import type { AnalysisSelection } from '@ap/contracts';
import { sameItems } from '../stable';
import type { analysisSelectionDependencies } from '../registry/analysis-selections';

export type AnalysisSelectionCompare = (a: string, b: string) => number;
export type AnalysisSelectionAvailability = readonly string[] | {
  readonly from: string;
  readonly to: string;
  /** A stable comparator for both selection and report endpoints. Defaults to string order. */
  readonly compare?: AnalysisSelectionCompare;
  /** Category endpoints in axis order, with the source’s display labels. */
  readonly candidates?: readonly { readonly value: string; readonly label: string }[];
};

export function sameAvailability(a: AnalysisSelectionAvailability | undefined, b: AnalysisSelectionAvailability | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if ('from' in a && 'from' in b) {
    const x = a.candidates; const y = b.candidates;
    return a.from === b.from && a.to === b.to && a.compare === b.compare
      && (x === y || (!!x && !!y && x.length === y.length && x.every((item, i) => {
        const other = y[i];
        if (other === undefined) throw new Error('Equal-length availability candidates must have matching entries');
        return item.value === other.value && item.label === other.label;
      })));
  }
  return !('from' in a) && !('from' in b) && sameItems(a, b);
}

const compareStrings: AnalysisSelectionCompare = (a, b) => Number(a > b) - Number(a < b);

export function analysisSelectionRangeCompare(available: AnalysisSelectionAvailability | undefined): AnalysisSelectionCompare {
  if (!available || !('from' in available)) return compareStrings;
  const { candidates, compare } = available;
  if (!candidates) return compare ?? compareStrings;
  return (a, b) => {
    const first = candidates.findIndex(item => item.value === a);
    const last = candidates.findIndex(item => item.value === b);
    return first < 0 || last < 0 ? NaN : first - last;
  };
}

export function isAnalysisSelectionAvailable(selection: AnalysisSelection, available: AnalysisSelectionAvailability | undefined): boolean {
  if (!available) return true;
  if ('from' in available) {
    if (selection.shape !== 'range') return true;
    const compare = analysisSelectionRangeCompare(available);
    try {
      if (available.candidates) return compare(selection.from, selection.to) <= 0;
      return compare(selection.from, available.to) <= 0 && compare(available.from, selection.to) <= 0;
    } catch {
      // A late report may reject an endpoint already in the URL. Keep the chip and mark the range unavailable.
      return false;
    }
  }
  return selection.shape !== 'set' || selection.values.some(value => available.includes(value));
}

type AvailabilityReport = { drillAddress: string; publisher: string | undefined; available: AnalysisSelectionAvailability };
const emptyAvailability: ReadonlyMap<string, AvailabilityReport> = new Map();
export const readEmptyAvailability = () => emptyAvailability;
export const subscribeToEmptyAvailability = () => () => {};

export function readAvailability(snapshot: typeof emptyAvailability, key: string, drillAddress: string, publisher: string | null | undefined) {
  const report = snapshot.get(key);
  return report?.drillAddress === drillAddress && report.publisher === publisher ? report.available : undefined;
}

export function createAnalysisSelectionAvailability() {
  let snapshot = emptyAvailability;
  let graph: ReturnType<typeof analysisSelectionDependencies> | undefined;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  const registrations = new Map<string, Map<symbol, AvailabilityReport>>();
  function update(key: string, value: AvailabilityReport | undefined) {
    if (snapshot.get(key) === value) return;
    const next = new Map(snapshot);
    if (value === undefined) next.delete(key);
    else next.set(key, value);
    snapshot = next;
    notify();
  }
  return {
    hover: createSelectionHover(),
    read: () => snapshot,
    graph: () => graph,
    publishGraph(next: NonNullable<typeof graph>) {
      graph = next;
      notify();
      return () => {
        if (graph !== next) return;
        graph = undefined;
        notify();
      };
    },
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    report(key: string, value: AvailabilityReport) {
      const reports = registrations.get(key) ?? new Map();
      const token = Symbol();
      reports.set(token, value);
      registrations.set(key, reports);
      update(key, value);
      return () => {
        if (!reports.delete(token)) return;
        if (!reports.size) registrations.delete(key);
        update(key, [...reports.values()].at(-1));
      };
    },
  };
}

type Hover = { key: string; drillAddress: string };

function createSelectionHover() {
  const active = new Set<Hover>();
  const listeners = new Set<() => void>();
  let current: Hover | undefined;
  function update(next: Hover | undefined) {
    if (next === current) return;
    current = next;
    for (const listener of listeners) listener();
  }
  return {
    read: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    begin(key: string, drillAddress: string) {
      const hover = { key, drillAddress };
      active.add(hover);
      update(hover);
      return () => {
        active.delete(hover);
        if (current === hover) update([...active].at(-1));
      };
    },
  };
}
