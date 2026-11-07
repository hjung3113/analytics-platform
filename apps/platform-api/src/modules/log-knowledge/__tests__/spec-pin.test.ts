import { describe, expect, it } from 'vitest';

import type { EffectiveChange } from '../domain/spec-effective.js';
import { changeSetDigest } from '../domain/spec-pin.js';

const change = (id: string, over: Partial<EffectiveChange> = {}): EffectiveChange => ({
  id,
  targetKind: 'event',
  targetKey: 'spindle/start',
  changeKind: 'changed',
  change: { before: { name: 'a' }, after: { name: 'b' } },
  needsRevalidation: false,
  ...over,
});

describe('changeSetDigest (round spec pin, #1444 c)', () => {
  it('is a SHA-256 hex and the same for the same changes, whatever the key order of the body', () => {
    const a = changeSetDigest([change('c1'), change('c2')]);
    const b = changeSetDigest([change('c1', { change: { after: { name: 'b' }, before: { name: 'a' } } }), change('c2')]);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(b).toBe(a);
  });

  it('an empty change list has a stable digest and an added change changes it', () => {
    const none = changeSetDigest([]);
    expect(none).toBe(changeSetDigest([]));
    expect(changeSetDigest([change('c1')])).not.toBe(none);
  });

  it('apply order matters and needsRevalidation is not part of the digest', () => {
    expect(changeSetDigest([change('c1'), change('c2')])).not.toBe(changeSetDigest([change('c2'), change('c1')]));
    expect(changeSetDigest([change('c1', { needsRevalidation: true })])).toBe(changeSetDigest([change('c1')]));
  });
});
