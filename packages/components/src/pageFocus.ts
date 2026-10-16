import type { PageNavigation } from '@ap/kernel';

// A disappearing action returns focus to main, or page content outside a shell (06 §26).
export function focusPageFallback(source: HTMLElement | null) {
  const target = source?.closest<HTMLElement>('main[tabindex]')
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
