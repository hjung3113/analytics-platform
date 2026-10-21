import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PLATFORM_PERMISSION_TABLE } from '../permissions.js';

// ADR-0068 "one vocabulary": the platform's `PERMISSIONS` list (repo root, outside this
// workspace — read as text, not imported) and this module's table must not drift.
const MENU_TS = new URL('../../../../../../../../packages/contracts/src/menu.ts', import.meta.url);

function platformPermissions(): string[] {
  const text = readFileSync(MENU_TS, 'utf8');
  const list = /export const PERMISSIONS\s*=\s*\[([^\]]*)\]/.exec(text)?.[1];
  if (list === undefined) throw new Error('PERMISSIONS list not found in menu.ts');
  return [...list.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe('platform permission table vs packages/contracts PERMISSIONS', () => {
  it('lists every platform permission exactly once and nothing else', () => {
    const vocabulary = platformPermissions();
    expect(vocabulary.length).toBeGreaterThan(0);
    const tabled = PLATFORM_PERMISSION_TABLE.map((entry) => entry.permission);
    for (const permission of vocabulary) {
      expect(tabled.filter((p) => p === permission), permission).toHaveLength(1);
    }
    expect(tabled.filter((p) => !vocabulary.includes(p))).toEqual([]);
  });
});
