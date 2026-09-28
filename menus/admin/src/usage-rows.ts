/**
 * Left join of the Menu Registry with the usage summary (docs/05 메뉴 활용률 계측): every registered menu
 * stays visible, zero-filled when the server summary has no entry yet. Screen-independent and pure so the
 * join contract is unit-testable; the page only sorts and pages the result.
 */
import { formatInstant, type Text, type UsageMenuSummary } from '@ap/contracts';
import type { Registry } from '@ap/kernel';

/** lastUsedAt is an epoch-ms instant (#88): format in the viewer's time zone, not the stored UTC digits. */
export function formatLastUsed(ms: number | null, lang: keyof Text, timeZone?: string): string {
  return ms === null ? '—' : formatInstant(ms, lang, timeZone);
}

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
