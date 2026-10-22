import { buildQuery, parseQuery, sameGlobal, type GlobalContext, type Pair } from '@ap/contracts';
import { pathFor, type MenuEntry, type Registry } from './registry';
import type { PaneScreen } from './platform';

type ResetRule = Pick<MenuEntry, 'contextResetKeys'>;

/**
 * The one rule for a deliberate global-Context change (06 §6.4): the menu's `contextResetKeys` (e.g. the result-set page index) leave
 * the page pairs when `next` differs from `current`, and stay when it does not. `setGlobal` and `withPaneContext` both use it.
 * Kernel-internal (no longer a public export since #660); outside the kernel use `withPaneContext`.
 */
export function dropResetKeys(menu: ResetRule | null | undefined, pairs: Pair[], current: GlobalContext, next: GlobalContext): Pair[] {
  const keys = menu?.contextResetKeys;
  if (!keys || keys.length === 0 || sameGlobal(current, next)) return pairs;
  return pairs.filter(([k]) => !keys.includes(k));
}

/**
 * `query` (a screen's saved address, leading `?` or empty) with its analysis Context replaced by `global`: the screen keeps its own
 * page keys and extras except the menu's `contextResetKeys`, exactly as a Context write on that screen would leave them. Pure; throws
 * `ContractError` when `query` does not parse for this menu, so callers decide what an unreadable address means.
 */
export function withPaneContext(menu: Pick<MenuEntry, 'pageKeys' | 'contextResetKeys'>, query: string, global: GlobalContext): string {
  const parsed = parseQuery(query, menu.pageKeys);
  return buildQuery(global, dropResetKeys(menu, parsed.page, parsed.global, global), parsed.extras);
}

/** The virtual address of a pane, using the same query prefix as its screen provider. */
export function paneHref(registry: Registry, screen: PaneScreen): string {
  const query = screen.query === '' || screen.query.startsWith('?') ? screen.query : `?${screen.query}`;
  return pathFor(registry.menuById(screen.menuId), screen.params) + query;
}
