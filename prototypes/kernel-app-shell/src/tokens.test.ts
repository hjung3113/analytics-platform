import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { shellDimensions } from './App';
it('consumes current canonical DESIGN and 06 dimensions, not a competing baseline', () => {
  const design = readFileSync('../../DESIGN.md', 'utf8');
  const contract = readFileSync('../../docs/06_platform_ui_contract.md', 'utf8');
  expect(Number(design.match(/sidebar-shell:\n(?:[^\n]*\n)*?\s+width: (\d+)px/)?.[1])).toBe(shellDimensions.expanded);
  expect(Number(design.match(/top-bar:\n(?:[^\n]*\n)*?\s+height: (\d+)px/)?.[1])).toBe(shellDimensions.header);
  expect(Number(contract.match(/Sidebar collapsed\s+(\d+)px/)?.[1])).toBe(shellDimensions.collapsed);
});
