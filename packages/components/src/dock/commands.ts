/**
 * Pure layout commands: the keyboard and menu path that is equal to a drag (ADR-0067 decision 7). Every command returns a new valid
 * tree and never mutates its input. Unknown panel ids and an impossible request are programmer errors and throw a `RangeError`;
 * callers guard (the board cannot remove its last pane, the menu only offers moves that exist).
 */
import { canonicalDockTree, dockGroups, type DockNode } from './schema';

type Group = Extract<DockNode, { type: 'group' }>;
type Branch = Extract<DockNode, { type: 'branch' }>;
export type DockEdge = 'left' | 'right' | 'top' | 'bottom';
export type DockDropPosition = 'center' | DockEdge;

const clone = <T extends DockNode>(node: T): T => JSON.parse(JSON.stringify(node)) as T;
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const round = (value: number) => Math.round(value * 1e4) / 1e4;

type Location = { group: Group; parent: Branch | null; index: number };

function locate(root: DockNode, panelId: string): Location | undefined {
  const walk = (node: DockNode, parent: Branch | null, index: number): Location | undefined => {
    if (node.type === 'group') return node.panels.includes(panelId) ? { group: node, parent, index } : undefined;
    for (let at = 0; at < node.children.length; at++) {
      const found = walk(node.children[at]!, node, at);
      if (found) return found;
    }
    return undefined;
  };
  return walk(root, null, 0);
}

function require(root: DockNode, panelId: string): Location {
  const found = locate(root, panelId);
  if (!found) throw new RangeError(`dock: unknown panel "${panelId}"`);
  return found;
}

/** The panels of a subtree in depth-first order. */
export function panelOrder(tree: DockNode): string[] {
  return dockGroups(tree).flatMap(group => group.panels);
}

export function groupOf(tree: DockNode, panelId: string): { panels: string[]; active: string } | undefined {
  const found = locate(tree, panelId);
  return found ? { panels: [...found.group.panels], active: found.group.active } : undefined;
}

export function activatePanel(tree: DockNode, panelId: string): DockNode {
  const next = clone(tree);
  require(next, panelId).group.active = panelId;
  return next;
}

/** Takes the panel out of its group. A group that empties leaves its branch (sizes renormalise, one-child branches collapse). Null = nothing left. */
function detach(root: DockNode, panelId: string): DockNode | null {
  const { group, parent, index } = require(root, panelId);
  if (group.panels.length > 1) {
    const at = group.panels.indexOf(panelId);
    group.panels.splice(at, 1);
    if (group.active === panelId) group.active = group.panels[Math.min(at, group.panels.length - 1)]!;
    return root;
  }
  if (!parent) return null;
  parent.children.splice(index, 1);
  parent.sizes.splice(index, 1);
  const remaining = sum(parent.sizes);
  parent.sizes = parent.sizes.map(size => (size / remaining) * 100);
  return canonicalDockTree(root);
}

/** Puts a new group holding `panelId` beside the target's group, or the panel into the target's group as the active tab. */
function insert(root: DockNode, panelId: string, target: { panelId: string; position: DockDropPosition }): DockNode {
  const { group, parent, index } = require(root, target.panelId);
  if (target.position === 'center') {
    group.panels.push(panelId);
    group.active = panelId;
    return root;
  }
  const dir: Branch['dir'] = target.position === 'left' || target.position === 'right' ? 'row' : 'column';
  const before = target.position === 'left' || target.position === 'top';
  const created: Group = { type: 'group', panels: [panelId], active: panelId };
  if (parent && parent.dir === dir) {
    const half = parent.sizes[index]! / 2;
    parent.sizes.splice(index, 1, half, half);
    parent.children.splice(before ? index : index + 1, 0, created);
    return canonicalDockTree(root);
  }
  const replacement: Branch = { type: 'branch', dir, sizes: [50, 50], children: before ? [created, group] : [group, created] };
  if (parent) { parent.children[index] = replacement; return canonicalDockTree(root); }
  return canonicalDockTree(replacement);
}

/** `center` joins the target's group as the active tab; an edge splits the target's group (the new group holds only `panelId`). */
export function movePanel(tree: DockNode, panelId: string, target: { panelId: string; position: DockDropPosition }): DockNode {
  const next = clone(tree);
  const source = require(next, panelId);
  require(next, target.panelId);
  const sameGroup = source.group.panels.includes(target.panelId);
  if (sameGroup && target.position === 'center') { source.group.active = panelId; return next; }
  if (sameGroup && source.group.panels.length === 1) return next;
  const detached = detach(next, panelId);
  if (!detached) return next;
  return insert(detached, panelId, target);
}

export function addPanel(tree: DockNode, panelId: string, near: { panelId: string; position: 'center' | 'right' | 'bottom' }): DockNode {
  const next = clone(tree);
  if (locate(next, panelId)) throw new RangeError(`dock: panel "${panelId}" already exists`);
  return insert(next, panelId, near);
}

/** Throws when `panelId` is the last panel. */
export function removePanel(tree: DockNode, panelId: string): DockNode {
  const next = clone(tree);
  const detached = detach(next, panelId);
  if (!detached) throw new RangeError('dock: cannot remove the last panel');
  return detached;
}

/**
 * Moves the boundary between child `index` and `index + 1` of the branch at `branchPath` (child indices from the root) by `deltaPercent`
 * points of the branch. `minPercent` is the least each side may keep, in the same points; an impossible pair is left as it is.
 */
export function resizeBoundary(tree: DockNode, branchPath: readonly number[], index: number, deltaPercent: number, minPercent: [number, number]): DockNode {
  const next = clone(tree);
  let node: DockNode = next;
  for (const step of branchPath) {
    if (node.type !== 'branch' || !node.children[step]) throw new RangeError('dock: no branch at that path');
    node = node.children[step]!;
  }
  if (node.type !== 'branch' || index < 0 || index + 1 >= node.children.length) throw new RangeError('dock: no boundary at that index');
  const before = node.sizes[index]!;
  const total = before + node.sizes[index + 1]!;
  const low = minPercent[0];
  const high = total - minPercent[1];
  if (low > high) return next;
  const moved = Math.min(high, Math.max(low, before + deltaPercent));
  node.sizes[index] = round(moved);
  node.sizes[index + 1] = round(total - moved);
  return next;
}
