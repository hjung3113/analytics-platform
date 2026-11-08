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

export { createSyntheticHierarchySource, type SyntheticHierarchyOptions } from './hierarchy/syntheticHierarchy';

/** Nonzero jsdom geometry for the real hierarchy virtualizer; restores every descriptor it changes. */
export function stubHierarchyGeometry(): () => void {
  const names = ['clientHeight', 'clientWidth', 'scrollHeight', 'offsetHeight', 'offsetWidth', 'scrollIntoView', 'scrollTo'] as const;
  const descriptors = names.map(name => [name, Object.getOwnPropertyDescriptor(HTMLElement.prototype, name)] as const);
  for (const name of ['clientHeight', 'offsetHeight']) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get() { return (this as HTMLElement).hasAttribute('data-hierarchy-scroll') ? 340 : 800; } });
  for (const name of ['clientWidth', 'offsetWidth']) Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get() { return 224; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return parseFloat((this as HTMLElement).firstElementChild instanceof HTMLElement ? ((this as HTMLElement).firstElementChild as HTMLElement).style.getPropertyValue('--hierarchy-total') : '') || 800; } });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn(function (this: HTMLElement, options: ScrollToOptions) { this.scrollTop = options.top ?? 0; queueMicrotask(() => { if (this.isConnected) this.dispatchEvent(new Event('scroll')); }); }) });
  const previousObserver = globalThis.ResizeObserver;
  vi.stubGlobal('ResizeObserver', class { constructor(private callback: ResizeObserverCallback) {} observe(target: Element) { queueMicrotask(() => this.callback([{ target, contentRect: { width: 224, height: target.hasAttribute('data-hierarchy-scroll') ? 340 : 800 }, borderBoxSize: [{ inlineSize: 224, blockSize: 340 }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver)); } unobserve() {} disconnect() {} });
  const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { const height = this.hasAttribute('data-hierarchy-scroll') ? 340 : 800; return { width: 224, height, x: 0, y: 0, top: 0, left: 0, right: 224, bottom: height, toJSON() {} }; });
  return () => { rect.mockRestore(); vi.stubGlobal('ResizeObserver', previousObserver); for (const [name, descriptor] of descriptors) { if (descriptor) Object.defineProperty(HTMLElement.prototype, name, descriptor); else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name]; } };
}
