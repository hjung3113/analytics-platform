/**
 * Type-level regression for the `#platform-assembly` contract (#153 review P2-2): `pnpm typecheck` fails if an
 * implementation typed `CreateAssembly` returns the wrong shape — each `@ts-expect-error` must find an error.
 * No runtime code; not a vitest file.
 */
import type { CreateAssembly } from '#platform-assembly';
import type { PlatformAdapter } from '@ap/contracts';

declare const adapter: PlatformAdapter;

// @ts-expect-error — the adapter is required.
export const missingAdapter: CreateAssembly = () => ({ topBarTools: null });

// @ts-expect-error — the adapter must be a PlatformAdapter, not any object.
export const wrongAdapter: CreateAssembly = () => ({ adapter: { menuQuery: 1 } });

// @ts-expect-error — the registry argument is `{ registry }`, not a bare string.
export const wrongArgument: CreateAssembly = (o: string) => ({ adapter: o as unknown as PlatformAdapter });

export const ok: CreateAssembly = () => ({ adapter });
