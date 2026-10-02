/**
 * Production-graph check (#153, ADR-0009), run in CI after `pnpm build`:
 *   node scripts/check-prod-graph.ts               → OK, or exit 1 listing every mock/dev module in the graph
 *   node scripts/check-prod-graph.ts --force-mock  → proves the check bites: resolves the assembly to the mock
 *                                                    assembly, so the same check must exit 1
 * Builds the production graph in memory (`build.write: false`) with `#platform-assembly` left external, so the
 * real assembly (#154) is neither needed nor bundled. AP_PROD_GRAPH_CHECK=1 tells vite.config.ts not to demand
 * AP_PLATFORM_ASSEMBLY; nothing else sets it.
 */
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { findForbiddenModules } from './prod-graph.ts';

const SPECIFIER = '#platform-assembly';
const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK_ASSEMBLY = fileURLToPath(new URL('../src/dev/mock-assembly.tsx', import.meta.url));
const forceMock = process.argv.includes('--force-mock');

process.env.AP_PROD_GRAPH_CHECK = '1';
const result = await build({
  root: APP_ROOT,
  mode: 'production',
  logLevel: 'error',
  ...(forceMock ? { resolve: { alias: { [SPECIFIER]: MOCK_ASSEMBLY } } } : {}),
  build: { write: false, rollupOptions: forceMock ? {} : { external: [SPECIFIER] } },
});

const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
const chunks = outputs.flatMap(o => o.output).filter((c): c is Rollup.OutputChunk => c.type === 'chunk');
const ids = new Set(chunks.flatMap(c => c.moduleIds));
const offenders = findForbiddenModules(ids);
const external = chunks.some(c => c.imports.includes(SPECIFIER)) && ![...ids].some(id => id.includes(SPECIFIER));

if (offenders.length > 0 || !external) {
  console.error(`check:prod-graph FAILED${forceMock ? ' (--force-mock)' : ''} — the production graph must not bundle mock/dev code (ADR-0009)`);
  if (!external) console.error(`  - '${SPECIFIER}' was bundled instead of left external`);
  for (const o of offenders) console.error(`  - [${o.rule}] ${o.id}`);
  process.exit(1);
}
console.log(`check:prod-graph OK — ${ids.size} modules in the production graph, no mock/dev modules, ${SPECIFIER} external`);
