import { CUSTOM_GROUP_AXIS, narrowCondition, type Condition, type CustomGroupTarget, type EquipmentSummary, type SavedViewListItem } from '@ap/contracts';

export type ExpandCustomGroupsInput = {
  condition: Condition | null;
  selection: readonly string[] | null;
  groups: Readonly<Record<string, CustomGroupTarget | { denied: string }>>;
  facts: readonly EquipmentSummary[];
};
export type ExpandCustomGroupsResult =
  | { ok: true; condition: Condition | null; selection: string[] | null }
  | { ok: false; denied: { id: string; reason: string }[] };

/** The id a listed saved group is chosen by: a denied entry carries its own id, a readable one its view's. */
export function customGroupItemId(item: SavedViewListItem): string {
  return 'denied' in item && item.denied ? item.id : item.view.id;
}

/**
 * The single read rule for a chosen custom group (ADR-0164): the query refuses and the query bar explains with the same verdict.
 * Missing or another kind → `not-found`; a denied entry or a view the user cannot read → its reason; another Scope → `scope-mismatch`.
 */
export function customGroupReadState(item: SavedViewListItem | undefined, scopeId: string | null): { name: string; target: CustomGroupTarget } | { denied: string } {
  if (!item) return { denied: 'not-found' };
  if ('denied' in item && item.denied) return { denied: item.reason };
  if (item.view.kind !== 'custom-group') return { denied: 'not-found' };
  if (!item.capabilities.canView) return { denied: item.capabilities.reason ?? 'forbidden' };
  if (item.view.savedScopeId !== scopeId) return { denied: 'scope-mismatch' };
  return { name: item.view.name, target: item.view.target };
}

/** The single membership rule for a custom-group target (ADR-0164): fixed IDs or AND across axes, OR within each axis. */
export function customGroupMembers(target: CustomGroupTarget, facts: readonly EquipmentSummary[]): string[] {
  if ('fixed' in target) return [...new Set(target.fixed)];
  return facts.filter(row => Object.entries(target.rule).every(([axis, values]) => {
    const actual = axis === 'roomNames' ? [row.room] : (Object.hasOwn(row.axes, axis) ? row.axes[axis] : undefined) ?? [];
    return values.some(value => actual.includes(value));
  })).map(row => row.equipmentId);
}

/** Pure preparation only (ADR-0164): union group membership, then intersect Selection. Data authorization still belongs to the server. */
export function expandCustomGroups({ condition, selection, groups, facts }: ExpandCustomGroupsInput): ExpandCustomGroupsResult {
  const chosen = condition?.[CUSTOM_GROUP_AXIS];
  if (!chosen) return { ok: true, condition, selection: selection === null ? null : [...selection] };
  const denied: { id: string; reason: string }[] = [];
  const members = new Set<string>();
  for (const id of new Set(chosen)) {
    const group = Object.hasOwn(groups, id) ? groups[id] : undefined;
    if (!group) { denied.push({ id, reason: 'not-found' }); continue; }
    if ('denied' in group) { denied.push({ id, reason: group.denied }); continue; }
    for (const member of customGroupMembers(group, facts)) members.add(member);
  }
  if (denied.length > 0) return { ok: false, denied };
  return {
    ok: true,
    condition: narrowCondition(condition, Object.keys(condition ?? {}).filter(axis => axis !== CUSTOM_GROUP_AXIS)),
    selection: selection === null ? [...members] : [...new Set(selection)].filter(id => members.has(id)),
  };
}
