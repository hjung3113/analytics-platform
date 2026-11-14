/**
 * A random UUIDv4 (RFC 9562 §5.4) in any browser context: the shape an `Idempotency-Key` must have (servers accept only
 * UUIDv4), and a safe unique id anywhere else.
 *
 * `crypto.randomUUID` when it exists; it is missing outside a secure context (plain HTTP on a non-localhost origin), so the
 * fallback fills 16 bytes from `crypto.getRandomValues` and pins the version and variant bits. Without Web Crypto — no
 * `crypto` at all, or a `crypto` object with neither function — it throws: ids come from a cryptographic RNG or not at
 * all, never `Math.random`. Call this instead of `crypto.randomUUID()`, which throws a TypeError there.
 */
export function randomUuidV4(): string {
  const c = typeof crypto === 'undefined' ? undefined : crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  if (typeof c?.getRandomValues !== 'function') {
    throw new Error('randomUuidV4: no Web Crypto (crypto.randomUUID and crypto.getRandomValues are both missing); refusing to fall back to Math.random');
  }
  const bytes = new Uint8Array(16);
  c.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
