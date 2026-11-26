import { createContext, useCallback, useContext, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

type Target = 'toolbar' | 'description' | 'maximize';
type Targets = Partial<Record<Target, HTMLElement>>;
export type DockChartCloseFocus = (trigger: HTMLButtonElement | null) => void;
export type DockChartLayoutActions = {
  content: ReactNode;
  takeCloseFocus: () => DockChartCloseFocus | null;
  /** True once if the pane's own ⋯ trigger or its menu held focus when this merged ⋯ replaced it; the merged ⋯ then takes focus (#3095). */
  claimFocus?: () => boolean;
};
type Pane = { charts: ReadonlyMap<string, boolean>; targets: Targets; layoutActions?: DockChartLayoutActions | undefined; stripWidth?: number | undefined };
const EMPTY_PANE: Pane = { charts: new Map(), targets: {} };

function singleFrameId(pane: Pane | undefined) {
  if (pane?.charts.size !== 1) return undefined;
  for (const [id, acceptsHead] of pane.charts) {
    if (acceptsHead) return id;
  }
}

const DockChartContext = createContext<ReturnType<typeof createDockChartStore> | null>(null);
export const DockChartPaneEngaged = createContext(false);
export const DockChartToolbarWidth = createContext<number | null | undefined>(undefined);
export const DockChartPaneId = createContext<string | null>(null);
export const DockChartMaximizeTarget = createContext<HTMLElement | undefined>(undefined);
export const DockChartLayoutActionsSlot = createContext<((actions: DockChartLayoutActions | undefined) => void) | undefined>(undefined);
export const DockChartCloseMore = createContext<(() => void) | undefined>(undefined);

function createDockChartStore() {
  const panes = new Map<string, Pane>();
  const listeners = new Set<() => void>();
  const update = (panel: string, change: (pane: Pane) => Pane) => {
    const pane = panes.get(panel) ?? EMPTY_PANE;
    const next = change(pane);
    if (next === pane) return;
    if (!next.charts.size && !next.layoutActions && next.stripWidth === undefined && !Object.values(next.targets).some(Boolean)) panes.delete(panel);
    else panes.set(panel, next);
    listeners.forEach(listener => listener());
  };
  return {
    read: (panel: string) => panes.get(panel),
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    registerChart: (panel: string, chart: string, acceptsHead: boolean | null) => update(panel, pane => {
      if ((pane.charts.get(chart) ?? null) === acceptsHead) return pane;
      const charts = new Map(pane.charts);
      if (acceptsHead === null) charts.delete(chart);
      else charts.set(chart, acceptsHead);
      return { ...pane, charts };
    }),
    setTarget: (panel: string, slot: Target, node: HTMLElement | null) => update(panel, pane => {
      if (pane.targets[slot] === (node ?? undefined)) return pane;
      return { ...pane, targets: { ...pane.targets, [slot]: node ?? undefined } };
    }),
    setLayoutActions: (panel: string, actions: DockChartLayoutActions | undefined) => update(panel, pane =>
      pane.layoutActions === actions ? pane : { ...pane, layoutActions: actions }),
    setStripWidth: (panel: string, width: number | undefined) => update(panel, pane =>
      pane.stripWidth === width ? pane : { ...pane, stripWidth: width }),
  };
}

const noSubscribe = () => () => {};
function useDockPane(dock: ReturnType<typeof createDockChartStore> | null, panel: string | null | undefined) {
  return useSyncExternalStore(dock?.subscribe ?? noSubscribe, () => panel ? dock?.read(panel) : undefined, () => undefined);
}

export function DockChartHeadProvider({ children }: { children: ReactNode }) {
  const [store] = useState(createDockChartStore);
  return <DockChartContext.Provider value={store}>{children}</DockChartContext.Provider>;
}

/** Each mounted chart counts once even when two frames use the same consumer chartId. */
export function useDockChartHead(chart: string, { mounted = true, acceptsHead = true } = {}) {
  const panel = useContext(DockChartPaneId);
  const dock = useContext(DockChartContext);
  const register = dock?.registerChart;
  const setTarget = dock?.setTarget;
  useLayoutEffect(() => {
    if (!panel || !register || !mounted) return;
    register(panel, chart, acceptsHead);
    return () => { register(panel, chart, null); };
  }, [panel, chart, mounted, acceptsHead, register]);
  const setMaximize = useCallback((node: HTMLDivElement | null) => {
    if (panel) setTarget?.(panel, 'maximize', node);
  }, [panel, setTarget]);
  const pane = useDockPane(dock, panel);
  const single = singleFrameId(pane) === chart;
  return { targets: single ? pane?.targets : undefined, stripWidth: single ? pane?.stripWidth : undefined, layoutActions: single ? pane?.layoutActions : undefined, setMaximize };
}

export function useDockChartSlot(panel: string | undefined, slot: 'toolbar' | 'description') {
  const dock = useContext(DockChartContext);
  const setTarget = dock?.setTarget;
  const setLayoutActions = dock?.setLayoutActions;
  const setStripWidth = dock?.setStripWidth;
  const ref = useCallback((node: HTMLDivElement | null) => {
    if (panel) setTarget?.(panel, slot, node);
  }, [panel, slot, setTarget]);
  const registerLayoutActions = useCallback((actions: DockChartLayoutActions | undefined) => {
    if (panel) setLayoutActions?.(panel, actions);
  }, [panel, setLayoutActions]);
  const pane = useDockPane(dock, panel);
  const publishStripWidth = useCallback((width: number | undefined) => {
    if (panel) setStripWidth?.(panel, width);
  }, [panel, setStripWidth]);
  return { ref, publishStripWidth, singleChart: singleFrameId(pane) !== undefined, maximize: pane?.targets.maximize, registerLayoutActions };
}

/**
 * A host's header-right content drawn outside the dock's slot (a portal from the panel, as the board pane head is): whether this panel's single
 * Chart Frame has joined the group head, the Frame's maximize slot, and where the host registers its menu content for the Frame's one `⋯`.
 * Read inside the panel (`DockLayout` `mergeChartHead`). Only primitives and stable nodes are read, so registering menu content does not re-render
 * the caller.
 */
export function useDockChartMerge() {
  const panel = useContext(DockChartPaneId);
  const dock = useContext(DockChartContext);
  const subscribe = dock?.subscribe ?? noSubscribe;
  const read = () => (panel ? dock?.read(panel) : undefined);
  const merged = useSyncExternalStore(subscribe, () => { const pane = read(); return singleFrameId(pane) !== undefined && !!pane?.targets.toolbar; }, () => false);
  const maximize = useSyncExternalStore(subscribe, () => read()?.targets.maximize, () => undefined);
  const setLayoutActions = dock?.setLayoutActions;
  const registerLayoutActions = useCallback((actions: DockChartLayoutActions | undefined) => {
    if (panel) setLayoutActions?.(panel, actions);
  }, [panel, setLayoutActions]);
  return { merged, maximize: merged ? maximize : undefined, registerLayoutActions };
}
