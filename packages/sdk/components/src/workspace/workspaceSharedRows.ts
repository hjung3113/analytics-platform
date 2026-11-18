import { isRecord } from '@ap/contracts';
import { panelOrder } from '../dock/commands';
import { dockBranch, normalizeDockTree, type DockNode } from '../dock/schema';
import { topLevelRows } from './workspaceRows';

export type SharedRow = { id: string; panels: readonly string[] };
export type SharedRowSize = { id: string; share?: number; height?: number; widths?: Record<string, number> };

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const share = (value: unknown): value is number => positive(value) && value <= 100;
const stableShare = (value: number) => Number(value.toPrecision(12));
const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);

export function readSharedRowSizes(raw: unknown): SharedRowSize[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(entry => {
    if (!isRecord(entry) || typeof entry.id !== 'string') return [];
    const widths = isRecord(entry.widths) ? Object.entries(entry.widths).filter((pair): pair is [string, number] => share(pair[1])) : [];
    return [{
      id: entry.id,
      ...(share(entry.share) && entry.share < 100 ? { share: entry.share } : {}),
      ...(positive(entry.height) && entry.height <= 20000 ? { height: Math.round(entry.height) } : {}),
      ...(widths.length > 1 ? { widths: Object.fromEntries(widths) } : {}),
    }];
  });
}

function rowMembers(row: DockNode): string[] {
  const children = row.type === 'branch' && row.dir === 'row' ? row.children : [row];
  if (children.some(child => child.type !== 'group' || child.panels.length !== 1)) return [];
  return panelOrder(row);
}

export function sharedRowOf(row: DockNode, declarations: readonly SharedRow[]) {
  const members = rowMembers(row);
  return members.length ? declarations.find(item => members.every(id => item.panels.includes(id))) : undefined;
}

export type LegacyFitShare = { panels: readonly string[]; share: number };

/** Read fit shares by the stored panels before visibility can redistribute them. */
export function legacyFitShares(layout: DockNode, primaryId: string): LegacyFitShare[] {
  if (layout.type !== 'branch' || layout.dir !== 'column') return [];
  return layout.children.flatMap((row, index) => {
    const panels = rowMembers(row);
    return panels.length && !panels.includes(primaryId) ? [{ panels, share: layout.sizes[index]! }] : [];
  });
}

/** Save only dimensions changed by a resize in the same arrangement. Hidden columns keep their relative weights. */
export function rememberSharedRowSizes(previous: DockNode, layout: DockNode, declarations: readonly SharedRow[], sizes: readonly SharedRowSize[], { stack, previousHeights, heights }: {
  stack: boolean; previousHeights?: readonly number[]; heights?: readonly number[];
}): SharedRowSize[] {
  const result = new Map(sizes.map(value => [value.id, value]));
  const beforeRows = topLevelRows(previous);
  topLevelRows(layout).forEach((row, index) => {
    const declaration = sharedRowOf(row, declarations);
    if (!declaration) return;
    const old = result.get(declaration.id);
    const height = stack && heights?.[index] !== previousHeights?.[index] ? heights?.[index] : undefined;
    const rowShare = !stack && previous.type === 'branch' && layout.type === 'branch' && layout.dir === 'column'
      && previous.sizes[index] !== layout.sizes[index] ? layout.sizes[index] : undefined;
    const before = beforeRows[index];
    let widths: SharedRowSize['widths'];
    if (row.type === 'branch' && before?.type === 'branch' && row.sizes.some((size, at) => size !== before.sizes[at])) {
      const members = rowMembers(row);
      const weights = old?.widths ?? {};
      const pool = sum(members.map(id => Object.hasOwn(weights, id) ? weights[id]! : 100 / members.length));
      widths = { ...weights, ...Object.fromEntries(members.map((id, at) => [id, stableShare((row.sizes[at]! * pool) / 100)])) };
    }
    if (height === undefined && rowShare === undefined && widths === undefined) return;
    result.set(declaration.id, {
      ...old, id: declaration.id,
      ...(height !== undefined ? { height } : {}),
      ...(rowShare !== undefined ? { share: rowShare } : {}),
      ...(widths ? { widths } : {}),
    });
  });
  return [...result.values()];
}

/** Named rows follow the base arrangement and precede independent last rows. Their members follow declaration order. */
export function placeSharedRows(layout: DockNode, shown: readonly string[], declarations: readonly SharedRow[], sizes: readonly SharedRowSize[], below: readonly string[]): DockNode {
  const rows = declarations.map(row => ({ ...row, panels: row.panels.filter(id => shown.includes(id)) })).filter(row => row.panels.length > 0);
  if (!rows.length) return layout;
  const managed = new Set(rows.flatMap(row => row.panels));
  const base = normalizeDockTree(layout, shown.filter(id => !managed.has(id)));
  const baseRows = topLevelRows(base);
  const baseShares = base.type === 'branch' && base.dir === 'column' ? base.sizes : [100];
  const fallback = 100 / (baseRows.length + rows.length);
  const remembered = rows.map(row => sizes.find(item => item.id === row.id));
  const rowShares = remembered.map(item => item?.share ?? fallback);
  const reserved = sum(rowShares);
  // A row saved while other rows were absent can claim too much when all return together.
  const budget = reserved < 100 ? reserved : 100 - fallback;
  const entries = baseRows.map((node, index) => ({ node, size: (baseShares[index]! * (100 - budget)) / 100 }));
  const firstBelow = entries.findIndex(({ node }) => node.type === 'group' && node.panels.length === 1 && below.includes(node.active));
  const shared = rows.map((row, index) => {
    const children: DockNode[] = row.panels.map(id => ({ type: 'group', panels: [id], active: id }));
    const widths = remembered[index]?.widths ?? {};
    const weights = row.panels.map(id => Object.hasOwn(widths, id) ? widths[id]! : 100 / row.panels.length);
    const node = children.length === 1 ? children[0]! : dockBranch('row', weights.map(weight => stableShare((weight * 100) / sum(weights))), children);
    return { node, size: (rowShares[index]! * budget) / reserved };
  });
  entries.splice(firstBelow < 0 ? entries.length : firstBelow, 0, ...shared);
  return dockBranch('column', entries.map(entry => entry.size), entries.map(entry => entry.node));
}

export function restoreSharedRowHeights(layout: DockNode, heights: readonly number[], declarations: readonly SharedRow[], sizes: readonly SharedRowSize[]): number[] {
  return topLevelRows(layout).map((row, index) => {
    const declaration = sharedRowOf(row, declarations);
    return sizes.find(size => size.id === declaration?.id)?.height ?? heights[index]!;
  });
}
