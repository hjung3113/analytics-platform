import { usePublishAnalysisWorkspace } from '../chart/NextAnalysisBridge';
import { useCompactPageDensity } from '../pageDensity';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useI18n, useMessages, usePlatformOptional, type Text } from '@ap/kernel';
import { cn, isDevelopment } from '@ap/ui';
import type { LucideIcon } from 'lucide-react';
import { activatePanel, groupOf, movePanel, panelOrder } from '../dock/commands';
import { focusSoon, focusTabSoon } from '../dock/focusTab';
import { DockLayoutBase } from '../dock/DockLayout';
import type { DockPanel, DockRows } from '../dock/dockTypes';
import { dockTheme } from '../dock/dockPresentation';
import { dockLayoutMenu } from '../dock/layoutMenu';
import { clampFloatingPanel, dockGroupsInReadingOrder, type DockFloatingPanel, type PanelEdge } from '../dock/schema';
import { useRegisterWorkspaceCommands, useWorkspaceDepth, WorkspaceDepthProvider, type WorkspaceCommand } from '../dock/WorkspaceCommandsHost';
import { InWorkspacePanelProvider } from './panelContext';
import { PanelBadge } from './PanelBadge';
import { AnalysisPanelAddContext, type AnalysisPanelAddition } from './PanelAdd';
import { COMPONENTS_MESSAGES } from '../messages';
import { MODE_PREFIX, PRESET_PREFIX, RESET_ID, SHOW_PREFIX, WorkspaceToolbar } from './WorkspaceToolbar';
import { WorkspaceGroupActions } from './WorkspaceGroupActions';
import { WorkspaceEdges } from './WorkspaceEdges';
import { readWorkspaceState, sameWorkspaceState, workspaceStorageKey, writeWorkspaceState, WORKSPACE_WRITE_DELAY_MS, type PanelWorkspaceStorage } from './workspaceStorage';
import { applyPreset, changeMode, collapsePanel, floatPanel, hasAutomaticRows, hidePanel, initialWorkspaceState, measureWorkspaceRows, normalizeWorkspaceState, presetTree, rememberSharedRows, resetLayout, settleRows, showPanel, tabAfterHide, updateWorkspacePanels, withAdjustedRowHeights, withRows, workspacePreference, WORKSPACE_ID, type PanelWorkspaceLayout, type RowEnv, type WorkspaceSpec, type WorkspaceState } from './workspaceState';
import { canMoveBelow, clampRow, moveToNewRow, NEW_ROW_HEIGHT, rowMinimumOf, rowPreferredOf, topLevelRows, validPreferred } from './workspaceRows';
import { useRegisterPageFlow } from '../pageFlow';
import { alignUnderChrome, restoreScrollOffset, scrollContainerOf, stickyChromeHeight, useVisibleAreaHeight } from '../visibleArea';

export type { PanelWorkspaceLayout } from './workspaceState';
export type { PanelWorkspaceStorage } from './workspaceStorage';

/**
 * Where a workspace outside a `PlatformProvider` keeps its local preference (#1953). `key` is used as it is, without `persistKey`: two
 * workspaces on one page need two keys, and the app names the user in it when several people share a browser. A new `key` remounts the
 * workspace and reads that key; a new `storage` under the same key is used from the next write on (nothing is re-read or copied).
 * `storage` defaults to `localStorage`; every access is guarded and a refusing storage leaves the preference in memory.
 */
export type PanelWorkspacePersistence = { key: string; storage?: PanelWorkspaceStorage };

export type PanelWorkspacePanel = {
  /** Static identifier (`^[a-z][a-z0-9._-]{0,63}$`): it is stored in the local preference. */
  id: string;
  /** Declared analysis selection source hosted here when its id differs from this layout id. */
  analysisSelectionSourceId?: string;
  title: Text;
  /** Icon in the collapsed left rail; absent = first character of the translated title. */
  icon?: LucideIcon;
  /** Collapse is on by default. False removes collapse actions; summary appears beside the top tab's title. */
  collapse?: false | { summary?: Text };
  /** Floating inside the workspace is on by default. The primary panel can never float. */
  float?: false;
  render: () => ReactNode;
  /** Replace the normal Hide action with removal from the consumer's panels. The consumer must remove this entry. */
  onRemove?: () => void;
  /** Exactly one panel is primary (the first when none is): it can never be hidden and keeps the space other panels free. */
  primary?: boolean;
  /** px; default 240 × 160. */
  minWidth?: number;
  minHeight?: number;
  /**
   * px of the panel body (below the 40px strip) at which its content does not overflow. A stacked row whose panels declare it starts that tall (the
   * tallest panel of a row; rows stacked inside a row add up), within the row's minimum and the visible height. Undeclared rows keep the default.
   * A stored stack row below its preferred height is raised once for a new or increased declaration (#2786), within the row's limits.
   */
  preferredHeight?: number;
  /**
   * Signals that the panel holds something while it is a background tab or hidden (`추세 · 2 rows added`, partial data). Drawn in the tab (count above 99
   * as `99+`; `warning` adds a triangle, never colour alone) and spoken as the tab's `aria-description`; the title and the tab's name never change.
   * A hidden panel's `warning` marks the `숨긴 패널 n` button, and its `다시 보기` item carries the `description`. Changing it does not remount panels
   * and is not announced through a live region.
   */
  badge?: { count?: number; tone?: 'neutral' | 'warning'; description: Text };
  /**
   * @deprecated Use `collapse`. The summary is used by the collapsed top tab; there is no separate minimize button.
   */
  minimize?: { summary?: Text };
  /**
   * Where the panel opens when the layout does not hold it yet (#2398): absent = a tab in the primary panel's group; `'below'` = a new last row
   * (full width). Applies when the panel first joins `panels` (a panel the user added) and to presets that do not name it. A layout the user
   * already arranged, stored or not, is never moved by it. `{ row }` gives same-row panels a shared lower row in declaration
   * order. The workspace keeps its height and split as members leave or return.
   */
  placement?: 'below' | { row: string };
  /**
   * Opt-in (#2398): a pin button in the panel header. The menu owns what pinning means (with `usePinnedPanels`, the panel stays in `panels` at
   * the next drill step); the SDK only draws the state and calls `onToggle`.
   */
  pin?: { pinned: boolean; onToggle: () => void };
  /**
   * The panel must stay (#2862: another panel holds this panel's selection). «숨기기» stays in the `⋯` menu, disabled, and says `reason`;
   * collapsing and floating, which keep the panel, still work. The menu sets it and removes it when nothing depends on the panel.
   */
  keep?: { reason: Text };
};

export type PanelWorkspacePreset = { id: string; label: Text; layout: PanelWorkspaceLayout };

export type PanelWorkspaceProps = {
  /** Menu-declared actions for the active panel, after all platform items and a separator. Absent/empty leaves the menu unchanged; primary panels are not filtered. */
  panelMenuItems?: (panelId: string) => readonly { id: string; label: Text; onSelect: () => void }[];
  panels: readonly PanelWorkspacePanel[];
  presets: readonly PanelWorkspacePreset[];
  initialPreset: string;
  /** Preset shown below `compactBelow` (in memory only). Without it the panels stack into one tab group (display only). */
  compactPreset?: string;
  /** Static identifier of this workspace within its menu (`^[a-z][a-z0-9._-]{0,63}$`): part of the local preference key. */
  persistKey: string;
  /** Accessible name of the region. */
  label: Text;
  /** Container width in px under which the compact arrangement is shown. Default 900. */
  compactBelow?: number;
  /** Height mode of a workspace nobody has touched. A saved preference, a saved `화면 맞춤` included, always wins; `기본 배치` keeps the user's mode. Below `compactBelow` fit shows and the stored mode is untouched. Default `stack` (`fit` keeps the old start; the user switches in the toolbar's `⋯`). */
  initialMode?: 'fit' | 'stack';
  /**
   * Preset id the menu arranges its panels in while stacked. A workspace nobody has touched that starts in stack starts on it (else on `initialPreset`).
   * Switching `화면 맞춤` → `아래로 쌓기` applies it only while the layout is still `initialPreset`'s arrangement, and switching back applies
   * `initialPreset` only while it is still `stackPreset`'s: a layout the user changed is kept. An unknown id is ignored. Nothing stored is rewritten on load.
   */
  stackPreset?: string;
  /**
   * Brings `panelId` to the front of its tab group when `seq` changes (a menu counts up: `{ panelId: 'trend', seq: n + 1 }`). Only the active tab
   * changes for an existing panel: a hidden panel stays hidden, another panel's maximize is kept (it is a no-op, not queued)
   * and focus never moves. A panel added with the reveal request becomes active, ending maximize if it joins a different group.
   * An explicit user action can opt into `restoreHidden` to show a hidden panel, ending another panel's maximize so the restored
   * panel is visible. It uses its declared placement when it has no preset sibling to rejoin. Collapsed and
   * floating panels keep their placement. An unknown `panelId`, a repeated `seq` and `null` do nothing. A request present on
   * mount is not applied.
   */
  revealRequest?: { panelId: string; seq: number; restoreHidden?: boolean } | null;
  /**
   * Local preference of a standalone workspace (no `PlatformProvider`, #1953). Without it a standalone workspace keeps its layout in memory.
   * Inside a `PlatformProvider` it is ignored: the platform key names the session user and the routed menu, so one person's layout never
   * shows for another on a shared browser and two menus never share a key.
   */
  persistence?: PanelWorkspacePersistence;
  /**
   * Opt-in (#2416): the menu's own workspace actions, e.g. `PanelAddMenu`. Drawn at the end of the workspace toolbar, right-aligned before the
   * height-mode `⋯`; inside a command host (the board), where the toolbar is not drawn, they get a right-aligned row above the panels.
   * Absent = output unchanged.
   */
  toolbarActions?: ReactNode;
  /** Catalog and add handler for panels that follow the chart's URL selection. */
  analysisPanelAddition?: AnalysisPanelAddition;
  /** Enabled collapsed edges. Default left and top; an empty array disables the edge strips. Below 692px strips and floating are off. */
  edges?: ('left' | 'top')[];
};

const DEFAULT_COMPACT_BELOW = 900;
/** px: the visible height assumed until the first measure (and where nothing can be measured). */
const DEFAULT_VISIBLE = 900;
/** px: the toolbar row and its gap, for the baseline of a workspace that has not been shown fitted yet. */
const TOOLBAR_CHROME = 48;
const EDGE_BREAKPOINT = 692;
const DEFAULT_EDGES: PanelEdge[] = ['left', 'top'];
const FLOAT_SMALL = { width: 560, height: 440 };
const FLOAT_LARGE = { width: 760, height: 560 };
const FLOAT_INSET = 8;
const PEEK_TOP = 48;
/** Body fallback for fill-height content, plus the workspace's single panel header. */
const PEEK_BODY_FLOOR = 200;
const PEEK_HEADER_HEIGHT = 42;

/** Development-only diagnostics; production renders on with the repair rules of the state. */
function useDevChecks(props: PanelWorkspaceProps) {
  const { panels, presets, initialPreset, compactPreset, stackPreset, persistKey } = props;
  const signature = JSON.stringify([panels.map(panel => [panel.id, panel.primary === true]), presets.map(preset => preset.id), initialPreset, compactPreset, stackPreset, persistKey]);
  useEffect(() => {
    if (!isDevelopment()) return;
    const problems: string[] = [];
    if (panels.filter(panel => panel.primary).length !== 1) problems.push('exactly one panel must be primary (the first is used)');
    if (!WORKSPACE_ID.test(persistKey)) problems.push(`persistKey "${persistKey}" must match ${String(WORKSPACE_ID)}`);
    for (const panel of panels) if (!WORKSPACE_ID.test(panel.id)) problems.push(`panel id "${panel.id}" must match ${String(WORKSPACE_ID)}`);
    if (new Set(panels.map(panel => panel.id)).size !== panels.length) problems.push('panel ids must be unique');
    if (!presets.some(preset => preset.id === initialPreset)) problems.push(`initialPreset "${initialPreset}" is not a preset`);
    if (compactPreset !== undefined && !presets.some(preset => preset.id === compactPreset)) problems.push(`compactPreset "${compactPreset}" is not a preset`);
    if (stackPreset !== undefined && !presets.some(preset => preset.id === stackPreset)) problems.push(`stackPreset "${stackPreset}" is not a preset`);
    if (problems.length > 0) console.error(`[PanelWorkspace] ${problems.join('; ')}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `signature` serialises exactly the inputs read above, so the check re-runs only when they change, not on every new array identity
  }, [signature]);
}

/**
 * **Decided** (ADR-0067 decision 22, met by #690: #755, #756): a menu's panels in a dock layout the user can rearrange. The menu declares the panels, a few
 * named arrangements (presets) and which panel is primary; the platform owns the tabs, drag, split, maximize, the hidden-panel list, the
 * default layout and the local preference. Use it for dense analysis menus with four or more panels (06 §12); everything else keeps
 * `AnalysisLayout`.
 *
 * - **Remount 0.** Switching preset, `기본 배치`, moving, splitting, tab choice and maximize re-arrange panels that stay mounted, so their
 *   state and queries are untouched. A hidden panel's subtree unmounts: state that must survive hiding lives above the workspace.
 * - **Toolbar or host.** Alone, a toolbar row sits above the panels. Inside a `WorkspaceCommandsHost` (the board pane) there is no
 *   toolbar and the same commands go to the host's menu.
 * - **Compact.** Under `compactBelow` the `compactPreset` arrangement shows, in memory only: what the user does there is not stored and
 *   the stored layout returns on widening. Without `compactPreset` the panels stack into one tab group.
 * - **Local preference.** `platform:workspace:v1:<user>:<menu>:<persistKey>` in `localStorage` (written 300 ms after a change, flushed on
 *   unmount and `pagehide`); read once on mount, never by a query. Without a user or a routed menu it stays in memory. Two panes showing
 *   the same menu and `persistKey` share it; the last writer wins. Maximize is never stored.
 * - **Standalone.** Without a `PlatformProvider` (an app outside the platform, under `I18nProvider`) the layout stays in memory unless
 *   `persistence` names a key and optionally a storage; inside a `PlatformProvider` `persistence` is ignored.
 * - **Fill.** Give the page `layout="fill"` so the workspace takes the height under the header.
 * - **Height mode.** `아래로 쌓기` (default, ADR-0130): the top-level rows keep
 *   their own px heights, the workspace is as tall as they are (plus a strip that takes a tab for a new row) and the page scrolls; a workspace with one
 *   row fills what the page shows. `화면 맞춤`: the workspace fills the remaining height and the panels share it. The user chooses per workspace in the
 *   toolbar's `⋯` or the host menu; it is stored with the layout. Below `compactBelow` stack is off (fit shows) and comes back on widening.
 */
export function PanelWorkspace(props: PanelWorkspaceProps) {
  const platform = usePlatformOptional();
  useDevChecks(props);
  if (props.panels.length === 0) return null;
  let storageKey: string | null;
  let storage: PanelWorkspaceStorage | undefined;
  if (platform) {
    const userId = platform.session.user.id;
    const menuId = platform.route?.menu.id;
    storageKey = userId && menuId ? workspaceStorageKey(userId, menuId, props.persistKey) : null;
  } else {
    storageKey = props.persistence?.key || null;
    storage = props.persistence?.storage;
  }
  // A persistKey (or menu, or user, or standalone key) change is a different workspace: its body remounts and restores that key's state on its own.
  return <WorkspaceBody key={storageKey ?? `memory:${props.persistKey}`} {...props} storageKey={storageKey} storage={storage} />;
}

function WorkspaceBody({ panels, presets: given, initialPreset, compactPreset, stackPreset, label, compactBelow = DEFAULT_COMPACT_BELOW, initialMode, revealRequest, toolbarActions, analysisPanelAddition, panelMenuItems, edges = DEFAULT_EDGES, storageKey, storage }: PanelWorkspaceProps & { storageKey: string | null; storage: PanelWorkspaceStorage | undefined }) {
  const densePage = useCompactPageDensity();
  const { tx } = useI18n();
  const m = useMessages(COMPONENTS_MESSAGES);
  const depth = useWorkspaceDepth() + 1;
  const primaryId = (panels.find(panel => panel.primary) ?? panels[0]!).id;
  const presets: readonly PanelWorkspacePreset[] = given.length > 0 ? given : [{ id: initialPreset, label: COMPONENTS_MESSAGES.workspaceLayout, layout: { type: 'group', panels: panels.map(panel => panel.id) } }];
  const panelMinimums = new Map(panels.map(panel => [panel.id, { minWidth: panel.minWidth, minHeight: panel.minHeight }]));
  const rowMinimum = rowMinimumOf(panelMinimums);
  const declaredHeights = new Map(panels.flatMap(panel => (validPreferred(panel.preferredHeight) ? [[panel.id, panel.preferredHeight] as const] : [])));
  const rowPreferred = declaredHeights.size > 0 ? rowPreferredOf(declaredHeights, panelMinimums, dockTheme(true).gap) : undefined;
  const below = panels.filter(panel => panel.placement === 'below' && panel.id !== primaryId).map(panel => panel.id);
  const declaredRows = new Map<string, string[]>();
  for (const panel of panels) {
    if (panel.id === primaryId || typeof panel.placement !== 'object') continue;
    const { row } = panel.placement;
    const members = declaredRows.get(row);
    if (members) members.push(panel.id);
    else declaredRows.set(row, [panel.id]);
  }
  const sharedRows = Array.from(declaredRows, ([id, members]) => ({ id, panels: members }));
  const spec: WorkspaceSpec = { panelIds: panels.map(panel => panel.id), primaryId, presets, initialPreset, rowMinimum, initialMode, stackPreset, below, sharedRows, preferredHeights: declaredHeights, rowPreferred };
  const titleOf = (id: string) => { const panel = panels.find(candidate => candidate.id === id); return panel ? tx(panel.title) : id; };
  /** The panel's badge with its description localised. */
  const summaryOf = (id: string) => { const panel = panels.find(candidate => candidate.id === id); const summary = panel?.collapse && panel.collapse.summary !== undefined ? panel.collapse.summary : panel?.minimize?.summary; return summary ? tx(summary) : ''; };
  const badgeOf = (id: string) => { const badge = panels.find(candidate => candidate.id === id)?.badge; return badge ? { count: badge.count, tone: badge.tone ?? 'neutral', description: tx(badge.description) } : undefined; };

  const [initial] = useState(() => {
    const saved = storageKey ? readWorkspaceState(storageKey, spec, storage) : null;
    return { saved, state: saved ?? initialWorkspaceState(spec) };
  });
  const [storedState, setStored] = useState(initial.state);
  const root = useRef<HTMLDivElement>(null);
  const visible = useVisibleAreaHeight(root, true);
  const maxRow = visible ?? DEFAULT_VISIBLE;
  const panelIdentity = JSON.stringify([primaryId, [...spec.panelIds].sort(), sharedRows]);
  const [seenPanels, setSeenPanels] = useState({ identity: panelIdentity, below, ids: spec.panelIds });
  const panelsChanged = seenPanels.identity !== panelIdentity;
  // A changed panel set renders its repaired state at once and commits it before paint. Not a render-phase setState: an observer
  // update queued right after one is computed eagerly against the state before it and would put the old panel set back (#2518).
  const stored = useMemo(() => (panelsChanged ? updateWorkspacePanels(storedState, spec, seenPanels.below, maxRow) : storedState),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `spec` is a new object each render; `panelIdentity` is its identity here.
    [panelsChanged, storedState, seenPanels, panelIdentity, maxRow]);
  useLayoutEffect(() => {
    if (!panelsChanged) return;
    setSeenPanels({ identity: panelIdentity, below, ids: spec.panelIds });
    setStored(previous => (previous === storedState ? stored : updateWorkspacePanels(previous, spec, seenPanels.below, maxRow)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `spec` is rebuilt each render; the effect acts only while `panelsChanged`, whose inputs are listed.
  }, [panelsChanged, panelIdentity, below, seenPanels, storedState, stored, maxRow]);

  // Width of the workspace: under `compactBelow` with a compact preset the arrangement is the preset's, in memory.
  // Only the side of `compactBelow` is state: a resize that stays on one side re-renders nothing (#823).
  const [narrow, setNarrow] = useState(false);
  const [edgesNarrow, setEdgesNarrow] = useState(false);
  // The side of `compactBelow` as the effects below must see it in the very commit that learns it (the state is still last render's there).
  const narrowNow = useRef(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    // Seeded before the first paint: a narrow first view must not measure or store rows.
    const width = element.getBoundingClientRect().width;
    if (width > 0) { narrowNow.current = width < compactBelow; setNarrow(narrowNow.current); setEdgesNarrow(width < EDGE_BREAKPOINT); }
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) { narrowNow.current = entry.contentRect.width < compactBelow; setNarrow(narrowNow.current); setEdgesNarrow(entry.contentRect.width < EDGE_BREAKPOINT); } });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [compactBelow]);
  const compactSpec = compactPreset === undefined ? undefined : presets.find(preset => preset.id === compactPreset);
  const compact = compactSpec !== undefined && narrow;
  const [compactState, setCompactState] = useState<WorkspaceState | null>(null);
  if (panelsChanged && compactState !== null) setCompactState(previous => previous ? normalizeWorkspaceState(previous, spec, { maxRow }) : null);
  if (!compact && compactState !== null) setCompactState(null);
  const derived: WorkspaceState = compact ? { ...stored, preset: compactSpec.id, layout: presetTree(compactSpec.layout, panelOrder(stored.layout)) } : stored;
  const state = compact ? (compactState ?? derived) : stored;

  const [maximized, setMaximized] = useState<string | null>(null);
  /** px above the rows (toolbar and its gap) read when a stacked maximize starts; the maximized box is the visible height less this. */
  const [maximizeChrome, setMaximizeChrome] = useState<number | null>(null);
  const shown = panelOrder(state.layout);
  const maximizedId = maximized !== null && shown.includes(maximized) ? maximized : null;

  // Height mode (#686). Stack shows only at a width where the workspace is not narrow; the stored mode and rows survive a narrow spell untouched.
  const stackActive = stored.mode === 'stack' && !narrow;
  const count = topLevelRows(stored.layout).length;
  const storedRows = stored.rows !== undefined && stored.rows.length === count ? stored.rows : undefined;
  const automaticRows = hasAutomaticRows(stored);
  const rowDeclarations = JSON.stringify(panels.map(panel => [panel.id, panel.minHeight, panel.preferredHeight]));
  const fitSlot = useRef<HTMLDivElement>(null);
  const lastFit = useRef<number | null>(null);
  // The height fit mode gives the layout, the same input whichever mode shows: measured while fit shows, kept while stack does.
  useLayoutEffect(() => {
    const element = fitSlot.current;
    if (!element || stackActive) return;
    const read = (height: number) => { if (height > 0) lastFit.current = height; };
    read(element.getBoundingClientRect().height);
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(entries => { const entry = entries[entries.length - 1]; if (entry) read(entry.contentRect.height); });
    observer.observe(element);
    return () => { observer.disconnect(); };
  }, [stackActive]);
  useRegisterPageFlow(stackActive);

  // Commands read the latest render at call time, so their identity depends on what they display only.
  const live = useRef({ compact, narrow, derived, presets, primaryId, rowMinimum, rowPreferred, maxRow, stackActive, maximizedId, initialPreset, stackPreset, below, sharedRows });
  useLayoutEffect(() => { live.current = { compact, narrow, derived, presets, primaryId, rowMinimum, rowPreferred, maxRow, stackActive, maximizedId, initialPreset, stackPreset, below, sharedRows }; });
  /** px that make one row fill what the page shows: the scroll container less the workspace offset, toolbar and its gap, and page bottom padding. */
  const oneRowHeight = useCallback(() => {
    const element = root.current;
    const container = element ? scrollContainerOf(element) : null;
    if (!element) return NEW_ROW_HEIGHT;
    const area = container ? container.clientHeight : window.innerHeight;
    const top = element.getBoundingClientRect().top;
    const offset = container ? top - container.getBoundingClientRect().top + container.scrollTop : top + window.scrollY;
    const toolbar = element.querySelector<HTMLElement>('[data-workspace-toolbar], [data-workspace-actions]');
    const above = toolbar ? toolbar.getBoundingClientRect().height + (parseFloat(getComputedStyle(element).rowGap) || 0) : 0;
    const page = element.closest('[data-platform-page-content]');
    const padding = page ? parseFloat(getComputedStyle(page).paddingBottom) || 0 : 0;
    return Math.floor(area - offset - above - padding);
  }, []);
  const rowEnv = useCallback((): RowEnv => ({ minimum: live.current.rowMinimum, maximum: live.current.maxRow, baseline: lastFit.current ?? Math.max(NEW_ROW_HEIGHT, live.current.maxRow - TOOLBAR_CHROME), oneRow: oneRowHeight(), preferred: live.current.rowPreferred }), [oneRowHeight]);
  /** `keep`: an edit; rows follow the panels (`created`: the panel the edit moved into a row of its own, which is then a new row). `enter`: preset or reset; rows come from the new shares and the fit baseline, so repeating it cannot add height. `raw`: the edit decided the rows itself. */
  const update = useCallback((change: (current: WorkspaceState) => WorkspaceState, settle: 'keep' | 'enter' | 'raw' = 'keep', created?: string, { dockEdit = false } = {}) => {
    if (live.current.compact) setCompactState(previous => change(previous ?? live.current.derived));
    else {
      // One snapshot at the command boundary: the updater stays pure (React may replay it) and never reads the DOM.
      const env = settle === 'raw' ? null : rowEnv();
      const { below: declaredBelow, sharedRows: declaredSharedRows } = live.current;
      setStored(previous => {
        const next = change(previous);
        if (settle === 'raw' || env === null) return next;
        const sized = dockEdit && created === undefined ? rememberSharedRows(previous, next, declaredSharedRows) : next;
        return settleRows(previous, sized, settle, env, created, declaredBelow, declaredSharedRows);
      });
    }
  }, [rowEnv]);
  // A reveal persists like a user activation. The seq present at mount counts as handled.
  const knownIds = panels.map(panel => panel.id).join('|');
  const handledSeq = useRef(revealRequest?.seq);
  const revealSeq = revealRequest?.seq;
  const revealId = revealRequest?.panelId;
  const restoreHidden = revealRequest?.restoreHidden;
  const addedWithReveal = revealId !== undefined && !seenPanels.ids.includes(revealId);
  const [dockReveal, setDockReveal] = useState<{ panelId: string; seq: number } | null>(null);
  useEffect(() => {
    if (revealSeq === undefined || revealId === undefined || revealSeq === handledSeq.current) return;
    handledSeq.current = revealSeq;
    if (!knownIds.split('|').includes(revealId)) {
      if (isDevelopment()) console.error(`[PanelWorkspace] revealRequest names "${revealId}", which is not a panel`);
      return;
    }
    const { primaryId, presets, below, sharedRows } = live.current;
    const restoring = restoreHidden === true && state.hidden.includes(revealId)
      && !state.collapsed?.[revealId] && !state.floating?.some(panel => panel.panelId === revealId);
    const targetGroup = groupOf(state.layout, revealId);
    if (maximizedId !== null && maximizedId !== revealId) {
      if (!restoring && !(addedWithReveal && targetGroup)) return;
      if (restoring || !targetGroup?.panels.includes(maximizedId)) setMaximized(null);
    }
    update(current => {
      const next = restoring
        ? showPanel(current, revealId, primaryId, presets.find(candidate => candidate.id === current.preset) ?? presets[0]!, below, sharedRows)
        : current;
      const home = groupOf(next.layout, revealId);
      return home && home.active !== revealId ? { ...next, layout: activatePanel(next.layout, revealId) } : next;
    }, restoring ? 'keep' : 'raw');
    // The one-group narrow display has its own selection.
    if (restoring || targetGroup) setDockReveal({ panelId: revealId, seq: revealSeq });
  }, [revealSeq, revealId, restoreHidden, knownIds, addedWithReveal, maximizedId, state, update]);
  const setMode = useCallback((mode: 'fit' | 'stack') => {
    if (live.current.narrow) return;
    if (mode === 'stack' && fitSlot.current && !live.current.stackActive) { const height = fitSlot.current.getBoundingClientRect().height; if (height > 0) lastFit.current = height; }
    const env = rowEnv();
    update(current => changeMode(current, mode, { presets: live.current.presets, initialPreset: live.current.initialPreset, stackPreset: live.current.stackPreset, below: live.current.below, sharedRows: live.current.sharedRows }, env), 'raw');
  }, [update, rowEnv]);
  // Measure missing rows before paint. An automatic fill row stays tied to the scrollport while its provenance is intact.
  const needsRows = storedRows === undefined;
  useLayoutEffect(() => {
    if (!stackActive || narrowNow.current || !needsRows || visible === null) return;
    const env = rowEnv();
    const declaredBelow = live.current.below;
    setStored(previous => {
      if (previous.mode !== 'stack' || previous.rows?.length === topLevelRows(previous.layout).length) return previous;
      return measureWorkspaceRows(previous, env, declaredBelow, live.current.sharedRows);
    });
  }, [stackActive, needsRows, visible, rowEnv]);

  useLayoutEffect(() => {
    const element = root.current;
    if (!element || !stackActive || narrowNow.current || !automaticRows || visible === null) return;
    const measure = () => {
      const env = rowEnv();
      const declaredBelow = live.current.below;
      setStored(previous => hasAutomaticRows(previous) ? measureWorkspaceRows(previous, env, declaredBelow, live.current.sharedRows) : previous);
    };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const container = scrollContainerOf(element);
    let observed = new Set<Element>();
    const bind = () => {
      const targets = new Set<Element>([element]);
      const toolbar = element.querySelector('[data-workspace-toolbar], [data-workspace-actions]');
      if (toolbar) targets.add(toolbar);
      mutations?.observe(element, { childList: true });
      // Upstream chrome can move this root even when the scrollport and the root keep their sizes.
      for (let node: HTMLElement = element; node !== container && node.parentElement; node = node.parentElement) {
        for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) targets.add(sibling);
        targets.add(node.parentElement);
        mutations?.observe(node.parentElement, { childList: true });
      }
      observed.forEach(target => { if (!targets.has(target)) resize?.unobserve(target); });
      targets.forEach(target => { if (!observed.has(target)) resize?.observe(target); });
      observed = targets;
    };
    const mutations = typeof MutationObserver === 'undefined' ? null : new MutationObserver(() => { bind(); measure(); });
    bind();
    measure();
    window.addEventListener('resize', measure);
    return () => { resize?.disconnect(); mutations?.disconnect(); window.removeEventListener('resize', measure); };
  }, [automaticRows, count, rowDeclarations, rowEnv, stackActive, visible]);

  // Restored rows obey the visible-height cap once, when a scrollport measurement first exists. Not again: a later window resize never rewrites the preference.
  const restoreClamped = useRef(false);
  useLayoutEffect(() => {
    if (restoreClamped.current || !stackActive || narrowNow.current || storedRows === undefined || visible === null) return;
    restoreClamped.current = true;
    if (automaticRows) return;
    setStored(previous => {
      if (previous.mode !== 'stack' || previous.rows === undefined || previous.rows.length !== topLevelRows(previous.layout).length) return previous;
      const minimums = topLevelRows(previous.layout).map(live.current.rowMinimum);
      const clamped = previous.rows.map((px, index) => clampRow(px, minimums[index]!, live.current.maxRow));
      return withAdjustedRowHeights(previous, clamped, live.current.sharedRows);
    });
  }, [automaticRows, stackActive, storedRows, visible]);

  const isFloating = (id: string) => panels.find(panel => panel.id === id)?.float !== false && state.floating?.some(panel => panel.panelId === id);
  const edgeOf = (id: string) => {
    const edge = state.collapsed?.[id];
    return !edgesNarrow && edge && edges.includes(edge) && panels.find(panel => panel.id === id)?.collapse !== false && !isFloating(id) ? edge : null;
  };
  const shape = JSON.stringify({
    narrow,
    stack: stored.mode === 'stack',
    presets: presets.map(preset => [preset.id, tx(preset.label)]),
    current: state.preset,
    hidden: state.hidden.filter(id => edgesNarrow || (!edgeOf(id) && !isFloating(id))).map(id => [id, titleOf(id), badgeOf(id)?.description ?? null, badgeOf(id)?.tone === 'warning', null]),
  });
  const commands = useMemo<readonly WorkspaceCommand[]>(() => {
    const parsed = JSON.parse(shape) as { narrow: boolean; stack: boolean; presets: [string, string][]; current: string; hidden: [string, string, string | null, boolean, string | null][] };
    const preset = (id: string) => live.current.presets.find(candidate => candidate.id === id);
    return [
      ...parsed.presets.map(([id, text]): WorkspaceCommand => ({
        id: `${PRESET_PREFIX}${id}`, label: text, kind: 'radio', checked: id === parsed.current, disabled: parsed.narrow, description: parsed.narrow ? m('workspaceCompactPresetOff') : undefined,
        run: () => { const next = preset(id); if (next && !live.current.narrow) update(current => applyPreset(current, next, live.current.below, live.current.sharedRows), 'enter'); },
      })),
      ...(['fit', 'stack'] as const).map((mode): WorkspaceCommand => ({
        id: `${MODE_PREFIX}${mode}`, label: m(mode === 'fit' ? 'workspaceModeFit' : 'workspaceModeStack'), kind: 'radio', group: 'mode', groupLabel: m('workspaceHeightMode'),
        checked: (mode === 'stack') === parsed.stack, disabled: parsed.narrow, description: parsed.narrow ? m('workspaceModeOff') : undefined, run: () => { setMode(mode); },
      })),
      ...parsed.hidden.map(([id, text, description, warning, chip]): WorkspaceCommand => ({
        id: `${SHOW_PREFIX}${id}`, label: m('workspaceShowPanel', { title: text }), kind: 'action', description: description ?? undefined, warning: warning || undefined, chip: chip ?? undefined,
        run: () => { update(current => showPanel(current, id, live.current.primaryId, preset(current.preset) ?? live.current.presets[0]!, hasAutomaticRows(current) ? live.current.below : [], live.current.sharedRows)); },
      })),
      {
        id: RESET_ID, label: m('workspaceResetLayout'), kind: 'action',
        run: () => { const next = preset(parsed.current) ?? live.current.presets[0]!; update(current => resetLayout(current, next, live.current.below, live.current.sharedRows), 'enter'); },
      },
    ];
  }, [shape, update, setMode, m]);
  const hosted = useRegisterWorkspaceCommands(commands, depth);

  // Local preference: only the stored state, never the compact overlay.
  const persisted = useRef(initial.saved);
  // The latest storage without re-arming the write timer when an app passes a new object each render.
  const storageRef = useRef(storage);
  useEffect(() => { storageRef.current = storage; });
  const pending = useRef<WorkspaceState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const flush = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    const next = pending.current;
    pending.current = null;
    if (next && storageKey) { writeWorkspaceState(storageKey, next, storageRef.current, { sharedRows: live.current.sharedRows.length > 0 }); persisted.current = next; }
  }, [storageKey]);
  useEffect(() => {
    if (!storageKey) return;
    clearTimeout(timer.current);
    // Back to what is already stored (a change undone within the delay): nothing to write.
    const preference = workspacePreference(stored);
    const baseline = persisted.current ?? (automaticRows ? null : initial.state);
    if (baseline && sameWorkspaceState(preference, baseline)) { pending.current = null; return; }
    pending.current = preference;
    timer.current = setTimeout(flush, WORKSPACE_WRITE_DELAY_MS);
  }, [automaticRows, initial.state, stored, storageKey, flush]);
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => { window.removeEventListener('pagehide', flush); flush(); };
  }, [flush]);

  const [peek, setPeek] = useState<DockFloatingPanel | null>(null);
  const peekTrigger = useRef<HTMLElement | null>(null);
  const activePeek = !edgesNarrow && peek && state.hidden.includes(peek.panelId) && !state.floating?.some(panel => panel.panelId === peek.panelId) ? peek : null;
  const dismissPeek = useCallback(() => { setPeek(null); focusSoon(() => peekTrigger.current?.isConnected ? peekTrigger.current : null); }, []);
  useEffect(() => { if (edgesNarrow) setPeek(null); }, [edgesNarrow]);
  useEffect(() => {
    if (!activePeek) return;
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('[data-workspace-edge-panel], [role="menu"], [data-radix-popper-content-wrapper]')) return;
      const group = event.target.closest<HTMLElement>('[data-dock-floating]');
      if (group?.dataset.dockFloating === activePeek.panelId && root.current?.contains(group)) return;
      dismissPeek();
    };
    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[role="menu"][data-state="open"]')) return;
      event.preventDefault(); event.stopPropagation(); dismissPeek();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); };
  }, [activePeek, dismissPeek]);
  const floatingPanels = edgesNarrow ? [] : [...(state.floating ?? []).filter(item => panels.find(panel => panel.id === item.panelId)?.float !== false), ...(activePeek ? [activePeek] : [])];
  const peekPanel = panels.find(panel => panel.id === activePeek?.panelId);
  const peekHeightFloor = Math.max(PEEK_BODY_FLOOR, peekPanel?.preferredHeight ?? 0, peekPanel?.minHeight ?? 0) + PEEK_HEADER_HEIGHT;
  const dockPanels: DockPanel[] = panels.filter(panel => shown.includes(panel.id) || floatingPanels.some(item => item.panelId === panel.id)).map(panel => ({
    id: panel.id, title: tx(panel.title), minWidth: panel.minWidth, minHeight: panel.minHeight,
    analysisSelectionSourceId: panel.analysisSelectionSourceId,
    render: () => <InWorkspacePanelProvider value>{panel.render()}</InWorkspacePanelProvider>,
  }));
  // Badges reach the tab through these two callbacks; their identity follows the badges alone, so other changes do not rebuild the tabs.
  const badgeSignature = JSON.stringify(panels.map(panel => [panel.id, panel.badge ? [panel.badge.count ?? null, panel.badge.tone ?? 'neutral', tx(panel.badge.description), tx(panel.title)] : null]));
  const badges = useMemo(() => new Map((JSON.parse(badgeSignature) as [string, [number | null, 'neutral' | 'warning', string, string] | null][]).flatMap(([id, badge]) => (badge ? [[id, badge] as const] : []))), [badgeSignature]);
  const renderTab = useMemo(() => {
    if (badges.size === 0) return undefined;
    return (panelId: string) => {
      const badge = badges.get(panelId);
      return badge ? <><span className="truncate">{badge[3]}</span><PanelBadge count={badge[0] ?? undefined} tone={badge[1]} description={badge[2]} /></> : undefined;
    };
  }, [badges]);
  const tabA11y = useMemo(() => {
    if (badges.size === 0) return undefined;
    return (panelId: string) => { const badge = badges.get(panelId); return badge ? { description: badge[2] } : undefined; };
  }, [badges]);
  const reading = dockGroupsInReadingOrder(state.layout);
  const focusTab = (panelId: string) => { focusTabSoon(() => root.current, panelId); };
  const closeFocus = useRef<(() => void) | null>(null);
  const layoutChange = (change: (current: WorkspaceState) => WorkspaceState, created?: string) => { update(change, 'keep', created); };
  const moveBelow = (id: string) => {
    layoutChange(current => (panelOrder(current.layout).includes(id) ? { ...current, layout: moveToNewRow(current.layout, id) } : current), id);
    revealRow(id);
  };
  /** The new row's header goes under the sticky chrome once the engine has laid the row out (it grows the box over a few frames, so the alignment is repeated). */
  const revealRow = (panelId: string) => {
    for (const delay of [0, 40, 120, 300]) {
      setTimeout(() => {
        const element = root.current;
        if (!element?.isConnected || !live.current.stackActive) return;
        const tab = Array.from(element.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]')).find(item => item.dataset.tabPanelId === panelId);
        const header = tab?.closest<HTMLElement>('.dv-groupview');
        if (header) alignUnderChrome(header, element);
      }, delay);
    }
  };

  // Stack rows: stored px raised to each row's current minimum (a panel's minimum can change); the maximum only limits what the user asks for.
  const stackRows = stackActive ? storedRows : undefined;
  // The panel the engine's last drop moved, until the engine reports the resulting layout (`DockRows.onPanelDrop`); used once.
  const dropped = useRef<string | null>(null);
  const onPanelDrop = useCallback((panelId: string | null) => { dropped.current = panelId; }, []);
  const rowMinimums = stackRows ? topLevelRows(state.layout).map(rowMinimum) : [];
  const rows: DockRows | undefined = stackRows ? {
    heights: stackRows.map((px, index) => Math.max(px, rowMinimums[index]!)), minimums: rowMinimums, maximum: maxRow,
    onHeightsChange: next => {
      setStored(previous => {
        const minimums = topLevelRows(previous.layout).map(live.current.rowMinimum);
        if (previous.mode !== 'stack' || next.length !== minimums.length) return previous;
        const resized = withRows(previous, 'stack', next.map((px, index) => clampRow(px, minimums[index]!, Math.max(live.current.maxRow, px))));
        return rememberSharedRows(previous, resized, live.current.sharedRows);
      });
    },
    onDropBelow: moveBelow, onPanelDrop, dropBelowLabel: m('workspaceDropBelow'),
    maximizedHeight: maximizeChrome !== null && maximizedId !== null ? Math.max(0, maxRow - maximizeChrome) : undefined,
  } : undefined;

  // Page scroll padding (D8): the browser's own scrolling to a focused element stops under the sticky chrome. The CSS variable is defined below the scroll container, so px it is.
  useLayoutEffect(() => {
    const element = root.current;
    const container = element && stackActive ? scrollContainerOf(element) : null;
    if (!element || !container) return;
    const previous = container.style.scrollPaddingTop;
    container.style.scrollPaddingTop = `${stickyChromeHeight(element.closest('[data-platform-page]'))}px`;
    return () => { container.style.scrollPaddingTop = previous; };
  }, [stackActive, visible]);

  // Maximize in stack mode (D7): the box is the visible height under the toolbar and the workspace top goes under the sticky chrome; restoring returns the scroll position.
  const hasRows = rows !== undefined;
  const maximizing = hasRows && maximizedId !== null;
  const wasMaximizing = useRef(false);
  const savedScroll = useRef<number | null>(null);
  const cancelRestore = useRef<(() => void) | null>(null);
  /** Every maximize request goes through here: the scroll position is read before the shorter box can clamp it. */
  const requestMaximized = (panelId: string | null) => {
    if (panelId !== null && maximizedId === null && live.current.stackActive && root.current) {
      const container = scrollContainerOf(root.current);
      savedScroll.current = container ? container.scrollTop : null;
    }
    setMaximized(panelId);
  };
  useLayoutEffect(() => {
    cancelRestore.current?.();
    cancelRestore.current = null;
    const was = wasMaximizing.current;
    wasMaximizing.current = maximizing;
    const element = root.current;
    const container = element ? scrollContainerOf(element) : null;
    if (maximizing && !was && element) {
      const toolbar = element.querySelector<HTMLElement>('[data-workspace-toolbar]');
      setMaximizeChrome(toolbar ? toolbar.getBoundingClientRect().height + (parseFloat(getComputedStyle(element).rowGap) || 0) : 0);
      alignUnderChrome(element, element);
    } else if (!maximizing && was) {
      const saved = savedScroll.current;
      savedScroll.current = null;
      if (hasRows && saved !== null && container) cancelRestore.current = restoreScrollOffset(container, saved);
    } else if (!maximizing && !hasRows) savedScroll.current = null;
    return () => { cancelRestore.current?.(); cancelRestore.current = null; };
  }, [maximizing, hasRows]);

  const groupActions = (group: { panels: string[]; active: string }) => {
    const id = group.active;
    const panel = panels.find(panel => panel.id === id);
    const pin = panel?.pin;
    const floating = floatingPanels.find(panel => panel.panelId === id);
    const area = () => {
      const rect = fitSlot.current?.querySelector('[data-dock-layout]')?.getBoundingClientRect();
      return { width: rect?.width || FLOAT_LARGE.width, height: rect?.height || FLOAT_LARGE.height };
    };
    const collapse = (edge: PanelEdge, { fromMenu }: { fromMenu: boolean }) => {
      setPeek(null); setMaximized(null);
      const focusEdge = () => { focusSoon(() => root.current?.querySelector<HTMLElement>(`[data-workspace-edge-panel="${id}"]`)); };
      if (fromMenu) closeFocus.current = focusEdge;
      else focusEdge();
      layoutChange(current => collapsePanel(current, id, primaryId, edge));
    };
    const float = () => {
      setPeek(null); setMaximized(null);
      const box = clampFloatingPanel(floating ?? { panelId: id, x: FLOAT_INSET, y: FLOAT_INSET, ...FLOAT_SMALL }, area());
      closeFocus.current = () => { focusTab(id); };
      layoutChange(current => floatPanel(current, box, primaryId));
    };
    const pinOpen = () => {
      setPeek(null);
      update(current => showPanel(current, id, primaryId, presets.find(preset => preset.id === current.preset) ?? presets[0]!, [], sharedRows));
      focusTab(id);
    };
    const changeBox = (change: Partial<DockFloatingPanel>) => {
      if (!floating) return;
      const box = clampFloatingPanel({ ...floating, ...change }, area());
      update(current => floatPanel(current, box, primaryId));
      closeFocus.current = () => { focusTab(id); };
    };
    const menu = dockLayoutMenu(state.layout, id, { maximized: maximizedId !== null && group.panels.includes(maximizedId), orderOf: other => reading.indexOf(other as (typeof reading)[number]) });
    return <WorkspaceGroupActions key={id} title={titleOf(id)} titleOf={titleOf} menu={menu} closeFocus={closeFocus} pin={pin}
      menuItems={panelMenuItems?.(id).map(item => ({ ...item, label: tx(item.label) }))}
      edgeActions={id === primaryId || edgesNarrow ? undefined : {
        left: panel?.collapse !== false && edges.includes('left') ? () => { collapse('left', { fromMenu: true }); } : undefined,
        top: panel?.collapse !== false && edges.includes('top') ? () => { collapse('top', { fromMenu: true }); } : undefined,
        float: panel?.float !== false && (!floating || activePeek?.panelId === id) ? float : undefined,
        overlay: floating ? {
          pin: pinOpen,
          close: activePeek?.panelId === id ? dismissPeek : () => { collapse(state.collapsed?.[id] ?? 'top', { fromMenu: false }); },
          position: activePeek?.panelId === id ? undefined : place => {
            const size = area(); changeBox(place === 'top-left' ? { x: FLOAT_INSET, y: FLOAT_INSET } : { x: (size.width - floating.width) / 2, y: (size.height - floating.height) / 2 });
          },
          size: activePeek?.panelId === id ? undefined : size => { changeBox(size === 'small' ? FLOAT_SMALL : FLOAT_LARGE); },
        } : undefined,
      }}
      onMaximize={(maximize, fromMenu) => { if (!maximize && fromMenu) closeFocus.current = () => { focusTab(id); }; requestMaximized(maximize ? id : null); }}
      onSplit={position => { if (!menu.maximized && menu.split) { closeFocus.current = () => { focusTab(id); }; const target = menu.split; layoutChange(current => ({ ...current, layout: movePanel(current.layout, id, { panelId: target, position }) }), id); } }}
      onMove={target => { closeFocus.current = () => { focusTab(id); }; layoutChange(current => ({ ...current, layout: movePanel(current.layout, id, { panelId: target, position: 'center' }) })); }}
      onMoveBelow={rows && canMoveBelow(state.layout, id) ? () => { closeFocus.current = () => { focusTab(id); }; moveBelow(id); } : undefined}
      hideBlocked={panel?.keep ? { reason: tx(panel.keep.reason) } : undefined}
      onHide={id === primaryId ? undefined : () => {
        setMaximized(null);
        const next = hidePanel(state, id, primaryId);
        closeFocus.current = () => { focusTab(tabAfterHide(state, next, id, primaryId)); };
        if (panel?.onRemove) { panel.onRemove(); return; }
        layoutChange(current => {
          const next = hidePanel(current, id, primaryId);
          // Explicit hide chooses the hidden list instead of the remembered edge destination.
          const collapsed = { ...next.collapsed };
          delete collapsed[id];
          return { ...next, collapsed };
        });
      }}
      />;
  };

  const edgeItems = (edge: PanelEdge) => panels.filter(panel => state.hidden.includes(panel.id) && edgeOf(panel.id) === edge)
    .map(panel => ({ id: panel.id, title: titleOf(panel.id), summary: summaryOf(panel.id), icon: panel.icon }));
  const openPeek = (id: string, trigger: HTMLElement) => {
    if (activePeek?.panelId === id) { dismissPeek(); return; }
    const dock = fitSlot.current?.querySelector('[data-dock-layout]')?.getBoundingClientRect();
    const tab = trigger.getBoundingClientRect();
    const area = { width: dock?.width || FLOAT_LARGE.width, height: dock?.height || FLOAT_LARGE.height };
    peekTrigger.current = trigger;
    setPeek(clampFloatingPanel({ panelId: id, x: (state.collapsed?.[id] ?? 'top') === 'top' ? Math.max(0, tab.left - (dock?.left ?? 0)) : 0, y: PEEK_TOP, width: FLOAT_SMALL.width, height: Math.min(FLOAT_SMALL.height, Math.max(1, area.height - PEEK_TOP)) }, area));
  };

  const destinations = analysisPanelAddition ? {
    ...analysisPanelAddition,
    items: analysisPanelAddition.items.filter(item => !shown.includes(item.id) && !state.collapsed?.[item.id] && !isFloating(item.id)),
  } : null;
  usePublishAnalysisWorkspace(panels.map(panel => panel.analysisSelectionSourceId ?? panel.id), destinations);
  return <WorkspaceDepthProvider value={depth}>
    <AnalysisPanelAddContext.Provider value={destinations}>
    <div ref={root} data-panel-workspace data-workspace-mode={rows ? 'stack' : 'fit'} data-workspace-compact={compact ? '' : undefined} data-workspace-density={densePage ? 'compact' : undefined} className={cn(rows ? 'flex w-full min-w-0 flex-col' : 'flex h-full min-h-0 w-full min-w-0 flex-col', densePage ? 'gap-1.5' : 'gap-2')}
      onKeyDown={event => { if (event.key !== 'Escape' || event.defaultPrevented) return; if (activePeek) dismissPeek(); else if (maximizedId) requestMaximized(null); else return; event.preventDefault(); event.stopPropagation(); }}>
      {!hosted && <WorkspaceToolbar label={tx(label)} commands={commands} onShown={focusTab} actions={toolbarActions} />}
      {hosted && toolbarActions !== undefined && <div data-workspace-actions className="flex items-center justify-end gap-2">{toolbarActions}</div>}
      <WorkspaceEdges edge="top" items={edgeItems('top')} label={m('workspaceTopEdge')} peekId={activePeek?.panelId ?? null} onPeek={openPeek} />
      <div className={cn('flex min-w-0', !rows && 'min-h-0 flex-1')}>
      <WorkspaceEdges edge="left" items={edgeItems('left')} label={m('workspaceLeftEdge')} peekId={activePeek?.panelId ?? null} onPeek={openPeek} />
      <div ref={fitSlot} data-workspace-dock className="min-h-0 min-w-0 flex-1">
        <DockLayoutBase panels={dockPanels} layout={state.layout} label={tx(label)} rows={rows} reveal={dockReveal} renderTab={renderTab} tabA11y={tabA11y}
          floating={edgesNarrow ? undefined : { panels: floatingPanels, peekId: activePeek?.panelId, peekHeightFloor, onDismissPeek: dismissPeek, onChange: (next, tree) => { update(current => {
            const returned = (current.floating ?? []).filter(item => !next.some(panel => panel.panelId === item.panelId)).map(item => item.panelId);
            return { ...current, floating: next, hidden: [...new Set([...current.hidden.filter(id => !returned.includes(id)), ...next.map(panel => panel.panelId)])], layout: tree };
          }); } }}
          onLayoutChange={next => {
            const moved = dropped.current ?? undefined;
            dropped.current = null;
            update(current => ({ ...current, layout: next }), 'keep', moved, { dockEdit: true });
          }}
          onActivate={id => { update(current => (panelOrder(current.layout).includes(id) ? { ...current, layout: activatePanel(current.layout, id) } : current), 'raw'); }}
          maximizedPanelId={maximizedId} onMaximizedChange={requestMaximized}
          renderGroupActions={groupActions}
          separatorLabel={info => info.after.length === 0 ? m('workspaceSeparatorRowBottom', { before: titleOf(info.before[0]!) }) : m(info.dir === 'row' ? 'workspaceSeparatorColumns' : 'workspaceSeparatorRows', { before: titleOf(info.before[0]!), after: titleOf(info.after[0]!) })}
          narrow={compactSpec ? false : narrow} />
      </div>
      </div>
    </div>
    </AnalysisPanelAddContext.Provider>
  </WorkspaceDepthProvider>;
}
