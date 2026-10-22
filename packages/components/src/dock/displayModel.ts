/** What the layout looks like on screen, derived from the caller's tree, the maximized panel and the container width. Pure. */
import { panelOrder } from './commands';
import { dockGroups, type DockNode } from './schema';

type Dir = 'row' | 'column';

/**
 * Narrow display: one group of every panel, showing the first group's active panel (or the choice). Tabs are in `order` when the caller
 * has one (the board's pane numbers), else in depth-first order of the layout.
 */
export function stackedTree(layout: DockNode, choice?: string, order?: readonly string[]): DockNode {
  const depthFirst = panelOrder(layout);
  const panels = order ? [...depthFirst].sort((a, b) => order.indexOf(a) - order.indexOf(b)) : depthFirst;
  const first = dockGroups(layout)[0];
  const active = choice && panels.includes(choice) ? choice : first?.active ?? panels[0] ?? '';
  return { type: 'group', panels, active };
}

/** Panels whose content is on screen: the active tab of its group, and, while one is maximized, only inside that group. */
export function visiblePanelIds(display: DockNode, maximizedPanelId: string | null): Set<string> {
  const groups = dockGroups(display);
  const maximized = maximizedPanelId ? groups.find(group => group.panels.includes(maximizedPanelId)) : undefined;
  return new Set((maximized ? [maximized] : groups).map(group => group.active));
}

export type DockBoundary = {
  key: string;
  /** Child indices from the root to the branch. */
  path: number[];
  /** The boundary sits between child `index` and `index + 1`. */
  index: number;
  dir: Dir;
  before: string[];
  after: string[];
  /** The active panel of the first group on each side: the root `aria-controls` points at. */
  beforeControl: string;
  afterControl: string;
  /** Share of the pair in the branch, in points of the whole branch. */
  pairPercent: number;
  beforePercent: number;
  /** The least extent each side may keep along `dir`, in px. */
  minBefore: number;
  minAfter: number;
};

/** A panel's own minimum in px along the axes; what it leaves out falls back to the layout's `min`. */
export type PanelMinimums = ReadonlyMap<string, { minWidth?: number; minHeight?: number }>;

function minAlong(node: DockNode, axis: Dir, min: { width: number; height: number }, own?: PanelMinimums): number {
  // A group keeps the largest minimum of its tabs, so a boundary never asks the engine for less than it will keep.
  if (node.type === 'group') return Math.max(...node.panels.map(id => (axis === 'row' ? own?.get(id)?.minWidth ?? min.width : own?.get(id)?.minHeight ?? min.height)));
  const parts = node.children.map(child => minAlong(child, axis, min, own));
  return node.dir === axis ? parts.reduce((total, part) => total + part, 0) : Math.max(...parts);
}

/** Every boundary between adjacent children of a branch, in depth-first order. */
export function dockBoundaries(layout: DockNode, min: { width: number; height: number }, own?: PanelMinimums): DockBoundary[] {
  const found: DockBoundary[] = [];
  const walk = (node: DockNode, path: number[]) => {
    if (node.type === 'group') return;
    for (let index = 0; index + 1 < node.children.length; index++) {
      const before = node.children[index]!;
      const after = node.children[index + 1]!;
      found.push({
        key: `${path.join('.')}/${index}`, path, index, dir: node.dir, before: panelOrder(before), after: panelOrder(after),
        beforeControl: dockGroups(before)[0]!.active, afterControl: dockGroups(after)[0]!.active,
        pairPercent: node.sizes[index]! + node.sizes[index + 1]!, beforePercent: node.sizes[index]!,
        minBefore: minAlong(before, node.dir, min, own), minAfter: minAlong(after, node.dir, min, own),
      });
    }
    node.children.forEach((child, at) => { walk(child, [...path, at]); });
  };
  walk(layout, []);
  return found;
}

export type PairBounds = { min: number; max: number; now: number };

/** `aria-valuenow/min/max` of a boundary: the first side's share of the pair, in percent. Unmeasured pairs fall back to 10–90. */
export function pairBounds(boundary: DockBoundary, pairPx: number): PairBounds {
  const now = Math.round((boundary.beforePercent / boundary.pairPercent) * 100);
  if (!(pairPx > 0)) return { min: 10, max: 90, now };
  const min = Math.min(100, Math.ceil((boundary.minBefore / pairPx) * 100));
  const max = Math.max(0, 100 - Math.ceil((boundary.minAfter / pairPx) * 100));
  return min <= max ? { min, max, now } : { min: now, max: now, now };
}
