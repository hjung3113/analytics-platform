/**
 * Menu Registry → table row projection (issue #42). The registry is a client declaration, not a mart
 * result: rows are projected in the menu package and the page queries no endpoint. Pure so the equality
 * contract (every row equals registry values) is unit-testable.
 */
import type { Capability, ContextKey, GroupId, Permission, SpaceId, Text } from '@ap/contracts';
import type { MenuEntry, Registry } from '@ap/kernel';

export type RegistryRow = {
  id: string; spaceId: SpaceId | null; spaceLabel: Text; groupId: GroupId; path: string;
  permission: Permission; capabilities: string; pageKeys: string;
  contextResetKeys: string; status: 'implemented' | 'planned';
};

/** Fixed display order; unsupported keys omitted. */
const ORDER = ['time', 'roomNames', 'condition', 'selection', 'lot', 'ppid', 'recipe', 'metric'] as const satisfies readonly ContextKey[];

/** Table cell only. `time:apply, lot:reference`. None → ''. */
export function formatCapabilities(context: Record<ContextKey, Capability>): string {
  return ORDER.filter(k => context[k] !== 'unsupported').map(k => `${k}:${context[k]}`).join(', ');
}

function spaceFields(menu: MenuEntry, registry: Registry): { spaceId: SpaceId | null; spaceLabel: Text } {
  const space = registry.spaceOf(menu);
  return space === null
    ? { spaceId: null, spaceLabel: { ko: '전역', en: 'Global' } }
    : { spaceId: space.id, spaceLabel: { ko: space.id, en: space.id } };
}

export function toRegistryRow(menu: MenuEntry, registry: Registry): RegistryRow {
  return {
    id: menu.id, ...spaceFields(menu, registry), groupId: menu.group, path: menu.path,
    permission: menu.permission, capabilities: formatCapabilities(menu.context),
    pageKeys: menu.pageKeys.join(', '), contextResetKeys: (menu.contextResetKeys ?? []).join(', '),
    status: menu.component ? 'implemented' : 'planned',
  };
}
