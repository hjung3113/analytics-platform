import { columnGroupBasis, effectiveColumnGroups, MIN_GROUP_WIDTH, sanitizeColumnGroups, validGroupName, type ColumnGroups, type StoredColumnGroups } from './columnGroups';

type Column = { id: string; columnGroup?: readonly string[] };
type Snapshot = StoredColumnGroups;

/** Materialize only membership; declared labels and widths remain code- and language-driven until explicitly edited. */
export function materializeColumnGroups(columns: Column[], declared: ColumnGroups | undefined, stored: Snapshot | undefined): Snapshot {
  const effective = effectiveColumnGroups(columns, declared, stored);
  const sanitized = sanitizeColumnGroups(stored);
  const overrides = effective.columns !== columns ? sanitized?.items : undefined;
  const items: Snapshot['items'] = [];
  for (const column of effective.columns) {
    const id = column.columnGroup?.[0];
    if (id === undefined) continue;
    let item = items.find(group => group.id === id);
    if (!item) {
      const override = overrides?.find(group => group.id === id);
      item = { id, members: [], ...(override?.label !== undefined && { label: override.label }), ...(override?.width !== undefined && { width: override.width }) };
      items.push(item);
    }
    item.members.push(column.id);
  }
  return { basis: columnGroupBasis(columns, declared), items };
}

function takeMembers(snapshot: Snapshot, id: string, members: string[]): Snapshot['items'] {
  const taken = new Set(members);
  return snapshot.items.flatMap(item => {
    const next = item.id === id ? members : item.members.filter(member => !taken.has(member));
    return next.length ? [{ ...item, members: next }] : [];
  });
}
const randomId = () => Math.random().toString(36).slice(2, 10);
export function createColumnGroup(snapshot: Snapshot, name: string, selected: string[], reserved: readonly string[], generate: () => string = randomId): Snapshot {
  const members = [...new Set(selected)];
  if (members.length < 2 || !validGroupName(name)) return snapshot;
  const used = new Set([...reserved, '_select', '_action', ...snapshot.items.map(item => item.id)]);
  const candidate = `u:${generate()}`;
  let id = candidate;
  // A deterministic suffix also guarantees termination with a colliding injectable generator.
  let suffix = 0;
  while (used.has(id)) id = `${candidate}:${++suffix}`;
  return { ...snapshot, items: [...takeMembers(snapshot, id, members), { id, label: name.trim(), members }] };
}
export function renameColumnGroup(snapshot: Snapshot, id: string, name: string): Snapshot {
  if (!validGroupName(name)) return snapshot;
  return { ...snapshot, items: snapshot.items.map(item => item.id === id ? { ...item, label: name.trim() } : item) };
}
export function setColumnGroupMembers(snapshot: Snapshot, id: string, selected: string[]): Snapshot {
  const members = [...new Set(selected)];
  if (!members.length || !snapshot.items.some(item => item.id === id)) return snapshot;
  return { ...snapshot, items: takeMembers(snapshot, id, members) };
}
export function ungroupColumns(snapshot: Snapshot, id: string): Snapshot {
  return { ...snapshot, items: snapshot.items.filter(item => item.id !== id) };
}
export function setColumnGroupWidth(snapshot: Snapshot, id: string, width: number | undefined): Snapshot {
  if (width !== undefined && !Number.isFinite(width)) return snapshot;
  return { ...snapshot, items: snapshot.items.map(item => {
    if (item.id !== id) return item;
    const { width: previousWidth, ...rest } = item;
    void previousWidth;
    return width === undefined ? rest : { ...rest, width: Math.max(MIN_GROUP_WIDTH, width) };
  }) };
}
