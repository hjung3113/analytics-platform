/**
 * A client-made correlation id (`client-…`): the id the person sees on a client-side error screen and the id a
 * client-error report carries (`ClientErrorReport.correlationId`). Servers accept a report only with the `client-`
 * prefix, at most 80 characters, and adopt it as `X-Correlation-Id` only within `[A-Za-z0-9._-]{1,128}`
 * (http-adapter-contract §7); every form below stays inside both.
 *
 * `crypto.randomUUID` when it exists; it is missing outside a secure context (plain HTTP), so the fallback is the
 * epoch ms in hex plus random hex from `crypto.getRandomValues`, or `Math.random` where no Web Crypto exists.
 * Two failures in the same millisecond still get different ids.
 */
export function clientCorrelationId(): string {
  const c = typeof crypto === 'undefined' ? undefined : crypto;
  if (typeof c?.randomUUID === 'function') return `client-${c.randomUUID()}`;
  let rand: string;
  if (c) {
    const bytes = c.getRandomValues(new Uint8Array(8));
    rand = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  } else {
    rand = Math.random().toString(16).slice(2, 18).padEnd(16, '0');
  }
  return `client-${Date.now().toString(16)}-${rand}`;
}
