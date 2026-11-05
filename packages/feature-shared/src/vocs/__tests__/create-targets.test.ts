import { describe, expect, it } from 'vitest';

import { vocCreateTargetsSchema } from '../create-targets.js';

const id = '00000000-0000-4000-8000-000000000001';

describe('vocCreateTargetsSchema', () => {
  it('accepts an open and a closed target', () => {
    const parsed = vocCreateTargetsSchema.parse({
      items: [
        { managed_system_id: id, allowed: true },
        { managed_system_id: id, allowed: false, reason: 'restricted' },
      ],
    });
    expect(parsed.items).toHaveLength(2);
  });

  it.each([
    ['an unknown reason', { managed_system_id: id, allowed: false, reason: 'denied' }],
    ['an extra key', { managed_system_id: id, allowed: true, mode: 'open' }],
    ['a non-uuid id', { managed_system_id: 'x', allowed: true }],
  ])('rejects %s', (_label, item) => {
    expect(vocCreateTargetsSchema.safeParse({ items: [item] }).success).toBe(false);
  });
});
