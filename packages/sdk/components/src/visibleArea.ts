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

/**
 * Everything of the page that stays stuck over its scroll container: the sticky head (title, Context bar) and, on an apply page, the query row once
 * it is collapsed (a separate sticky element under the head). A board pane's page has neither: the pane's own head sits outside the pane body.
 */
export function stickyChromeOf(page: Element | null): HTMLElement[] {
  if (!page) return [];
  return [page.querySelector<HTMLElement>('[data-page-sticky-header]'), page.querySelector<HTMLElement>('[data-query-bar][data-query-bar-collapsed]')]
    .filter((chrome): chrome is HTMLElement => chrome !== null);
}

/** Summed height of `stickyChromeOf(page)`: the one formula for what the page keeps over its scroll container (also `--page-sticky-offset`). Reads layout. */
export function stickyChromeHeight(page: Element | null): number {
  return stickyChromeOf(page).reduce((total, chrome) => total + chrome.getBoundingClientRect().height, 0);
}

/**
 * Height of what the user sees of `element`'s scroll container: its client height (the window's when the document scrolls) less the sticky
 * page chrome that overlaps it (head and collapsed query row). A board pane's body is such a container, so the same answer holds inside a pane.
 * Reads layout: call it from effects and observer callbacks only.
 */
export function visibleAreaHeight(element: HTMLElement): number {
  const container = scrollContainerOf(element);
  const height = container ? container.clientHeight : window.innerHeight;
  return Math.max(0, Math.floor(height - stickyChromeHeight(element.closest('[data-platform-page]'))));
}

/** `visibleAreaHeight` of the element in `ref` while `active`, kept current through the scroll container, the sticky chrome and the window; null before the first measure. */
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
    // The collapsed query row appears, disappears and resizes on its own (expand/collapse), so the chrome is read again on a mutation of the page.
    const page = element.closest('[data-platform-page]');
    let chrome: HTMLElement[] = [];
    const rebind = () => {
      const next = stickyChromeOf(page);
      chrome.forEach(item => { if (!next.includes(item)) observer?.unobserve(item); });
      next.forEach(item => { if (!chrome.includes(item)) observer?.observe(item); });
      const changed = next.length !== chrome.length || next.some((item, index) => item !== chrome[index]);
      chrome = next;
      if (changed) update();
    };
    rebind();
    const mutations = page && typeof MutationObserver !== 'undefined' ? new MutationObserver(rebind) : null;
    if (page) mutations?.observe(page, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-query-bar-collapsed'] });
    window.addEventListener('resize', update);
    return () => { mutations?.disconnect(); observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [ref, active]);
  return height;
}
