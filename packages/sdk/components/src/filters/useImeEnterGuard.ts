import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react';

const TEXT_INPUT_TYPES = new Set(['text', 'search']);
const isTextInput = (target: EventTarget): target is HTMLInputElement => target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);

/**
 * The composition tracker `useImeEnterGuard` and the table quick search share so the two do not diverge (#1232).
 * `composingEnter(event)` is true for an Enter that belongs to an IME composition and releases the tracker; callers also
 * `release()` on any non-Enter key. `onCompositionEnd` arms the one-frame window, text inputs only.
 */
export function useImeComposition() {
  const afterComposition = useRef(false);
  const releaseFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(releaseFrame.current), []);
  const release = () => { afterComposition.current = false; };
  return {
    composingEnter: (event: KeyboardEvent) => {
      const composing = event.nativeEvent.isComposing || event.keyCode === 229 || afterComposition.current;
      release();
      return composing;
    },
    release,
    onCompositionStart: release,
    onCompositionEnd: (event: SyntheticEvent) => {
      if (!isTextInput(event.target as EventTarget)) return;
      afterComposition.current = true;
      cancelAnimationFrame(releaseFrame.current);
      releaseFrame.current = requestAnimationFrame(release);
    },
  };
}

/**
 * Cancels the implicit form submission of an Enter that belongs to an IME composition (isComposing, keyCode 229, or the Safari
 * Enter that follows compositionend). Spread the handlers onto the `<form>`; submit stays the only apply path (06 §13, ADR-0037).
 */
export function useImeEnterGuard() {
  const ime = useImeComposition();
  return {
    onKeyDown: (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.defaultPrevented) return;
      if (event.key !== 'Enter') { ime.release(); return; }
      if (!isTextInput(event.target as EventTarget)) return;
      if (ime.composingEnter(event)) event.preventDefault();
    },
    onCompositionStart: ime.onCompositionStart,
    onCompositionEnd: ime.onCompositionEnd,
  };
}
