import { isRecord } from '@ap/contracts';

/**
 * Dock layout schema (ADR-0067 decision 4): one recursive tree shared by the board and the menu workspace.
 * Maximize is never stored. A menu workspace's `hidden` list and `preset` live in its own state (`PanelWorkspace`), not in this tree.
 */
export type DockNode =
  | { type: 'group'; panels: string[]; active: string }
  | { type: 'branch'; dir: 'row' | 'column'; sizes: number[]; children: DockNode[] };

type Group = Extract<DockNode, { type: 'group' }>;
type Branch = Extract<DockNode, { type: 'branch' }>;

const SUM_TOLERANCE = 0.01;

const isDir = (value: unknown): value is 'row' | 'column' => value === 'row' || value === 'column';
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
const validSizes = (sizes: unknown, count: number): sizes is number[] =>
  Array.isArray(sizes) && sizes.length === count && sizes.every(size => typeof size === 'number' && Number.isFinite(size) && size > 0)
  && Math.abs(sum(sizes) - 100) <= SUM_TOLERANCE;
const scale = (sizes: readonly number[], to: number) => { const total = sum(sizes); return sizes.map(size => (size / total) * to); };
const equalShares = (count: number) => Array.from({ length: count }, () => 100 / count);

/** A branch whose child is a branch of the same direction is the same split; the engine cannot represent the nesting, so both sides use the flat form. */
export function canonicalDockTree(node: DockNode): DockNode {
  if (node.type === 'group') return node;
  const children: DockNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, index) => {
    const share = node.sizes[index] ?? 0;
    const flat = canonicalDockTree(child);
    if (flat.type === 'branch' && flat.dir === node.dir) {
      flat.children.forEach((grandchild, at) => { children.push(grandchild); sizes.push((share * (flat.sizes[at] ?? 0)) / 100); });
    } else { children.push(flat); sizes.push(share); }
  });
  if (children.length === 1) return children[0]!;
  return { type: 'branch', dir: node.dir, sizes, children };
}

/** Groups in depth-first order. */
export function dockGroups(node: DockNode): Group[] {
  return node.type === 'group' ? [node] : node.children.flatMap(dockGroups);
}

/**
 * Groups in reading order: by the top edge each occupies, then the left edge (computed from the shares; a tolerance absorbs rounding). The
 * default 2×2 of `[1 3 | 2 4]` columns reads 1 2 / 3 4, where depth-first order says 1 3 2 4.
 */
export function dockGroupsInReadingOrder(node: DockNode): Group[] {
  const placed: { group: Group; top: number; left: number }[] = [];
  const walk = (current: DockNode, top: number, left: number, height: number, width: number) => {
    if (current.type === 'group') { placed.push({ group: current, top, left }); return; }
    const total = sum(current.sizes) || 1;
    let offset = 0;
    current.children.forEach((child, index) => {
      const share = (current.sizes[index] ?? 0) / total;
      if (current.dir === 'row') walk(child, top, left + offset * width, height, share * width);
      else walk(child, top + offset * height, left, share * height, width);
      offset += share;
    });
  };
  walk(node, 0, 0, 1, 1);
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-3;
  return placed.sort((a, b) => (same(a.top, b.top) ? a.left - b.left : a.top - b.top)).map(item => item.group);
}

function parse(raw: unknown, allowed: ReadonlySet<string>, seen: Set<string>): DockNode | null {
  if (!isRecord(raw)) return null;
  if (raw.type === 'group') {
    const panels: string[] = [];
    if (Array.isArray(raw.panels)) {
      for (const id of raw.panels) {
        if (typeof id === 'string' && allowed.has(id) && !seen.has(id)) { seen.add(id); panels.push(id); }
      }
    }
    if (panels.length === 0) return null;
    return { type: 'group', panels, active: typeof raw.active === 'string' && panels.includes(raw.active) ? raw.active : panels[0]! };
  }
  if (raw.type === 'branch' && isDir(raw.dir) && Array.isArray(raw.children)) {
    const original = raw.children as unknown[];
    const kept: { node: DockNode; size: number }[] = [];
    const usable = validSizes(raw.sizes, original.length);
    original.forEach((child, index) => {
      const node = parse(child, allowed, seen);
      if (node) kept.push({ node, size: usable ? (raw.sizes as number[])[index]! : 1 });
    });
    if (kept.length === 0) return null;
    // Valid sizes survive dropped siblings proportionally; anything else becomes equal shares.
    const sizes = usable ? scale(kept.map(item => item.size), 100) : equalShares(kept.length);
    return canonicalDockTree({ type: 'branch', dir: raw.dir, sizes, children: kept.map(item => item.node) });
  }
  return null;
}

/**
 * Repairs any value into a valid tree over exactly `panelIds`. Unknown and duplicate ids are dropped, empty groups removed, one-child
 * branches collapsed, `active` repaired, bad sizes replaced with equal shares and missing ids appended to the first group
 * (depth-first). Anything unusable becomes one group of all ids. Never throws.
 */
export function normalizeDockTree(raw: unknown, panelIds: readonly string[]): DockNode {
  const ids = [...new Set(panelIds)];
  const allowed = new Set(ids);
  const seen = new Set<string>();
  let tree: DockNode | null = null;
  try { tree = parse(raw, allowed, seen); } catch { tree = null; seen.clear(); }
  if (!tree) return { type: 'group', panels: ids, active: ids[0] ?? '' };
  const missing = ids.filter(id => !seen.has(id));
  if (missing.length === 0) return tree;
  const first = dockGroups(tree)[0]!;
  const append = (node: DockNode): DockNode => node === first ? { ...first, panels: [...first.panels, ...missing] }
    : node.type === 'group' ? node : { ...node, children: node.children.map(append) };
  return append(tree);
}

/** The schema invariants, for callers that must reject instead of repair. */
export function isValidDockTree(tree: unknown, panelIds: readonly string[]): boolean {
  const expected = new Set(panelIds);
  const seen = new Set<string>();
  const check = (node: unknown): boolean => {
    if (!isRecord(node)) return false;
    if (node.type === 'group') {
      const panels = node.panels;
      if (!Array.isArray(panels) || panels.length === 0 || typeof node.active !== 'string' || !panels.includes(node.active)) return false;
      return panels.every(id => typeof id === 'string' && expected.has(id) && !seen.has(id) && (seen.add(id), true));
    }
    if (node.type === 'branch') {
      const children = node.children;
      if (!isDir(node.dir) || !Array.isArray(children) || children.length < 2 || !validSizes(node.sizes, children.length)) return false;
      return children.every(check);
    }
    return false;
  };
  return check(tree) && seen.size === expected.size;
}

export const dockBranch = (dir: Branch['dir'], sizes: number[], children: DockNode[]): Branch => ({ type: 'branch', dir, sizes, children });
