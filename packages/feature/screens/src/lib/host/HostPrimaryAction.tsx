import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { useHostPrimaryActionTarget } from './host-seam';

/**
 * Draws a screen's one primary action (create/register) in the host's page head when the host offers a target, and in place otherwise (standalone app, a gated page).
 * Wrap only the trigger button: its gating, handlers and the dialog it opens stay where the screen put them, so state and focus recovery keep their lifetime.
 */
export function HostPrimaryAction({ children }: { children: ReactNode }): ReactNode {
  const target = useHostPrimaryActionTarget();
  return target === null ? children : createPortal(children, target);
}
