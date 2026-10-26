import { lazy, type ComponentType } from 'react';

/**
 * A code-split component shared by every mount (#915). Internal: `EChart` and `DockLayout` use it; `index.ts` does not export it.
 *
 * - `current()` is what a new mount renders: the loaded component itself once the chunk is in, so the mount draws in its first commit
 *   with no Suspense fallback (and no wait for React's fallback throttle), else one lazy component shared by the mounts that wait.
 * - `retry()` after a failed load: the next import runs again and the retrying mount takes the new lazy component. Mounts that keep the
 *   failed one keep their own error state and retry action.
 *
 * A mount keeps the component it started with (in state), so a load that finishes later does not swap its element type and remount it.
 */
export function lazyChunk<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let loaded: ComponentType<P> | null = null;
  let pending: Promise<{ default: ComponentType<P> }> | null = null;
  const start = () => pending ??= load().then(
    module => { loaded = module.default; return module; },
    (error: unknown) => { pending = null; throw error; },
  );
  let shared = lazy(start);
  return {
    current: (): ComponentType<P> => loaded ?? shared,
    // Another mount's retry may have loaded it meanwhile.
    retry: (): ComponentType<P> => loaded ?? (shared = lazy(start)),
  };
}
