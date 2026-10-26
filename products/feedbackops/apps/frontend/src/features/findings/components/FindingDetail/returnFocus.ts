import type * as React from 'react';

// The evidence modals are controlled (no DialogTrigger), so Radix does not know the opener (#927 UX-2).
// Radix queues close autofocus, so only restore when focus has nowhere meaningful to be:
// a control the user (or a toast action) already focused outside the dialog is left alone.
export function restoreOpenerFocus(
  event: Event,
  returnFocusRef?: React.RefObject<HTMLButtonElement | null>,
): void {
  const trigger = returnFocusRef?.current;
  if (!trigger?.isConnected || trigger.disabled) return;
  const active = document.activeElement;
  const dialog = event.currentTarget instanceof Element ? event.currentTarget : null;
  // Without the dialog node only body/null count as lost: the detail drawer around the opener is a dialog too.
  const focusLost =
    active === null || active === document.body || dialog?.contains(active) === true;
  if (!focusLost) return;
  event.preventDefault();
  trigger.focus();
}
