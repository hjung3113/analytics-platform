import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { canonicalSpecifier } from '../../../test/canonical-specifier';

// The platform's Survey detail entry exports these production parts; keep their direct imports
// free of the API barrel, sonner and the TanStack router.
it('keeps Survey detail parts free of the api barrel, sonner and the TanStack router', () => {
  const file = resolve(__dirname, '../components/detail/SurveyDetailParts.tsx');
  const source = readFileSync(file, 'utf8');
  const sourceRoot = resolve(__dirname, '../../..');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => canonicalSpecifier(file, match[1] ?? '', sourceRoot));
  expect(imports.length).toBeGreaterThan(0);
  for (const specifier of imports) {
    expect(specifier).not.toMatch(/^@\/lib\/api(\/index)?$|^sonner$|^@tanstack\/react-router$/);
  }
});
