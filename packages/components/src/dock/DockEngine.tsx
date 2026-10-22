/**
 * The only module that imports the layout engine (`dockview-react`, ADR-0067 decision 2). Loaded lazily by `DockLayout`; nothing in
 * its signature or output exposes an engine type or the engine's JSON.
 */
import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject,
} from 'react';
import {
  DockviewReact, type DockviewApi, type DockviewReadyEvent, type DockviewWillDropEvent, type IDockviewHeaderActionsProps, type IDockviewPanelHeaderProps, type IDockviewPanelProps,
} from 'dockview-react';
import { TransientOverlayScope } from '@ap/ui';
import { groupOf } from './commands';
import { DockSeparators, type DockRect } from './DockSeparators';
import type { DockLayoutProps, DockPanel } from './dockTypes';
import { fromEngineLayout, keepStoredSizes, sameDockTree, toEngineLayout, type EngineLayout } from './engineModel';
import { isProgrammaticFocus, programmaticFocus } from './programmaticFocus';
import { canonicalDockTree, type DockNode } from './schema';
import './dock.css';

export type DockEngineProps = Pick<DockLayoutProps, 'panels' | 'layout' | 'onLayoutChange' | 'renderTab' | 'renderGroupActions' | 'tabA11y' | 'separatorLabel'> & {
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
  tabA11y: DockEngineProps['tabA11y'];
  /** Counts the reconciles: the engine rebuilds tab elements in one, so what is set on them from outside is set again. */
  reconciles: number;
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
    <TransientOverlayScope active={visible}>{panel?.render() ?? null}</TransientOverlayScope>
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
  }, [description, keyShortcuts, engine.reconciles]);
  return <span ref={mark} data-dock-tab={id} className="flex min-w-0 items-center truncate">
    {engine.renderTab?.(id, { active: engine.active.has(id), groupFocused: engine.focused.has(id) }) ?? engine.panels.get(id)?.title ?? id}
  </span>;
}

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
    const measure = () => { setStripWidth(Math.round(strip.getBoundingClientRect().width)); };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(strip);
    return () => { observer.disconnect(); };
  }, [drawn]);
  if (!engine.renderGroupActions || !group) return null;
  return <div ref={slot} data-dock-group-actions data-dock-active={group.active} className="flex h-full min-w-0 items-center">{engine.renderGroupActions(group, { stripWidth })}</div>;
}

const COMPONENTS = { panel: PanelHost };
const TAB_COMPONENTS = { tab: DockTab };
/** Module-level so the option object keeps its identity across renders (a new one re-applies the theme). */
const THEME = { name: 'ap', className: 'ap-dock', gap: 6 };
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
  panels, layout, display, interactive, maximizedPanelId, visible, minPanelSize, onLayoutChange, onActivate, renderTab, renderGroupActions, tabA11y, separatorLabel,
  containerRef, instanceId,
}: DockEngineProps) {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [epoch, setEpoch] = useState(0);
  // Counts real reconciles (`fromJSON` drops the engine's maximize, even when only titles or minimum sizes changed).
  const [reconciles, setReconciles] = useState(0);
  const [rects, setRects] = useState<Record<string, DockRect>>({});
  const [focusedPanel, setFocusedPanel] = useState<string | null>(null);
  const applying = useRef(false);
  const applied = useRef<{ key: string; meta: string } | null>(null);
  // `emitted`: the key of the tree last reported to the parent (it already shows in the engine); `pending`: a report awaits the parent's answer.
  const emitted = useRef<string | null>(null);
  const pending = useRef(false);
  const dragging = useRef(false);
  const canonicalDisplay = useMemo(() => canonicalDockTree(display), [display]);
  const key = useMemo(() => JSON.stringify(canonicalDisplay), [canonicalDisplay]);
  const panelMinimums = useMemo(() => new Map(panels.map(panel => [panel.id, { minWidth: panel.minWidth, minHeight: panel.minHeight }])), [panels]);
  const meta = useMemo(() => JSON.stringify([panels.map(panel => [panel.id, panel.title, panel.minWidth, panel.minHeight]), minPanelSize]), [panels, minPanelSize]);
  // The effects below run on what changed (key, meta, epoch), not on every new object identity; they read the rest from here.
  const live = useRef({ layout, interactive, onLayoutChange, canonicalDisplay, panels, minPanelSize });
  useLayoutEffect(() => { live.current = { layout, interactive, onLayoutChange, canonicalDisplay, panels, minPanelSize }; });
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

  const onReady = useCallback((event: DockviewReadyEvent) => { setApi(event.api); }, []);

  // Report what the user did to the engine (drag, sash, tab drop, tab activation) as a new tree. Sizes are only news while a sash is being
  // dragged: the engine's own px rounding, gaps and minimum sizes would otherwise differ from `layout` by a fraction on every load.
  const check = useCallback((target: DockviewApi) => {
    if (applying.current) return;
    scheduleMeasure();
    const current = live.current;
    if (!current.interactive) return;
    const shown = canonicalDockTree(current.layout);
    const read = readEngine(target, shown);
    const structural = !sameDockTree(read.tree, shown, { sizes: false });
    const resized = !structural && dragging.current && read.measured && !sameDockTree(read.tree, shown, { sizes: true, tolerance: 0.05 });
    if (!structural && !resized) return;
    // Only a sash drag brings the engine's sizes along; any other change keeps the stored shares (the engine's px are rounded and clamped).
    const next = resized ? read.tree : keepStoredSizes(read.tree, shown);
    const nextKey = JSON.stringify(next);
    // The engine fires several events for one change (active, move, layout) before the parent's commit; the same tree is reported once.
    if (nextKey === emitted.current) return;
    emitted.current = nextKey;
    pending.current = true;
    current.onLayoutChange(next);
    // A parent that ignores the change leaves the engine ahead of `layout`; the epoch makes the reconcile below run and win.
    setEpoch(value => value + 1);
  }, [scheduleMeasure]);
  useEffect(() => {
    if (!api) return;
    const subscriptions = [api.onDidLayoutChange(() => { check(api); }), api.onDidActivePanelChange(() => { check(api); }), api.onDidMovePanel(() => { check(api); })];
    const container = containerRef.current;
    const down = (event: Event) => { if (event.target instanceof Element && event.target.closest('.dv-sash')) dragging.current = true; };
    const up = () => { if (dragging.current) { dragging.current = false; check(api); } };
    container?.addEventListener('pointerdown', down, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      subscriptions.forEach(subscription => { subscription.dispose(); });
      container?.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, [api, check, containerRef]);

  /** Puts the live engine on `live.current.canonicalDisplay` (shares at the engine's current size) and brings focus back to the tab it had. */
  const applyLayout = useCallback((target: DockviewApi, appliedKey: string, appliedMeta: string) => {
    const { canonicalDisplay: wanted, panels: wantedPanels, minPanelSize: minimum } = live.current;
    const focusedBefore = containerRef.current?.contains(document.activeElement) ? document.activeElement : null;
    const focusedTabId = focusedBefore instanceof HTMLElement ? focusedBefore.closest<HTMLElement>('[role="tab"]')?.dataset.tabPanelId : undefined;
    applying.current = true;
    try {
      target.fromJSON(toEngineLayout(wanted, wantedPanels, minimum, { width: target.width, height: target.height }) as unknown as SerializedLayout, { reuseExistingPanels: true });
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
  }, [containerRef, scheduleMeasure]);

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

  // Maximize is the engine's group maximize and is never stored, so it is re-asserted after every reconcile. The engine hides the other groups
  // with the px size they had, and gives that size back on restore whatever the container became meanwhile: a resize in between leaves the
  // shares skewed (and below the minimum), so a restore after a resize puts the stored shares back at the current size.
  const maximizedAt = useRef<{ width: number; height: number } | null>(null);
  useEffect(() => {
    if (!api) return;
    const target = maximizedPanelId ? api.getPanel(maximizedPanelId) : undefined;
    if (target) {
      if (!target.api.isMaximized()) { maximizedAt.current ??= { width: api.width, height: api.height }; target.api.maximize(); }
    } else if (api.hasMaximizedGroup()) {
      const at = maximizedAt.current;
      maximizedAt.current = null;
      api.exitMaximizedGroup();
      if (at && (at.width !== api.width || at.height !== api.height) && applied.current) applyLayout(api, applied.current.key, applied.current.meta);
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
  const onWillDrop = useCallback((event: DockviewWillDropEvent) => {
    const data = event.getData();
    if (!data || data.viewId !== event.api.id) event.preventDefault();
  }, []);

  const context = useMemo<Context>(() => {
    const focusGroup = focusedPanel ? groupOf(canonicalDisplay, focusedPanel)?.panels ?? [] : [];
    const active = new Set<string>();
    const collect = (node: DockNode) => { if (node.type === 'group') active.add(node.active); else node.children.forEach(collect); };
    collect(canonicalDisplay);
    return { instanceId, panels: panelMap, visible, active, focused: new Set(focusGroup), display: canonicalDisplay, renderTab, renderGroupActions, tabA11y, reconciles, onActivate };
  }, [instanceId, panelMap, visible, focusedPanel, canonicalDisplay, renderTab, renderGroupActions, tabA11y, reconciles, onActivate]);

  // Separator keys change the layout without the engine having moved: the parent's answer is applied to the engine (or reverted if it ignores it).
  const separate = (next: DockNode) => {
    emitted.current = null;
    pending.current = true;
    onLayoutChange(next);
    setEpoch(value => value + 1);
  };

  return <EngineContext.Provider value={context}>
    <div className="h-full w-full">
      <DockviewReact components={COMPONENTS} tabComponents={TAB_COMPONENTS} defaultTabComponent={DockTab} rightHeaderActionsComponent={GroupActions}
        onReady={onReady} onWillDrop={onWillDrop} theme={THEME} defaultRenderer="always" singleTabMode="fullwidth"
        disableFloatingGroups disableDnd={!interactive} announcements={false} />
    </div>
    {interactive && !maximizedPanelId && <DockSeparators layout={layout} rects={rects} minPanelSize={minPanelSize} panelMinimums={panelMinimums} instanceId={instanceId} label={separatorLabel} onChange={separate} />}
  </EngineContext.Provider>;
}

