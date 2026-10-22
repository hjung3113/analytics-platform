import { describe, expect, it } from 'vitest';

import { PLATFORM_PERMISSION_TABLE } from '../permissions.js';
import { platformVocab } from './platform-vocab.js';

// ADR-0068 "one vocabulary": the platform's `PERMISSIONS` list (@ap/contracts/vocab.json) and
// this module's table must not drift.
const platformPermissions = (): string[] => platformVocab().permissions;

describe('platform permission table vs @ap/contracts PERMISSIONS', () => {
  it('lists every platform permission exactly once and nothing else', () => {
    const vocabulary = platformPermissions();
    expect(vocabulary.length).toBeGreaterThan(0);
    const tabled = PLATFORM_PERMISSION_TABLE.map((entry) => entry.permission);
    for (const permission of vocabulary) {
      expect(
        tabled.filter((p) => p === permission),
        permission,
      ).toHaveLength(1);
    }
    expect(tabled.filter((p) => !vocabulary.includes(p))).toEqual([]);
  });
});
