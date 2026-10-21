/** What the layout looks like on screen, derived from the caller's tree, the maximized panel and the container width. Pure. */
import { panelOrder } from './commands';
import { dockGroups, type DockNode } from './schema';

type Dir = 'row' | 'column';

/** Narrow display: one group of every panel in depth-first order, showing the first group's active panel (or the local choice). */
export function stackedTree(layout: DockNode, choice?: string): DockNode {
  const panels = panelOrder(layout);
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

function minAlong(node: DockNode, axis: Dir, min: { width: number; height: number }): number {
  if (node.type === 'group') return axis === 'row' ? min.width : min.height;
  const parts = node.children.map(child => minAlong(child, axis, min));
  return node.dir === axis ? parts.reduce((total, part) => total + part, 0) : Math.max(...parts);
}

/** Every boundary between adjacent children of a branch, in depth-first order. */
export function dockBoundaries(layout: DockNode, min: { width: number; height: number }): DockBoundary[] {
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
        minBefore: minAlong(before, node.dir, min), minAfter: minAlong(after, node.dir, min),
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
