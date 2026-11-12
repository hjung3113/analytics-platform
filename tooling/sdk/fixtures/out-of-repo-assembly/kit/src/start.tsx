// The kit's start: everything the Host needs is injected here — declarations, the mock assembly, the query-history port.
import { compareQueryHistory, KERNEL_PERMISSIONS, type QueryHistoryEntry, type QueryHistoryKey, type QueryHistoryStore } from '@ap/contracts';
import { startAppHost } from '@ap/app-host';
import { usePlatform } from '@ap/kernel';
import { useOverlayState } from '@ap/kernel/host';
import { AuditTimeline } from '@ap/components';
import { DockLayout, normalizeDockTree } from '@ap/components/dock';
import { Button } from '@ap/ui';
import { readColorToken, THEME_COLOR_TOKENS } from '@ap/ui/theme';
import { declarations, KIT_AXES } from '../menus';
import { createAssembly } from '../mock/assembly';

/**
 * Cross-package probe mounted inside PlatformProvider next to the shell: the consumer-side proof that kernel/host hooks,
 * ui primitives and theme tokens, components widgets and dock utilities all come from the app's single copy of each package.
 */
function KitProbe() {
  const { session } = usePlatform();
  const { paletteOpen } = useOverlayState();
  return (
    <section
      data-testid="kit-probe"
      data-user={session.user.id}
      data-permissions={KERNEL_PERMISSIONS.length}
      data-token={THEME_COLOR_TOKENS[0]}
      data-resolved={typeof readColorToken}
      data-host={String(paletteOpen)}
      data-dock={typeof DockLayout + ':' + normalizeDockTree(null, ['a']).type}
    >
      <Button>kit button</Button>
      <AuditTimeline events={[]} />
    </section>
  );
}

/** In-memory QueryHistoryStore: the kit stores nothing between reloads. */
function inMemoryQueryHistory(): QueryHistoryStore {
  const rows = new Map<string, QueryHistoryEntry[]>();
  const keyOf = (key: QueryHistoryKey) => JSON.stringify([key.userId, key.menuId, key.scopeId]);
  return {
    list: async (key) => [...(rows.get(keyOf(key)) ?? [])],
    record: async (key, entry) => {
      const id = keyOf(key);
      const previous = rows.get(id) ?? [];
      const count = (previous.find((row) => row.id === entry.id && row.query === entry.query)?.count ?? 0) + 1;
      const merged = [{ ...entry, count, lastAppliedAt: Date.now() }, ...previous.filter((row) => !(row.id === entry.id && row.query === entry.query))];
      // The port assigns ordering and the 20-entry cap to the store (contracts links/query-history).
      rows.set(id, merged.sort(compareQueryHistory).slice(0, 20));
    },
    remove: async (key, id) => {
      const current = keyOf(key);
      rows.set(current, (rows.get(current) ?? []).filter((row) => row.id !== id));
    },
    clear: async (key) => {
      rows.delete(keyOf(key));
    },
  };
}

export function startKitApp(container: HTMLElement): Promise<void> {
  return startAppHost({
    container,
    declarations,
    createAssembly,
    equipmentAxes: KIT_AXES,
    queryHistory: inMemoryQueryHistory(),
    children: () => <KitProbe />,
  });
}
