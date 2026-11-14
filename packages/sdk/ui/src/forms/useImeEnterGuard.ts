import { useEffect, useRef, type KeyboardEvent, type SyntheticEvent } from 'react';

const TEXT_INPUT_TYPES = new Set(['text', 'search']);
const isTextInput = (target: EventTarget): target is HTMLInputElement => target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);

/** What `useImeEnterGuard` returns. Pass the members by name; spreading the object onto an element would leak `isComposingEnter` as a DOM attribute. */
export interface ImeEnterGuard {
  /** Form level: cancels the implicit submission of an Enter that belongs to a composition in a text field of the form. */
  onKeyDown: (event: KeyboardEvent<HTMLFormElement>) => void;
  onCompositionStart: () => void;
  /** Arms the one-frame window for the Enter Safari sends after `compositionend` (any field; the form-level `onKeyDown` still acts on text and search inputs only). */
  onCompositionEnd: (event: SyntheticEvent) => void;
  /**
   * Field level: call it first in a text field's own `onKeyDown`. True for an Enter that belongs to an IME composition
   * (isComposing, keyCode 229, or the Safari Enter right after `compositionend`): that Enter must not select, add or commit.
   * Any other key releases the Safari window and returns false. It consumes the window: call it once per keydown, first.
   */
  isComposingEnter: (event: KeyboardEvent) => boolean;
}

/**
 * The one IME Enter guard (#1232, #2215): an Enter that confirms a Korean, Japanese or Chinese composition never acts.
 * `isComposing` alone misses the Enter Safari fires after `compositionend` (isComposing already false), and some browsers
 * report only keyCode 229, so every Enter handler on a text field goes through this hook (lint `ap/ime-enter-guard`).
 * - A form: put `onKeyDown`, `onCompositionStart` and `onCompositionEnd` on the `<form>`; submit stays the only apply path (06 §13, ADR-0037).
 * - A text field that acts on Enter itself (combobox search, quick search, rename): put `onCompositionStart` and
 *   `onCompositionEnd` on the field and return early from its `onKeyDown` when `isComposingEnter(event)` is true.
 */
export function useImeEnterGuard(): ImeEnterGuard {
  const afterComposition = useRef(false);
  const releaseFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(releaseFrame.current), []);
  const release = () => { afterComposition.current = false; };
  const isComposingEnter = (event: KeyboardEvent) => {
    if (event.key !== 'Enter') { release(); return false; }
    const composing = event.nativeEvent.isComposing || event.keyCode === 229 || afterComposition.current;
    release();
    return composing;
  };
  return {
    onKeyDown: (event) => {
      if (event.defaultPrevented) return;
      if (event.key !== 'Enter') { release(); return; }
      if (!isTextInput(event.target as EventTarget)) return;
      if (isComposingEnter(event)) event.preventDefault();
    },
    onCompositionStart: release,
    onCompositionEnd: () => {
      afterComposition.current = true;
      cancelAnimationFrame(releaseFrame.current);
      releaseFrame.current = requestAnimationFrame(release);
    },
    isComposingEnter,
  };
}
