import { describe, expect, it } from 'vitest';

import { platformSystemsFileSchema } from '../platform-systems.js';

describe('platformSystemsFileSchema (ADR-0110 decision 5)', () => {
  it('accepts the committed shape, including an empty declaration', () => {
    expect(
      platformSystemsFileSchema.safeParse({
        version: 1,
        systems: [{ space_id: 'mars', name: 'MARS' }],
      }).success,
    ).toBe(true);
    expect(platformSystemsFileSchema.safeParse({ version: 1, systems: [] }).success).toBe(true);
  });

  it.each([
    ['unknown version', { version: 2, systems: [] }],
    ['missing systems', { version: 1 }],
    ['blank name', { version: 1, systems: [{ space_id: 'mars', name: ' ' }] }],
    ['blank space id', { version: 1, systems: [{ space_id: '', name: 'MARS' }] }],
    ['extra key', { version: 1, systems: [{ space_id: 'mars', name: 'MARS', x: 1 }] }],
    [
      'duplicate space id',
      {
        version: 1,
        systems: [
          { space_id: 'mars', name: 'A' },
          { space_id: 'mars', name: 'B' },
        ],
      },
    ],
  ])('rejects %s', (_label, value) => {
    expect(platformSystemsFileSchema.safeParse(value).success).toBe(false);
  });
});
