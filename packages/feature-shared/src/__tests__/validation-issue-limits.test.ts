import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { VALIDATION_ISSUE_LIMITS } from '../validation-issue-limits.js';

describe('VALIDATION_ISSUE_LIMITS', () => {
  it('pins the mock copy (menus cannot import this package) to the shared values', () => {
    const source = readFileSync(fileURLToPath(new URL('../../../../menus/log-dev/log-models/src/mock/issues.ts', import.meta.url)), 'utf8');
    const literal = /const LIMIT = \{([^}]*)\} as const;/.exec(source)?.[1];
    expect(literal).toBeDefined();
    const copy = Object.fromEntries([...(literal ?? '').matchAll(/(\w+):\s*(\d+)/g)].map((m) => [m[1], Number(m[2])]));
    const { evidencePerOccurrence, ...rest } = VALIDATION_ISSUE_LIMITS;
    expect(copy).toEqual({ ...rest, evidence: evidencePerOccurrence });
  });
});
