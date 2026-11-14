import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Whether the element's text is cut off at its right edge right now (`scrollWidth > clientWidth`), re-measured after every render and whenever its box is resized.
 * One-line text truncation only: a fitting label never needs a tooltip or a native `title`, so a caller shows one only while this is true.
 * Without `ResizeObserver` (old test environments) it measures after renders alone. The ref may point at a different element on a later render (a collapsed row that remounts).
 */
export function useIsTruncated<T extends HTMLElement>(ref: RefObject<T | null>): boolean {
  const [truncated, setTruncated] = useState(false);
  const observed = useRef<{ element: T; observer: ResizeObserver } | null>(null);
  const last = useRef(false);
  // The state is written only when the measured boolean changes: an unchanged value still re-enters the component body when it is set after every commit.
  const set = (next: boolean) => { if (last.current !== next) { last.current = next; setTruncated(next); } };
  // No dependency list on purpose: a content change that does not resize the box still changes `scrollWidth`; an unchanged result bails out of the state update.
  useLayoutEffect(() => {
    const element = ref.current;
    set(element !== null && element.scrollWidth > element.clientWidth);
    if (observed.current?.element === element) return;
    observed.current?.observer.disconnect();
    observed.current = null;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => set(element.scrollWidth > element.clientWidth));
    observer.observe(element);
    observed.current = { element, observer };
  });
  useEffect(() => () => { observed.current?.observer.disconnect(); observed.current = null; }, []);
  return truncated;
}
