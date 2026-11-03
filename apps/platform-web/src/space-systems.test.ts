import { describe, expect, it, vi } from 'vitest';
import { fetchSpaceLinks } from '@ap/feature-bridge';
import { createSpaceSystemsStore, linkedSystemOf, platformSystemOf, type SpaceSystems } from './space-systems';

const A = '4f1b2c3d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const B = '7a8b9c0d-1e2f-4a3b-9c4d-5e6f7a8b9c0d';
const PLATFORM = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a';
const data = (spaceId: string, managedSystemId: string, declared = true, platform: string | null = PLATFORM): SpaceSystems => ({ links: [{ spaceId, managedSystemId, declared }], platformManagedSystemId: platform });

/** A source whose answers the test settles by hand, in any order. */
function deferred() {
  const calls: { resolve: (value: SpaceSystems) => void; reject: (error: unknown) => void }[] = [];
  const source = vi.fn((_signal?: AbortSignal) => new Promise<SpaceSystems>((resolve, reject) => { calls.push({ resolve, reject }); }));
  return { source, calls };
}
const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe('space-systems store lifecycle (#1289 node j)', () => {
  it('is pending with nothing to read until the load answers, then ready', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    expect(store.getSnapshot()).toEqual({ status: 'pending', data: null });
    store.start(['s1'], source);
    expect(store.getSnapshot().status).toBe('pending');
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBeNull();
    expect(platformSystemOf(store.getSnapshot())).toBeNull();
    calls[0]!.resolve(data('mars', A));
    await flush();
    expect(store.getSnapshot().status).toBe('ready');
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBe(A);
    expect(platformSystemOf(store.getSnapshot())).toBe(PLATFORM);
  });

  it('notifies subscribers on every change, and stops after unsubscribe', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.start(['s1'], source);
    const afterStart = listener.mock.calls.length;
    calls[0]!.resolve(data('mars', A));
    await flush();
    expect(listener.mock.calls.length).toBeGreaterThan(afterStart);
    off();
    const seen = listener.mock.calls.length;
    store.refresh();
    calls[1]!.resolve(data('mars', B));
    await flush();
    expect(listener.mock.calls.length).toBe(seen);
  });

  it('a link that is not declared gives no system; an unlinked space gives none', async () => {
    const store = createSpaceSystemsStore();
    store.start(['s1'], async () => data('mars', A, false));
    await flush();
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBeNull();
    expect(linkedSystemOf(store.getSnapshot(), 'bravo')).toBeNull();
  });

  it('a failed first load is failed (no data); retryIfFailed loads again, and a ready store ignores it', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    store.start(['s1'], source);
    calls[0]!.reject(new Error('down'));
    await flush();
    expect(store.getSnapshot()).toEqual({ status: 'failed', data: null });
    store.retryIfFailed();
    expect(store.getSnapshot().status).toBe('pending');
    calls[1]!.resolve(data('mars', A));
    await flush();
    expect(store.getSnapshot().status).toBe('ready');
    store.retryIfFailed();
    expect(source).toHaveBeenCalledTimes(2);
  });

  it('a source that throws synchronously is a failure, not an unhandled error', async () => {
    const store = createSpaceSystemsStore();
    store.start(['s1'], () => { throw new Error('boom'); });
    await flush();
    expect(store.getSnapshot().status).toBe('failed');
  });

  it('no source (an assembly without server links) is ready and empty at once', () => {
    const store = createSpaceSystemsStore();
    store.start(['s1'], null);
    expect(store.getSnapshot()).toEqual({ status: 'ready', data: { links: [], platformManagedSystemId: null } });
  });

  it('the same session starts one load; a refresh keeps what is shown and a failed refresh keeps it too', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    store.start(['s1'], source);
    store.start(['s1'], source);
    expect(source).toHaveBeenCalledTimes(1);
    calls[0]!.resolve(data('mars', A));
    await flush();
    store.refresh();
    expect(store.getSnapshot().status).toBe('ready');
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBe(A);
    calls[1]!.reject(new Error('down'));
    await flush();
    expect(store.getSnapshot().status).toBe('ready');
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBe(A);
  });

  it('a session change clears the old data at once and starts the new session load', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    store.start(['s1'], source);
    calls[0]!.resolve(data('mars', A));
    await flush();
    store.start(['s2'], source);
    expect(store.getSnapshot()).toEqual({ status: 'pending', data: null });
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBeNull();
    expect(source).toHaveBeenCalledTimes(2);
    calls[1]!.resolve(data('mars', B));
    await flush();
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBe(B);
  });

  it('ignores a late result of an earlier session when the new session already answered (reverse order)', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    store.start(['s1'], source);
    store.start(['s2'], source); // session change while the first request is pending
    calls[1]!.resolve(data('mars', B));
    await flush();
    calls[0]!.resolve(data('mars', A)); // the earlier session's answer arrives last
    await flush();
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBe(B);
  });

  it('ignores a late failure of an earlier session after the new session is ready', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    store.start(['s1'], source);
    store.start(['s2'], source);
    calls[1]!.resolve(data('mars', B));
    await flush();
    calls[0]!.reject(new Error('late'));
    await flush();
    expect(store.getSnapshot().status).toBe('ready');
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBe(B);
  });

  it('ignores a superseded refresh that answers after a newer one', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    store.start(['s1'], source);
    calls[0]!.resolve(data('mars', A));
    await flush();
    store.refresh(); // calls[1]
    store.refresh(); // calls[2] supersedes it
    calls[2]!.resolve(data('mars', B));
    await flush();
    calls[1]!.resolve(data('mars', A));
    await flush();
    expect(linkedSystemOf(store.getSnapshot(), 'mars')).toBe(B);
  });

  it('reset forgets the session and ignores an in-flight answer', async () => {
    const store = createSpaceSystemsStore();
    const { source, calls } = deferred();
    store.start(['s1'], source);
    store.reset();
    calls[0]!.resolve(data('mars', A));
    await flush();
    expect(store.getSnapshot()).toEqual({ status: 'pending', data: null });
    store.refresh();
    expect(source).toHaveBeenCalledTimes(1);
  });
});

describe('superseded requests carry cancellation (a 401 of an obsolete request has no side effect)', () => {
  it('aborts the previous request on a session change, a refresh and reset', () => {
    const store = createSpaceSystemsStore();
    const { source } = deferred();
    store.start(['s1'], source);
    const first = source.mock.calls[0]![0]!;
    store.start(['s2'], source);
    expect(first.aborted).toBe(true);
    const second = source.mock.calls[1]![0]!;
    store.refresh();
    expect(second.aborted).toBe(true);
    const third = source.mock.calls[2]![0]!;
    expect(third.aborted).toBe(false);
    store.reset();
    expect(third.aborted).toBe(true);
  });

  it('a 401 for the superseded session answered after the replacement succeeded does not redirect', async () => {
    const onSessionLost = vi.fn();
    const api = { basePath: '/api/features', onSessionLost };
    const releases: (() => void)[] = [];
    vi.stubGlobal('fetch', vi.fn((_url: string, init?: RequestInit) => {
      const first = releases.length === 0;
      return new Promise<Response>((resolve) => {
        releases.push(() => resolve(first
          ? new Response('{}', { status: 401 })
          : new Response(JSON.stringify({ items: [], platform_managed_system_id: null }), { status: 200 })));
        void init;
      });
    }));
    try {
      const store = createSpaceSystemsStore();
      const source = (signal: AbortSignal) => fetchSpaceLinks(api, signal);
      store.start(['s1'], source);
      store.start(['s2'], source);
      releases[1]!();
      await flush();
      expect(store.getSnapshot().status).toBe('ready');
      releases[0]!(); // the earlier session's request answers 401 last
      await flush();
      expect(onSessionLost).not.toHaveBeenCalled();
      expect(store.getSnapshot().status).toBe('ready');
    } finally { vi.unstubAllGlobals(); }
  });

  it('a 401 for the current request still reaches the host callback', async () => {
    const onSessionLost = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    try {
      const store = createSpaceSystemsStore();
      store.start(['s1'], (signal) => fetchSpaceLinks({ basePath: '/api/features', onSessionLost }, signal));
      await flush();
      expect(onSessionLost).toHaveBeenCalledTimes(1);
      expect(store.getSnapshot().status).toBe('failed');
    } finally { vi.unstubAllGlobals(); }
  });
});
