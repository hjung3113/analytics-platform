/**
 * Injection contract for the composition root (#153, ADR-0009). `src/main.tsx` imports `createAssembly` from this
 * specifier; vite.config.ts resolves it by mode — `development`/`mock`/`test` (vitest) → `src/dev/mock-assembly.tsx`,
 * `real` → `src/real/http-assembly.tsx` (this repo's real-server assembly, #154), any other mode → the module at env
 * `AP_PLATFORM_ASSEMBLY` (the in-house real adapter assembly, #154).
 * TypeScript only sees this declaration, so every implementation must be typed with it:
 * `export const createAssembly: CreateAssembly = …` with `import type { CreateAssembly } from '#platform-assembly'`.
 */
declare module '#platform-assembly' {
  import type { ReactNode } from 'react';
  import type { PlatformAdapter } from '@ap/contracts';
  import type { Registry } from '@ap/kernel';

  /**
   * What a build injects: the server adapter and its top-bar tools (DevTools in mock builds; production writes `null`).
   * `feedbackOpsApi` (real assemblies only; absent in mock) is where the FeedbackOps bridge screens call and what they do
   * when the FeedbackOps session is lost (ADR-0071). Structural: the Kernel and this contract know no menu.
   */
  export type Assembly = { adapter: PlatformAdapter; topBarTools: ReactNode; feedbackOpsApi?: { basePath: string; onSessionLost: () => void } };
  /**
   * What `createAssembly` may answer (#154, http-adapter-contract §3 안 B): the assembly to mount, a `redirect` target
   * (`main.tsx` calls `window.location.replace`, e.g. to the login page), or a `screen` rendered instead of the app
   * (no Kernel, no shell — e.g. "server unavailable").
   */
  export type AssemblyOutcome = Assembly | { redirect: string } | { screen: ReactNode };
  /** Synchronous in mock builds; the real assembly awaits the bootstrap, so `main.tsx` awaits either. */
  export type CreateAssembly = (o: { registry: Registry }) => AssemblyOutcome | Promise<AssemblyOutcome>;
  export const createAssembly: CreateAssembly;
}
