import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { usePlatform, type AnalysisSelectionChip } from '@ap/kernel';
import { useHostPlatform, useHostPlatformOptional } from '@ap/kernel/host';
import type { DirectNextAnalysisAction, NextAnalysisPointDrill } from './NextAnalysisItems';
import type { AnalysisPanelDestinations } from '../workspace/PanelAdd';
import { DrillBasisMemory, useDrillBasisMemory } from './ChartDrillBasisMenu';
import { WorkspacePanelVisibleContext } from '../workspace/panelContext';
import { paneRouteKey } from '../filters/paneRouteKey';

function createPublications<T>() {
  const entries = new Map<string, Map<symbol, T>>();
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    readUnique(key: string) {
      const publishers = entries.get(key);
      return publishers?.size === 1 ? publishers.values().next().value : undefined;
    },
    publish(keys: readonly string[], value: T) {
      const publisher = Symbol();
      for (const key of keys) {
        const publishers = entries.get(key) ?? new Map<symbol, T>();
        publishers.set(publisher, value);
        entries.set(key, publishers);
      }
      notify();
      return () => {
        for (const key of keys) {
          const publishers = entries.get(key);
          publishers?.delete(publisher);
          if (publishers?.size === 0) entries.delete(key);
        }
        notify();
      };
    },
  };
}

type PublishedAnalysis = {
  actions: readonly DirectNextAnalysisAction[];
  pointDrill?: NextAnalysisPointDrill;
};

const createSelectionDrags = () => createPublications<StartSelectionDrag>();

function createBridge() {
  return {
    actions: createPublications<PublishedAnalysis>(),
    workspaces: createPublications<AnalysisPanelDestinations | null>(),
    selectionDrags: createSelectionDrags(),
  };
}

const BridgeContext = createContext<ReturnType<typeof createBridge> | null>(null);
const PaneSelectionDrags = createContext<ReturnType<typeof createSelectionDrags> | null>(null);
const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;
type Output = { panelId: string; key: string };
const outputKey = ({ panelId, key }: Output) => JSON.stringify([panelId, key]);
type StartSelectionDrag = (event: PointerEvent, chip: AnalysisSelectionChip, trigger: HTMLButtonElement) => void;
// Panel IDs are nonempty. The empty key also allows an inbound chip to use a sole workspace.
const ANY_WORKSPACE = '';

export function NextAnalysisBridge({ children }: { children: ReactNode }) {
  const platform = usePlatform();
  const { adapter, session, revision, global: { scopeId }, route, pathname } = platform;
  const memory = useDrillBasisMemory(platform);
  const menu = route?.menu;
  // A publication belongs to the current screen, session and Scope.
  const bridge = useMemo(createBridge, [adapter, session, revision, scopeId, menu, pathname]);
  return <BridgeContext value={bridge}><DrillBasisMemory value={memory}>{children}</DrillBasisMemory></BridgeContext>;
}

export function usePublishNextAnalysis(output: Output | null | undefined, actions: readonly DirectNextAnalysisAction[], pointDrill?: NextAnalysisPointDrill) {
  const bridge = useContext(BridgeContext);
  const visible = useContext(WorkspacePanelVisibleContext);
  const key = visible && output ? outputKey(output) : null;
  useLayoutEffect(() => {
    if (key !== null) return bridge?.actions.publish([key], { actions, pointDrill });
  }, [bridge, key, actions, pointDrill]);
}

export function usePublishAnalysisWorkspace(panelIds: readonly string[], addition: AnalysisPanelDestinations | null) {
  const bridge = useContext(BridgeContext);
  const visible = useContext(WorkspacePanelVisibleContext);
  useLayoutEffect(() => {
    if (visible) return bridge?.workspaces.publish(panelIds, addition);
  }, [bridge, panelIds, addition, visible]);
}

export function usePublishedNextAnalysis(output: Output) {
  const bridge = useContext(BridgeContext);
  const key = outputKey(output);
  const publication = useSyncExternalStore(bridge?.actions.subscribe ?? emptySubscribe, () => bridge?.actions.readUnique(key), emptySnapshot);
  const workspace = useSyncExternalStore(bridge?.workspaces.subscribe ?? emptySubscribe, () => bridge?.workspaces.readUnique(output.panelId), emptySnapshot);
  return { publication, workspace };
}

/** A board renders its query bar and its selected pane's content in separate providers. */
export function PaneSelectionDragProvider({ children }: { children: ReactNode }) {
  const { adapter, session, revision } = useHostPlatform();
  const store = useMemo(createSelectionDrags, [adapter, session, revision]);
  return <PaneSelectionDrags.Provider value={store}>{children}</PaneSelectionDrags.Provider>;
}

function useSelectionDragStore() {
  const local = useContext(BridgeContext)?.selectionDrags;
  const shared = useContext(PaneSelectionDrags);
  const platform = useHostPlatformOptional();
  if (shared && platform?.paneId) return {
    store: shared,
    scope: JSON.stringify([paneRouteKey(platform.paneId, platform.route), platform.global.scopeId]),
  };
  return { store: local, scope: '' };
}

const dragKey = (scope: string, panelId: string) => JSON.stringify([scope, panelId]);

export function usePublishSelectionDrag(panelIds: readonly string[], start: StartSelectionDrag, reset: () => void) {
  const { store, scope } = useSelectionDragStore();
  const visible = useContext(WorkspacePanelVisibleContext);
  useLayoutEffect(() => {
    if (visible) return store?.publish([ANY_WORKSPACE, ...new Set(panelIds)].map(id => dragKey(scope, id)), start);
  }, [store, scope, visible, panelIds, start]);
  useLayoutEffect(() => reset, [store, scope, visible, reset]);
}

export function usePublishedSelectionDrag(panelId: string | undefined) {
  const { store, scope } = useSelectionDragStore();
  return useSyncExternalStore(store?.subscribe ?? emptySubscribe,
    () => (panelId ? store?.readUnique(dragKey(scope, panelId)) : undefined) ?? store?.readUnique(dragKey(scope, ANY_WORKSPACE)), emptySnapshot);
}
