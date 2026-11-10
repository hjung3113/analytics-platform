// Production graph guard (platform ADR-0009 approach, ADR-0119 §7): the production entry's import closure holds no synthetic adapter, no
// contract-suite helper and no dev assembly; the dev/test assembly does inject the synthetic adapter. Static, DB-free.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createDevLogExplorerModule } from '../../../test-support/log-explorer-dev-assembly.js';
import { createSyntheticScenario } from '../adapters/synthetic/index.js';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const FORBIDDEN = [`modules${sep}log-explorer${sep}adapters${sep}synthetic${sep}`, `modules${sep}log-explorer${sep}testing${sep}`, `${sep}test-support${sep}`, `${sep}__tests__${sep}`];
const IMPORT = /(?:from|import)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g;

/** Relative-import closure of `entry`. `read` returns the file text or null. Resolves `./x.js` to `./x.ts`. */
export function closure(entry: string, read: (file: string) => string | null): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    const text = read(file);
    if (text === null) continue;
    for (const match of text.matchAll(IMPORT)) {
      const spec = match[1] as string;
      const base = resolve(dirname(file), spec.replace(/\.js$/, ''));
      for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) if (read(candidate) !== null) { queue.push(candidate); break; }
    }
  }
  return seen;
}
const readDisk = (file: string) => (existsSync(file) && statSync(file).isFile() ? readFileSync(file, 'utf8') : null);
const forbiddenIn = (files: Set<string>) => [...files].map((f) => relative(SRC, f)).filter((f) => FORBIDDEN.some((bad) => f.includes(bad)));

describe('production graph', () => {
  it('the production entry reaches no synthetic adapter, contract-suite helper, test-support or test file', () => {
    const files = closure(join(SRC, 'index.ts'), readDisk);
    expect(files.size).toBeGreaterThan(50);
    expect(forbiddenIn(files)).toEqual([]);
  });

  it('the log-explorer barrel alone reaches nothing forbidden', () => {
    const files = closure(join(SRC, 'modules/log-explorer/index.ts'), readDisk);
    expect([...files].some((f) => f.endsWith(`log-explorer${sep}index.ts`))).toBe(true);
    expect(forbiddenIn(files)).toEqual([]);
  });

  it('the check itself catches a synthetic import (negative control)', () => {
    const fake: Record<string, string> = {
      [join(SRC, 'a.ts')]: "import { x } from './modules/log-explorer/index.js';",
      [join(SRC, 'modules/log-explorer/index.ts')]: "export * from './adapters/synthetic/index.js';",
      [join(SRC, 'modules/log-explorer/adapters/synthetic/index.ts')]: 'export const x = 1;',
    };
    expect(forbiddenIn(closure(join(SRC, 'a.ts'), (f) => fake[f] ?? null))).toEqual([`modules${sep}log-explorer${sep}adapters${sep}synthetic${sep}index.ts`]);
  });

  it('the dev/test assembly injects the synthetic adapter and says so', async () => {
    const module = createDevLogExplorerModule({ db: {} as never, clock: () => new Date(0), lifecycleRead: { getRoundSampleSet: async () => null }, audit: {} as never });
    const { sampleSet } = createSyntheticScenario('typical');
    const described = await module.sourceRead.describe({ sourceOwner: sampleSet.sourceOwner }, { signal: new AbortController().signal, timeBudgetMs: 1000 });
    expect(described).toMatchObject({ status: 'ok', synthetic: true });
    const rows = await module.sourceRead.searchRecords({ sampleSet, query: {}, cursor: null, limit: 5 }, { signal: new AbortController().signal, timeBudgetMs: 1000 });
    if (rows.status !== 'ok') throw new Error('not ok');
    expect(rows.rows.every((r) => r.synthetic)).toBe(true);
  });

  it('only dev/test code imports the synthetic adapter', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        if (statSync(full).isDirectory()) { walk(full); continue; }
        if (!full.endsWith('.ts')) continue;
        const rel = relative(SRC, full);
        if (rel.startsWith(`modules${sep}log-explorer${sep}adapters${sep}synthetic${sep}`) || rel.includes(`${sep}__tests__${sep}`) || rel.startsWith(`test-support${sep}`) || /\.test\.ts$/.test(rel)) continue;
        if (readFileSync(full, 'utf8').replace(/\/\/.*$/gm, '').includes('adapters/synthetic')) offenders.push(rel);
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
