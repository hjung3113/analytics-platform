import { afterEach, describe, expect, it, vi } from 'vitest';
import { randomUuidV4 } from '@ap/contracts';

// The servers accept an Idempotency-Key only in this shape (UUIDv4: version nibble 4, variant 8–b).
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => { vi.unstubAllGlobals(); });

describe('randomUuidV4', () => {
  it('uses crypto.randomUUID where it exists', () => {
    expect(randomUuidV4()).toMatch(UUID_V4);
  });

  it('builds a UUIDv4 from getRandomValues outside a secure context (plain HTTP has no randomUUID)', () => {
    vi.stubGlobal('crypto', { getRandomValues: globalThis.crypto.getRandomValues.bind(globalThis.crypto) });
    const keys = new Set(Array.from({ length: 200 }, () => randomUuidV4()));
    for (const key of keys) expect(key).toMatch(UUID_V4);
    expect(keys.size).toBe(200);
  });

  // No `Math.random` fallback (#2017 fix): without a cryptographic RNG the mint fails loudly, whatever the shape of the
  // missing Web Crypto. `@ap/feature-screens` `randomUuidV4` is kept behaviourally identical, down to the same throw.
  it.each([
    ['crypto undefined', undefined],
    ['an incomplete crypto object (no randomUUID, no getRandomValues)', {}],
  ])('throws instead of falling back to Math.random: %s', (_label, stub) => {
    vi.stubGlobal('crypto', stub);
    expect(() => randomUuidV4()).toThrow(/Web Crypto/);
  });
});
