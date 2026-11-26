/**
 * Pure state of a menu workspace (ADR-0067 decisions 3-5, 18-20): which preset is current, the dock tree, which panels are hidden.
 * Maximize is never part of it. No React, no storage.
 */
import { isRecord } from '@ap/contracts';
import { activatePanel, addPanel, groupOf, moveToNewRow, panelOrder, removePanel } from '../dock/commands';
import { dockTheme } from '../dock/dockPresentation';
import { dockGroupsInReadingOrder, isValidDockTree, normalizeDockTree, parseFloatingPanels, type DockNode, type DockFloatingPanel, type PanelEdge } from '../dock/schema';
import { legacyFitShares, placeSharedRows, readSharedRowSizes, rememberSharedRowSizes, restoreSharedRowHeights, sharedRowOf, type LegacyFitShare, type SharedRow, type SharedRowSize } from './workspaceSharedRows';
import { clampRow, enterRows, isFillRow, NEW_ROW_HEIGHT, reconcileRows, ROW_MIN_HEIGHT, topLevelRows, validPreferred, withRowShares, type PreferredHeight, type RowMinimum } from './workspaceRows';

/** The arrangement a preset describes. Structurally the dock tree; `sizes` are ratios (any positive numbers, only their proportions count). */
export type PanelWorkspaceLayout =
  | { type: 'group'; panels: string[]; active?: string }
  | { type: 'branch'; dir: 'row' | 'column'; sizes: number[]; children: PanelWorkspaceLayout[] };

/**
 * `mode` absent = fit (the workspace fills its container); `'stack'` = the top-level rows keep their own px in `rows` (the single source; the
 * layout's top-level shares are their projection). Both are optional so a state written before them still loads and an older reader ignores them.
 */
const AUTO_FILL = Symbol('workspace auto fill');
// Keep unmapped legacy shares for this mount without adding a field to stored preferences.
const LEGACY_FIT_SHARES = Symbol('workspace legacy fit shares');
type AutoFill = { kind: 'single' } | { kind: 'below'; panelId: string } | { kind: 'shared'; rowId: string };
const SINGLE_FILL: AutoFill = { kind: 'single' };

/**
 * `preferredSeen`: the last checked `preferredHeight` px for each panel, including panels temporarily absent from the workspace. A stored stack row
 * under its preferred height is raised once on a new or larger declaration (#2786); after that the user's own smaller height stays.
 */
export type WorkspaceState = { v: 1; preset: string; layout: DockNode; hidden: string[]; mode?: 'stack'; rows?: number[]; preferredSeen?: Record<string, number>; collapsed?: Record<string, PanelEdge>; floating?: DockFloatingPanel[]; sharedRowSizes?: SharedRowSize[]; [AUTO_FILL]?: AutoFill; [LEGACY_FIT_SHARES]?: LegacyFitShare[] };
export type WorkspacePreset = { id: string; layout: PanelWorkspaceLayout };

/** Static identifiers only: nothing from data can reach a storage key. */
export const WORKSPACE_ID = /^[a-z][a-z0-9._-]{0,63}$/;
/** Room for a prefix and five-character escapes for each UTF-16 unit of a saved instance ID. */
export const WORKSPACE_PANEL_ID = /^[a-z][a-z0-9._-]{0,1023}$/;

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
export function presetTree(layout: PanelWorkspaceLayout, ids: readonly string[], below: readonly string[] = [], sharedRows: readonly SharedRow[] = []): DockNode {
  let tree = normalizeDockTree(toShares(layout), ids);
  // #2398: a `placement: 'below'` panel the preset does not name becomes a new last row instead of a tab in the first group.
  const named = namedIds(layout);
  for (const id of below) if (ids.includes(id) && !named.has(id) && panelOrder(tree).length > 1) tree = moveToNewRow(tree, id);
  return placeSharedRows(tree, ids, sharedRows, [], below);
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
  /** Height mode of a workspace nobody has touched; a saved preference (fit included) always wins. Default stack (ADR-0130). */
  initialMode?: 'fit' | 'stack';
  /** Preset id the menu arranges its panels in while stacked (ADR-0130): an untouched workspace that starts in stack starts on it, and the mode switch applies it while the arrangement is still the initial preset's. Unknown ids are ignored. */
  stackPreset?: string;
  /** Panels declared with `placement: 'below'` (#2398): when the layout does not hold them yet they open as a new last row, not a tab. */
  below?: readonly string[];
  sharedRows?: readonly SharedRow[];
  /** Panels' declared `preferredHeight` px and the row height they ask for (#2786): restore raises a stored row once when a declaration is new or grew. */
  preferredHeights?: ReadonlyMap<string, number>;
  rowPreferred?: PreferredHeight;
};

/** Refresh the current panels' declarations while remembering the heights of panels outside this panel set. */
function withPreferredSeen(state: WorkspaceState, spec: WorkspaceSpec, previous?: unknown): WorkspaceState {
  const seen = new Map<string, number>();
  if (isRecord(previous)) {
    for (const [id, px] of Object.entries(previous)) {
      if (WORKSPACE_PANEL_ID.test(id) && validPreferred(px)) seen.set(id, px);
    }
  }
  for (const id of spec.panelIds) {
    const px = spec.preferredHeights?.get(id);
    if (validPreferred(px)) seen.set(id, px);
    else seen.delete(id);
  }
  return seen.size ? { ...state, preferredSeen: Object.fromEntries(seen) } : state;
}

/** Sanity bound on a stored row height: anything above is a corrupt value, not a layout. */
const MAX_STORED_ROW_PX = 20000;

/** The height mode of `state`: fit (no `mode`, no `rows`), or stack with `rows` (absent while they are still to be measured). */
export function withRows(state: WorkspaceState, mode: 'fit' | 'stack', rows?: readonly number[]): WorkspaceState {
  const { mode: _mode, rows: _rows, [AUTO_FILL]: _autoFill, ...base } = state;
  if (mode === 'fit') return base;
  return rows ? { ...base, layout: withRowShares(base.layout, rows), mode: 'stack', rows: [...rows] } : { ...base, mode: 'stack' };
}

/** Adjust measured rows while keeping already-remembered shared heights in sync with their changed rows. */
export function withAdjustedRowHeights(state: WorkspaceState, heights: readonly number[], declarations: readonly SharedRow[]): WorkspaceState {
  if (heights.length === state.rows?.length && heights.every((px, index) => px === state.rows?.[index])) return state;
  const next = withRows(state, 'stack', heights);
  if (!declarations.length || !state.sharedRowSizes?.some(size => size.height !== undefined)) return next;
  const changed = new Map<string, number>();
  topLevelRows(state.layout).forEach((row, index) => {
    const px = heights[index]!;
    if (px === state.rows?.[index]) return;
    const shared = sharedRowOf(row, declarations);
    if (shared) changed.set(shared.id, px);
  });
  return { ...next, sharedRowSizes: state.sharedRowSizes.map(size => {
    const height = changed.get(size.id);
    return height === undefined || size.height === undefined ? size : { ...size, height };
  }) };
}

/**
 * What stack mode needs from the page to size rows: the least height per row, the most a row may be given, the height fit mode gives the layout,
 * the px that make one row fill what the page shows (`oneRow`) and the rows' preferred heights where panels declare them.
 */
export type RowEnv = { minimum: RowMinimum; maximum: number; baseline: number; oneRow: number; preferred?: PreferredHeight };

export const hasAutomaticRows = (state: WorkspaceState): boolean => state[AUTO_FILL] !== undefined;

/** Auto-fill provenance is local to this mount, and its measured heights are omitted from the saved state. */
export function workspacePreference(state: WorkspaceState, declaredIds?: ReadonlySet<string>): WorkspaceState {
  const preference = hasAutomaticRows(state) ? withRows(state, 'stack') : state;
  if (!declaredIds || !preference.preferredSeen) return preference;
  const entries = Object.entries(preference.preferredSeen).filter(([id]) => declaredIds.has(id));
  const { preferredSeen: _previous, ...layout } = preference;
  return entries.length ? { ...layout, preferredSeen: Object.fromEntries(entries) } : layout;
}

/**
 * A rowless stack state is automatic when its rows are a fill row alone, or a fill row over one lone declared below panel: rows are omitted
 * from the saved preference only while they are automatic, so a reload with the below panel open keeps that provenance.
 */
function automaticFill(state: WorkspaceState, rows: readonly DockNode[], env: RowEnv, below: readonly string[], sharedRows: readonly SharedRow[]): AutoFill | undefined {
  if (state[AUTO_FILL]) return state[AUTO_FILL];
  if (isFillRow(rows, env.preferred)) return SINGLE_FILL;
  if (state.rows !== undefined || rows.length !== 2 || !isFillRow(rows.slice(0, 1), env.preferred)) return undefined;
  const shared = sharedRowOf(rows[1]!, sharedRows);
  if (shared && !state.sharedRowSizes?.some(size => size.id === shared.id && size.height !== undefined)) return { kind: 'shared', rowId: shared.id };
  const lone = panelOrder(rows[1]!);
  return lone.length === 1 && below.includes(lone[0]!) ? { kind: 'below', panelId: lone[0]! } : undefined;
}

export function measureWorkspaceRows(state: WorkspaceState, env: RowEnv, below: readonly string[] = [], sharedRows: readonly SharedRow[] = []): WorkspaceState {
  const rows = topLevelRows(state.layout);
  const fill = automaticFill(state, rows, env, below, sharedRows);
  if (!fill) return withRestoredSharedHeights(state, enterRows(state.layout, env.baseline, env.minimum, env.maximum, env), { sharedRows, rowMinimum: env.minimum });

  const first = rows[0]!;
  if (env.preferred?.(first) !== undefined) {
    const heights = state.rows?.length === rows.length ? state.rows : enterRows(state.layout, env.baseline, env.minimum, env.maximum, env);
    return withRows(state, 'stack', heights);
  }
  const minimum = env.minimum(first);
  // The fill row takes the whole visible height: the drop strip shows only during a tab drag and overlays the box (#2508).
  const available = clampRow(env.oneRow, minimum, env.maximum);
  const heights = [available];
  if (fill.kind !== 'single') {
    // The two rows share the visible height evenly. When either would fall under its minimum, each keeps its own height and the page grows.
    const last = rows[1]!;
    const lastMinimum = env.minimum(last);
    const shared = available - dockTheme(true).gap;
    const top = Math.ceil(shared / 2);
    const bottom = shared - top;
    if (top >= minimum && bottom >= lastMinimum) { heights[0] = top; heights.push(bottom); }
    else heights.push(clampRow(env.preferred?.(last) ?? NEW_ROW_HEIGHT, lastMinimum, env.maximum));
  }
  if (state[AUTO_FILL] === fill && state.rows?.length === heights.length && heights.every((height, index) => height === state.rows![index])) return state;
  return { ...withRows(state, 'stack', heights), [AUTO_FILL]: fill };
}

/** The added row must be a new lone panel below the same first row. A move of an existing tab is a layout edit. */
function appendedPanel(before: readonly DockNode[], after: readonly DockNode[]): string | undefined {
  if (before.length !== 1 || after.length !== 2 || !sameArrangement(before[0]!, after[0]!)) return undefined;
  const ids = panelOrder(after[1]!);
  return ids.length === 1 ? ids[0] : undefined;
}

function followBelowPanel(previous: WorkspaceState, next: WorkspaceState, below: readonly string[]): WorkspaceState {
  const fill = previous[AUTO_FILL];
  if (!fill) return next;
  const before = topLevelRows(previous.layout);
  const after = topLevelRows(next.layout);
  const added = appendedPanel(before, after);
  if (fill.kind === 'single' && added !== undefined && below.includes(added)) return { ...next, [AUTO_FILL]: { kind: 'below', panelId: added } };
  if (fill.kind === 'below' && appendedPanel(after, before) === fill.panelId) return { ...next, [AUTO_FILL]: SINGLE_FILL };
  return next;
}

/** Record a user resize before a later visibility change can discard its dimensions. */
export function rememberSharedRows(previous: WorkspaceState, state: WorkspaceState, declarations: readonly SharedRow[]): WorkspaceState {
  if (!declarations.length || !sameArrangement(previous.layout, state.layout)) return state;
  const sharedRowSizes = rememberSharedRowSizes(previous.layout, state.layout, declarations, state.sharedRowSizes ?? [], {
    stack: state.mode === 'stack', previousHeights: previous.rows, heights: state.rows,
  });
  return sharedRowSizes.length ? { ...state, sharedRowSizes } : state;
}

function withRestoredSharedHeights(state: WorkspaceState, heights: readonly number[], spec: Pick<WorkspaceSpec, 'sharedRows' | 'rowMinimum'>): WorkspaceState {
  const rows = topLevelRows(state.layout);
  const restored = restoreSharedRowHeights(state.layout, heights, spec.sharedRows ?? [], state.sharedRowSizes ?? []);
  return withRows(state, 'stack', restored.map((height, index) => Math.max(height, spec.rowMinimum?.(rows[index]!) ?? ROW_MIN_HEIGHT)));
}

/** Repair the live panel set while keeping the height of a survivor when its declared below panel leaves. */
export function updateWorkspacePanels(previous: WorkspaceState, spec: WorkspaceSpec, previousBelow: readonly string[], maxRow = MAX_STORED_ROW_PX): WorkspaceState {
  const next = normalizeWorkspaceState(previous, spec, { maxRow });
  if (next.mode !== 'stack') return next;
  const shared = followSharedPanel(previous, next, spec.sharedRows ?? []);
  if (shared !== next) return shared;
  if (hasAutomaticRows(previous) && sameArrangement(previous.layout, next.layout)) return { ...next, [AUTO_FILL]: previous[AUTO_FILL] };
  const followed = followBelowPanel(previous, next, spec.below ?? []);
  if (hasAutomaticRows(followed)) return followed;
  const removedBelow = appendedPanel(topLevelRows(next.layout), topLevelRows(previous.layout));
  if (removedBelow !== undefined && previousBelow.includes(removedBelow) && previous.rows?.length === 2) {
    return raiseToPreferred(withRows(next, 'stack', previous.rows.slice(0, 1)), previous.preferredSeen ?? {}, spec, maxRow);
  }
  return next;
}

function followSharedPanel(previous: WorkspaceState, next: WorkspaceState, declarations: readonly SharedRow[]): WorkspaceState {
  const fill = previous[AUTO_FILL];
  if (fill?.kind === 'single' || fill?.kind === 'shared') {
    const beforeRows = topLevelRows(previous.layout);
    const nextRows = topLevelRows(next.layout);
    if (sameArrangement(beforeRows[0]!, nextRows[0]!)) {
      if (fill.kind === 'shared' && nextRows.length === 1) return { ...next, [AUTO_FILL]: SINGLE_FILL };
      const declared = nextRows.length === 2 ? sharedRowOf(nextRows[1]!, declarations) : undefined;
      if (declared && (fill.kind === 'single' || fill.rowId === declared.id) && !next.sharedRowSizes?.some(size => size.id === declared.id && size.height !== undefined)) {
        return { ...next, [AUTO_FILL]: { kind: 'shared', rowId: declared.id } };
      }
    }
  }
  return next;
}

/**
 * `next` is `previous` after an edit; the rows follow it. Fit: no rows. Stack, `keep`: rows that keep their panels keep their px, a new row
 * gets 360, a gone row is dropped (rows still to be measured stay so). Stack, `enter` (preset, `기본 배치`): rows are derived again from the new
 * shares and the baseline, never from the current stack height. `created`: the panel the edit moved into a row of its own (see `reconcileRows`).
 */
export function settleRows(previous: WorkspaceState, next: WorkspaceState, how: 'keep' | 'enter', env: RowEnv, created?: string, below: readonly string[] = [], sharedRows: readonly SharedRow[] = []): WorkspaceState {
  if (next === previous) return previous;
  if (next.mode !== 'stack') return next.mode !== undefined || next.rows !== undefined ? withRows(next, 'fit') : next;
  if (how === 'enter') return measureWorkspaceRows(withRows(next, 'stack'), env, below, sharedRows);
  const shared = followSharedPanel(previous, next, sharedRows);
  if (shared !== next) return measureWorkspaceRows(shared, env, below, sharedRows);
  const followed = followBelowPanel(previous, next, below);
  if (followed !== next) return measureWorkspaceRows(followed, env, below);
  if (previous.rows === undefined || previous.rows.length !== topLevelRows(previous.layout).length) return withRows(next, 'stack');
  const heights = reconcileRows(previous.layout, previous.rows, next.layout, env.minimum, env.maximum, created, env.preferred);
  return sameArrangement(previous.layout, next.layout) ? withRows(next, 'stack', heights) : withRestoredSharedHeights(next, heights, { sharedRows, rowMinimum: env.minimum });
}

/**
 * Brings the stored mode and rows of `raw` onto the repaired `state`: anything but a valid stack mode is fit; rows that do not fit the layout are left to be measured.
 * `appended`: the repair added rows (a `below` panel that joined, #2398). The stored rows are then matched to the new rows by their panels
 * (`reconcileRows` over the stored layout): a surviving row keeps its px wherever it now sits, a new row gets `NEW_ROW_HEIGHT`, a gone row is dropped.
 */
function restoreRows(raw: Record<string, unknown>, state: WorkspaceState, spec: WorkspaceSpec, maxRow: number, appended = false): WorkspaceState {
  if (raw.mode !== 'stack') return state;
  const rows = topLevelRows(state.layout);
  const minimum = spec.rowMinimum ?? (() => ROW_MIN_HEIGHT);
  const stored = Array.isArray(raw.rows) && raw.rows.every(px => typeof px === 'number' && Number.isFinite(px) && px > 0 && px <= MAX_STORED_ROW_PX) ? (raw.rows as number[]).map(px => Math.round(px)) : undefined;
  const seen = isRecord(raw.preferredSeen) ? raw.preferredSeen : {};
  if (stored && appended) {
    const previous = normalizeDockTree(raw.layout, [...namedIds(raw.layout)]);
    if (topLevelRows(previous).length === stored.length) {
      // A row with no stored predecessor opens at its declared preference: there is no user height to keep, whatever `preferredSeen` remembers (#2820).
      const matched = reconcileRows(previous, stored, state.layout, minimum, Math.min(maxRow, MAX_STORED_ROW_PX), undefined, spec.rowPreferred);
      return raiseToPreferred(withRestoredSharedHeights(state, matched, spec), seen, spec, maxRow);
    }
  }
  if (stored?.length !== rows.length) return withRows(state, 'stack');
  return raiseToPreferred(withRows(state, 'stack', stored.map((px, index) => Math.max(minimum(rows[index]!), px))), seen, spec, maxRow);
}

/** A row under an unseen preference is raised once (#2786). The cap only limits the raise, so existing taller rows keep their px. */
function raiseToPreferred(state: WorkspaceState, seen: Record<string, unknown>, spec: WorkspaceSpec, maxRow: number): WorkspaceState {
  const { rows } = state;
  const { rowPreferred, preferredHeights } = spec;
  if (!rows || !rowPreferred || !preferredHeights?.size) return state;
  const maximum = Math.min(maxRow, MAX_STORED_ROW_PX);
  const declaredAnew = (row: DockNode) => panelOrder(row).some(id => {
    const declared = preferredHeights.get(id);
    const before = seen[id];
    return validPreferred(declared) && (!validPreferred(before) || before < declared);
  });
  const heights = topLevelRows(state.layout).map((row, index) => {
    const px = rows[index]!;
    const preferred = rowPreferred(row);
    if (validPreferred(preferred) && px < preferred && declaredAnew(row)) {
      return Math.max(px, clampRow(preferred, spec.rowMinimum?.(row) ?? ROW_MIN_HEIGHT, maximum));
    }
    return px;
  });
  return withAdjustedRowHeights(state, heights, spec.sharedRows ?? []);
}

const presetOf = (spec: WorkspaceSpec, id: string) => spec.presets.find(preset => preset.id === id) ?? spec.presets[0]!;

/** The menu's `stackPreset`, only when it names a preset (an exact lookup: `presetOf` would fall back to the first preset). */
const stackPresetOf = (spec: Pick<WorkspaceSpec, 'presets' | 'stackPreset'>) => (spec.stackPreset === undefined ? undefined : spec.presets.find(preset => preset.id === spec.stackPreset));

/** The state of a workspace nobody has touched: nothing hidden, the menu's `initialMode` (default stack, with rows measured after mount); a stack start uses the `stackPreset`, else the initial preset. */
export function initialWorkspaceState(spec: WorkspaceSpec): WorkspaceState {
  const stack = spec.initialMode !== 'fit';
  const preset = (stack ? stackPresetOf(spec) : undefined) ?? presetOf(spec, spec.initialPreset);
  const state = withPreferredSeen({ v: 1, preset: preset.id, layout: presetTree(preset.layout, spec.panelIds, spec.below, spec.sharedRows), hidden: [] }, spec);
  return stack ? { ...state, mode: 'stack' } : state;
}

/**
 * Whether `a` is still the arrangement `b` describes: the same branch directions and child order, and in every group the same panels as a set.
 * Sizes, the active tab and the tab order do not count (row px are a projection on the top-level shares; hiding and showing a panel reorders tabs).
 */
function sameArrangement(a: DockNode, b: DockNode): boolean {
  if (a.type === 'group' || b.type === 'group') return a.type === 'group' && b.type === 'group' && a.panels.length === b.panels.length && a.panels.every(id => b.panels.includes(id));
  return a.dir === b.dir && a.children.length === b.children.length && a.children.every((child, index) => sameArrangement(child, b.children[index]!));
}

/** `state` moved from the arrangement of preset `from` to that of preset `to`, only while it still is `from`'s (the user's own arrangement is the user's). */
function moveArrangement(state: WorkspaceState, presets: readonly WorkspacePreset[], from: string, to: string | undefined, below?: readonly string[], sharedRows?: readonly SharedRow[]): WorkspaceState {
  const source = presets.find(preset => preset.id === from);
  const target = to === undefined ? undefined : presets.find(preset => preset.id === to);
  if (!source || !target) return state;
  const shown = panelOrder(state.layout);
  return sameArrangement(state.layout, presetTree(source.layout, shown, below, sharedRows)) ? applyPreset(state, target, below, sharedRows) : state;
}

/**
 * The height mode switch (`화면 맞춤` ↔ `아래로 쌓기`). Fit to stack applies `stackPreset` when the layout is still the initial preset's; stack to fit applies the
 * initial preset when it is still the `stackPreset`'s; any other arrangement is kept. Without a usable `stackPreset` the arrangement is always kept.
 */
export function changeMode(current: WorkspaceState, mode: 'fit' | 'stack', spec: Pick<WorkspaceSpec, 'presets' | 'initialPreset' | 'stackPreset' | 'below' | 'sharedRows'>, env: RowEnv): WorkspaceState {
  const stackPreset = stackPresetOf(spec)?.id;
  if (mode === 'fit') {
    if (current.mode !== 'stack') return current;
    return withRows(stackPreset === undefined ? current : moveArrangement(current, spec.presets, stackPreset, spec.initialPreset, spec.below, spec.sharedRows), 'fit');
  }
  if (current.mode === 'stack') return current;
  const arranged = stackPreset === undefined ? current : moveArrangement(current, spec.presets, spec.initialPreset, stackPreset, spec.below, spec.sharedRows);
  return withRestoredSharedHeights(arranged, enterRows(arranged.layout, env.baseline, env.minimum, env.maximum, env), { sharedRows: spec.sharedRows, rowMinimum: env.minimum });
}

/**
 * Repairs any value into a valid state for `spec`. Never throws. A wrong `v` or a value that is not an object gives the initial state;
 * an unknown preset keeps the layout and falls back to the initial preset's name; `hidden` keeps known, non-primary, distinct ids; a
 * panel that is neither in the tree nor hidden joins the primary's group (behind its active tab); the primary is never hidden. `mode` other
 * than `'stack'` is fit; stack `rows` that are not finite positive numbers, or not one per top-level row, are dropped (the workspace measures
 * them again), and each is raised to its row's minimum.
 */
export function normalizeWorkspaceState(raw: unknown, spec: WorkspaceSpec, { fromStorage = false, maxRow = MAX_STORED_ROW_PX } = {}): WorkspaceState {
  try {
    if (!isRecord(raw) || raw.v !== 1) return initialWorkspaceState(spec);
    const known = new Set(spec.panelIds);
    const hidden = Array.isArray(raw.hidden)
      ? [...new Set(raw.hidden.filter((id): id is string => typeof id === 'string' && known.has(id) && id !== spec.primaryId))]
      : [];
    const allowed = new Set(spec.panelIds.filter(id => id !== spec.primaryId));
    const collapsed = isRecord(raw.collapsed) ? Object.fromEntries(Object.entries(raw.collapsed).filter((entry): entry is [string, PanelEdge] => allowed.has(entry[0]) && (entry[1] === 'left' || entry[1] === 'top'))) : {};
    const floating = parseFloatingPanels(raw.floating, allowed);
    floating.forEach(panel => { if (!hidden.includes(panel.panelId)) hidden.push(panel.panelId); });
    let extra = { ...(Object.keys(collapsed).length ? { collapsed } : {}), ...(floating.length ? { floating } : {}) };
    const preset = typeof raw.preset === 'string' && spec.presets.some(candidate => candidate.id === raw.preset) ? raw.preset : presetOf(spec, spec.initialPreset).id;
    const shown = spec.panelIds.filter(id => !hidden.includes(id));
    const named = namedIds(raw.layout);
    const shared = spec.sharedRows ?? [];
    const sizes = readSharedRowSizes(raw.sharedRowSizes);
    let legacy = (raw as Partial<WorkspaceState>)[LEGACY_FIT_SHARES] ?? [];
    if (fromStorage && raw.mode !== 'stack' && raw.sharedRowSizes === undefined && isValidDockTree(raw.layout, [...named])) {
      legacy = legacyFitShares(normalizeDockTree(raw.layout, [...named]), spec.primaryId);
    }
    const pending = legacy.filter(({ panels, share }) => {
      const declaration = shared.find(row => panels.every(id => row.panels.includes(id)));
      if (!declaration) return true;
      if (!sizes.some(size => size.id === declaration.id)) sizes.push({ id: declaration.id, share });
      return false;
    });
    const sharedChanged = shared.some(row => row.panels.some(id => shown.includes(id) !== named.has(id)));
    extra = { ...extra, ...(sizes.length ? { sharedRowSizes: sizes } : {}), ...(pending.length ? { [LEGACY_FIT_SHARES]: pending } : {}) };
    const placed = shown.filter(id => named.has(id) || id === spec.primaryId);
    if (!shown.some(id => named.has(id))) return withPreferredSeen(restoreRows(raw, { v: 1, preset, layout: presetTree(presetOf(spec, preset).layout, shown, spec.below, shared), hidden, ...extra }, spec, maxRow), spec, raw.preferredSeen);
    let layout = normalizeDockTree(raw.layout, placed);
    let appended = false;
    const incoming = shown.filter(id => !placed.includes(id));
    for (const id of incoming) {
      if (shared.some(row => row.panels.includes(id))) continue;
      const before = groupActive(layout, spec.primaryId);
      layout = addPanel(layout, id, { panelId: spec.primaryId, position: 'center' });
      if (before) layout = activatePanel(layout, before);
      if (spec.below?.includes(id) && panelOrder(layout).length > 1) { layout = moveToNewRow(layout, id); appended = true; }
    }
    if (sharedChanged) layout = placeSharedRows(layout, shown, shared, sizes, spec.below ?? []);
    return withPreferredSeen(restoreRows(raw, { v: 1, preset, layout, hidden, ...extra }, spec, maxRow, appended || sharedChanged || (sizes.length > 0 && named.size !== shown.length)), spec, raw.preferredSeen);
  } catch {
    return initialWorkspaceState(spec);
  }
}

function groupActive(tree: DockNode, panelId: string): string | undefined {
  const find = (node: DockNode): string | undefined => (node.type === 'group' ? (node.panels.includes(panelId) ? node.active : undefined) : node.children.map(find).find(Boolean));
  return find(tree);
}

/** Switches to `preset`: its arrangement of the panels that are shown; hidden panels stay hidden. The panels stay the same, so nothing remounts. */
export function applyPreset(state: WorkspaceState, preset: WorkspacePreset, below?: readonly string[], sharedRows?: readonly SharedRow[]): WorkspaceState {
  return { ...state, preset: preset.id, layout: presetTree(preset.layout, panelOrder(state.layout), below, sharedRows) };
}

/** `기본 배치`: the current preset's arrangement of every panel; nothing hidden. The height mode is the user's and stays as it is (never reset to `initialMode`). */
export function resetLayout(state: WorkspaceState, preset: WorkspacePreset, below?: readonly string[], sharedRows?: readonly SharedRow[]): WorkspaceState {
  const { sharedRowSizes: _sizes, [LEGACY_FIT_SHARES]: _legacy, ...rest } = state;
  return { ...rest, preset: preset.id, layout: presetTree(preset.layout, [...panelOrder(state.layout), ...state.hidden], below, sharedRows), hidden: [], floating: [] };
}

export function collapsePanel(state: WorkspaceState, panelId: string, primaryId: string, edge: PanelEdge): WorkspaceState {
  if (panelId === primaryId) return state;
  const next = hidePanel(state, panelId, primaryId);
  return { ...next, collapsed: { ...next.collapsed, [panelId]: edge }, floating: next.floating?.filter(panel => panel.panelId !== panelId) };
}

export function floatPanel(state: WorkspaceState, panel: DockFloatingPanel, primaryId: string): WorkspaceState {
  if (panel.panelId === primaryId) return state;
  const next = hidePanel(state, panel.panelId, primaryId);
  return { ...next, floating: [...(next.floating ?? []).filter(item => item.panelId !== panel.panelId), panel] };
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
 * does not hold the primary; else to the right of the primary. For a panel listed in `below`, the fallback is a new last row.
 */
export function showPanel(state: WorkspaceState, panelId: string, primaryId: string, preset: WorkspacePreset, below: readonly string[] = [], sharedRows: readonly SharedRow[] = []): WorkspaceState {
  if (!state.hidden.includes(panelId)) return state;
  const shown = panelOrder(state.layout);
  const after = { ...state, hidden: state.hidden.filter(id => id !== panelId), ...(state.floating ? { floating: state.floating.filter(panel => panel.panelId !== panelId) } : {}) };
  if (sharedRows.some(row => row.panels.includes(panelId))) {
    return { ...after, layout: placeSharedRows(state.layout, [...shown, panelId], sharedRows, state.sharedRowSizes ?? [], below) };
  }
  const home = groupOf(presetTree(preset.layout, [...shown, ...state.hidden], below), panelId);
  const sibling = home?.panels.find(id => id !== panelId && shown.includes(id));
  const appendBelow = sibling === undefined && below.includes(panelId);
  const other = dockGroupsInReadingOrder(state.layout).find(group => !group.panels.includes(primaryId));
  const into = appendBelow ? primaryId : sibling ?? other?.active;
  const primaryActive = groupActive(state.layout, primaryId);
  let layout = addPanel(state.layout, panelId, into !== undefined ? { panelId: into, position: 'center' } : { panelId: primaryId, position: 'right' });
  if (into !== undefined && groupOf(layout, panelId)?.panels.includes(primaryId) && primaryActive) layout = activatePanel(layout, primaryActive);
  if (appendBelow) layout = moveToNewRow(layout, panelId);
  return { ...after, layout };
}

/** The tab that should take focus after `panelId` was hidden: the one now active in the group it left, else the primary's. */
export function tabAfterHide(before: WorkspaceState, after: WorkspaceState, panelId: string, primaryId: string): string {
  const left = groupOf(before.layout, panelId)?.panels.find(id => id !== panelId);
  return (left !== undefined ? groupOf(after.layout, left)?.active : undefined) ?? primaryId;
}

export const sameWorkspaceState = (a: WorkspaceState, b: WorkspaceState) => JSON.stringify(a) === JSON.stringify(b);
