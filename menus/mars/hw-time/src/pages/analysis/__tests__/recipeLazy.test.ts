import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
/** Static relative imports only: `import(...)` is a separate chunk and is not followed. */
function staticGraph(entry: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    if (file.includes('?raw')) return;
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/^\s*(?:import|export)\s[^;]*?from\s+['"](\.[^'"]+)['"]/gm)) {
      const spec = match[1]!;
      if (/^\s*(?:import|export)\s+type\s/.test(match[0])) continue;
      const [path, query] = spec.split('?');
      const base = resolve(dirname(file), path!);
      const found = [base, `${base}.ts`, `${base}.tsx`, resolve(base, 'index.ts')].find(candidate => existsSync(candidate) && !candidate.endsWith('/'));
      if (!found) continue;
      visit(query ? `${found}?${query}` : found);
    }
  };
  visit(resolve(here, '../AnalysisWorkspace.tsx'));
  return seen;
}

describe('panel recipe stays out of the HW Time screen chunk (v0.40 review-quality Q3)', () => {
  it('the workspace reaches no ?raw source and no recipe model through static imports', () => {
    const graph = [...staticGraph(resolve(here, '../AnalysisWorkspace.tsx'))];
    expect(graph.filter(file => file.includes('?raw'))).toEqual([]);
    expect(graph.filter(file => file.endsWith('/recipeModel.ts'))).toEqual([]);
  });
});
