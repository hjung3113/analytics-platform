import type { AnalysisSelection } from '@ap/contracts';
import { sameItems } from '../stable';

export type AnalysisSelectionAvailability = readonly string[] | { readonly from: string; readonly to: string };

export function sameAvailability(a: AnalysisSelectionAvailability | undefined, b: AnalysisSelectionAvailability | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if ('from' in a && 'from' in b) return a.from === b.from && a.to === b.to;
  return !('from' in a) && !('from' in b) && sameItems(a, b);
}

export function isAnalysisSelectionAvailable(selection: AnalysisSelection, available: AnalysisSelectionAvailability | undefined): boolean {
  if (!available) return true;
  if ('from' in available) {
    return selection.shape !== 'range' || (selection.from <= available.to && available.from <= selection.to);
  }
  return selection.shape !== 'set' || selection.values.some(value => available.includes(value));
}

const emptyAvailability: ReadonlyMap<string, AnalysisSelectionAvailability> = new Map();
export const readEmptyAvailability = () => emptyAvailability;
export const subscribeToEmptyAvailability = () => () => {};

export function createAnalysisSelectionAvailability() {
  let snapshot = emptyAvailability;
  const listeners = new Set<() => void>();
  function update(next: typeof snapshot) {
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
      update(new Map(snapshot).set(key, available));
      return () => {
        if (snapshot.get(key) !== available) return;
        const next = new Map(snapshot);
        next.delete(key);
        update(next);
      };
    },
  };
}
