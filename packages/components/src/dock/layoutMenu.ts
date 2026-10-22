/**
 * What a panel's layout menu offers (board `칸 N 동작` and the menu workspace's `<제목> 동작` share it): maximize or restore, split a tab
 * group, move into another group. Pure: the caller draws the items and runs them with `movePanel`.
 */
import { dockGroups, type DockNode } from './schema';

export type DockGroupInfo = { panels: string[]; active: string };

export type DockLayoutMenu =
  /** The panel's group is maximized: restore is the only item. */
  | { maximized: true }
  | {
      maximized: false;
      /** The other panel of the group to split against (`movePanel(…, { panelId: split, position: 'right' | 'bottom' })`); null for a group of one. */
      split: string | null;
      /** The other groups, ordered by `orderOf` ascending. `target` is the group's active panel (`movePanel(…, { panelId: target, position: 'center' })`). */
      moves: { order: number; target: string; group: DockGroupInfo }[];
    };

/**
 * `orderOf` is the caller's: the board numbers a group by its lowest pane number, which a `DockNode` does not carry; the menu workspace
 * passes the group's place in reading order. The helper never orders on its own.
 */
export function dockLayoutMenu(tree: DockNode, panelId: string, options: { maximized: boolean; orderOf: (group: DockGroupInfo) => number }): DockLayoutMenu {
  if (options.maximized) return { maximized: true };
  const groups = dockGroups(tree);
  const mine = groups.find(group => group.panels.includes(panelId));
  const moves = mine
    ? groups.filter(group => group !== mine).map(group => ({ order: options.orderOf(group), target: group.active, group })).sort((a, b) => a.order - b.order)
    : [];
  return { maximized: false, split: mine && mine.panels.length >= 2 ? mine.panels.find(id => id !== panelId)! : null, moves };
}
