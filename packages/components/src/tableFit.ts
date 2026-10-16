import { useCallback, useLayoutEffect, useState } from 'react';

/** ADR-0037: the least scroll budget a table keeps when the page leaves less room. */
export const ROW_AREA_FLOOR = 240;
/** Fallback cap before the first measurement (and where nothing can be measured). */
export const ROW_AREA_FALLBACK = 420;
/** Action column stays pinned only while the scrollport keeps this much room beside it and the left pins. */
export const ACTION_PIN_MIN_SCROLL = 120;

/**
 * Row-viewport height cap `R` (ADR-0037 `min(N, max(240, R))` — this is the `max(240, R)` part).
 *
 * Every number is in CSS px along the scroll container's content axis, measured as if scrolled to the top:
 * - `containerHeight`: the visible (client) height of the scroll container (window: `innerHeight`).
 * - `stickyTop`: height of the sticky page header, which sits at the top of the content.
 * - `viewportTopInContent`: top of the row viewport measured from the top of the scroll content, so it
 *   already includes the sticky header when that header is in flow.
 * - `below`: everything after the row viewport to the end of the page content (pager, following siblings
 *   and gaps, bottom padding). It moves with the table, so it does not depend on the table's own height.
 *
 * The sticky header is counted once: `stickyTop` plus the part of `viewportTopInContent` beyond it.
 */
export function availableRowHeight({ containerHeight, stickyTop, viewportTopInContent, below }: {
  containerHeight: number; stickyTop: number; viewportTopInContent: number; below: number;
}): number {
  const aboveSticky = Math.max(0, viewportTopInContent - stickyTop);
  return Math.max(ROW_AREA_FLOOR, Math.floor(containerHeight - stickyTop - aboveSticky - below));
}

function isScrollable(element: Element): boolean {
  return /(auto|scroll|overlay)/.test(getComputedStyle(element).overflowY);
}

/** Nearest scrollable ancestor; null = the window (document scrolls). */
function scrollContainerOf(element: HTMLElement): HTMLElement | null {
  for (let node = element.parentElement; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    if (isScrollable(node)) return node;
  }
  return null;
}

type Fit = { cap: number; width: number };

/** Reads the geometry (layout effects and observer callbacks only) and normalizes element/window scrolling to one frame. */
function measure(viewport: HTMLElement): Fit {
  const container = scrollContainerOf(viewport);
  const root = document.documentElement;
  const containerHeight = container ? container.clientHeight : window.innerHeight;
  const containerTop = container ? container.getBoundingClientRect().top + container.clientTop : 0;
  const scrollTop = container ? container.scrollTop : window.scrollY;
  const scrollHeight = container ? container.scrollHeight : root.scrollHeight;
  const view = viewport.getBoundingClientRect();
  const sticky = viewport.closest('[data-platform-page]')?.querySelector<HTMLElement>('[data-page-sticky-header]');
  const pageContent = viewport.closest<HTMLElement>('[data-platform-page-content]');
  let contentBottom = containerTop - scrollTop + scrollHeight;
  if (pageContent) {
    contentBottom = pageContent.getBoundingClientRect().bottom;
    // The page content stretches (`flex-1`) to fill a short page; the natural end is its last child plus the bottom padding.
    const last = pageContent.lastElementChild;
    if (last) contentBottom = Math.min(contentBottom, last.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(pageContent).paddingBottom) || 0));
  }
  return {
    cap: availableRowHeight({
      containerHeight,
      stickyTop: sticky ? sticky.getBoundingClientRect().height : 0,
      viewportTopInContent: view.top - containerTop + scrollTop,
      below: Math.max(0, contentBottom - view.bottom),
    }),
    width: viewport.clientWidth,
  };
}

/**
 * Page-fit cap and scrollport width of the row viewport. `viewportRef` is a callback ref: a viewport that is removed
 * (non-ok outcome) and recreated on retry is measured fresh. Observers cover everything that moves the table without
 * a window resize: the scroll container, the page content (banners above/below, siblings), the sticky header, the
 * table root and the viewport itself.
 */
export function useTableFit(section: { current: HTMLElement | null }): {
  viewportRef: (node: HTMLDivElement | null) => void; cap: number | null; width: number | null;
} {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [fit, setFit] = useState<Fit | null>(null);
  const viewportRef = useCallback((next: HTMLDivElement | null) => setNode(next), []);
  useLayoutEffect(() => {
    if (!node) return;
    // Measure here (effect/observer), never inside the state updater: React may run updaters during render.
    const update = () => {
      const next = measure(node);
      setFit(prev => prev && prev.cap === next.cap && prev.width === next.width ? prev : next);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (observer) {
      const targets = new Set<Element>([node, scrollContainerOf(node) ?? document.documentElement]);
      const pageContent = node.closest('[data-platform-page-content]');
      const sticky = node.closest('[data-platform-page]')?.querySelector('[data-page-sticky-header]');
      if (pageContent) targets.add(pageContent);
      if (sticky) targets.add(sticky);
      if (section.current) targets.add(section.current);
      targets.forEach(target => observer.observe(target));
    }
    window.addEventListener('resize', update);
    return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [node, section]);
  return { viewportRef, cap: fit?.cap ?? null, width: fit?.width ?? null };
}
