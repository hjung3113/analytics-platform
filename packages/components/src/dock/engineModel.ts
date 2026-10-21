/**
 * Our tree <-> the engine's serialised grid, as plain data. No engine import: the shapes are described locally so they never reach the
 * public API. Sizes follow the engine's convention (`serializeBranchNode`, dockview-core main.esm.mjs:2336): a node's `size` is its extent
 * along its parent's split axis; the root's is the orthogonal extent.
 */
import { canonicalDockTree, type DockNode } from './schema';

export type EngineLeaf = { type: 'leaf'; data: { id: string; views: string[]; activeView: string }; size: number };
export type EngineBranch = { type: 'branch'; data: EngineNode[]; size: number };
export type EngineNode = EngineLeaf | EngineBranch;
export type EnginePanelState = { id: string; contentComponent: string; tabComponent: string; title: string; renderer: 'always'; minimumWidth: number; minimumHeight: number };
export type EngineLayout = {
  grid: { root: EngineBranch; width: number; height: number; orientation: 'HORIZONTAL' | 'VERTICAL' };
  panels: Record<string, EnginePanelState>;
};

/** The size to lay out against while the container has none yet (before the first measure); the engine keeps ratios when it is resized. */
export const NOMINAL_SIZE = 1000;

export function toEngineLayout(
  tree: DockNode, panels: readonly { id: string; title: string }[], min: { width: number; height: number }, size: { width: number; height: number },
): EngineLayout {
  const width = size.width > 0 ? size.width : NOMINAL_SIZE;
  const height = size.height > 0 ? size.height : NOMINAL_SIZE;
  const flat = canonicalDockTree(tree);
  let groups = 0;
  const node = (current: DockNode, w: number, h: number, parentDir: 'row' | 'column'): EngineNode => {
    const extent = parentDir === 'row' ? w : h;
    if (current.type === 'group') return { type: 'leaf', data: { id: `dock-group-${groups++}`, views: [...current.panels], activeView: current.active }, size: extent };
    return { type: 'branch', data: children(current, w, h), size: extent };
  };
  const children = (branch: Extract<DockNode, { type: 'branch' }>, w: number, h: number): EngineNode[] => branch.children.map((child, index) => {
    const share = branch.sizes[index]! / 100;
    return branch.dir === 'row' ? node(child, w * share, h, 'row') : node(child, w, h * share, 'column');
  });
  const root: EngineBranch = flat.type === 'group'
    ? { type: 'branch', data: [node(flat, width, height, 'row')], size: height }
    : { type: 'branch', data: children(flat, width, height), size: flat.dir === 'row' ? height : width };
  return {
    grid: { root, width, height, orientation: flat.type === 'branch' && flat.dir === 'column' ? 'VERTICAL' : 'HORIZONTAL' },
    panels: Object.fromEntries(panels.map(panel => [panel.id, {
      id: panel.id, contentComponent: 'panel', tabComponent: 'tab', title: panel.title, renderer: 'always' as const, minimumWidth: min.width, minimumHeight: min.height,
    }])),
  };
}

const roundShares = (sizes: number[]): number[] => {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  const shares = sizes.map(size => Math.round((size / total) * 1e4) / 1e2);
  shares[shares.length - 1] = Math.round((100 - shares.slice(0, -1).reduce((sum, share) => sum + share, 0)) * 100) / 100;
  return shares;
};

/** Reads the engine's serialised grid back. `measured` is false when any split had no size (jsdom, hidden container): those get equal shares. */
export function fromEngineLayout(json: { grid: { root: EngineBranch; orientation: 'HORIZONTAL' | 'VERTICAL' } }): { tree: DockNode; measured: boolean } {
  let measured = true;
  const read = (node: EngineNode, dir: 'row' | 'column'): DockNode => {
    if (node.type === 'leaf') {
      const views = node.data.views;
      return { type: 'group', panels: [...views], active: views.includes(node.data.activeView) ? node.data.activeView : views[0]! };
    }
    const kids = node.data.map(child => read(child, dir === 'row' ? 'column' : 'row'));
    const sizes = node.data.map(child => child.size);
    const total = sizes.reduce((sum, size) => sum + size, 0);
    if (!(total > 0) || sizes.some(size => !(size >= 0))) measured = false;
    return { type: 'branch', dir, sizes: total > 0 && sizes.every(size => size > 0) ? roundShares(sizes) : kids.map(() => 100 / kids.length), children: kids };
  };
  const rootDir = json.grid.orientation === 'VERTICAL' ? 'column' : 'row';
  return { tree: canonicalDockTree(read(json.grid.root, rootDir)), measured };
}

/** Same structure, same tab order and active tabs; sizes compared only when `sizes` is set, within `tolerance` points. */
export function sameDockTree(a: DockNode, b: DockNode, options: { sizes: boolean; tolerance?: number }): boolean {
  const tolerance = options.tolerance ?? 0.5;
  if (a.type === 'group') {
    return b.type === 'group' && a.active === b.active && a.panels.length === b.panels.length && a.panels.every((id, index) => id === b.panels[index]);
  }
  if (b.type !== 'branch' || a.dir !== b.dir || a.children.length !== b.children.length) return false;
  if (options.sizes && a.sizes.some((size, index) => Math.abs(size - b.sizes[index]!) > tolerance)) return false;
  return a.children.every((child, index) => sameDockTree(child, b.children[index]!, options));
}
