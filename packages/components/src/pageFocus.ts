import type { PageNavigation } from '@ap/kernel';

export const PANE_ROOT_SELECTOR = '[data-pane-id]';

export function paneRootOf(el: HTMLElement | null): HTMLElement | null {
  return el?.closest<HTMLElement>(PANE_ROOT_SELECTOR) ?? null;
}

export function paneRootById(id: string): HTMLElement | null {
  return Array.from(document.querySelectorAll<HTMLElement>(PANE_ROOT_SELECTOR)).find(el => el.dataset.paneId === id) ?? null;
}

export function detailFocusFallback(
  opener: HTMLElement | null,
  paneRoot: HTMLElement | null,
  available: (element: HTMLElement | null) => element is HTMLElement,
): HTMLElement | null {
  const visiblePane = Array.from(document.querySelectorAll<HTMLElement>(`${PANE_ROOT_SELECTOR}[tabindex]`)).find(available) ?? null;
  return available(opener) ? opener : available(paneRoot) ? paneRoot : visiblePane
    ?? document.querySelector<HTMLElement>('[data-page-heading][tabindex]') ?? document.getElementById('platform-main');
}

// A disappearing action returns focus to its pane root (a board pane, ADR-0049), else main, or page content outside a shell (06 §26).
export function focusPageFallback(source: HTMLElement | null) {
  const target = source?.closest<HTMLElement>(`${PANE_ROOT_SELECTOR}[tabindex]`)
    ?? source?.closest<HTMLElement>('main[tabindex]')
    ?? source?.closest<HTMLElement>('[data-platform-page-content]')
    ?? source?.querySelector<HTMLElement>('[data-platform-page-content]');
  target?.focus({ preventScroll: true });
}

// ReturnLink calls this after its synchronous Kernel navigation, before the destination commits.
export function requestReturnFocus(navigation: PageNavigation, href: string) {
  navigation.requestReturn(href);
}

export function consumePageFocus(navigation: PageNavigation, path: string) {
  return navigation.consume(path);
}
