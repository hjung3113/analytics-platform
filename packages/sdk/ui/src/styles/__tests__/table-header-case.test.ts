import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

it('preserves declared case in the shared table header style', () => {
  const css = readFileSync(resolve(__dirname, '../index.css'), 'utf8');
  const header = css.match(/\.t-table-header\s*\{([^}]+)\}/);
  expect(header).not.toBeNull();
  expect(header?.[1]).not.toMatch(/text-transform:\s*(?:upper|lower)case/);
});
