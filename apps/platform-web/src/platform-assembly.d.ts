/**
 * Injection contract for the composition root (#153, ADR-0009). `src/main.tsx` imports `createAssembly` from this
 * specifier; vite.config.ts resolves it by mode — `development`/`mock`/`test` (vitest) → `src/dev/mock-assembly.tsx`,
 * any other mode → the module at env `AP_PLATFORM_ASSEMBLY` (the in-house real adapter assembly, #154).
 * TypeScript only sees this declaration, so every implementation must be typed with it:
 * `export const createAssembly: CreateAssembly = …` with `import type { CreateAssembly } from '#platform-assembly'`.
 */
declare module '#platform-assembly' {
  import type { ReactNode } from 'react';
  import type { PlatformAdapter } from '@ap/contracts';
  import type { Registry } from '@ap/kernel';

  /** What a build injects: the server adapter and its top-bar tools (DevTools in mock builds; production writes `null`). */
  export type Assembly = { adapter: PlatformAdapter; topBarTools: ReactNode };
  export type CreateAssembly = (o: { registry: Registry }) => Assembly;
  export const createAssembly: CreateAssembly;
}
