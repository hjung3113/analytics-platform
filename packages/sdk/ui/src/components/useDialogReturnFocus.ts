import * as React from 'react';
import { useScopedAutofocus } from './TransientOverlayScope';

type FocusEventHandler = (event: Event) => void;

/**
 * Focus return for Radix dialog content (#1169). A dialog opened without a
 * `DialogTrigger` has no trigger for Radix to focus on close, so focus falls to
 * `<body>`. This remembers the element focused when the content opens and, after
 * Radix's own close handling, focuses it if focus is still on `<body>`.
 *
 * - Keyed by the content element: Radix dispatches both autofocus events on it, and
 *   the close one runs after unmount in a timer, so a quick reopen must not share an opener.
 * - A consumer `onCloseAutoFocus` that calls `preventDefault` wins.
 * - A hidden overlay scope suppresses the event (`useScopedAutofocus`) before any of this runs.
 * - Dialogs with a trigger are unchanged: Radix focuses the trigger, so focus is not on `<body>`.
 */
export function useDialogReturnFocus(props: {
  onOpenAutoFocus?: FocusEventHandler | undefined;
  onCloseAutoFocus?: FocusEventHandler | undefined;
}): { onOpenAutoFocus: FocusEventHandler; onCloseAutoFocus: FocusEventHandler } {
  const openers = React.useRef(new WeakMap<EventTarget, HTMLElement>());
  const { onOpenAutoFocus: consumerOpen, onCloseAutoFocus: consumerClose } = props;
  const onOpenAutoFocus = (event: Event) => {
    const active = document.activeElement;
    if (event.target && active instanceof HTMLElement && active !== document.body) {
      openers.current.set(event.target, active);
    }
    consumerOpen?.(event);
  };
  const onCloseAutoFocus = useScopedAutofocus((event: Event) => {
    const opener = event.target ? openers.current.get(event.target) : undefined;
    if (event.target) openers.current.delete(event.target);
    consumerClose?.(event);
    if (event.defaultPrevented || !opener) return;
    // Radix's own default (trigger focus) runs after this handler; check once it has finished.
    queueMicrotask(() => {
      const active = document.activeElement;
      if (opener.isConnected && (active === null || active === document.body)) opener.focus();
    });
  });
  return { onOpenAutoFocus, onCloseAutoFocus };
}
