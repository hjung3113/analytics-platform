import type { PageNavigation } from '@ap/kernel';

// ReturnLink calls this after its synchronous Kernel navigation, before the destination commits.
export function requestReturnFocus(navigation: PageNavigation, href: string) {
  navigation.requestReturn(href);
}

export function consumePageFocus(navigation: PageNavigation, path: string) {
  return navigation.consume(path);
}
