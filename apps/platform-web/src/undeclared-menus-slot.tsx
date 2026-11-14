import { useMemo, type ReactNode } from 'react';
import type { UsageSummary } from '@ap/contracts';
import { usePlatformQuery, type UndeclaredMenu, type UndeclaredMenusSlot } from '@ap/kernel';
import { useHostPlatform } from '@ap/kernel/host';

/** The operations-console permission that already gates `usageSummary` (http-adapter-contract: `undeclaredMenuPermissions` is read only with it). */
const CONSOLE_PERMISSION = 'console:access';
const NONE: readonly UndeclaredMenu[] = [];

/**
 * Operator-only list of menus no server declaration grants to anyone (#1846). It reads the optional `undeclaredMenuPermissions` of the
 * existing usage summary — no new endpoint — and only for an actor holding `console:access`; everyone else gets an empty list and no request.
 * The server's English `reason` is a diagnostic, not sidebar copy, so only the menu id and permission key pass on.
 * A failed or slow read leaves the list empty: the diagnostic never blocks or changes the menu list.
 */
function Read({ children }: { children: (list: readonly UndeclaredMenu[]) => ReactNode }) {
  const { adapter, can } = useHostPlatform();
  const allowed = can(CONSOLE_PERMISSION);
  const q = usePlatformQuery<UsageSummary>(signal => adapter.usageSummary({ preset: 'all' }, signal), null, allowed, 'session');
  const rows = q.response?.data?.undeclaredMenuPermissions;
  const list = useMemo<readonly UndeclaredMenu[]>(() => (allowed && rows ? rows.map(({ menuId, permission }) => ({ menuId, permission })) : NONE), [allowed, rows]);
  return <>{children(list)}</>;
}

export const undeclaredMenusSlot: UndeclaredMenusSlot = { Read };
