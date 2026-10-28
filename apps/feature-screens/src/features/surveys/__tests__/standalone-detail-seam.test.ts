import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// The platform's Survey detail entry exports these production parts; keep their direct imports
// free of the API barrel, sonner and the TanStack router.
it('keeps Survey detail parts free of the api barrel, sonner and the TanStack router', () => {
  const source = readFileSync(
    resolve(__dirname, '../components/detail/SurveyDetailParts.tsx'),
    'utf8',
  );
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  expect(imports.length).toBeGreaterThan(0);
  for (const specifier of imports) {
    expect(specifier).not.toMatch(/^@\/lib\/api(\/index)?$|^sonner$|^@tanstack\/react-router$/);
  }
});
