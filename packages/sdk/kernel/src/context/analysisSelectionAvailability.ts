import type { AnalysisSelection } from '@ap/contracts';
import { sameItems } from '../stable';

type Compare = (a: string, b: string) => number;
export type AnalysisSelectionAvailability = readonly string[] | {
  readonly from: string;
  readonly to: string;
  /** A stable comparator for both selection and report endpoints. Defaults to string order. */
  readonly compare?: Compare;
};

export function sameAvailability(a: AnalysisSelectionAvailability | undefined, b: AnalysisSelectionAvailability | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if ('from' in a && 'from' in b) return a.from === b.from && a.to === b.to && a.compare === b.compare;
  return !('from' in a) && !('from' in b) && sameItems(a, b);
}

const compareStrings: Compare = (a, b) => Number(a > b) - Number(a < b);

export function isAnalysisSelectionAvailable(selection: AnalysisSelection, available: AnalysisSelectionAvailability | undefined): boolean {
  if (!available) return true;
  if ('from' in available) {
    const compare = available.compare ?? compareStrings;
    return selection.shape !== 'range' || (compare(selection.from, available.to) <= 0 && compare(available.from, selection.to) <= 0);
  }
  return selection.shape !== 'set' || selection.values.some(value => available.includes(value));
}

const emptyAvailability: ReadonlyMap<string, AnalysisSelectionAvailability> = new Map();
export const readEmptyAvailability = () => emptyAvailability;
export const subscribeToEmptyAvailability = () => () => {};

export function createAnalysisSelectionAvailability() {
  let snapshot = emptyAvailability;
  const listeners = new Set<() => void>();
  const registrations = new Map<string, Map<symbol, AnalysisSelectionAvailability>>();
  function update(key: string, value: AnalysisSelectionAvailability | undefined) {
    if (snapshot.get(key) === value) return;
    const next = new Map(snapshot);
    if (value === undefined) next.delete(key);
    else next.set(key, value);
    snapshot = next;
    for (const listener of listeners) listener();
  }
  return {
    read: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    report(key: string, available: AnalysisSelectionAvailability) {
      const reports = registrations.get(key) ?? new Map();
      const token = Symbol();
      reports.set(token, available);
      registrations.set(key, reports);
      update(key, available);
      return () => {
        if (!reports.delete(token)) return;
        if (!reports.size) registrations.delete(key);
        update(key, [...reports.values()].at(-1));
      };
    },
  };
}
