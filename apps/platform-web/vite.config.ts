import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { ASSEMBLY_SPECIFIER, prodGraphGuard } from './scripts/prod-graph.ts';
import { realDevProxy } from './scripts/real-dev-proxy.ts';
import { chooseAssembly, MOCK_MODES, type AssemblyChoice } from './scripts/assembly-choice.ts';

/** `#platform-assembly` (src/platform-assembly.d.ts) is resolved here by mode — #153, ADR-0009. */
const MOCK_ASSEMBLY = fileURLToPath(new URL('./src/dev/mock-assembly.tsx', import.meta.url));
const REAL_ASSEMBLY = fileURLToPath(new URL('./src/real/http-assembly.tsx', import.meta.url));
/** Feature sources reached through @ap/feature-screens/global-screens import themselves with the `@/` alias (ADR-0071). */
const FEATURE_SRC = fileURLToPath(new URL('../../apps/feature-screens/src', import.meta.url));
/** @eqv/core is workspace source on zod 4 while feature screens use zod 3: the dev server pre-bundles one `zod` for every importer, so core's imports get zod 3 (`z.int is not a function`). Route only core's own `zod` to its copy (ADR-0132, plan P12). */
const EQV_CORE_DIR = fileURLToPath(new URL('../../packages/eqv/core/', import.meta.url));
const eqvCoreZod = (): Plugin => ({
  name: 'eqv-core-zod',
  enforce: 'pre',
  resolveId(id, importer) {
    if (id !== 'zod' || importer === undefined || !importer.startsWith(EQV_CORE_DIR)) return null;
    return realpathSync(`${EQV_CORE_DIR}node_modules/zod/index.js`);
  },
});
const BACKEND_ORIGIN = process.env.AP_BACKEND_ORIGIN ?? 'http://127.0.0.1:3011';

/**
 * dev server (`development`), `--mode mock` and vitest → the mock assembly with DevTools. `vite --mode real` (dev server only) → this
 * repo's real-server assembly (src/real/http-assembly.tsx) plus the /api·/auth proxy; `vite build --mode real` follows the production rule. Any other mode → the
 * module at env AP_PLATFORM_ASSEMBLY, or the config throws: there is no placeholder adapter. `vite preview` only
 * serves an existing dist/ and is exempt. AP_PROD_GRAPH_CHECK=1 is honoured ONLY by scripts/check-prod-graph.ts —
 * it leaves the specifier unresolved so the check can mark it external and inspect the graph without any assembly.
 */
function assemblyAlias(choice: AssemblyChoice): Record<string, string> {
  if (choice.kind === 'mock') return { [ASSEMBLY_SPECIFIER]: MOCK_ASSEMBLY };
  if (choice.kind === 'real-dev') return { [ASSEMBLY_SPECIFIER]: REAL_ASSEMBLY };
  if (choice.kind === 'injected') return { [ASSEMBLY_SPECIFIER]: choice.path };
  return {};
}

/** Every non-mock build checks its own full graph (real assembly included) for mock/dev code — ADR-0009. No env
 * turns it off; the check script runs with it too. */
const guardGraph = (mode: string): boolean => !MOCK_MODES.has(mode);

export default defineConfig(({ mode, command, isPreview = false }) => {
  const choice = chooseAssembly({ mode, command, isPreview, env: process.env });
  return {
    base: process.env.AP_BASE_PATH ?? '/',
    plugins: [eqvCoreZod(), tailwindcss(), ...(guardGraph(mode) ? [prodGraphGuard()] : [])],
    // Bare `echarts/*` entries are imported only inside a lazy chunk: without this list a warm dep cache that predates a new entry makes the dev server re-optimize and reload the page mid-interaction (#580 DIAG1).
    optimizeDeps: { include: ['echarts/core', 'echarts/charts', 'echarts/components', 'echarts/features', 'echarts/renderers'].map(entry => `@ap/components > ${entry}`) },
    resolve: { alias: { '@': FEATURE_SRC, ...assemblyAlias(choice) } },
    server: choice.kind === 'real-dev' ? { proxy: realDevProxy(BACKEND_ORIGIN) } : undefined,
    test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
  };
});
