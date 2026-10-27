import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// The standalone SurveyDetail wrapper is outside the platform bridge's entry graph on purpose (`fo-entry-graph.test.ts` asserts it is absent there), so that graph
// guard cannot see it; this keeps it free of what the bridge's entries must not reach: the `@/lib/api` barrel, `sonner` and the TanStack router.
it('keeps the standalone SurveyDetail wrapper free of the api barrel, sonner and the TanStack router', () => {
  const source = readFileSync(resolve(__dirname, '../components/detail/SurveyDetail.tsx'), 'utf8');
  const imports = [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]);
  expect(imports.length).toBeGreaterThan(0);
  for (const specifier of imports) {
    expect(specifier).not.toMatch(/^@\/lib\/api(\/index)?$|^sonner$|^@tanstack\/react-router$/);
  }
});
