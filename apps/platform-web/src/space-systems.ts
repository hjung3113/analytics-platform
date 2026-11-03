import type { SpaceLinks } from '@ap/feature-bridge';

/**
 * The app's copy of the space → Managed System links (#1289 node j, ADR-0110 decision 5), behind the Kernel's synchronous feature slot.
 * The Kernel slot contract is unchanged: `managedSystemFor` and the slot's `entriesFor` read this store synchronously and see `null` until it is ready.
 * The store is observable so the app composition (`main.tsx`) can rerender the shell and the VOC form when it completes, fails or refreshes.
 *
 * Lifecycle: `start(session, source)` is called with the current session identity. A different session clears the old data at once and starts that
 * session's load; the same session is a no-op. Every load carries a ticket: a result or failure is applied only while its ticket is still the latest, so a late
 * answer from an earlier session or a superseded refresh is ignored (it could otherwise put another workspace's links back into the active store).
 * The link is navigation/default metadata only: it grants no permission (ADR-0068 decision 1).
 */
export type SpaceSystems = SpaceLinks;
/** Loads the links; the assembly supplies it (the real one reads the feature API, the mock one answers fixed data). */
/** `identity` is the session the load runs under (the one passed to `start`), so a late 401 can be tied to its own session. */
export type SpaceSystemsSource = (signal: AbortSignal, identity: readonly unknown[]) => Promise<SpaceSystems>;
export type SpaceSystemsStatus = 'pending' | 'ready' | 'failed';
export type SpaceSystemsSnapshot = { readonly status: SpaceSystemsStatus; readonly data: SpaceSystems | null };

const EMPTY: SpaceSystems = { links: [], platformManagedSystemId: null };

export type SpaceSystemsStore = ReturnType<typeof createSpaceSystemsStore>;

export function createSpaceSystemsStore() {
  let snapshot: SpaceSystemsSnapshot = { status: 'pending', data: null };
  let session: readonly unknown[] | null = null;
  let source: SpaceSystemsSource | null = null;
  let ticket = 0;
  let inflight: AbortController | null = null;
  const listeners = new Set<() => void>();

  function publish(next: SpaceSystemsSnapshot): void {
    snapshot = next;
    for (const listener of [...listeners]) listener();
  }

  function load(): void {
    const mine = ++ticket;
    // A superseded request is cancelled so its late answer (a 401 included) can cause no side effect.
    inflight?.abort();
    const controller = new AbortController();
    inflight = controller;
    const current = source;
    const identity = session ?? [];
    if (current === null) { publish({ status: 'ready', data: EMPTY }); return; }
    let answer: Promise<SpaceSystems>;
    try { answer = current(controller.signal, identity); } catch (error) { answer = Promise.reject(error); }
    answer.then(
      (data) => { if (mine === ticket) publish({ status: 'ready', data }); },
      // A failed refresh keeps the links already in hand; only a load with nothing to show is `failed`.
      () => { if (mine === ticket) publish(snapshot.data === null ? { status: 'failed', data: null } : snapshot); },
    );
  }

  const sameSession = (a: readonly unknown[], b: readonly unknown[]) => a.length === b.length && a.every((value, index) => Object.is(value, b[index]));

  return {
    subscribe(listener: () => void): () => void { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: (): SpaceSystemsSnapshot => snapshot,
    /** Begin (or continue) the load for `identity`; `null` source = the assembly has no server links (empty and ready). */
    start(identity: readonly unknown[], nextSource: SpaceSystemsSource | null): void {
      if (session !== null && sameSession(session, identity) && source === nextSource) return;
      session = identity;
      source = nextSource;
      publish({ status: 'pending', data: null });
      load();
    },
    /** Reload for the current session, keeping what is shown meanwhile. Nothing started yet: no-op. */
    refresh(): void { if (session !== null) load(); },
    /** The next open of the VOC form retries a failed load. */
    retryIfFailed(): void { if (snapshot.status === 'failed') { publish({ status: 'pending', data: null }); load(); } },
    /** Forget the session (sign-out): data cleared, in-flight results ignored. */
    reset(): void { ticket += 1; inflight?.abort(); inflight = null; session = null; source = null; publish({ status: 'pending', data: null }); },
  };
}

/** The Managed System of a space: the linked one only while the link is declared; `null` for no space (the caller defaults to 「플랫폼」), no link or a disconnected one. */
export function linkedSystemOf(snapshot: SpaceSystemsSnapshot, spaceId: string): string | null {
  if (snapshot.status !== 'ready' || snapshot.data === null) return null;
  const link = snapshot.data.links.find((item) => item.spaceId === spaceId);
  return link !== undefined && link.declared ? link.managedSystemId : null;
}

/** The workspace's 「플랫폼」 system, or `null` while the store is not ready or the server has none. */
export function platformSystemOf(snapshot: SpaceSystemsSnapshot): string | null {
  return snapshot.status === 'ready' && snapshot.data !== null ? snapshot.data.platformManagedSystemId : null;
}

/** The one store of the page (the Kernel slot and the compose bridge read it synchronously). */
export const spaceSystems = createSpaceSystemsStore();
