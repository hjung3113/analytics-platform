import { dockTheme, dockDndEdges, dockDropOverlayModel } from './dockPresentation';
/**
 * The only module that imports the layout engine (`dockview-react`, ADR-0067 decision 2). Loaded lazily by `DockLayout`; nothing in
 * its signature or output exposes an engine type or the engine's JSON.
 */
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject,
} from 'react';
import {
  DockviewReact, getPanelData, type DockviewApi, type DockviewReadyEvent, type DockviewWillDropEvent, type DockviewWillShowOverlayLocationEvent, type IDockviewHeaderActionsProps, type IDockviewPanelHeaderProps, type IDockviewPanelProps,
} from 'dockview-react';
import { TransientOverlayScope, prefersReducedMotion } from '@ap/ui';
import { groupOf } from './commands';
import { DockSeparators, type DockRect } from './DockSeparators';
import type { DockLayoutProps, DockPanel, DockRows } from './dockTypes';
import { fromEngineLayout, keepStoredSizes, sameDockTree, toEngineLayout, type EngineLayout } from './engineModel';
import { PageFlowContext } from '../pageFlow';
import { isProgrammaticFocus, programmaticFocus } from './programmaticFocus';
import { canonicalDockTree, type DockNode } from './schema';
import './dock.css';

export type DockEngineProps = Pick<DockLayoutProps, 'panels' | 'layout' | 'onLayoutChange' | 'renderTab' | 'renderGroupActions' | 'renderGroupTabsEnd' | 'tabA11y' | 'separatorLabel' | 'canDropAt'> & {
  /** What the engine shows: `layout`, or the one-group stack of the narrow display. */
  display: DockNode;
  /** False in the narrow display: no drag and drop, nothing reported. */
  interactive: boolean;
  /** Effective maximized panel (null in the narrow display). */
  maximizedPanelId: string | null;
  /** Panels whose content is on screen; everything else is inert and its overlays are closed. */
  visible: ReadonlySet<string>;
  minPanelSize: { width: number; height: number };
  onActivate: (panelId: string) => void;
  containerRef: RefObject<HTMLElement | null>;
  instanceId: string;
  /** Row mode (see `DockRows`); absent = the layout fills its container. */
  rows?: DockRows;
};

type Context = {
  instanceId: string;
  panels: ReadonlyMap<string, DockPanel>;
  visible: ReadonlySet<string>;
  active: ReadonlySet<string>;
  focused: ReadonlySet<string>;
  display: DockNode;
  renderTab: DockEngineProps['renderTab'];
  renderGroupActions: DockEngineProps['renderGroupActions'];
  renderGroupTabsEnd: DockEngineProps['renderGroupTabsEnd'];
  tabA11y: DockEngineProps['tabA11y'];
  /** Counts the reconciles: the engine rebuilds tab elements in one, so what is set on them from outside is set again. */
  reconciles: number;
  /** Counts the engine's own panel moves: it puts a retained header into a new tab element there, with no reconcile (an accepted move skips `applyLayout`). */
  moves: number;
  onActivate: (panelId: string) => void;
};

const EngineContext = createContext<Context | null>(null);
function useEngine(): Context {
  const value = useContext(EngineContext);
  if (!value) throw new Error('dock: engine component rendered outside DockEngine');
  return value;
}

/** The panel's content root. Visibility is derived from the layout, not from engine events, so a reconcile never flickers it. */
function PanelHost({ api }: IDockviewPanelProps) {
  const engine = useEngine();
  const id = api.id;
  const visible = engine.visible.has(id);
  const panel = engine.panels.get(id);
  return <div id={`${engine.instanceId}-panel-${id}`} data-dock-panel={id} data-dock-visible={visible} inert={!visible} tabIndex={-1} className="h-full min-h-0 min-w-0 overflow-auto focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus-ring"
    onFocus={event => {
      // Focus moving into the panel from outside it is the user choosing the panel. Not: focus the dock itself moved, or an event of a nested
      // layout (its panel belongs to that layout's `onActivate`).
      if (isProgrammaticFocus()) return;
      const root = event.currentTarget.closest('[data-dock-layout]');
      if (event.target instanceof Element && event.target.closest('[data-dock-layout]') !== root) return;
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) engine.onActivate(id);
    }}>
    {/* A panel is a page-flow boundary: a workspace stacked inside it scrolls inside the panel and never changes the page around the dock. */}
    <PageFlowContext.Provider value={null}><TransientOverlayScope active={visible}><div data-dock-panel-content className="h-full min-w-0 w-full">{panel?.render() ?? null}</div></TransientOverlayScope></PageFlowContext.Provider>
  </div>;
}

/** Our tab content. There is no close button: closing is a platform command, never the engine's (ADR-0067 decision 7). */
function DockTab({ api }: IDockviewPanelHeaderProps) {
  const engine = useEngine();
  const id = api.id;
  const mark = useRef<HTMLSpanElement>(null);
  const a11y = engine.tabA11y?.(id);
  const description = a11y?.description;
  const keyShortcuts = a11y?.keyShortcuts;
  // The tab element belongs to the engine; the host's spoken extras are set on it from the content the engine puts inside.
  useLayoutEffect(() => {
    const tab = mark.current?.closest<HTMLElement>('[role="tab"]');
    if (!tab) return;
    const set = (name: string, value: string | undefined) => { if (value === undefined) tab.removeAttribute(name); else tab.setAttribute(name, value); };
    set('aria-description', description);
    set('aria-keyshortcuts', keyShortcuts);
  }, [description, keyShortcuts, engine.reconciles, engine.moves]);
  return <span ref={mark} data-dock-tab={id} className="flex min-w-0 items-center truncate">
    {engine.renderTab?.(id, { active: engine.active.has(id), groupFocused: engine.focused.has(id) }) ?? engine.panels.get(id)?.title ?? id}
  </span>;
}

/** Fired on the layout root when a sash drag ends and the panel contents are released. */
const RESIZE_END = 'dock-resize-end';

function GroupActions({ activePanel, panels }: IDockviewHeaderActionsProps) {
  const engine = useEngine();
  const slot = useRef<HTMLDivElement>(null);
  const [stripWidth, setStripWidth] = useState(0);
  const anchor = activePanel?.id ?? panels[0]?.id;
  const group = engine.renderGroupActions && anchor ? groupOf(engine.display, anchor) : undefined;
  const drawn = group !== undefined;
  // The header strip is the slot's container; its width is what the host fits the tabs and its own content into.
  useLayoutEffect(() => {
    const strip = slot.current?.closest<HTMLElement>('.dv-tabs-and-actions-container');
    if (!strip) return;
    // While a sash is dragged the width is read once, when the drag ends (`DockEngine` announces it), not on every frame.
    const root = strip.closest('[data-dock-layout]');
    const measure = () => { if (!root?.hasAttribute('data-dock-resizing')) setStripWidth(Math.round(strip.getBoundingClientRect().width)); };
    measure();
    root?.addEventListener(RESIZE_END, measure);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure);
    observer?.observe(strip);
    return () => { observer?.disconnect(); root?.removeEventListener(RESIZE_END, measure); };
  }, [drawn]);
  if (!engine.renderGroupActions || !group) return null;
  return <div ref={slot} data-dock-group-actions data-dock-active={group.active} className="flex h-full min-w-0 items-center">{engine.renderGroupActions(group, { stripWidth })}</div>;
}

/** The host's slot right after the group's last tab (dockview's left header actions, which sit after the tab list). */
function GroupTabsEnd({ activePanel, panels }: IDockviewHeaderActionsProps) {
  const engine = useEngine();
  const anchor = activePanel?.id ?? panels[0]?.id;
  const group = engine.renderGroupTabsEnd && anchor ? groupOf(engine.display, anchor) : undefined;
  if (!engine.renderGroupTabsEnd || !group) return null;
  return <div data-dock-group-tabs-end data-dock-active={group.active} className="flex h-full min-w-0 items-center">{engine.renderGroupTabsEnd(group)}</div>;
}

const COMPONENTS = { panel: PanelHost };
const TAB_COMPONENTS = { tab: DockTab };
/** Module-level so the option object keeps its identity across renders (a new one re-applies the theme). */
const THEME = dockTheme(true);
type SerializedLayout = Parameters<DockviewApi['fromJSON']>[0];

const sameRects = (a: Record<string, DockRect>, b: Record<string, DockRect>) => {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every(key => {
    const x = a[key]; const y = b[key]!;
    return x !== undefined && x.left === y.left && x.top === y.top && x.width === y.width && x.height === y.height;
  });
};

/**
 * The tree the engine shows. While a group is maximized `toJSON` is not used (it leaves and re-enters maximize, dockview-core
 * main.esm.mjs:2473-2506); the group's tab order and active tab are read from the group API instead (`api.groups` :3901, `group.panels` and
 * `group.activePanel` :11956-11959) onto the stored layout. Panels cannot cross groups meanwhile (the other groups are hidden).
 */
function readEngine(api: DockviewApi, stored: DockNode): { tree: DockNode; measured: boolean } {
  if (!api.hasMaximizedGroup()) return fromEngineLayout(api.toJSON() as unknown as EngineLayout);
  const groups = api.groups;
  const read = (node: DockNode): DockNode => {
    if (node.type === 'branch') return { ...node, children: node.children.map(read) };
    const engine = groups.find(candidate => candidate.panels.some(panel => panel.id === node.panels[0]));
    const ids = engine?.panels.map(panel => panel.id) ?? [];
    if (!engine || ids.length !== node.panels.length || !ids.every(id => node.panels.includes(id))) return node;
    const active = engine.activePanel?.id;
    return { type: 'group', panels: ids, active: active && ids.includes(active) ? active : node.active };
  };
  return { tree: canonicalDockTree(read(stored)), measured: false };
}

export default function DockEngine({
  panels, layout, display, interactive, maximizedPanelId, visible, minPanelSize, onLayoutChange, onActivate, renderTab, renderGroupActions, renderGroupTabsEnd, tabA11y, separatorLabel, canDropAt,
  containerRef, instanceId, rows,
}: DockEngineProps) {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [epoch, setEpoch] = useState(0);
  // Counts real reconciles (`fromJSON` drops the engine's maximize, even when only titles or minimum sizes changed).
  const [reconciles, setReconciles] = useState(0);
  const [moves, setMoves] = useState(0);
  const [rects, setRects] = useState<Record<string, DockRect>>({});
  const [focusedPanel, setFocusedPanel] = useState<string | null>(null);
  const applying = useRef(false);
  const applied = useRef<{ key: string; meta: string } | null>(null);
  // `emitted`: the key of the tree last reported to the parent (it already shows in the engine); `pending`: a report awaits the parent's answer.
  const emitted = useRef<string | null>(null);
  const pending = useRef(false);
  // `dragging`: a sash drag is live or its final notification is still due; `released`: the pointer is up and `dragTimer` is the fallback that lowers it.
  const dragging = useRef(false);
  const released = useRef(false);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // `deferred`: a sash drag changed the sizes and the parent has not been told yet (it is told once, when the drag ends); `frozen`: the panel hosts held at their size.
  const deferred = useRef(false);
  const frozen = useRef<HTMLElement[]>([]);
  const canonicalDisplay = useMemo(() => canonicalDockTree(display), [display]);
  const key = useMemo(() => JSON.stringify(canonicalDisplay), [canonicalDisplay]);
  const panelMinimums = useMemo(() => new Map(panels.map(panel => [panel.id, { minWidth: panel.minWidth, minHeight: panel.minHeight }])), [panels]);
  const meta = useMemo(() => JSON.stringify([panels.map(panel => [panel.id, panel.title, panel.minWidth, panel.minHeight]), minPanelSize]), [panels, minPanelSize]);
  // The effects below run on what changed (key, meta, epoch), not on every new object identity; they read the rest from here.
  const rowsTotal = rows ? rows.heights.reduce((sum, height) => sum + height, 0) : undefined;
  // The engine spaces top-level rows by the theme gap and shares only the rest among them. The box adds the gaps, so each row is drawn at its own px
  // and a resize of one row moves no other (the gap was shared out by proportion before: untouched rows changed by a few px while dragging).
  const rowsBox = rows && rowsTotal !== undefined ? rowsTotal + Math.max(0, rows.heights.length - 1) * THEME.gap : undefined;
  const live = useRef({ layout, interactive, onLayoutChange, canonicalDisplay, panels, minPanelSize, rowsBox });
  useLayoutEffect(() => { live.current = { layout, interactive, onLayoutChange, canonicalDisplay, panels, minPanelSize, rowsBox }; });
  const panelMap = useMemo(() => new Map(panels.map(panel => [panel.id, panel])), [panels]);

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!api || !container) return;
    const base = container.getBoundingClientRect();
    const next: Record<string, DockRect> = {};
    for (const panel of api.panels) {
      const box = panel.group.element.getBoundingClientRect();
      next[panel.id] = { left: box.left - base.left, top: box.top - base.top, width: box.width, height: box.height };
    }
    setRects(previous => (sameRects(previous, next) ? previous : next));
  }, [api, containerRef]);
  const frame = useRef(0);
  const scheduleMeasure = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(measure);
  }, [measure]);
  useEffect(() => () => { cancelAnimationFrame(frame.current); }, []);

  // The latest `canDropAt`, read by the preview subscription and the drop handler (one function, so both judge alike) without resubscribing.
  const canDrop = useRef(canDropAt);
  useLayoutEffect(() => { canDrop.current = canDropAt; });
  const refused = useCallback((event: DockviewWillDropEvent | DockviewWillShowOverlayLocationEvent): boolean => {
    const judge = canDrop.current;
    const data = event.getData();
    // A dragged whole group has no panel id: it keeps the engine's behaviour.
    if (!judge || !data?.panelId) return false;
    const target = event.kind === 'edge' ? undefined : event.group;
    return !judge({ panelId: data.panelId, targetGroupPanelIds: target ? target.panels.map(panel => panel.id) : [], position: event.position });
  }, []);
  const onReady = useCallback((event: DockviewReadyEvent) => {
    setApi(event.api);
    // A refused place draws no preview; the drag effect stays `none` there because nothing accepts it.
    event.api.onWillShowOverlay(overlay => { if (refused(overlay)) overlay.preventDefault(); });
  }, [refused]);

  // Report what the user did to the engine (drag, sash, tab drop, tab activation) as a new tree. Sizes are only news while a sash is being
  // dragged: the engine's own px rounding, gaps and minimum sizes would otherwise differ from `layout` by a fraction on every load.
  // While a sash is dragged the panel contents keep the size they had when it started and what overflows is clipped: the frame and the separators
  // move live, the contents (charts, tables) are laid out again once, when the drag ends. Only this layout's own panels, not a layout nested in one.
  const freeze = useCallback(() => {
    const root = containerRef.current;
    if (!root) return;
    const hosts = Array.from(root.querySelectorAll<HTMLElement>('[data-dock-panel]')).filter(host => host.closest('[data-dock-layout]') === root);
    const sizes = hosts.map(host => ({ host, width: host.clientWidth, height: host.clientHeight }));
    root.setAttribute('data-dock-resizing', '');
    for (const { host, width, height } of sizes) {
      host.setAttribute('data-dock-frozen', '');
      const content = host.querySelector<HTMLElement>('[data-dock-panel-content]');
      if (content && width > 0 && height > 0) { content.style.width = `${width}px`; content.style.height = `${height}px`; }
    }
    frozen.current = hosts;
  }, [containerRef]);
  const thaw = useCallback(() => {
    const root = containerRef.current;
    if (!root?.hasAttribute('data-dock-resizing')) return;
    for (const host of frozen.current) {
      host.removeAttribute('data-dock-frozen');
      const content = host.querySelector<HTMLElement>('[data-dock-panel-content]');
      if (content) { content.style.width = ''; content.style.height = ''; }
    }
    frozen.current = [];
    root.removeAttribute('data-dock-resizing');
    root.dispatchEvent(new Event(RESIZE_END));
  }, [containerRef]);
  // Clears the gesture without telling the parent: cancel (a caller-owned layout lands), dispose (unmount) and the tail of settling.
  const endDrag = useCallback(() => {
    clearTimeout(dragTimer.current);
    dragging.current = false;
    released.current = false;
    deferred.current = false;
    thaw();
  }, [thaw]);
  const report = useCallback((next: DockNode) => {
    const nextKey = JSON.stringify(next);
    // The engine fires several events for one change (active, move, layout) before the parent's commit; the same tree is reported once.
    if (nextKey === emitted.current) return;
    emitted.current = nextKey;
    pending.current = true;
    live.current.onLayoutChange(next);
    // A parent that ignores the change leaves the engine ahead of `layout`; the epoch makes the reconcile below run and win.
    setEpoch(value => value + 1);
  }, []);
  const check = useCallback((target: DockviewApi) => {
    if (applying.current) return;
    // A sash drag is measured and reported when it ends, not on every frame of it.
    const sashDrag = dragging.current && !released.current;
    if (!sashDrag) scheduleMeasure();
    const current = live.current;
    if (!current.interactive) return;
    const shown = canonicalDockTree(current.layout);
    const read = readEngine(target, shown);
    const structural = !sameDockTree(read.tree, shown, { sizes: false });
    const resized = !structural && dragging.current && read.measured && !sameDockTree(read.tree, shown, { sizes: true, tolerance: 0.05 });
    // The first measured notification after the pointer is up is the drag's own final one: it consumes the permission before the parent is told,
    // so nothing later (a reconcile, a window resize) can be reported as this drag's sizes.
    if (released.current && read.measured) endDrag();
    if (!structural && !resized) return;
    // The sizes of a drag in progress are only remembered; the final notification (or the release timer) tells the parent once.
    if (resized && sashDrag) { deferred.current = true; return; }
    // Only a sash drag brings the engine's sizes along; any other change keeps the stored shares (the engine's px are rounded and clamped).
    report(resized ? read.tree : keepStoredSizes(read.tree, shown));
  }, [scheduleMeasure, endDrag, report]);
  useEffect(() => {
    if (!api) return;
    const subscriptions = [api.onDidLayoutChange(() => { check(api); }), api.onDidActivePanelChange(() => { check(api); }), api.onDidMovePanel(() => { setMoves(value => value + 1); check(api); })];
    const container = containerRef.current;
    // The engine ends a sash drag on a document `pointerup` (dockview-core main.esm.mjs:1519-1532), after this window-capture handler. Its sash-end
    // event becomes a layout change (:2159-2161), propagates up the grid (:2225-2231, :2576-2578) and is buffered by `BaseGrid` (:2974-2977) into
    // `onDidLayoutChange`, an `AsapEvent` fired from `queueMicrotask` (:2952-2953, :300-307). That notification is the drag's final one and `check`
    // consumes the permission there. A drag that changed nothing sends none, so the timer lowers the flag once the dispatch and its microtasks are
    // done; `applyLayout` lowers it too when a caller-owned layout lands first.
    // No final notification came: lower the flag, and tell the parent the sizes the drag left in the engine, if it changed any.
    const settle = () => {
      const owed = deferred.current && released.current;
      endDrag();
      scheduleMeasure();
      if (!owed) return;
      const shown = canonicalDockTree(live.current.layout);
      const read = readEngine(api, shown);
      if (live.current.interactive && read.measured && sameDockTree(read.tree, shown, { sizes: false }) && !sameDockTree(read.tree, shown, { sizes: true, tolerance: 0.05 })) report(read.tree);
    };
    const up = () => {
      if (!dragging.current || released.current) return;
      released.current = true;
      clearTimeout(dragTimer.current);
      dragTimer.current = setTimeout(settle, 0);
    };
    const down = (event: Event) => {
      if (!(event.target instanceof Element && event.target.closest('.dv-sash'))) return;
      // A press while the pointer of the running drag is still down is not a new drag: nothing is thawed or frozen again mid-gesture.
      if (dragging.current && !released.current) return;
      // A released drag still waiting for its timer is owed to the parent: settle it before the next one starts.
      if (dragging.current) settle();
      dragging.current = true;
      freeze();
    };
    container?.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      endDrag();
      subscriptions.forEach(subscription => { subscription.dispose(); });
      container?.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [api, check, containerRef, endDrag, freeze, report, scheduleMeasure]);

  /** Puts the live engine on `live.current.canonicalDisplay` (shares at the engine's current size) and brings focus back to the tab it had. */
  const applyLayout = useCallback((target: DockviewApi, appliedKey: string, appliedMeta: string) => {
    const { canonicalDisplay: wanted, panels: wantedPanels, minPanelSize: minimum, rowsBox: total } = live.current;
    const focusedBefore = containerRef.current?.contains(document.activeElement) ? document.activeElement : null;
    const focusedTabId = focusedBefore instanceof HTMLElement ? focusedBefore.closest<HTMLElement>('[role="tab"]')?.dataset.tabPanelId : undefined;
    if (released.current) endDrag();
    applying.current = true;
    try {
      // `fromJSON` ends with a forced relayout at the size the engine had when it started, which would scale every row of the new layout to the
      // old height until the ResizeObserver tells the engine the new one. Put the engine on the new height first, so that size is the new one.
      if (total !== undefined && target.height !== total) target.layout(target.width, total);
      target.fromJSON(toEngineLayout(wanted, wantedPanels, minimum, { width: target.width, height: total ?? target.height }) as unknown as SerializedLayout, { reuseExistingPanels: true });
    } finally {
      applying.current = false;
    }
    applied.current = { key: appliedKey, meta: appliedMeta };
    emitted.current = null;
    if (focusedBefore instanceof HTMLElement && !focusedBefore.isConnected) {
      // The same panel's tab if it is still there (the tab is rebuilt when its title changes), else the first active tab.
      const tabs = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[role="tab"][data-tab-panel-id]') ?? []);
      const tab = tabs.find(item => focusedTabId !== undefined && item.dataset.tabPanelId === focusedTabId) ?? tabs.find(item => item.getAttribute('aria-selected') === 'true');
      if (tab) programmaticFocus(() => { tab.focus({ preventScroll: true }); });
    }
    setReconciles(value => value + 1);
    scheduleMeasure();
  }, [containerRef, scheduleMeasure, endDrag]);

  // Bring the engine to `display` without remounting any panel: `fromJSON(…, { reuseExistingPanels: true })` re-parents the live panels
  // (dockview-core main.esm.mjs:17640). Never `clear()` and never `close()` (those dispose panels, D9).
  useEffect(() => {
    if (!api) return;
    const { canonicalDisplay: wanted, panels: wantedPanels } = live.current;
    const engineIds = api.panels.map(panel => panel.id).sort().join('\n');
    const wantedIds = wantedPanels.map(panel => panel.id).sort().join('\n');
    const answered = pending.current;
    pending.current = false;
    let rebuild: boolean;
    if (!applied.current || applied.current.meta !== meta || engineIds !== wantedIds) rebuild = true;
    else if (applied.current.key !== key) rebuild = key !== emitted.current;
    else if (answered) rebuild = true;
    else {
      rebuild = !sameDockTree(readEngine(api, wanted).tree, wanted, { sizes: false });
    }
    if (!rebuild) { applied.current = { key, meta }; return; }
    applyLayout(api, key, meta);
  }, [api, key, meta, epoch, applyLayout]);

  // Row mode: the container height and the top-level shares change together. The engine would otherwise relayout the new height with the old
  // shares (every row scaled) and correct it a frame later, which moves rows the user did not touch. Here, before paint, the live engine is
  // put on the new shares at the new height; the reconcile effect above then finds nothing left to do.
  useLayoutEffect(() => {
    if (!api || rowsBox === undefined || !applied.current || applied.current.meta !== meta) return;
    if (applied.current.key === key || key === emitted.current) return;
    applyLayout(api, key, meta);
  }, [api, rowsBox, key, meta, applyLayout]);

  // Maximize is the engine's group maximize and is never stored, so it is re-asserted after every reconcile. The engine hides the other groups
  // with the px size they had, and gives that size back on restore whatever the container became meanwhile: a resize in between leaves the
  // shares skewed (and below the minimum), so every restore puts the stored shares back at the current size. The size at the start of the
  // maximize and at the restore cannot tell whether it changed in between (1440 -> 600 -> 1440 looks unchanged), and re-applying equal shares
  // changes nothing.
  useEffect(() => {
    if (!api) return;
    const target = maximizedPanelId ? api.getPanel(maximizedPanelId) : undefined;
    if (target) {
      if (!target.api.isMaximized()) target.api.maximize();
    } else if (api.hasMaximizedGroup()) {
      api.exitMaximizedGroup();
      if (applied.current) applyLayout(api, applied.current.key, applied.current.meta);
    }
    scheduleMeasure();
  }, [api, maximizedPanelId, key, epoch, reconciles, scheduleMeasure, applyLayout]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    return () => { observer.disconnect(); };
  }, [containerRef, scheduleMeasure]);

  // The engine makes every group container a `region` named after its active panel, which duplicates the panel's own region name (a chart
  // card) and is no landmark of ours: each group's tab panel is already labelled by its tab. Removed on mount and whenever the engine sets
  // them again (title or active panel change).
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const strip = (group: Element) => { group.removeAttribute('role'); group.removeAttribute('aria-label'); };
    const stripAll = () => { container.querySelectorAll('.dv-groupview').forEach(strip); };
    stripAll();
    const observer = new MutationObserver(records => {
      for (const record of records) {
        if (record.type === 'attributes' && record.target instanceof Element && record.target.classList.contains('dv-groupview')) strip(record.target);
        else if (record.type === 'childList' && Array.from(record.addedNodes).some(node => node instanceof Element && (node.classList.contains('dv-groupview') || node.querySelector('.dv-groupview')))) stripAll();
      }
    });
    observer.observe(container, { subtree: true, childList: true, attributes: true, attributeFilter: ['role', 'aria-label'] });
    return () => { observer.disconnect(); };
  }, [containerRef, api]);

  // Row mode: the engine's own grid (the first `.dv-grid-view` inside the wrapper; a layout nested in a panel comes after it) is marked, so `dock.css`
  // switches off the sashes of this grid only and a nested layout keeps its pointer sashes.
  const rowsWrapper = useRef<HTMLDivElement>(null);
  const rowMode = rows !== undefined;
  useEffect(() => {
    const grid = rowMode && api ? rowsWrapper.current?.querySelector('.dv-grid-view') : null;
    if (!grid) return;
    grid.setAttribute('data-dock-rows-grid', '');
    return () => { grid.removeAttribute('data-dock-rows-grid'); };
  }, [api, rowMode]);

  // Which group holds focus drives the tab's `groupFocused`.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const panelAt = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      return target.closest<HTMLElement>('[data-dock-panel]')?.dataset.dockPanel ?? target.closest<HTMLElement>('[data-tab-panel-id]')?.dataset.tabPanelId ?? null;
    };
    const focusIn = (event: FocusEvent) => { setFocusedPanel(panelAt(event.target)); };
    const focusOut = (event: FocusEvent) => { if (!(event.relatedTarget instanceof Node && container.contains(event.relatedTarget))) setFocusedPanel(null); };
    container.addEventListener('focusin', focusIn);
    container.addEventListener('focusout', focusOut);
    return () => { container.removeEventListener('focusin', focusIn); container.removeEventListener('focusout', focusOut); };
  }, [containerRef]);

  // A drag from another instance, or one that is not a panel, is refused (the engine already ignores foreign payloads, `viewId` mismatch at
  // main.esm.mjs:11510/11538; this makes the refusal explicit). `onUnhandledDragOver` is never accepted.
  const onPanelDrop = rows?.onPanelDrop;
  const onWillDrop = useCallback((event: DockviewWillDropEvent) => {
    const data = event.getData();
    if (!data || data.viewId !== event.api.id) { event.preventDefault(); return; }
    if (refused(event)) event.preventDefault();
    // The drop is reported as a layout right after this (before any other drop); the row model needs to know which panel moved.
    onPanelDrop?.(event.defaultPrevented ? null : data.panelId);
  }, [onPanelDrop, refused]);

  // The strip under the last row accepts one tab of this layout: not a whole group, not another layout's tab, not outside data. Every drag over the strip
  // ends here, taken or refused: an ancestor dock (the board around a pane) must never act on a drop released over it. These are native listeners on the
  // strip itself, which see the event before any ancestor's: React's own handlers run at the root, after the ancestors' native ones.
  const [dropOver, setDropOver] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const onDropBelow = rows?.onDropBelow;
  const stripShown = onDropBelow !== undefined && interactive;
  useEffect(() => {
    const element = strip.current;
    if (!element || !stripShown) return;
    const accepted = () => {
      const data = getPanelData();
      return data && data.panelId && data.viewId === api?.id ? data.panelId : null;
    };
    const effect = (event: DragEvent, value: 'move' | 'none') => { const transfer = event.dataTransfer as DataTransfer | null | undefined; if (transfer) transfer.dropEffect = value; };
    const enter = (event: DragEvent) => { event.stopPropagation(); };
    const over = (event: DragEvent) => {
      event.stopPropagation();
      if (accepted()) { event.preventDefault(); effect(event, 'move'); setDropOver(true); } else { effect(event, 'none'); setDropOver(false); }
    };
    const leave = () => { setDropOver(false); };
    const drop = (event: DragEvent) => {
      event.stopPropagation();
      setDropOver(false);
      const panelId = accepted();
      if (!panelId) return;
      event.preventDefault();
      onDropBelow(panelId);
    };
    element.addEventListener('dragenter', enter);
    element.addEventListener('dragover', over);
    element.addEventListener('dragleave', leave);
    element.addEventListener('drop', drop);
    return () => { element.removeEventListener('dragenter', enter); element.removeEventListener('dragover', over); element.removeEventListener('dragleave', leave); element.removeEventListener('drop', drop); };
  }, [stripShown, api, onDropBelow]);

  const context = useMemo<Context>(() => {
    const focusGroup = focusedPanel ? groupOf(canonicalDisplay, focusedPanel)?.panels ?? [] : [];
    const active = new Set<string>();
    const collect = (node: DockNode) => { if (node.type === 'group') active.add(node.active); else node.children.forEach(collect); };
    collect(canonicalDisplay);
    return { instanceId, panels: panelMap, visible, active, focused: new Set(focusGroup), display: canonicalDisplay, renderTab, renderGroupActions, renderGroupTabsEnd, tabA11y, reconciles, moves, onActivate };
  }, [instanceId, panelMap, visible, focusedPanel, canonicalDisplay, renderTab, renderGroupActions, renderGroupTabsEnd, tabA11y, reconciles, moves, onActivate]);

  // Separator keys change the layout without the engine having moved: the parent's answer is applied to the engine (or reverted if it ignores it).
  const separate = (next: DockNode) => {
    emitted.current = null;
    pending.current = true;
    onLayoutChange(next);
    setEpoch(value => value + 1);
  };

  return <EngineContext.Provider value={context}>
    <div ref={rowsWrapper} data-dock-rows={rows ? '' : undefined} className={rows ? 'h-(--dock-rows-box) w-full' : 'h-full w-full'} style={rowsTotal === undefined ? undefined : { '--dock-rows-height': `${rowsTotal}px`, '--dock-rows-box': `${rowsBox}px` } as CSSProperties}>
      <DockviewReact components={COMPONENTS} tabComponents={TAB_COMPONENTS} defaultTabComponent={DockTab} rightHeaderActionsComponent={GroupActions} leftHeaderActionsComponent={GroupTabsEnd}
        onReady={onReady} onWillDrop={onWillDrop} theme={dockTheme(prefersReducedMotion())} dndEdges={dockDndEdges} dropOverlayModel={dockDropOverlayModel} defaultRenderer="always" singleTabMode="fullwidth"
        disableFloatingGroups disableDnd={!interactive} announcements={false} />
    </div>
    {stripShown && <div ref={strip} data-dock-drop-below
      className={`mt-2 flex h-[72px] items-center justify-center rounded-lg border-2 border-dashed text-sm ${dropOver ? 'border-accent-primary bg-surface-row-hover text-text-primary' : 'border-border-strong text-text-muted'}`}>{rows?.dropBelowLabel}</div>}
    {interactive && !maximizedPanelId && <DockSeparators layout={layout} rects={rects} minPanelSize={minPanelSize} panelMinimums={panelMinimums} instanceId={instanceId} label={separatorLabel} onChange={separate} rows={rows} />}
  </EngineContext.Provider>;
}

