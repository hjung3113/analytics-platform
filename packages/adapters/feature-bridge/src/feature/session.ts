import { useLayoutEffect, useState, useSyncExternalStore } from 'react';
import { usePlatform } from '@ap/kernel';
import type { PlatformAdapter } from '@ap/contracts';
import { configureApiClient, createFeatureQueryClient } from '@ap/feature-screens/global-screens/core';
import { featureApi } from '../feature-api';

/** One feature QueryClient for the whole app (ADR-0071 decision 5); cleared whenever the session generation changes. */
export const featureQueryClient = createFeatureQueryClient();

type Generation = { adapter: PlatformAdapter; revision: number; userId: string | null };
type Ready = Generation & { epoch: number };

/** The generation the cache was last cleared for. Written only inside the layout effect below, never during render. */
let lastReady: Ready | null = null;

/** Epoch whose session was lost (any feature 401). It stays retired, across page remounts too, until a new generation starts a new epoch. */
let retiredEpoch: number | null = null;
const retiredListeners = new Set<() => void>();
const subscribeRetired = (listener: () => void): (() => void) => {
  retiredListeners.add(listener);
  return () => { retiredListeners.delete(listener); };
};
const readRetired = (): number | null => retiredEpoch;

/** The unauthorized handler of the generation configured last (`null` until a feature session mounted). Written only inside the layout effect. */
type Active = { epoch: number; fire: () => void };
let active: Active | null = null;

/** The host session a read started under: `[adapter, revision, userId]`, the same tuple `useFeatureSession` and the app's space-systems store key on. */
export type SessionIdentity = readonly unknown[];
const sameIdentity = (a: SessionIdentity, b: SessionIdentity): boolean => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

/**
 * For reads outside React Query's configured client (the space-links transport): called when a request STARTS, with the host session identity it runs under;
 * the returned function is called by the transport only for a 401 on a request that was NOT aborted. The app aborts a request the moment the host session
 * changes (the store starts in a layout effect), so a non-aborted request is a current-host request. With an identity: if it is the generation the feature
 * session is configured for, the shared unauthorized handling runs (retire subtrees, clear the cache, then the host redirect); otherwise there is no feature
 * generation to retire (no feature hook mounted for this session) and only the host's own `onSessionLost` runs. Without an identity (a read made under a
 * mounted feature session) it binds to the epoch current at start.
 */
export function unauthorizedReporter(api: { onSessionLost: () => void }, identity?: SessionIdentity): () => void {
  const boundEpoch = active?.epoch ?? null;
  return () => {
    if (identity !== undefined) {
      if (active !== null && lastReady !== null && sameIdentity(identity, [lastReady.adapter, lastReady.revision, lastReady.userId])) active.fire();
      else api.onSessionLost();
      return;
    }
    // Only the session generation (epoch) decides: a hook mount inside the same generation replaces `active` but must not mute a live request.
    if (boundEpoch !== null && active?.epoch !== boundEpoch) return;
    if (active === null) api.onSessionLost(); else active.fire();
  };
}

/** Test-only: forget the module's session state so cases do not share one epoch. */
export function resetFeatureSessionForTests(): void {
  lastReady = null; retiredEpoch = null; active = null;
  for (const listener of [...retiredListeners]) listener();
}

const sameGeneration = (a: Generation, b: Generation): boolean => a.adapter === b.adapter && a.revision === b.revision && a.userId === b.userId;

export type FeatureSession = { status: 'no-api' } | { status: 'pending' } | { status: 'retired' } | { status: 'ready'; epoch: number };

/**
 * The one gate for everything that reads feature: the page, the bell popover and the unread badges (ADR-0071 decision 5). `ready` only for
 * the current (adapter, revision, user) generation, after the cache was cleared for it; `retired` after any feature 401, for every
 * mounted instance at once. Without a feature API (mock preview) it is `no-api` and nothing is requested.
 */
export function useFeatureSession(): FeatureSession {
  const { adapter, revision, user } = usePlatform();
  const api = featureApi();
  const userId = user?.id ?? null;
  const [ready, setReady] = useState<Ready | null>(null);
  const retired = useSyncExternalStore(subscribeRetired, readRetired);

  useLayoutEffect(() => {
    if (api === null) return;
    const current: Generation = { adapter, revision, userId };
    if (lastReady === null || !sameGeneration(lastReady, current)) {
      featureQueryClient.clear();
      lastReady = { ...current, epoch: (lastReady?.epoch ?? 0) + 1 };
    }
    const epoch = lastReady.epoch;
    const fire = () => {
      // Retire every subtree and the cache first: the host's login redirect can take a while, and the previous session's rows must not stay on screen.
      retiredEpoch = epoch;
      for (const listener of [...retiredListeners]) listener();
      featureQueryClient.clear();
      api.onSessionLost();
    };
    active = { epoch, fire };
    configureApiClient({ basePath: api.basePath, onUnauthorized: fire });
    setReady(lastReady);
  }, [api, adapter, revision, userId]);

  if (api === null) return { status: 'no-api' };
  if (ready === null || !sameGeneration(ready, { adapter, revision, userId })) return { status: 'pending' };
  if (ready.epoch === retired) return { status: 'retired' };
  return { status: 'ready', epoch: ready.epoch };
}
