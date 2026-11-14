// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('uses the bridge UUID predicate for space links instead of a private pattern (#2014 FEA-15)', () => {
  const source = readFileSync(fileURLToPath(new URL('./space-links.ts', import.meta.url)), 'utf8');
  expect(source).toMatch(/import \{ isUuid \} from '\.\/uuid'/);
  expect(source).not.toMatch(/const UUID\s*=/);
  expect(source).toContain('isUuid(platform)');
  expect(source).toContain('isUuid(managedSystemId)');
});
