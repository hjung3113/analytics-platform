import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { PLATFORM_SPACE_IDS, PLATFORM_USAGE_VIA } from '../usage.js';

// ADR-0068 "one vocabulary": the root contracts (outside this workspace — read as text, not
// imported) and this module's lists must not drift.
const ROOT = new URL('../../../../../../../../packages/contracts/src/', import.meta.url);

function unionMembers(file: string, typeName: string): string[] {
  const text = readFileSync(new URL(file, ROOT), 'utf8');
  const decl = new RegExp(`export type ${typeName}\\s*=\\s*([^;]+);`).exec(text)?.[1];
  if (decl === undefined) throw new Error(`${typeName} not found in ${file}`);
  return [...decl.matchAll(/'([^']+)'/g)].map((m) => m[1] as string);
}

describe('usage vocabulary vs packages/contracts', () => {
  it('UsageVia lists the adapter.ts union exactly', () => {
    const members = unionMembers('adapter.ts', 'UsageVia');
    expect(members.length).toBeGreaterThan(0);
    expect([...PLATFORM_USAGE_VIA].sort()).toEqual([...members].sort());
  });

  it('SpaceId lists the menu.ts union exactly', () => {
    const members = unionMembers('menu.ts', 'SpaceId');
    expect(members.length).toBeGreaterThan(0);
    expect([...PLATFORM_SPACE_IDS].sort()).toEqual([...members].sort());
  });
});
