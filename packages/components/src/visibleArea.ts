import { useLayoutEffect, useState, type RefObject } from 'react';

function isScrollable(element: Element): boolean {
  return /(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY);
}

/** Nearest scrollable ancestor; null = the window (document scrolls). */
export function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (isScrollable(node)) return node;
  }
  return null;
}

/** The page's sticky head (title, Context bar, the collapsed query row) above `element`; a pane's page has none. */
export function stickyHeaderOf(element: HTMLElement): HTMLElement | null {
  return element.closest('[data-platform-page]')?.querySelector<HTMLElement>('[data-page-sticky-header]') ?? null;
}

/**
 * Height of what the user sees of `element`'s scroll container: its client height (the window's when the document scrolls) less the sticky
 * page head that overlaps it. A board pane's body is such a container, so the same answer holds inside a pane. Reads layout: call it from
 * effects and observer callbacks only.
 */
export function visibleAreaHeight(element: HTMLElement): number {
  const container = scrollContainerOf(element);
  const height = container ? container.clientHeight : window.innerHeight;
  const sticky = stickyHeaderOf(element);
  return Math.max(0, Math.floor(height - (sticky ? sticky.getBoundingClientRect().height : 0)));
}

/** `visibleAreaHeight` of the element in `ref` while `active`, kept current through the scroll container, the sticky head and the window; null before the first measure. */
export function useVisibleAreaHeight(ref: RefObject<HTMLElement | null>, active: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!active || !element) return;
    const update = () => { const next = visibleAreaHeight(element); setHeight(previous => (previous === next || next <= 0 ? previous : next)); };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    const container = scrollContainerOf(element);
    if (container) observer?.observe(container);
    const sticky = stickyHeaderOf(element);
    if (sticky) observer?.observe(sticky);
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [ref, active]);
  return height;
}
