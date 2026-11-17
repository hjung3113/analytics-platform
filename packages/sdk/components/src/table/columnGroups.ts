import type { ReactNode } from 'react';

type GroupedColumn = { id: string; columnGroup?: readonly string[] };

/** Declaration diagnostics only: production stays silent and no stored preferences are rewritten. */
export function columnGroupErrors(columns: readonly GroupedColumn[], labels: Readonly<Record<string, string>> = {}): string[] {
  const errors = new Set<string>();
  const ids = new Set(['_select', '_action', ...columns.map(c => c.id)]);
  const parents = new Map<string, string>();
  const last = new Map<string, number>();
  columns.forEach((column, index) => {
    column.columnGroup?.forEach((id, depth, path) => {
      if (!Object.hasOwn(labels, id)) errors.add(`Column group "${id}": missing label in columnGroups.`);
      if (ids.has(id)) errors.add(`Column group "${id}" collides with a column id.`);
      const parent = JSON.stringify(path.slice(0, depth));
      if (parents.has(id) && parents.get(id) !== parent) errors.add(`Column group "${id}" has two parent paths.`);
      parents.set(id, parent);
      const previous = last.get(id);
      if (previous !== undefined && previous !== index - 1) errors.add(`Column group "${id}" has non-contiguous members.`);
      last.set(id, index);
    });
  });
  return [...errors];
}

export type DisplayUnit<T> = { kind: 'leaf'; leaves: T[] } | { kind: 'group'; id: string; leaves: T[] };

/** Shared header/body/row-group layout seam. N1 renders leaves directly; N2 may wrap a group's displayed cells here. */
export function displayedUnits<T>(items: readonly T[], pathOf: (item: T) => readonly string[] | undefined): DisplayUnit<T>[] {
  const units: DisplayUnit<T>[] = [];
  for (const item of items) {
    const id = pathOf(item)?.[0];
    const previous = units.at(-1);
    if (id !== undefined && previous?.kind === 'group' && previous.id === id) previous.leaves.push(item);
    else units.push(id === undefined ? { kind: 'leaf', leaves: [item] } : { kind: 'group', id, leaves: [item] });
  }
  return units;
}

/** All three row kinds render through this boundary. No wrapper is needed until a group declares a clip width (N2). */
export function renderDisplayedUnits<T>(items: readonly T[], pathOf: (item: T) => readonly string[] | undefined, renderLeaf: (item: T) => ReactNode): ReactNode[] {
  return displayedUnits(items, pathOf).flatMap(unit => unit.leaves.map(renderLeaf));
}
