import { CUSTOM_GROUP_AXIS, narrowCondition, type Condition, type CustomGroupTarget, type EquipmentSummary } from '@ap/contracts';

export type ExpandCustomGroupsInput = {
  condition: Condition | null;
  selection: readonly string[] | null;
  groups: Readonly<Record<string, CustomGroupTarget | { denied: string }>>;
  facts: readonly EquipmentSummary[];
};
export type ExpandCustomGroupsResult =
  | { ok: true; condition: Condition | null; selection: string[] | null }
  | { ok: false; denied: { id: string; reason: string }[] };

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
