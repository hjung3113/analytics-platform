import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll } from 'vitest';
import { registerDefaultHost } from '../lib/host/host-seam';

// Screens that read the host seam keep working in tests without wrapping (a test that needs none calls clearDefaultHost()).
// Imported in beforeAll, after the test file's vi.mock calls are registered: a static import here would bind the real
// `@tanstack/react-router` Link and `sonner` before a file mocks them.
beforeAll(async () => {
  const { tanstackHost } = await import('@/test/host-adapters/lib/host/tanstack-host');
  registerDefaultHost(tanstackHost);
});

// Vitest's `globals: false` config means @testing-library/react does NOT
// auto-register cleanup. Wire it explicitly so DOM nodes from prior tests
// don't leak into queries.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement window.scrollTo; TanStack Router's
// scroll-restoration hook calls it on every transition. Stub to keep test
// logs free of "Not implemented" noise.
if (typeof window !== 'undefined' && !window.scrollTo) {
  Object.defineProperty(window, 'scrollTo', { value: () => {}, writable: true });
} else if (typeof window !== 'undefined') {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}

// jsdom doesn't implement Element.prototype.scrollIntoView. Radix Select
// calls it on the selected item when its content mounts, and the throw
// unmounts the whole tree — every query after that sees an empty body.
// Real browsers (and the Playwright visual harness) have it.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    value: () => {},
    writable: true,
  });
}

// jsdom has no ResizeObserver; cmdk's CommandList observes its sizer to keep
// the selected row scrolled into view (#611). Same class of gap as
// scrollIntoView above — real browsers have it.
if (typeof globalThis.ResizeObserver === 'undefined') {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;
}
