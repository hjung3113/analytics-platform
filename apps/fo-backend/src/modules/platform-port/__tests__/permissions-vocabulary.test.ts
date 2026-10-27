import { describe, expect, it } from 'vitest';

import { PLATFORM_PERMISSION_TABLE } from '../permissions.js';
import { platformVocab } from './platform-vocab.js';

// ADR-0068 "one vocabulary": the kernel's own permissions (@ap/contracts/vocab.json `kernelPermissions`)
// and this module's table must not drift. An app's menu permissions (ADR-0072) are not in either.
const kernelPermissions = (): string[] => platformVocab().kernelPermissions;

describe('platform permission table vs @ap/contracts KERNEL_PERMISSIONS', () => {
  it('lists every kernel permission exactly once and nothing else', () => {
    const vocabulary = kernelPermissions();
    expect(vocabulary.length).toBeGreaterThan(0);
    const tabled = PLATFORM_PERMISSION_TABLE.map((entry) => entry.permission);
    expect([...tabled].sort()).toEqual([...vocabulary].sort());
    for (const permission of vocabulary) {
      expect(
        tabled.filter((p) => p === permission),
        permission,
      ).toHaveLength(1);
    }
  });
});
