import { expect, test as base } from '@playwright/test';

/**
 * Same-origin guard (#2897, #1705 §3): every spec imports `test` from here, never from '@playwright/test' (lint enforces it).
 * The auto fixture records every request the test's browser context makes and fails the test when one leaves the app's origin.
 * The assembled app must run with no network beyond its own server; a font, analytics beacon or CDN script would break that
 * on a closed network, and this is the only check that watches the running screens rather than the build output.
 */

/** Schemes the browser serves without leaving the page, so they are not requests to another origin. */
const LOCAL_SCHEMES: ReadonlySet<string> = new Set(['data:', 'blob:', 'about:']);

/** Requests whose origin is not `baseURL`'s, in the order made. */
export function foreignRequests(urls: readonly string[], baseURL: string): string[] {
  const origin = new URL(baseURL).origin;
  return urls.filter(raw => {
    const url = new URL(raw);
    return !LOCAL_SCHEMES.has(url.protocol) && url.origin !== origin;
  });
}

export const test = base.extend<{ sameOriginOnly: void }>({
  sameOriginOnly: [async ({ context, baseURL }, use) => {
    const seen: string[] = [];
    context.on('request', request => { seen.push(request.url()); });
    await use();
    expect(foreignRequests(seen, baseURL ?? ''), 'requests to another origin (#2897)').toEqual([]);
  }, { auto: true }],
});

export { expect };
