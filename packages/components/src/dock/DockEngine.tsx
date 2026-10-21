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
import { fromEngineLayout, sameDockTree, toEngineLayout, type EngineLayout } from './engineModel';
import { canonicalDockTree, type DockNode } from './schema';
import './dock.css';

export type DockEngineProps = Pick<DockLayoutProps, 'panels' | 'layout' | 'onLayoutChange' | 'renderTab' | 'renderGroupActions' | 'separatorLabel'> & {
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
  return <div id={`${engine.instanceId}-panel-${id}`} data-dock-panel={id} data-dock-visible={visible} inert={!visible} className="h-full min-h-0 min-w-0 overflow-auto"
    onFocus={event => {
      // Focus moving into the panel from outside it is the user choosing the panel.
      if (!(event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget))) engine.onActivate(id);
    }}>
    <TransientOverlayScope active={visible}>{panel?.render() ?? null}</TransientOverlayScope>
  </div>;
}

/** Our tab content. There is no close button: closing is a platform command, never the engine's (ADR-0067 decision 7). */
function DockTab({ api }: IDockviewPanelHeaderProps) {
  const engine = useEngine();
  const id = api.id;
  return <span data-dock-tab={id} className="flex min-w-0 items-center truncate">
    {engine.renderTab?.(id, { active: engine.active.has(id), groupFocused: engine.focused.has(id) }) ?? engine.panels.get(id)?.title ?? id}
  </span>;
}

function GroupActions({ activePanel, panels }: IDockviewHeaderActionsProps) {
  const engine = useEngine();
  if (!engine.renderGroupActions) return null;
  const anchor = activePanel?.id ?? panels[0]?.id;
  const group = anchor ? groupOf(engine.display, anchor) : undefined;
  return group ? <div className="flex h-full items-center pr-1">{engine.renderGroupActions(group)}</div> : null;
}

const COMPONENTS = { panel: PanelHost };
const TAB_COMPONENTS = { tab: DockTab };
/** Module-level so the option object keeps its identity across renders (a new one re-applies the theme). */
const THEME = { name: 'ap', className: 'ap-dock', gap: 6 };
type SerializedLayout = Parameters<DockviewApi['fromJSON']>[0];

/** The engine's sizes are px; when it has none (unmeasured container) the shape is taken from the layout instead. */
function inheritSizes(read: DockNode, from: DockNode): DockNode {
  if (read.type !== 'branch' || from.type !== 'branch' || read.dir !== from.dir || read.children.length !== from.children.length) return read;
  return { ...read, sizes: [...from.sizes], children: read.children.map((child, index) => inheritSizes(child, from.children[index]!)) };
}

const sameRects = (a: Record<string, DockRect>, b: Record<string, DockRect>) => {
  const keys = Object.keys(b);
  return keys.length === Object.keys(a).length && keys.every(key => {
    const x = a[key]; const y = b[key]!;
    return x !== undefined && x.left === y.left && x.top === y.top && x.width === y.width && x.height === y.height;
  });
};

function readEngine(api: DockviewApi) {
  // `toJSON` leaves and re-enters maximize, so it is not read while a group is maximized.
  return api.hasMaximizedGroup() ? null : fromEngineLayout(api.toJSON() as unknown as EngineLayout);
}

export default function DockEngine({
  panels, layout, display, interactive, maximizedPanelId, visible, minPanelSize, onLayoutChange, onActivate, renderTab, renderGroupActions, separatorLabel,
  containerRef, instanceId,
}: DockEngineProps) {
  const [api, setApi] = useState<DockviewApi | null>(null);
  const [epoch, setEpoch] = useState(0);
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
  const meta = useMemo(() => JSON.stringify([panels.map(panel => [panel.id, panel.title]), minPanelSize]), [panels, minPanelSize]);
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
    const read = readEngine(target);
    if (!read) return;
    const shown = canonicalDockTree(current.layout);
    const structural = !sameDockTree(read.tree, shown, { sizes: false });
    const resized = !structural && dragging.current && read.measured && !sameDockTree(read.tree, shown, { sizes: true, tolerance: 0.05 });
    if (!structural && !resized) return;
    const next = read.measured ? read.tree : inheritSizes(read.tree, shown);
    emitted.current = JSON.stringify(next);
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

  // Bring the engine to `display` without remounting any panel: `fromJSON(…, { reuseExistingPanels: true })` re-parents the live panels
  // (dockview-core main.esm.mjs:17640). Never `clear()` and never `close()` (those dispose panels, D9).
  useEffect(() => {
    if (!api) return;
    const { canonicalDisplay: wanted, panels: wantedPanels, minPanelSize: minimum } = live.current;
    const engineIds = api.panels.map(panel => panel.id).sort().join('\n');
    const wantedIds = wantedPanels.map(panel => panel.id).sort().join('\n');
    const answered = pending.current;
    pending.current = false;
    let rebuild: boolean;
    if (!applied.current || applied.current.meta !== meta || engineIds !== wantedIds) rebuild = true;
    else if (applied.current.key !== key) rebuild = key !== emitted.current;
    else if (answered) rebuild = true;
    else {
      const read = readEngine(api);
      rebuild = read !== null && !sameDockTree(read.tree, wanted, { sizes: false });
    }
    if (!rebuild) { applied.current = { key, meta }; return; }
    const focusedBefore = containerRef.current?.contains(document.activeElement) ? document.activeElement : null;
    applying.current = true;
    try {
      api.fromJSON(toEngineLayout(wanted, wantedPanels, minimum, { width: api.width, height: api.height }) as unknown as SerializedLayout, { reuseExistingPanels: true });
    } finally {
      applying.current = false;
    }
    applied.current = { key, meta };
    emitted.current = null;
    if (focusedBefore instanceof HTMLElement && !focusedBefore.isConnected) containerRef.current?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus({ preventScroll: true });
    scheduleMeasure();
  }, [api, key, meta, epoch, containerRef, scheduleMeasure]);

  // Maximize is the engine's group maximize and is never stored, so it is re-asserted after every reconcile.
  useEffect(() => {
    if (!api) return;
    const target = maximizedPanelId ? api.getPanel(maximizedPanelId) : undefined;
    if (target) { if (!target.api.isMaximized()) target.api.maximize(); } else if (api.hasMaximizedGroup()) api.exitMaximizedGroup();
    scheduleMeasure();
  }, [api, maximizedPanelId, key, epoch, scheduleMeasure]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(container);
    return () => { observer.disconnect(); };
  }, [containerRef, scheduleMeasure]);

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
    return { instanceId, panels: panelMap, visible, active, focused: new Set(focusGroup), display: canonicalDisplay, renderTab, renderGroupActions, onActivate };
  }, [instanceId, panelMap, visible, focusedPanel, canonicalDisplay, renderTab, renderGroupActions, onActivate]);

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
    {interactive && !maximizedPanelId && <DockSeparators layout={layout} rects={rects} minPanelSize={minPanelSize} instanceId={instanceId} label={separatorLabel} onChange={separate} />}
  </EngineContext.Provider>;
}

