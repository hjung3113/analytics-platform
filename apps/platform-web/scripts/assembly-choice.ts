/** Which assembly `#platform-assembly` resolves to, decided from the Vite mode/command (#153, #154, ADR-0009). Pure, so it is testable. */
export const MOCK_MODES: ReadonlySet<string> = new Set(['development', 'mock', 'test']);
/** `vite --mode real` (`pnpm dev:real`): the real-server assembly against a local backend, dev server only. */
export const REAL_MODE = 'real';

export const MISSING_ASSEMBLY_MESSAGE =
  '운영 빌드에는 실어댑터 조립 모듈이 필요하다 — AP_PLATFORM_ASSEMBLY에 경로를 준다(#154). mock 빌드는 --mode mock\n'
  + 'A production build needs the real adapter assembly module — set AP_PLATFORM_ASSEMBLY to its path (#154). For a mock build use --mode mock.';

export type AssemblyChoice =
  | { kind: 'mock' }
  | { kind: 'real-dev' }
  | { kind: 'unresolved' }
  | { kind: 'injected'; path: string };

type Input = { mode: string; command: 'build' | 'serve'; isPreview: boolean; env: Record<string, string | undefined> };

export function chooseAssembly({ mode, command, isPreview, env }: Input): AssemblyChoice {
  if (MOCK_MODES.has(mode)) return { kind: 'mock' };
  if (mode === REAL_MODE && command === 'serve' && !isPreview) return { kind: 'real-dev' };
  if (isPreview || env.AP_PROD_GRAPH_CHECK === '1') return { kind: 'unresolved' };
  const path = env.AP_PLATFORM_ASSEMBLY;
  if (!path) throw new Error(MISSING_ASSEMBLY_MESSAGE);
  return { kind: 'injected', path };
}
