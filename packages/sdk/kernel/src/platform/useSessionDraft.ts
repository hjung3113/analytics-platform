import { useCallback, useContext, useLayoutEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { AppContext } from './contexts';
import { useHostPlatform } from './hooks';

/**
 * Opt-in unsaved input, scoped to the menu, sorted route params, pane and caller's key. Memory only; never store server results here.
 * Survives only a same-user session-generation remount; ordinary unmount, discard and user changes clear it.
 * Pass `ready: false` until the screen's item access re-fetch under the NEW session succeeds; until then returns `initial`.
 * The shell rechecks menu permission before mounting. The menu owns item permission/readiness, dirty guards and calling discard after save.
 * `initial` is captured on activation; equality defaults to Object.is (provide isEqual for structured form input).
 */
export function useSessionDraft<T>(key: string, initial: T, options?: { ready?: boolean; isEqual?: (value: T, initial: T) => boolean }): [T, Dispatch<SetStateAction<T>>, { restored: boolean; discard: () => void }] {
  const app = useContext(AppContext);
  const { route, paneId } = useHostPlatform();
  if (!app) throw new Error('useSessionDraft outside PlatformProvider');
  const store = app.internal.sessionDrafts;
  const owner = app.pub.user.id;
  const scopedKey = JSON.stringify([route?.menu.id, Object.entries(route?.params ?? {}).sort(([a], [b]) => a.localeCompare(b)), paneId, key]);
  const ready = options?.ready ?? true;
  const read = () => {
    const entry = store.owner === owner ? store.entries.get(scopedKey) : undefined;
    const restored = ready && entry?.owner === owner;
    return { store, key: scopedKey, ready, initial, value: restored ? entry.value as T : initial, restored };
  };
  const [state, setState] = useState(read);
  if (state.store !== store || state.key !== scopedKey || state.ready !== ready) setState(read());
  const current = state.store === store && state.key === scopedKey && state.ready === ready ? state : read();
  const equal = options?.isEqual ?? Object.is;
  useLayoutEffect(() => {
    if (ready && store.owner === owner) {
      if (equal(current.value, current.initial)) store.entries.delete(scopedKey);
      else store.entries.set(scopedKey, { owner, value: current.value });
    }
  }, [store, scopedKey, ready, owner, current.value, current.initial, equal]);
  useLayoutEffect(() => {
    store.mounts.set(scopedKey, (store.mounts.get(scopedKey) ?? 0) + 1);
    return () => {
      const next = (store.mounts.get(scopedKey) ?? 0) - 1;
      if (next > 0) store.mounts.set(scopedKey, next);
      else {
        store.mounts.delete(scopedKey);
        // Defer ordinary-unmount deletion past synchronous StrictMode cleanup/setup replay so held drafts on non-ready mounts survive.
        queueMicrotask(() => {
          if (!store.mounts.has(scopedKey)) store.entries.delete(scopedKey);
        });
      }
    };
  }, [store, scopedKey]);
  const setValue = useCallback<Dispatch<SetStateAction<T>>>(next => {
    if (!ready) return;
    setState(held => ({ ...held, value: typeof next === 'function' ? (next as (value: T) => T)(held.value) : next }));
  }, [ready]);
  const discard = useCallback(() => {
    store.entries.delete(scopedKey);
    setState(held => ({ ...held, value: held.initial, restored: false }));
  }, [store, scopedKey]);
  return [ready ? current.value : initial, setValue, { restored: ready && current.restored, discard }];
}
