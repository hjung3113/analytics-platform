import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react';

const TEXT_INPUT_TYPES = new Set(['text', 'search']);
const isTextInput = (target: EventTarget): target is HTMLInputElement => target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);

/**
 * Cancels the implicit form submission of an Enter that belongs to an IME composition (isComposing, keyCode 229, or the Safari
 * Enter that follows compositionend). Spread the handlers onto the `<form>`; submit stays the only apply path (06 §13, ADR-0037).
 */
export function useImeEnterGuard() {
  const afterComposition = useRef(false);
  const releaseFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(releaseFrame.current), []);
  const release = () => { afterComposition.current = false; };
  return {
    onKeyDown: (event: KeyboardEvent<HTMLFormElement>) => {
      if (event.defaultPrevented) return;
      if (event.key !== 'Enter') { release(); return; }
      if (!isTextInput(event.target as EventTarget)) return;
      const composing = event.nativeEvent.isComposing || event.keyCode === 229 || afterComposition.current;
      release();
      if (composing) event.preventDefault();
    },
    onCompositionStart: release,
    onCompositionEnd: (event: SyntheticEvent) => {
      if (!isTextInput(event.target as EventTarget)) return;
      afterComposition.current = true;
      cancelAnimationFrame(releaseFrame.current);
      releaseFrame.current = requestAnimationFrame(release);
    },
  };
}
