/**
 * Focus moves the dock makes itself (reconcile focus restore, maximize-restore focus, the Shift+F10 menu path) are not the user choosing a
 * panel, so `onActivate` ignores them. Module-level so a nested layout's programmatic focus is also ignored by every layout around it.
 */
let depth = 0;

export function programmaticFocus(run: () => void): void {
  depth += 1;
  try { run(); } finally { depth -= 1; }
}

export const isProgrammaticFocus = () => depth > 0;
