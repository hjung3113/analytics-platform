import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { layoutRevision, validateLayout } from '@eqv/core';

// `src/mock/**` may not import `@eqv/core` and no file outside it may import `src/mock/**`, so the fixture is read as a file.
const fixture: unknown = JSON.parse(readFileSync(new URL('./mock/layout-fixture.json', import.meta.url), 'utf8'));

describe('mock layout fixture', () => {
  it('passes validateLayout as an equipment-layout', () => {
    const result = validateLayout(fixture);
    expect(result.issues).toEqual([]);
    expect(result.ok && result.layout.kind).toBe('equipment-layout');
  });

  it('is synthetic: neutral ids and a synthetic source only', () => {
    const text = JSON.stringify(fixture);
    expect(text).toContain('"license":"synthetic"');
    expect(text).not.toMatch(/eq-synth|samsung|tel|asml|applied|lam/i);
  });

  it('the mock\'s FIXTURE_REVISION constant is the real layoutRevision hash of the fixture', async () => {
    const result = validateLayout(fixture);
    if (!result.ok) throw new Error('fixture invalid');
    // `src/mock/**` is not importable from here (lint), so the constant is read from the source; `mock/index.test.ts` proves the seed uses it.
    const stored = /FIXTURE_REVISION = '(sha256:[0-9a-f]{64})'/.exec(readFileSync(new URL('./mock/store.ts', import.meta.url), 'utf8'))?.[1];
    expect(stored).toBe(await layoutRevision(result.layout));
  });
});
