/**
 * Production-graph check (#153, ADR-0009), run in CI after `pnpm build`:
 *   node scripts/check-prod-graph.ts                     → OK, or exit 1 listing every mock/dev module in the graph
 *   node scripts/check-prod-graph.ts --force-mock        → proves this check bites: the assembly is bundled as the
 *                                                          mock assembly, so the same check must exit 1
 *   node scripts/check-prod-graph.ts --force-mock-build  → proves the build-time guard bites: a real production
 *                                                          build with AP_PLATFORM_ASSEMBLY=<mock assembly> must fail
 * The default and --force-mock build the production graph in memory (`build.write: false`) with AP_PROD_GRAPH_CHECK=1,
 * which only tells vite.config.ts not to demand AP_PLATFORM_ASSEMBLY; the build-time guard `prodGraphGuard()` stays on
 * (no env disables it), so an offending graph fails inside the build and this script reports the guard's list. The
 * default leaves `#platform-assembly` external, so the real assembly (#154) is neither needed nor bundled; the script
 * then re-checks the output itself (same rule) and that the specifier stayed external.
 */
import { fileURLToPath } from 'node:url';
import { build, type Rollup } from 'vite';
import { ASSEMBLY_SPECIFIER, findForbiddenModules } from './prod-graph.ts';

const APP_ROOT = fileURLToPath(new URL('..', import.meta.url));
const MOCK_ASSEMBLY = fileURLToPath(new URL('../src/dev/mock-assembly.tsx', import.meta.url));
const forceMock = process.argv.includes('--force-mock');
const forceMockBuild = process.argv.includes('--force-mock-build');

/** Rollup tags plugin errors `[plugin ap:prod-graph-guard]` and Vite adds `[ap:prod-graph-guard]` on top — show one. */
const guardMessage = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).replace(/^\[([^\]]+)\] \[plugin \1\] /, '[$1] ');

if (forceMockBuild) {
  process.env.AP_PLATFORM_ASSEMBLY = MOCK_ASSEMBLY;
  try {
    await build({ root: APP_ROOT, mode: 'production', logLevel: 'silent', build: { write: false } });
  } catch (err) {
    console.error(`check:prod-graph --force-mock-build: the production build failed as it must —\n${guardMessage(err)}`);
    process.exit(1);
  }
  console.log('check:prod-graph --force-mock-build: a production build bundling the mock assembly PASSED — the build-time guard is not biting');
  process.exit(0);
}

process.env.AP_PROD_GRAPH_CHECK = '1';
let result: Awaited<ReturnType<typeof build>>;
try {
  result = await build({
    root: APP_ROOT,
    mode: 'production',
    logLevel: 'silent',
    ...(forceMock ? { resolve: { alias: { [ASSEMBLY_SPECIFIER]: MOCK_ASSEMBLY } } } : {}),
    build: { write: false, rollupOptions: forceMock ? {} : { external: [ASSEMBLY_SPECIFIER] } },
  });
} catch (err) {
  console.error(`check:prod-graph FAILED${forceMock ? ' (--force-mock)' : ''} — the production build stopped (ADR-0009):\n${guardMessage(err)}`);
  process.exit(1);
}

const outputs = (Array.isArray(result) ? result : [result]) as Rollup.RollupOutput[];
const chunks = outputs.flatMap(o => o.output).filter((c): c is Rollup.OutputChunk => c.type === 'chunk');
const ids = new Set(chunks.flatMap(c => c.moduleIds));
const offenders = findForbiddenModules(ids);
const external = chunks.some(c => c.imports.includes(ASSEMBLY_SPECIFIER)) && ![...ids].some(id => id.includes(ASSEMBLY_SPECIFIER));

if (offenders.length > 0 || !external) {
  console.error(`check:prod-graph FAILED${forceMock ? ' (--force-mock)' : ''} — the production graph must not bundle mock/dev code (ADR-0009)`);
  if (!external) console.error(`  - '${ASSEMBLY_SPECIFIER}' was bundled instead of left external`);
  for (const o of offenders) console.error(`  - [${o.rule}] ${o.id}`);
  process.exit(1);
}
console.log(`check:prod-graph OK — ${ids.size} modules in the production graph, no mock/dev modules, ${ASSEMBLY_SPECIFIER} external`);
