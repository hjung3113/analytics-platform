import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { usePlatform } from '@ap/kernel';
import type { PlatformAdapter } from '@ap/contracts';
import { configureApiClient, createFoQueryClient } from '@fops/frontend/global-screens/core';
import { foApi } from '../fo-api';

/** One FeedbackOps QueryClient for the whole app (ADR-0071 decision 5); cleared whenever the session generation changes. */
export const foQueryClient = createFoQueryClient();

type Generation = { adapter: PlatformAdapter; revision: number; userId: string | null };
type Ready = Generation & { epoch: number };

/** The generation the cache was last cleared for. Written only inside the layout effect below, never during render. */
let lastReady: Ready | null = null;

/** Epoch whose session was lost (any FeedbackOps 401). It stays retired, across page remounts too, until a new generation starts a new epoch. */
let retiredEpoch: number | null = null;
const retiredListeners = new Set<() => void>();
const subscribeRetired = (listener: () => void): (() => void) => {
  retiredListeners.add(listener);
  return () => { retiredListeners.delete(listener); };
};
const readRetired = (): number | null => retiredEpoch;

const sameGeneration = (a: Generation, b: Generation): boolean => a.adapter === b.adapter && a.revision === b.revision && a.userId === b.userId;

export type FoSession = { status: 'no-api' } | { status: 'pending' } | { status: 'retired' } | { status: 'ready'; epoch: number };

/**
 * The one gate for everything that reads FeedbackOps: the page, the bell popover and the unread badges (ADR-0071 decision 5). `ready` only for
 * the current (adapter, revision, user) generation, after the cache was cleared for it; `retired` after any FeedbackOps 401, for every
 * mounted instance at once. Without a FeedbackOps API (mock preview) it is `no-api` and nothing is requested.
 */
export function useFoSession(): FoSession {
  const { adapter, revision, user } = usePlatform();
  const api = foApi();
  const userId = user?.id ?? null;
  const [ready, setReady] = useState<Ready | null>(null);
  const retired = useSyncExternalStore(subscribeRetired, readRetired);

  useLayoutEffect(() => {
    if (api === null) return;
    const current: Generation = { adapter, revision, userId };
    if (lastReady === null || !sameGeneration(lastReady, current)) {
      foQueryClient.clear();
      lastReady = { ...current, epoch: (lastReady?.epoch ?? 0) + 1 };
    }
    const epoch = lastReady.epoch;
    configureApiClient({
      basePath: api.basePath,
      onUnauthorized: () => {
        // Retire every subtree and the cache first: the host's login redirect can take a while, and the previous session's rows must not stay on screen.
        retiredEpoch = epoch;
        for (const listener of [...retiredListeners]) listener();
        foQueryClient.clear();
        api.onSessionLost();
      },
    });
    setReady(lastReady);
  }, [api, adapter, revision, userId]);

  if (api === null) return { status: 'no-api' };
  if (ready === null || !sameGeneration(ready, { adapter, revision, userId })) return { status: 'pending' };
  if (ready.epoch === retired) return { status: 'retired' };
  return { status: 'ready', epoch: ready.epoch };
}
