import type { ReactNode } from 'react';
import type { PlatformColumnGroup } from './PlatformDataTable';

export type ColumnGroups = Readonly<Record<string, string | PlatformColumnGroup>>;
const MIN_GROUP_WIDTH = 60;
const isGroupWidth = (width: number) => Number.isFinite(width) && width >= MIN_GROUP_WIDTH;
export const columnGroupLabel = (groups: ColumnGroups | undefined, id: string): string => {
  const group = groups?.[id];
  return typeof group === 'string' ? group : group?.label ?? id;
};
export function columnGroupWidth(groups: ColumnGroups | undefined, id: string, scale: number): number | undefined {
  const group = groups?.[id];
  const width = typeof group === 'object' ? group.width : undefined;
  return width !== undefined && isGroupWidth(width) ? width * scale : undefined;
}

type GroupedColumn = { id: string; columnGroup?: readonly string[] };

/** Declaration diagnostics only: production stays silent and no stored preferences are rewritten. */
export function columnGroupErrors(columns: readonly GroupedColumn[], labels: ColumnGroups = {}): string[] {
  const errors = new Set<string>();
  const ids = new Set(['_select', '_action', ...columns.map(c => c.id)]);
  const parents = new Map<string, string>();
  const last = new Map<string, number>();
  columns.forEach((column, index) => {
    column.columnGroup?.forEach((id, depth, path) => {
      if (!Object.hasOwn(labels, id)) errors.add(`Column group "${id}": missing label in columnGroups.`);
      const group = labels[id];
      if (typeof group === 'object' && group.width !== undefined) {
        if (depth > 0) errors.add(`Column group "${id}": width is only supported on a top-level group.`);
        if (!isGroupWidth(group.width)) errors.add(`Column group "${id}": width must be finite and at least ${MIN_GROUP_WIDTH}.`);
      }
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

/** Shared header/body/row-group layout seam. */
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

/** Width and offsets count a declared width group once, independent of its inner travel. */
export function displayedWidth<T>(items: readonly T[], pathOf: (item: T) => readonly string[] | undefined, widthOf: (item: T) => number, groupWidth: (id: string) => number | undefined): number {
  return displayedUnits(items, pathOf).reduce((sum, unit) => sum + (unit.kind === 'group' ? groupWidth(unit.id) ?? unit.leaves.reduce((n, item) => n + widthOf(item), 0) : unit.leaves.reduce((n, item) => n + widthOf(item), 0)), 0);
}

/** All three row kinds render through this boundary. `wrap` returns `undefined` for a group it does not wrap (label-only), whose
 *  cells then stay flat keyed siblings as in the original DOM: a nested array would be an unkeyed fragment matched by position,
 *  so moving the group or hiding a column before it would remount its cells. */
export function renderDisplayedUnits<T>(items: readonly T[], pathOf: (item: T) => readonly string[] | undefined, renderLeaf: (item: T) => ReactNode, wrap?: (unit: Extract<DisplayUnit<T>, { kind: 'group' }>, cells: ReactNode[]) => ReactNode | undefined): ReactNode[] {
  return displayedUnits(items, pathOf).flatMap(unit => {
    const cells = unit.leaves.map(renderLeaf);
    const wrapped = unit.kind === 'group' && wrap ? wrap(unit, cells) : undefined;
    return wrapped === undefined ? cells : [wrapped];
  });
}
