import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import tailwindcss from '@tailwindcss/vite';
import { ASSEMBLY_SPECIFIER, prodGraphGuard } from './scripts/prod-graph.ts';

/** `#platform-assembly` (src/platform-assembly.d.ts) is resolved here by mode — #153, ADR-0009. */
const MOCK_ASSEMBLY = fileURLToPath(new URL('./src/dev/mock-assembly.tsx', import.meta.url));
const MOCK_MODES = new Set(['development', 'mock', 'test']);

const MISSING_ASSEMBLY_MESSAGE =
  '운영 빌드에는 실어댑터 조립 모듈이 필요하다 — AP_PLATFORM_ASSEMBLY에 경로를 준다(#154). mock 빌드는 --mode mock\n'
  + 'A production build needs the real adapter assembly module — set AP_PLATFORM_ASSEMBLY to its path (#154). For a mock build use --mode mock.';

/**
 * dev server (`development`), `--mode mock` and vitest → the mock assembly with DevTools. Any other mode → the
 * module at env AP_PLATFORM_ASSEMBLY, or the config throws: there is no placeholder adapter. `vite preview` only
 * serves an existing dist/ and is exempt. AP_PROD_GRAPH_CHECK=1 is honoured ONLY by scripts/check-prod-graph.ts —
 * it leaves the specifier unresolved so the check can mark it external and inspect the graph without any assembly.
 */
function assemblyAlias(mode: string, isPreview: boolean): Record<string, string> {
  if (MOCK_MODES.has(mode)) return { [ASSEMBLY_SPECIFIER]: MOCK_ASSEMBLY };
  if (isPreview || process.env.AP_PROD_GRAPH_CHECK === '1') return {};
  const real = process.env.AP_PLATFORM_ASSEMBLY;
  if (!real) throw new Error(MISSING_ASSEMBLY_MESSAGE);
  return { [ASSEMBLY_SPECIFIER]: real };
}

/** Every non-mock build checks its own full graph (real assembly included) for mock/dev code — ADR-0009. No env
 * turns it off; the check script runs with it too. */
const guardGraph = (mode: string): boolean => !MOCK_MODES.has(mode);

export default defineConfig(({ mode, isPreview = false }) => ({
  plugins: [tailwindcss(), ...(guardGraph(mode) ? [prodGraphGuard()] : [])],
  resolve: { alias: assemblyAlias(mode, isPreview) },
  build: { rollupOptions: { input: { main: 'index.html', fopsSpike: 'fops-spike.html' } } },
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'] },
}));
