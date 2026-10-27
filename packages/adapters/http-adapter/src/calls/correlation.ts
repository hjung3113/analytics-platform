const HEADER_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** `req-<epoch ms in hex>-<random hex>`; `crypto.getRandomValues` works on plain HTTP, `randomUUID` does not (contract §7). */
export function newRequestId(): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const rand = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `req-${Date.now().toString(16).padStart(16, '0')}-${rand}`;
}

/** A server id is shown on screen, so only the header-safe shape the server itself accepts is adopted. */
export function isSafeCorrelationId(value: string | null | undefined): value is string {
  return typeof value === 'string' && HEADER_ID.test(value);
}
