import { createContext, useContext, useLayoutEffect, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import { usePlatform } from '@ap/kernel';
import type { DirectNextAnalysisAction, NextAnalysisPointDrill } from './NextAnalysisItems';
import type { AnalysisPanelDestinations } from '../workspace/PanelAdd';
import { WorkspacePanelVisibleContext } from '../workspace/panelContext';

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

function createBridge() {
  return {
    actions: createPublications<PublishedAnalysis>(),
    workspaces: createPublications<AnalysisPanelDestinations | null>(),
  };
}

const BridgeContext = createContext<ReturnType<typeof createBridge> | null>(null);
const emptySubscribe = () => () => {};
const emptySnapshot = () => undefined;
type Output = { panelId: string; key: string };
const outputKey = ({ panelId, key }: Output) => JSON.stringify([panelId, key]);

export function NextAnalysisBridge({ children }: { children: ReactNode }) {
  const { session, revision, global: { scopeId }, route, pathname } = usePlatform();
  const menu = route?.menu;
  // A publication belongs to the current screen, session and Scope.
  const bridge = useMemo(createBridge, [session, revision, scopeId, menu, pathname]);
  return <BridgeContext.Provider value={bridge}>{children}</BridgeContext.Provider>;
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
