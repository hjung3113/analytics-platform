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

/**
 * Brings `element` into view in the workspace's own scroll container only (`scrollContainerOf(workspaceRoot)`: `#platform-main` on a page, the pane
 * body on a board), `nearest` semantics, below the sticky page chrome. Never `scrollIntoView`: that would also move the engine's inner containers. An
 * element inside a dock panel counts by its rect clamped to the panel's. No-op for an element outside that container (a portaled menu, the rail)
 * or inside the sticky chrome. Reads layout.
 */
export function revealInScrollContainer(element: HTMLElement, workspaceRoot: HTMLElement): void {
  const container = scrollContainerOf(workspaceRoot);
  if (!container || !container.contains(element)) return;
  const page = workspaceRoot.closest('[data-platform-page]');
  if (stickyChromeOf(page).some(chrome => chrome.contains(element))) return;
  const own = element.getBoundingClientRect();
  const panel = element.closest('[data-dock-panel]')?.getBoundingClientRect();
  const rectTop = panel ? Math.max(own.top, panel.top) : own.top;
  const rectBottom = panel ? Math.min(own.bottom, panel.bottom) : own.bottom;
  if (rectBottom < rectTop) return;
  const box = container.getBoundingClientRect();
  const top = box.top + stickyChromeHeight(page);
  const bottom = box.top + container.clientHeight;
  // A target larger than the visible area that spans it already shows as much as it can: nearest means no scroll.
  if (rectTop < top && rectBottom > bottom) return;
  if (rectTop < top) container.scrollTop += rectTop - top;
  else if (rectBottom > bottom) container.scrollTop += Math.min(rectBottom - bottom, rectTop - top);
}

/** Scrolls the workspace's scroll container so `element` sits directly under the sticky page chrome (a new row's header, the workspace top on maximize). Reads layout. */
export function alignUnderChrome(element: HTMLElement, workspaceRoot: HTMLElement): void {
  const container = scrollContainerOf(workspaceRoot);
  if (!container) return;
  const top = container.getBoundingClientRect().top + stickyChromeHeight(workspaceRoot.closest('[data-platform-page]'));
  container.scrollTop += element.getBoundingClientRect().top - top;
}

/** How many animation frames a scroll restore keeps trying while the page is still shorter than the saved offset. */
const RESTORE_FRAMES = 12;

/**
 * Puts `container` back at `offset` after a layout change that shrank it (the maximize box). The browser clamps `scrollTop` to the scroll room that
 * exists when it is written, and the dock engine re-fits its rows after the commit, so a short page (collapsed query bar) can clamp the write to 0.
 * Writes now, then retries each frame until the offset holds or `RESTORE_FRAMES` have passed. A wheel, touch, key or pointer press on the container
 * after the first frame (seen in the capture phase, so a child that stops the event still counts) means the user has taken over and ends the retries. Returns a cancel function.
 */
export function restoreScrollOffset(container: HTMLElement, offset: number): () => void {
  let frame = 0;
  let stopped = false;
  const takeOver = () => stop();
  const stop = () => {
    stopped = true;
    if (frame) cancelAnimationFrame(frame);
    for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) container.removeEventListener(type, takeOver, { capture: true });
  };
  container.scrollTop = offset;
  let left = RESTORE_FRAMES;
  let watching = false;
  const step = () => {
    frame = 0;
    if (stopped || !container.isConnected) return stop();
    if (!watching) {
      // Attached a frame late on purpose: the key press or click that triggered the restore (Escape, the restore button) is often still bubbling to
      // the container when this runs, and it must not count as the user taking over.
      watching = true;
      for (const type of ['wheel', 'touchstart', 'keydown', 'pointerdown']) container.addEventListener(type, takeOver, { capture: true, passive: true });
    }
    if (Math.abs(container.scrollTop - offset) <= 1 || left-- <= 0) return stop();
    container.scrollTop = offset;
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return stop;
}
