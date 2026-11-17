import type { ReactNode } from 'react';
import { MIN_GROUP_WIDTH, MAX_GROUP_LABEL_LENGTH, MAX_GROUP_BASIS_LENGTH, MAX_COLUMN_GROUPS, MAX_GROUP_ID_LENGTH, MAX_GROUP_MEMBERS, type StoredColumnGroups } from '@ap/contracts';
export { MIN_GROUP_WIDTH, MAX_GROUP_LABEL_LENGTH } from '@ap/contracts';
export type { StoredColumnGroups } from '@ap/contracts';
import type { PlatformColumnGroup } from './PlatformDataTable';
import { groupedOrder } from './columnOrder';

export type ColumnGroups = Readonly<Record<string, string | PlatformColumnGroup>>;
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

/** The editor accepts the same trimmed label bound as saved views. */
export const validGroupName = (name: string) => name.trim().length > 0 && name.trim().length <= MAX_GROUP_LABEL_LENGTH;

/** Shape validation only. Declaration-dependent filtering happens at read, never by rewriting storage. */
export function sanitizeColumnGroups(value: unknown): StoredColumnGroups | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const envelope = value as Record<string, unknown>;
  if (typeof envelope.basis !== 'string' || envelope.basis.length > MAX_GROUP_BASIS_LENGTH || !Array.isArray(envelope.items) || envelope.items.length > MAX_COLUMN_GROUPS) return undefined;
  const items: StoredColumnGroups['items'] = [];
  const ids = new Set<string>();
  for (const raw of envelope.items) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const item = raw as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id || item.id.length > MAX_GROUP_ID_LENGTH || ids.has(item.id) || !Array.isArray(item.members) || item.members.length > MAX_GROUP_MEMBERS || !item.members.every(member => typeof member === 'string' && member.length >= 1 && member.length <= MAX_GROUP_ID_LENGTH)) continue;
    if (item.label !== undefined && (typeof item.label !== 'string' || !validGroupName(item.label))) continue;
    if (item.id.startsWith('u:') && typeof item.label !== 'string') continue;
    if (item.width !== undefined && (typeof item.width !== 'number' || !isGroupWidth(item.width))) continue;
    ids.add(item.id);
    items.push({ id: item.id, members: [...new Set(item.members as string[])], ...(typeof item.label === 'string' && { label: item.label.trim() }), ...(typeof item.width === 'number' && { width: item.width }) });
  }
  return { basis: envelope.basis, items };
}

/** Only declared grouping structure participates: translation, widths and new plain columns are harmless. */
export function columnGroupBasis(columns: readonly GroupedColumn[], groups: ColumnGroups | undefined): string {
  const grouped = columns.filter(c => c.columnGroup?.length);
  const top = new Set(grouped.map(c => c.columnGroup![0]));
  return JSON.stringify([grouped.map(c => [c.id, c.columnGroup]), Object.keys(groups ?? {}).filter(id => top.has(id))]);
}

/** One substitution for every screen, pin, order, engine, aria and transfer consumer. Invalid merges fall back as a pair. */
export function effectiveColumnGroups<C extends GroupedColumn>(columns: C[], declaredGroups: ColumnGroups | undefined, stored: StoredColumnGroups | undefined): { columns: C[]; columnGroups: ColumnGroups | undefined } {
  const declared = { columns, columnGroups: declaredGroups };
  const snapshot = sanitizeColumnGroups(stored);
  if (!snapshot || snapshot.basis !== columnGroupBasis(columns, declaredGroups)) return declared;
  const columnIds = new Set(['_select', '_action', ...columns.map(c => c.id)]);
  const known = new Set(columns.map(c => c.id));
  const seen = new Set<string>();
  const membership = new Map<string, string>();
  const labels: Record<string, string | PlatformColumnGroup> = { ...declaredGroups };
  for (const item of snapshot.items) {
    if (columnIds.has(item.id)) continue;
    const label = item.label ?? (Object.hasOwn(labels, item.id) ? columnGroupLabel(labels, item.id) : undefined);
    if (label === undefined) continue;
    const members = item.members.filter(id => known.has(id) && !seen.has(id));
    if (!members.length) continue;
    for (const member of members) { seen.add(member); membership.set(member, item.id); }
    const width = item.width ?? columnGroupWidth(declaredGroups, item.id, 1);
    labels[item.id] = width === undefined ? label : { label, width };
  }
  const mapped = columns.map(c => {
    const id = membership.get(c.id);
    const columnGroup = id === undefined ? undefined : c.columnGroup?.[0] === id ? c.columnGroup : [id];
    return { ...c, columnGroup };
  });
  const byId = new Map(mapped.map(c => [c.id, c]));
  const ordered = groupedOrder(mapped, []).map(id => byId.get(id)!);
  if (columnGroupErrors(ordered, labels).length) return declared;
  return { columns: ordered, columnGroups: labels };
}

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
