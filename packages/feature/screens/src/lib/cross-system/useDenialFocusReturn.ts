import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';

export function getListDenialFocusTarget(card: HTMLDivElement | null) {
  return card?.querySelector<HTMLElement>('a[href], button:not([disabled])') ?? card;
}

export function focusListDenialCard(card: HTMLDivElement | null, options?: FocusOptions) {
  getListDenialFocusTarget(card)?.focus(options);
}

/** Return focus when a denial removes its focused list control (#2677). */
export function useDenialFocusReturn(denied: boolean, cardRef: RefObject<HTMLDivElement | null>) {
  const lastFocused = useRef<Element | null>(null);
  useEffect(() => {
    const record = (event: FocusEvent) => {
      lastFocused.current = event.target instanceof Element ? event.target : null;
    };
    // Focus that leaves a still-connected element was moved by the user, not by a removal; a restore that focuses it again keeps it (#3072).
    const release = (event: FocusEvent) => {
      const target = event.target;
      queueMicrotask(() => {
        if (target instanceof Element && target.isConnected && lastFocused.current === target && !target.contains(target.ownerDocument.activeElement)) {
          lastFocused.current = null;
        }
      });
    };
    document.addEventListener('focusin', record);
    document.addEventListener('focusout', release);
    return () => {
      document.removeEventListener('focusin', record);
      document.removeEventListener('focusout', release);
    };
  }, []);
  useLayoutEffect(() => {
    if (!denied) return;
    const previous = lastFocused.current;
    lastFocused.current = null;
    if (previous && !previous.isConnected && document.activeElement === document.body) {
      focusListDenialCard(cardRef.current);
    }
  }, [cardRef, denied]);
}
