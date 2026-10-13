// Internal handoff across ReturnLink unmount and the destination PlatformPage mount.
// Document ownership keeps independent browser documents isolated.
const returns = new WeakMap<Document, string>();

export function requestReturnFocus(document: Document, href: string) {
  returns.set(document, new URL(href, document.location.href).href);
}

export function consumeReturnFocus(document: Document): boolean {
  const destination = returns.get(document);
  if (!destination) return false;
  returns.delete(document);
  return destination === document.location.href;
}
