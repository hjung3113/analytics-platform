import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';

type Target = 'toolbar' | 'description' | 'maximize';
type Targets = Partial<Record<Target, HTMLElement>>;
export type DockChartLayoutActions = { content: ReactNode; takeCloseFocus: () => (() => void) | null };
type Pane = { charts: ReadonlyMap<string, boolean>; targets: Targets; layoutActions?: DockChartLayoutActions | undefined; stripWidth?: number | undefined };
const EMPTY_PANE: Pane = { charts: new Map(), targets: {} };

function singleFrameId(pane: Pane | undefined) {
  if (pane?.charts.size !== 1) return undefined;
  for (const [id, acceptsHead] of pane.charts) {
    if (acceptsHead) return id;
  }
}

const DockChartContext = createContext<{
  panes: ReadonlyMap<string, Pane>;
  registerChart: (panel: string, chart: string, acceptsHead: boolean | null) => void;
  setTarget: (panel: string, slot: Target, node: HTMLElement | null) => void;
  setStripWidth: (panel: string, width: number | undefined) => void;
  setLayoutActions: (panel: string, actions: DockChartLayoutActions | undefined) => void;
} | null>(null);
export const DockChartPaneEngaged = createContext(false);
export const DockChartToolbarWidth = createContext<number | null | undefined>(undefined);
export const DockChartPaneId = createContext<string | null>(null);
export const DockChartMaximizeTarget = createContext<HTMLElement | undefined>(undefined);
export const DockChartLayoutActionsSlot = createContext<((actions: DockChartLayoutActions | undefined) => void) | undefined>(undefined);
export const DockChartCloseMore = createContext<(() => void) | undefined>(undefined);

export function DockChartHeadProvider({ children }: { children: ReactNode }) {
  const [panes, setPanes] = useState<ReadonlyMap<string, Pane>>(() => new Map());
  const update = useCallback((panel: string, change: (pane: Pane) => Pane) => {
    setPanes(previous => {
      const pane = previous.get(panel) ?? EMPTY_PANE;
      const next = change(pane);
      if (next === pane) return previous;
      const result = new Map(previous);
      if (!next.charts.size && !next.layoutActions && next.stripWidth === undefined && !Object.values(next.targets).some(Boolean)) result.delete(panel);
      else result.set(panel, next);
      return result;
    });
  }, []);
  const registerChart = useCallback((panel: string, chart: string, acceptsHead: boolean | null) => {
    update(panel, pane => {
      if ((pane.charts.get(chart) ?? null) === acceptsHead) return pane;
      const charts = new Map(pane.charts);
      if (acceptsHead === null) charts.delete(chart);
      else charts.set(chart, acceptsHead);
      return { ...pane, charts };
    });
  }, [update]);
  const setTarget = useCallback((panel: string, slot: Target, node: HTMLElement | null) => {
    update(panel, pane => {
      if (pane.targets[slot] === (node ?? undefined)) return pane;
      return { ...pane, targets: { ...pane.targets, [slot]: node ?? undefined } };
    });
  }, [update]);
  const setLayoutActions = useCallback((panel: string, actions: DockChartLayoutActions | undefined) => {
    update(panel, pane => pane.layoutActions === actions ? pane : { ...pane, layoutActions: actions });
  }, [update]);
  const setStripWidth = useCallback((panel: string, width: number | undefined) => {
    update(panel, pane => pane.stripWidth === width ? pane : { ...pane, stripWidth: width });
  }, [update]);
  const value = useMemo(() => ({ panes, registerChart, setTarget, setLayoutActions, setStripWidth }), [panes, registerChart, setTarget, setLayoutActions, setStripWidth]);
  return <DockChartContext.Provider value={value}>{children}</DockChartContext.Provider>;
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
  const pane = panel ? dock?.panes.get(panel) : undefined;
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
  const pane = panel ? dock?.panes.get(panel) : undefined;
  const publishStripWidth = useCallback((width: number | undefined) => {
    if (panel) setStripWidth?.(panel, width);
  }, [panel, setStripWidth]);
  return { ref, publishStripWidth, singleChart: singleFrameId(pane) !== undefined, maximize: pane?.targets.maximize, registerLayoutActions };
}
