/**
 * The host request «open the Scope selector» (#1938). A Scope gate in a page body (`@ap/components`) cannot import the shell that draws
 * the selector, so the request passes through the host: the page calls `open()`, a mounted shell selector answers it.
 * It only opens the selector: it never applies, widens or picks a Scope (the person still chooses, and the Kernel validates).
 */
export type ScopeSelectorRequest = {
  /** Asks the most recently mounted selector to open. No-op when none is mounted. */
  open: () => void;
  /** Shell side: a mounted selector answers `open` until the returned function unregisters it. The last registered answers. */
  answer: (handler: () => void) => () => void;
  /** Whether a selector is mounted to answer `open`; read it with `subscribe` (`useSyncExternalStore`) so a gate shows its action only then. */
  available: () => boolean;
  subscribe: (listener: () => void) => () => void;
};

export function createScopeSelectorRequest(): ScopeSelectorRequest {
  const handlers: Array<() => void> = [];
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  return {
    open: () => { handlers.at(-1)?.(); },
    answer: handler => {
      // A wrapper per registration, so the same function registered twice unregisters one entry at a time.
      const entry = () => handler();
      handlers.push(entry);
      if (handlers.length === 1) notify();
      return () => {
        const index = handlers.lastIndexOf(entry);
        if (index === -1) return;
        handlers.splice(index, 1);
        if (handlers.length === 0) notify();
      };
    },
    available: () => handlers.length > 0,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}
