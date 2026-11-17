/**
 * Column order (#556a, §15, ADR-0024): internal pure helpers. `order` is the single order source; `pinning.left` only says which
 * columns are pinned. An empty saved order means declaration order (and, for pins, the order they were pinned in, as before).
 */

/** Saved ids that still exist keep their saved order; a column the list lacks goes right after its nearest declared predecessor; unknown ids drop. */
export function effectiveOrder(declared: readonly string[], saved: readonly string[]): string[] {
  const known = new Set(declared);
  const result: string[] = [];
  for (const id of saved) if (known.has(id) && !result.includes(id)) result.push(id);
  declared.forEach((id, index) => {
    if (result.includes(id)) return;
    let at = 0;
    for (let i = index - 1; i >= 0; i -= 1) {
      const found = result.indexOf(declared[i]);
      if (found >= 0) { at = found + 1; break; }
    }
    result.splice(at, 0, id);
  });
  return result;
}

type GroupedColumn = { id: string; columnGroup?: readonly string[] };

/** Gather every path's members at its first saved member, recursively. Never repairs storage on read. */
export function groupedOrder(columns: readonly GroupedColumn[], saved: readonly string[]): string[] {
  const paths = new Map(columns.map(c => [c.id, c.columnGroup ?? []]));
  const collect = (ids: string[], depth: number): string[] => {
    const seen = new Set<string>();
    return ids.flatMap(id => {
      const group = paths.get(id)?.[depth];
      if (group === undefined) return [id];
      if (seen.has(group)) return [];
      seen.add(group);
      return collect(ids.filter(member => paths.get(member)?.[depth] === group), depth + 1);
    });
  };
  return collect(effectiveOrder(columns.map(c => c.id), saved), 0);
}

/** D12: any visible saved member pins its entire outer group; keep legacy pin order for plain tables. */
export function groupedPins(columns: readonly GroupedColumn[], left: readonly string[], order: readonly string[], visibility: Readonly<Record<string, boolean>>, hasSavedOrder: boolean): string[] {
  if (!columns.some(c => c.columnGroup?.length)) return pinnedInOrder(left, order, hasSavedOrder);
  const pinnedGroups = new Set(columns.filter(c => left.includes(c.id) && visibility[c.id] !== false).map(c => c.columnGroup?.[0]).filter(g => g !== undefined));
  const expanded = columns.filter(c => c.columnGroup?.length ? pinnedGroups.has(c.columnGroup[0]) : left.includes(c.id)).map(c => c.id);
  return groupedOrder(columns, order).filter(id => expanded.includes(id));
}

/** The pinned ids in display order: the effective order once a saved order exists, the pinning order otherwise. */
export function pinnedInOrder(left: readonly string[], effective: readonly string[], hasSavedOrder: boolean): string[] {
  const known = left.filter(id => effective.includes(id));
  return hasSavedOrder ? effective.filter(id => known.includes(id)) : known;
}

/** Moves `id` to `toIndex` inside `group` (the group's current display sequence); the group's members keep to the slots they held in `effective`. */
export function moveWithinGroup(effective: readonly string[], group: readonly string[], id: string, toIndex: number): string[] {
  if (!group.includes(id)) return [...effective];
  const rest = group.filter(g => g !== id);
  const at = Math.max(0, Math.min(rest.length, toIndex));
  const sequence = [...rest.slice(0, at), id, ...rest.slice(at)];
  const members = new Set(group);
  let next = 0;
  return effective.map(e => members.has(e) ? sequence[next++] : e);
}
