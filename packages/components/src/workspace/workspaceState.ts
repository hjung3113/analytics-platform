/**
 * Pure state of a menu workspace (ADR-0067 decisions 3-5, 18-20): which preset is current, the dock tree, which panels are hidden.
 * Maximize is never part of it. No React, no storage.
 */
import { activatePanel, addPanel, panelOrder, removePanel } from '../dock/commands';
import { normalizeDockTree, type DockNode } from '../dock/schema';

/** The arrangement a preset describes. Structurally the dock tree; `sizes` are ratios (any positive numbers, only their proportions count). */
export type PanelWorkspaceLayout =
  | { type: 'group'; panels: string[]; active?: string }
  | { type: 'branch'; dir: 'row' | 'column'; sizes: number[]; children: PanelWorkspaceLayout[] };

export type WorkspaceState = { v: 1; preset: string; layout: DockNode; hidden: string[] };
export type WorkspacePreset = { id: string; layout: PanelWorkspaceLayout };

/** Static identifiers only: nothing from data can reach a storage key. */
export const WORKSPACE_ID = /^[a-z][a-z0-9._-]{0,63}$/;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

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

export type WorkspaceSpec = { panelIds: readonly string[]; primaryId: string; presets: readonly WorkspacePreset[]; initialPreset: string };

const presetOf = (spec: WorkspaceSpec, id: string) => spec.presets.find(preset => preset.id === id) ?? spec.presets[0]!;

/** The state of a workspace nobody has touched: the initial preset, nothing hidden. */
export function initialWorkspaceState(spec: WorkspaceSpec): WorkspaceState {
  const preset = presetOf(spec, spec.initialPreset);
  return { v: 1, preset: preset.id, layout: presetTree(preset.layout, spec.panelIds), hidden: [] };
}

/**
 * Repairs any value into a valid state for `spec`. Never throws. A wrong `v` or a value that is not an object gives the initial state;
 * an unknown preset keeps the layout and falls back to the initial preset's name; `hidden` keeps known, non-primary, distinct ids; a
 * panel that is neither in the tree nor hidden joins the primary's group (behind its active tab); the primary is never hidden.
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
    if (!shown.some(id => named.has(id))) return { v: 1, preset, layout: presetTree(presetOf(spec, preset).layout, shown), hidden };
    let layout = normalizeDockTree(raw.layout, placed);
    for (const id of shown.filter(candidate => !placed.includes(candidate))) {
      const before = groupActive(layout, spec.primaryId);
      layout = addPanel(layout, id, { panelId: spec.primaryId, position: 'center' });
      if (before) layout = activatePanel(layout, before);
    }
    return { v: 1, preset, layout, hidden };
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

/** `기본 배치`: the current preset's arrangement of every panel; nothing hidden. */
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

/** Brings `panelId` back as the active tab of the primary's group. */
export function showPanel(state: WorkspaceState, panelId: string, primaryId: string): WorkspaceState {
  if (!state.hidden.includes(panelId)) return state;
  return { ...state, layout: addPanel(state.layout, panelId, { panelId: primaryId, position: 'center' }), hidden: state.hidden.filter(id => id !== panelId) };
}

export const sameWorkspaceState = (a: WorkspaceState, b: WorkspaceState) => JSON.stringify(a) === JSON.stringify(b);
