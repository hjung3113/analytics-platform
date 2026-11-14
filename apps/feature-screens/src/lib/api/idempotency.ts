// Single source of Idempotency-Key minting.
//
// FO ADR-0015:72 locks the header to a client-generated UUIDv4, and every mutation
// route rejects anything else with `validation.malformed_idempotency_key`. That
// makes the *fallback* path load-bearing rather than cosmetic: `crypto.randomUUID`
// exists only in a secure context, so any origin that is not https and not
// localhost — a LAN IP during device testing, for instance — falls through to it
// on every POST/PATCH/DELETE.
//
// This module exists because there used to be two fallbacks. `client.ts` minted
// `Math.random().toString(36) + Date.now().toString(36)`, which is not a UUID at
// all, so every mutation that let the client auto-mint failed outright in exactly
// those environments while the ones passing a key from `useIdempotencyKey` (which
// had a correct fallback) kept working.
//
// It is also the package's one UUID generator (#2017): the feature-screens lint
// forbids `crypto.randomUUID` everywhere else, because a direct call throws a
// TypeError outside a secure context. It mirrors `randomUuidV4` of
// `@ap/contracts`, which this package does not depend on.

/** A UUIDv4 suitable for the `Idempotency-Key` header, in any browser context; throws when no Web Crypto exists. */
export function mintIdempotencyKey(): string {
  return randomUuidV4();
}

/** A random UUIDv4 in any browser context (`crypto.randomUUID`, else `getRandomValues`; throws with neither — no `Math.random`); use it for any client-made id, never `crypto.randomUUID()`. */
export function randomUuidV4(): string {
  // eslint-disable-next-line ap/no-browser-random-uuid -- the one guarded call the rule points everyone else to
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  // RFC4122 §4.4 — random bits with the version and variant nibbles pinned. Ids are cryptographic or the mint fails.
  const bytes = new Uint8Array(16);
  if (typeof crypto === 'undefined' || typeof crypto.getRandomValues !== 'function') {
    throw new Error('randomUuidV4: no Web Crypto (crypto.randomUUID and crypto.getRandomValues are both missing); refusing to fall back to Math.random');
  }
  crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => (b ?? 0).toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10, 16).join(''),
  ].join('-');
}
