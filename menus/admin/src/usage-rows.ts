/**
 * Left join of the Menu Registry with the usage summary (docs/05 메뉴 활용률 계측): every registered menu
 * stays visible, zero-filled when the server summary has no entry yet. Screen-independent and pure so the
 * join contract is unit-testable; the page only sorts and pages the result.
 */
import type { Text, UsageMenuSummary } from '@ap/contracts';
import type { Registry } from '@ap/kernel';

export type UsageRow = {
  id: string;
  label: Text;
  spaceId: string;
  visits: number;
  distinctUsers: number;
  lastUsedAt: number | null;
};

export function joinUsageRows(registry: Registry, summary: readonly UsageMenuSummary[]): UsageRow[] {
  const byMenu = new Map(summary.map(m => [m.menuId, m]));
  return registry.menus.map(menu => {
    const hit = byMenu.get(menu.id);
    return {
      id: menu.id,
      label: menu.label,
      spaceId: registry.spaceOf(menu).id,
      visits: hit?.visits ?? 0,
      distinctUsers: hit?.distinctUsers ?? 0,
      lastUsedAt: hit?.lastUsedAt ?? null,
    };
  });
}
