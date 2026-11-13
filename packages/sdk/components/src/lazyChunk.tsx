import { Component, lazy, useCallback, useState, type ComponentType, type ReactNode } from 'react';
import { isChunkLoadFailure } from '@ap/kernel/host';

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

type LazyChunk<P extends object> = ReturnType<typeof lazyChunk<P>>;

/**
 * Contains a rejected chunk load inside the consumer's box so it never unmounts the surrounding app (#48 P2). Any other error is not this
 * boundary's: it is thrown again in render so the nearest screen or panel boundary reports it (#2025).
 */
export class ChunkLoadBoundary extends Component<{ onError: (error: unknown) => void; children: ReactNode }, { failed: boolean; error: unknown }> {
  state = { failed: false, error: null as unknown };
  static getDerivedStateFromError(error: unknown) { return { failed: true, error }; }
  componentDidCatch(error: unknown) { if (isChunkLoadFailure(error)) this.props.onError(error); }
  render() {
    if (!this.state.failed) return this.props.children;
    if (!isChunkLoadFailure(this.state.error)) throw this.state.error;
    return null;
  }
}

/**
 * One mount's view of a shared chunk: the component it started with, whether its load failed, and a `retry` that takes the chunk's
 * new component. Render `<ChunkLoadBoundary key={attempt} onError={onError}>` around the `Component` and the failed state yourself.
 */
export function useLazyChunk<P extends object>(chunk: LazyChunk<P>) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [Loaded, setLoaded] = useState(chunk.current);
  const onError = useCallback(() => { setFailed(true); }, []);
  const retry = useCallback(() => {
    setLoaded(chunk.retry);
    setFailed(false);
    setAttempt(a => a + 1);
  }, [chunk]);
  return { Component: Loaded, failed, attempt, onError, retry };
}
