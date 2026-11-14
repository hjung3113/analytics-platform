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

// @ts-expect-error — `topBarTools` is required (production writes null), so a renamed `tools` leaves it missing.
export const renamedTools: CreateAssembly = () => ({ adapter, tools: null });

export const ok: CreateAssembly = () => ({ adapter, topBarTools: null });

// A real assembly awaits the bootstrap (#154): a Promise of the same shapes is fine, and so are the two non-mount answers.
export const asyncOk: CreateAssembly = async () => ({ adapter, topBarTools: null });
export const redirectOk: CreateAssembly = async () => ({ redirect: '/auth/login' });
export const screenOk: CreateAssembly = () => ({ screen: null });

// @ts-expect-error — a Promise of a wrong shape is still wrong.
export const asyncWrongAdapter: CreateAssembly = async () => ({ adapter: { menuQuery: 1 }, topBarTools: null });

// @ts-expect-error — a redirect target is a string.
export const wrongRedirect: CreateAssembly = () => ({ redirect: 1 });
