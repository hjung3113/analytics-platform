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
  const containerHeight = container ? container.clientHeight : window.innerHeight;
  const containerTop = container ? container.getBoundingClientRect().top + container.clientTop : 0;
  const scrollTop = container ? container.scrollTop : window.scrollY;
  const view = viewport.getBoundingClientRect();
  const sticky = viewport.closest('[data-platform-page]')?.querySelector<HTMLElement>('[data-page-sticky-header]');
  const pageContent = viewport.closest<HTMLElement>('[data-platform-page-content]');
  const boundary = pageContent ?? container ?? document.body;
  let contentBottom: number;
  if (pageContent) {
    contentBottom = pageContent.getBoundingClientRect().bottom;
    // The page content stretches (`flex-1`) to fill a short page; the natural end is its last child plus the bottom padding.
    const last = pageContent.lastElementChild;
    if (last) contentBottom = Math.min(contentBottom, last.getBoundingClientRect().bottom + (parseFloat(getComputedStyle(pageContent).paddingBottom) || 0));
  } else {
    // Walk the natural flow end instead of scrollHeight, which includes empty scrollport/flex slack.
    contentBottom = view.bottom;
    for (let child: Element = viewport; child !== boundary && child.parentElement; child = child.parentElement) {
      const parent = child.parentElement;
      for (let sibling = child.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
        contentBottom = Math.max(contentBottom, sibling.getBoundingClientRect().bottom);
      }
      contentBottom += parseFloat(getComputedStyle(parent).paddingBottom) || 0;
    }
  }
  // Other auto-fit viewports contribute a stable floor, on either side of this table. Keeping their
  // current heights here would couple the caps (A = C - B, B = C - A) and allow batched resizes to oscillate.
  let aboveAdjustment = 0, belowAdjustment = 0;
  for (const peer of boundary.querySelectorAll<HTMLElement>('[data-table-auto-fit]')) {
    if (peer === viewport || scrollContainerOf(peer) !== container) continue;
    const peerBox = peer.getBoundingClientRect();
    const adjustment = peerBox.height - ROW_AREA_FLOOR;
    if (peerBox.bottom <= view.top) aboveAdjustment += adjustment;
    else if (peerBox.top >= view.bottom) belowAdjustment += adjustment;
  }
  return {
    cap: availableRowHeight({
      containerHeight,
      stickyTop: sticky ? sticky.getBoundingClientRect().height : 0,
      viewportTopInContent: view.top - containerTop + scrollTop - aboveAdjustment,
      below: Math.max(0, contentBottom - view.bottom - belowAdjustment),
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
    const boundary = node.closest('[data-platform-page-content]') ?? scrollContainerOf(node) ?? document.body;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    let targets = new Set<Element>();
    const rebind = () => {
      const next = new Set<Element>([node, scrollContainerOf(node) ?? document.documentElement]);
      const sticky = node.closest('[data-platform-page]')?.querySelector('[data-page-sticky-header]');
      if (sticky) next.add(sticky);
      if (section.current) next.add(section.current);
      // A flex-filled page can keep its size while nested flow wrappers/siblings move the table.
      for (let child: Element = node; child !== boundary && child.parentElement; child = child.parentElement) {
        next.add(child.parentElement);
        for (const sibling of child.parentElement.children) next.add(sibling);
      }
      targets.forEach(target => { if (!next.has(target)) observer?.unobserve(target); });
      next.forEach(target => { if (!targets.has(target)) observer?.observe(target); });
      targets = next;
      update();
    };
    rebind();
    // Virtual rows mount/unmount inside the viewport on every scroll; only structure outside it changes the flow.
    const mutations = typeof MutationObserver === 'undefined' ? null
      : new MutationObserver(records => { if (records.some(record => !node.contains(record.target))) rebind(); });
    // A peer switching between auto-fit and an explicit height changes this cap without changing any size.
    mutations?.observe(boundary, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-table-auto-fit'] });
    window.addEventListener('resize', update);
    return () => { mutations?.disconnect(); observer?.disconnect(); window.removeEventListener('resize', update); };
  }, [node, section]);
  return { viewportRef, cap: fit?.cap ?? null, width: fit?.width ?? null };
}
