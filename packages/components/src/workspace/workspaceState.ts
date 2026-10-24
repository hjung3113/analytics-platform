/**
 * Pure state of a menu workspace (ADR-0067 decisions 3-5, 18-20): which preset is current, the dock tree, which panels are hidden.
 * Maximize is never part of it. No React, no storage.
 */
import { isRecord } from '@ap/contracts';
import { activatePanel, addPanel, groupOf, panelOrder, removePanel } from '../dock/commands';
import { dockGroupsInReadingOrder, normalizeDockTree, type DockNode } from '../dock/schema';
import { enterRows, reconcileRows, ROW_MIN_HEIGHT, topLevelRows, withRowShares, type RowMinimum } from './workspaceRows';

/** The arrangement a preset describes. Structurally the dock tree; `sizes` are ratios (any positive numbers, only their proportions count). */
export type PanelWorkspaceLayout =
  | { type: 'group'; panels: string[]; active?: string }
  | { type: 'branch'; dir: 'row' | 'column'; sizes: number[]; children: PanelWorkspaceLayout[] };

/**
 * `mode` absent = fit (the workspace fills its container); `'stack'` = the top-level rows keep their own px in `rows` (the single source; the
 * layout's top-level shares are their projection). Both are optional so a state written before them still loads and an older reader ignores them.
 */
export type WorkspaceState = { v: 1; preset: string; layout: DockNode; hidden: string[]; mode?: 'stack'; rows?: number[] };
export type WorkspacePreset = { id: string; layout: PanelWorkspaceLayout };

/** Static identifiers only: nothing from data can reach a storage key. */
export const WORKSPACE_ID = /^[a-z][a-z0-9._-]{0,63}$/;

/** Ratios -> shares of 100; anything unusable is left for `normalizeDockTree` (equal shares). */
function toShares(layout: unknown): unknown {
  if (!isRecord(layout) || layout.type !== 'branch' || !Array.isArray(layout.children)) return layout;
  const children = layout.children.map(toShares);
  const sizes = layout.sizes;
  const usable = Array.isArray(sizes) && sizes.length === children.length && sizes.every(size => typeof size === 'number' && Number.isFinite(size) && size > 0);
  const total = usable ? (sizes as number[]).reduce((sum, size) => sum + size, 0) : 0;
  return { ...layout, children, sizes: usable ? (sizes as number[]).map(size => (size / total) * 100) : undefined };
}

/** The preset's tree over exactly `ids` (panels the preset does not name join its first group; ids it names that are not in `ids` are dropped). */
export function presetTree(layout: PanelWorkspaceLayout, ids: readonly string[]): DockNode {
  return normalizeDockTree(toShares(layout), ids);
}

/** Every string the raw value names as a panel id, however malformed the rest is. */
function namedIds(raw: unknown, found = new Set<string>(), depth = 0): Set<string> {
  if (!isRecord(raw) || depth > 32) return found;
  if (Array.isArray(raw.panels)) raw.panels.forEach(id => { if (typeof id === 'string') found.add(id); });
  if (Array.isArray(raw.children)) raw.children.forEach(child => { namedIds(child, found, depth + 1); });
  return found;
}

export type WorkspaceSpec = {
  panelIds: readonly string[]; primaryId: string; presets: readonly WorkspacePreset[]; initialPreset: string;
  /** Least px of a row in stack mode; default 200. */
  rowMinimum?: RowMinimum;
  /** Height mode of a workspace nobody has touched; a saved preference (fit included) always wins. Default fit. */
  initialMode?: 'fit' | 'stack';
};

/** Sanity bound on a stored row height: anything above is a corrupt value, not a layout. */
const MAX_STORED_ROW_PX = 20000;

/** The height mode of `state`: fit (no `mode`, no `rows`), or stack with `rows` (absent while they are still to be measured). */
export function withRows(state: WorkspaceState, mode: 'fit' | 'stack', rows?: readonly number[]): WorkspaceState {
  const base = { v: 1 as const, preset: state.preset, layout: state.layout, hidden: state.hidden };
  if (mode === 'fit') return base;
  return rows ? { ...base, layout: withRowShares(base.layout, rows), mode: 'stack', rows: [...rows] } : { ...base, mode: 'stack' };
}

/** What stack mode needs from the page to size rows: the least height per row, the most a row may be given, and the height fit mode gives the layout. */
export type RowEnv = { minimum: RowMinimum; maximum: number; baseline: number };

/**
 * `next` is `previous` after an edit; the rows follow it. Fit: no rows. Stack, `keep`: rows that keep their panels keep their px, a new row
 * gets 360, a gone row is dropped (rows still to be measured stay so). Stack, `enter` (preset, `기본 배치`): rows are derived again from the new
 * shares and the baseline, never from the current stack height. `created`: the panel the edit moved into a row of its own (see `reconcileRows`).
 */
export function settleRows(previous: WorkspaceState, next: WorkspaceState, how: 'keep' | 'enter', env: RowEnv, created?: string): WorkspaceState {
  if (next === previous) return previous;
  if (next.mode !== 'stack') return next.mode !== undefined || next.rows !== undefined ? withRows(next, 'fit') : next;
  if (how === 'enter') return withRows(next, 'stack', enterRows(next.layout, env.baseline, env.minimum, env.maximum));
  if (previous.rows === undefined || previous.rows.length !== topLevelRows(previous.layout).length) return withRows(next, 'stack');
  return withRows(next, 'stack', reconcileRows(previous.layout, previous.rows, next.layout, env.minimum, env.maximum, created));
}

/** Brings the stored mode and rows of `raw` onto the repaired `state`: anything but a valid stack mode is fit; rows that do not fit the layout are left to be measured. */
function restoreRows(raw: Record<string, unknown>, state: WorkspaceState, spec: WorkspaceSpec): WorkspaceState {
  if (raw.mode !== 'stack') return state;
  const rows = topLevelRows(state.layout);
  const given = raw.rows;
  if (!Array.isArray(given) || given.length !== rows.length || !given.every(px => typeof px === 'number' && Number.isFinite(px) && px > 0 && px <= MAX_STORED_ROW_PX)) return withRows(state, 'stack');
  const minimum = spec.rowMinimum ?? (() => ROW_MIN_HEIGHT);
  return withRows(state, 'stack', rows.map((row, index) => Math.max(minimum(row), Math.round(given[index] as number))));
}

const presetOf = (spec: WorkspaceSpec, id: string) => spec.presets.find(preset => preset.id === id) ?? spec.presets[0]!;

/** The state of a workspace nobody has touched: the initial preset, nothing hidden, the menu's `initialMode` (stack without rows: they are measured once). */
export function initialWorkspaceState(spec: WorkspaceSpec): WorkspaceState {
  const preset = presetOf(spec, spec.initialPreset);
  const state: WorkspaceState = { v: 1, preset: preset.id, layout: presetTree(preset.layout, spec.panelIds), hidden: [] };
  return spec.initialMode === 'stack' ? { ...state, mode: 'stack' } : state;
}

/**
 * Repairs any value into a valid state for `spec`. Never throws. A wrong `v` or a value that is not an object gives the initial state;
 * an unknown preset keeps the layout and falls back to the initial preset's name; `hidden` keeps known, non-primary, distinct ids; a
 * panel that is neither in the tree nor hidden joins the primary's group (behind its active tab); the primary is never hidden. `mode` other
 * than `'stack'` is fit; stack `rows` that are not finite positive numbers, or not one per top-level row, are dropped (the workspace measures
 * them again), and each is raised to its row's minimum.
 */
export function normalizeWorkspaceState(raw: unknown, spec: WorkspaceSpec): WorkspaceState {
  try {
    if (!isRecord(raw) || raw.v !== 1) return initialWorkspaceState(spec);
    const known = new Set(spec.panelIds);
    const hidden = Array.isArray(raw.hidden)
      ? [...new Set(raw.hidden.filter((id): id is string => typeof id === 'string' && known.has(id) && id !== spec.primaryId))]
      : [];
    const preset = typeof raw.preset === 'string' && spec.presets.some(candidate => candidate.id === raw.preset) ? raw.preset : presetOf(spec, spec.initialPreset).id;
    const shown = spec.panelIds.filter(id => !hidden.includes(id));
    const named = namedIds(raw.layout);
    const placed = shown.filter(id => named.has(id) || id === spec.primaryId);
    if (!shown.some(id => named.has(id))) return restoreRows(raw, { v: 1, preset, layout: presetTree(presetOf(spec, preset).layout, shown), hidden }, spec);
    let layout = normalizeDockTree(raw.layout, placed);
    for (const id of shown.filter(candidate => !placed.includes(candidate))) {
      const before = groupActive(layout, spec.primaryId);
      layout = addPanel(layout, id, { panelId: spec.primaryId, position: 'center' });
      if (before) layout = activatePanel(layout, before);
    }
    return restoreRows(raw, { v: 1, preset, layout, hidden }, spec);
  } catch {
    return initialWorkspaceState(spec);
  }
}

function groupActive(tree: DockNode, panelId: string): string | undefined {
  const find = (node: DockNode): string | undefined => (node.type === 'group' ? (node.panels.includes(panelId) ? node.active : undefined) : node.children.map(find).find(Boolean));
  return find(tree);
}

/** Switches to `preset`: its arrangement of the panels that are shown; hidden panels stay hidden. The panels stay the same, so nothing remounts. */
export function applyPreset(state: WorkspaceState, preset: WorkspacePreset): WorkspaceState {
  return { ...state, preset: preset.id, layout: presetTree(preset.layout, panelOrder(state.layout)) };
}

/** `기본 배치`: the current preset's arrangement of every panel; nothing hidden. The height mode is the user's and stays as it is (never reset to `initialMode`). */
export function resetLayout(state: WorkspaceState, preset: WorkspacePreset): WorkspaceState {
  return { ...state, preset: preset.id, layout: presetTree(preset.layout, [...panelOrder(state.layout), ...state.hidden]), hidden: [] };
}

/**
 * Takes `panelId` out of the tree. The space it frees is shared by its siblings in proportion, so no panel (the primary above all) ends
 * up smaller. The primary and a panel that is not shown change nothing.
 */
export function hidePanel(state: WorkspaceState, panelId: string, primaryId: string): WorkspaceState {
  if (panelId === primaryId || !panelOrder(state.layout).includes(panelId)) return state;
  return { ...state, layout: removePanel(state.layout, panelId), hidden: [...state.hidden, panelId] };
}

/**
 * Brings `panelId` back without covering the primary: into the group of a panel that shares its group in `preset` and is still shown
 * (the active tab there, unless that group holds the primary, which then stays active); else into the first group in reading order that
 * does not hold the primary; else to the right of the primary.
 */
export function showPanel(state: WorkspaceState, panelId: string, primaryId: string, preset: WorkspacePreset): WorkspaceState {
  if (!state.hidden.includes(panelId)) return state;
  const shown = panelOrder(state.layout);
  const home = groupOf(presetTree(preset.layout, [...shown, ...state.hidden]), panelId);
  const sibling = home?.panels.find(id => id !== panelId && shown.includes(id));
  const other = dockGroupsInReadingOrder(state.layout).find(group => !group.panels.includes(primaryId));
  const into = sibling ?? other?.active;
  const primaryActive = groupActive(state.layout, primaryId);
  let layout = addPanel(state.layout, panelId, into !== undefined ? { panelId: into, position: 'center' } : { panelId: primaryId, position: 'right' });
  if (into !== undefined && groupOf(layout, panelId)?.panels.includes(primaryId) && primaryActive) layout = activatePanel(layout, primaryActive);
  return { ...state, layout, hidden: state.hidden.filter(id => id !== panelId) };
}

/** The tab that should take focus after `panelId` was hidden: the one now active in the group it left, else the primary's. */
export function tabAfterHide(before: WorkspaceState, after: WorkspaceState, panelId: string, primaryId: string): string {
  const left = groupOf(before.layout, panelId)?.panels.find(id => id !== panelId);
  return (left !== undefined ? groupOf(after.layout, left)?.active : undefined) ?? primaryId;
}

export const sameWorkspaceState = (a: WorkspaceState, b: WorkspaceState) => JSON.stringify(a) === JSON.stringify(b);
