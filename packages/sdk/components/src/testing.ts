// Test-only public entry `@ap/components/testing` (ADR-0040 extension, #413): the PlatformDataTable geometry stub.
// Import only from test files (*.test.ts(x), test-support.ts, test-setup.ts); the boundary lint rejects production imports.
// Components' own tests import it as `./testing`. Deliberately not exported from src/index.ts.
import { vi } from 'vitest';
import { SCROLLPORT_LABEL } from './scrollportLabel';

const SCROLLPORT_LABELS: readonly string[] = Object.values(SCROLLPORT_LABEL);

/**
 * jsdom has no layout: gives the table a 1280×800 page and a scrollport `scrollportWidth` wide (default 220, inside the
 * ADR-0037 compact action range of 192–248px), so `rowAction` is called with `compact: true`. Returns the restore function;
 * call it in `afterEach` (it undoes the prototype properties, the ResizeObserver global and the getBoundingClientRect spy).
 */
export function stubCompactTableGeometry(scrollportWidth = 220): () => void {
  const clientWidth = Object.getOwnPropertyDescriptor(Element.prototype, 'clientWidth');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get() { return 800; } });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get() { return 1280; } });
  Object.defineProperty(Element.prototype, 'clientWidth', { configurable: true, get() { return SCROLLPORT_LABELS.includes((this as Element).getAttribute('aria-label') ?? '') ? scrollportWidth : 0; } });
  vi.stubGlobal('ResizeObserver', class { constructor(private cb: ResizeObserverCallback) {} observe(target: Element) { this.cb([{ target, contentRect: { width: 1280, height: 800 } } as ResizeObserverEntry], this as unknown as ResizeObserver); } unobserve() {} disconnect() {} });
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 1280, height: 800, x: 0, y: 0, top: 0, left: 0, right: 1280, bottom: 800, toJSON() {} }));
  return () => {
    rect.mockRestore();
    vi.unstubAllGlobals();
    if (clientWidth) Object.defineProperty(Element.prototype, 'clientWidth', clientWidth); else delete (Element.prototype as unknown as Record<string, unknown>).clientWidth;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetHeight;
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).offsetWidth;
  };
}
