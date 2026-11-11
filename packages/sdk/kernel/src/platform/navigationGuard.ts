import type { MainUsageVia, Text } from '@ap/contracts';

/** What a menu declares with `useUnsavedGuard` (ADR-0115). */
export type UnsavedGuardOptions = {
  /** Detail line the shell shows next to the fixed consequence sentence; it never replaces it. */
  message?: string | Text;
  /**
   * `'path'` (default): only leaving the menu (the pathname changes) asks. `'address'`: any push to another pathname or query asks.
   * `{ pageKeys }`: leaving the menu asks, and so does a push that changes the value of one of these page keys (a key given more than once compares its
   * whole list, in order); a change to any other key never asks. Only keys that stay in the address count: a hidden page key travels in the entry state,
   * so naming one has no effect. An empty list behaves like `'path'`. `replace` and same-pathname writes under `'path'` never ask.
   */
  leaves?: 'path' | 'address' | { pageKeys: readonly string[] };
  /** Runs once, synchronously, only after the person confirmed leaving, before the destination is written. */
  onDiscard?: () => void;
};

/** A navigation waiting for the person's answer. Exposed to the shell by `useLeaveRequest()` (`@ap/kernel/host`). */
export type LeaveRequest = {
  /** Label of the menu being opened, when the destination matches one. */
  destination: Text | null;
  /** The innermost dirty registrant's `message`, or null (the shell shows its default sentence; the consequence sentence is always shown). */
  message: string | Text | null;
  /** How the move started; `'history'` is the browser Back/Forward. */
  via: MainUsageVia | 'history' | null;
  /** Leave: runs every blocking registrant's `onDiscard`, then replays the move once. No-op when this request is no longer the pending one. */
  confirm: () => void;
  /** Stay: drops the request; nothing else changed (a Back/Forward was already restored). No-op when no longer pending. */
  cancel: () => void;
};

type Entry = { read: () => UnsavedGuardOptions; seq: number };
export type AddressChange = { from: string; to: string };

const pathOf = (url: string): string => url.split('?')[0].split('#')[0];
const addressOf = (url: string): string => url.split('#')[0];
/** The ordered values of one query key, joined so two lists compare with `!==` (NUL cannot occur in a decoded query value of a real address). */
const valuesOf = (url: string, key: string): string => {
  const query = addressOf(url).split('?')[1] ?? '';
  return new URLSearchParams(query).getAll(key).join('\u0000');
};

/**
 * The Kernel-internal registry of unsaved-edit guards and the one pending leave request. Headless: the shell draws the dialog.
 * Registered entries are the dirty ones; a hook unregisters on `dirty=false` or unmount.
 */
export function createNavigationGuard() {
  const entries = new Set<Entry>();
  let seq = 0;
  let request: { view: LeaveRequest; blockers: Entry[] } | null = null;
  const listeners = new Set<() => void>();
  const traversals = new Set<() => void>();
  const notify = () => { for (const l of [...listeners]) l(); };

  let unloadAttached = false;
  const onUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
  const syncUnload = () => {
    if (typeof window === 'undefined') return;
    if (entries.size > 0 && !unloadAttached) { window.addEventListener('beforeunload', onUnload); unloadAttached = true; }
    else if (entries.size === 0 && unloadAttached) { window.removeEventListener('beforeunload', onUnload); unloadAttached = false; }
  };

  const blocks = (entry: Entry, change: AddressChange): boolean => {
    const leaves = entry.read().leaves ?? 'path';
    if (leaves === 'address') return addressOf(change.from) !== addressOf(change.to);
    if (pathOf(change.from) !== pathOf(change.to)) return true;
    return typeof leaves === 'object' && leaves.pageKeys.some(key => valuesOf(change.from, key) !== valuesOf(change.to, key));
  };
  const blockersFor = (change: AddressChange): Entry[] => [...entries].filter(e => blocks(e, change)).sort((a, b) => a.seq - b.seq);

  const dropRequest = () => { if (request !== null) { request = null; notify(); } };

  return {
    /** Registers a dirty guard; returns its unregister. */
    register(read: () => UnsavedGuardOptions): () => void {
      const entry: Entry = { read, seq: ++seq };
      entries.add(entry);
      syncUnload();
      return () => {
        entries.delete(entry);
        syncUnload();
        // A request whose every blocker is gone has nothing left to protect: dropped, never auto-confirmed.
        if (request !== null && !request.blockers.some(b => entries.has(b))) dropRequest();
      };
    },
    hasDirty: () => entries.size > 0,
    /** True when a dirty registrant would be left by `change`. */
    shouldBlock: (change: AddressChange): boolean => entries.size > 0 && blockersFor(change).length > 0,
    pending: (): boolean => request !== null,
    /** Opens (or replaces) the pending request for `change`; `proceed` replays the move after the person confirmed. Returns null when nobody blocks. */
    request(info: { change: AddressChange; destination: Text | null; via: LeaveRequest['via']; proceed: () => void }): LeaveRequest | null {
      const blockers = blockersFor(info.change);
      if (blockers.length === 0) return null;
      const innermost = [...blockers].reverse().map(b => b.read().message).find(m => m !== undefined) ?? null;
      const view: LeaveRequest = {
        destination: info.destination, message: innermost, via: info.via,
        confirm: () => {
          if (request?.view !== view) return;
          request = null;
          notify();
          // Only registrations still alive are asked to discard; one that unmounted while the dialog was open has nothing left to drop.
          for (const b of [...blockers].reverse()) if (entries.has(b)) b.read().onDiscard?.();
          info.proceed();
        },
        cancel: () => { if (request?.view === view) dropRequest(); },
      };
      request = { view, blockers };
      notify();
      return view;
    },
    dropRequest,
    subscribe: (listener: () => void): (() => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getRequest: (): LeaveRequest | null => request?.view ?? null,
    /** An address arrival by Back/Forward the Kernel accepted (not a cancelled or compensated one). */
    onTraversal: (listener: () => void): (() => void) => { traversals.add(listener); return () => { traversals.delete(listener); }; },
    traversed: () => { for (const l of [...traversals]) l(); },
  };
}
export type NavigationGuard = ReturnType<typeof createNavigationGuard>;

/** The history-state field holding an entry's position in the Kernel's own writes (ADR-0115). Other fields of `history.state` are never touched. */
export const HISTORY_INDEX_KEY = 'apIdx';
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** The entry's stamped position, or null for an entry the Kernel did not write. */
export function readHistoryIdx(state: unknown): number | null {
  if (!isRecord(state)) return null;
  const idx = state[HISTORY_INDEX_KEY];
  return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 ? idx : null;
}
/**
 * The history-state field naming the numbering segment an `apIdx` belongs to. Positions are comparable only inside one segment: a push from an entry the
 * Kernel did not stamp starts a new segment (once any stamp was seen), so a distance is never computed across it (it fails open instead).
 */
export const HISTORY_SEGMENT_KEY = 'apSeg';
/** The entry's segment, or null for the first (unnamed) one. */
export function readHistorySeg(state: unknown): string | null {
  if (!isRecord(state)) return null;
  const seg = state[HISTORY_SEGMENT_KEY];
  return typeof seg === 'string' && seg !== '' ? seg : null;
}
/** `state` with the position (and, past the first segment, the segment) stamped; foreign fields stay. */
export const withHistoryIdx = (state: unknown, idx: number, seg: string | null = null): Record<string, unknown> => {
  const next: Record<string, unknown> = { ...(isRecord(state) ? state : {}), [HISTORY_INDEX_KEY]: idx };
  if (seg !== null) next[HISTORY_SEGMENT_KEY] = seg; else delete next[HISTORY_SEGMENT_KEY];
  return next;
};
