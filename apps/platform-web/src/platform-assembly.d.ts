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
  import type { PlatformAdapter, SavedViewStore } from '@ap/contracts';
  import type { Registry } from '@ap/kernel';

  /**
   * What a build injects: the server adapter and its top-bar tools (DevTools in mock builds; production writes `null`).
   * `savedViews` is the browser-local ACL simulation in mock builds and the server-backed HTTP store in real builds (ADR-0099). `featureApi`
   * (real assemblies only; absent in mock) is where the feature bridge screens call and what they do when the
   * Feature session is lost (ADR-0071). `serverPreferences: true` makes the Kernel keep the user's preferences on the
   * server through the adapter's preference ports (ADR-0098); absent keeps browser storage. `invalidation` (real assemblies) is
   * where the app declares which of its endpoint ids a write through the adapter port affects (#1106); `main.tsx` mounts one
   * bridge that refreshes exactly those. Structural: the Kernel and this contract know no menu.
   */
  export type Assembly = { adapter: PlatformAdapter; topBarTools: ReactNode; savedViews?: SavedViewStore; featureApi?: { basePath: string; onSessionLost: () => void }; serverPreferences?: boolean; invalidation?: { subscribe: (listener: (endpointIds: readonly string[]) => void) => () => void } };
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
