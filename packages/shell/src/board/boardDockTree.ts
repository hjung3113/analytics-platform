import type { DockNode } from '@ap/components/dock';
import type { LayoutNode, Sheet } from './boardTypes';

/**
 * The dock renderer's view of a sheet's layout tree (ADR-0067). `LayoutNode` and `DockNode` are the same recursive tree; only the group's
 * member list is named differently (`panes` here, `panels` in the shared schema). Both directions are pure copies.
 */
export function toDockTree(tree: LayoutNode): DockNode {
  return tree.type === 'group'
    ? { type: 'group', panels: [...tree.panes], active: tree.active }
    : { type: 'branch', dir: tree.dir, sizes: [...tree.sizes], children: tree.children.map(toDockTree) };
}

export function fromDockTree(node: DockNode): LayoutNode {
  return node.type === 'group'
    ? { type: 'group', panes: [...node.panels], active: node.active }
    : { type: 'branch', dir: node.dir, sizes: [...node.sizes], children: node.children.map(fromDockTree) };
}

type GroupNode = Extract<LayoutNode, { type: 'group' }>;

/** Groups in depth-first order. */
export function groupsOf(tree: LayoutNode): GroupNode[] {
  return tree.type === 'group' ? [tree] : tree.children.flatMap(groupsOf);
}

export const groupHolding = (tree: LayoutNode, paneId: string): GroupNode | undefined => groupsOf(tree).find(group => group.panes.includes(paneId));

/** The tree with `paneId` the active tab of its group; the same object when it already is. An unknown id changes nothing. */
export function activateInTree(tree: LayoutNode, paneId: string): LayoutNode {
  const group = groupHolding(tree, paneId);
  if (!group || group.active === paneId) return tree;
  const walk = (node: LayoutNode): LayoutNode => (node.type === 'group'
    ? (node === group ? { ...node, active: paneId } : node)
    : { ...node, children: node.children.map(walk) });
  return walk(tree);
}

/** The layout the dock renderer shows: the stored tree with the selected pane in front of its group (a board is opened with its first pane selected, whatever the stored active tab). */
export const effectiveTree = (sheet: Sheet): LayoutNode => activateInTree(sheet.tree, sheet.selectedPaneId);

/**
 * The selection follows the tree (ADR-0067 decision 11): a selected pane that is no longer the active tab of its group (a drag or a
 * command put another tab in front) gives way to that group's active pane. The same object when the selection already is the active tab.
 */
export function reconcileSelection(sheet: Sheet): Sheet {
  const group = groupHolding(sheet.tree, sheet.selectedPaneId);
  return group && group.active !== sheet.selectedPaneId ? { ...sheet, selectedPaneId: group.active } : sheet;
}

const group = (id: string): LayoutNode => ({ type: 'group', panes: [id], active: id });
const branch = (dir: 'row' | 'column', ...children: LayoutNode[]): LayoutNode => ({ type: 'branch', dir, sizes: children.map(() => 100 / children.length), children });

/**
 * `기본 배치` for the pane count: the shapes the grid gives 1, 2 and 4 panes (a row of two columns of two for four), and for three panes a
 * row of pane 1 beside a column of panes 2 and 3. `ids` are in pane-number order.
 */
export function defaultTree(ids: readonly string[]): LayoutNode {
  if (ids.length <= 1) return group(ids[0]!);
  if (ids.length === 2) return branch('row', group(ids[0]!), group(ids[1]!));
  if (ids.length === 3) return branch('row', group(ids[0]!), branch('column', group(ids[1]!), group(ids[2]!)));
  return branch('row', branch('column', group(ids[0]!), group(ids[2]!)), branch('column', group(ids[1]!), group(ids[3]!)));
}

/** The structure of a tree without sizes and active tabs: what "the same arrangement" means for an undo that must not undo a later resize. */
export const treeShape = (node: LayoutNode): unknown => (node.type === 'group' ? node.panes : { dir: node.dir, children: node.children.map(treeShape) });

/** The panes under a node, as one order-free key: two nodes with the same key hold the same panes. */
const paneKey = (node: LayoutNode, without?: string): string => groupsOf(node).flatMap(g => g.panes).filter(id => id !== without).sort().join('\n');

/**
 * `before` (a tree that held `slotId`) with every size and active tab that still exists in `current` (the same tree after `slotId` was
 * removed and the user went on) taken from `current`. Only what the removal changed comes from `before`: the restored pane's own share, which
 * the survivors of that branch give up in proportion, so a resize made after the removal stays a resize. Nodes are matched by the panes they hold.
 */
export function reinsertPane(before: LayoutNode, current: LayoutNode, slotId: string): LayoutNode {
  const byPanes = new Map<string, LayoutNode>();
  const collect = (node: LayoutNode) => { byPanes.set(paneKey(node), node); if (node.type === 'branch') node.children.forEach(collect); };
  collect(current);
  const adopt = (node: LayoutNode): LayoutNode => {
    const match = byPanes.get(paneKey(node, slotId));
    if (node.type === 'group') return { ...node, panes: [...node.panes], active: match?.type === 'group' ? match.active : node.active };
    let sizes = [...node.sizes];
    if (match?.type === 'branch' && match.dir === node.dir) {
      const own = node.children.findIndex(child => child.type === 'group' && child.panes.length === 1 && child.panes[0] === slotId);
      if (match.children.length === node.children.length) sizes = [...match.sizes];
      else if (own >= 0 && match.children.length === node.children.length - 1) {
        const rest = 100 - node.sizes[own]!;
        sizes = match.sizes.map(size => (size * rest) / 100);
        sizes.splice(own, 0, node.sizes[own]!);
      }
    }
    return { ...node, sizes, children: node.children.map(adopt) };
  };
  return adopt(before);
}

/** The area a board is assumed to have when a pure function must pick the longer side of a group (the real size is only known to the renderer). */
const NOMINAL_BOARD = { width: 1200, height: 700 };

/** The group with the most area (the first in depth-first order on a tie) and its size in the nominal board. */
export function largestGroup(tree: LayoutNode): { group: GroupNode; width: number; height: number } {
  let best: { group: GroupNode; width: number; height: number } | null = null;
  const walk = (node: LayoutNode, width: number, height: number) => {
    if (node.type === 'group') {
      if (!best || width * height > best.width * best.height + 1e-6) best = { group: node, width, height };
      return;
    }
    node.children.forEach((child, i) => { walk(child, node.dir === 'row' ? (width * node.sizes[i]!) / 100 : width, node.dir === 'row' ? height : (height * node.sizes[i]!) / 100); });
  };
  walk(tree, NOMINAL_BOARD.width, NOMINAL_BOARD.height);
  return best!;
}
