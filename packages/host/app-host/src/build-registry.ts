import { createRegistry, type Registry } from '@ap/kernel';

/** The whole `createRegistry` input: spaces, groups, menus, permissions, carrySets, platformHomeMenuId, reservedRoots. */
export type CreateRegistryInput = Parameters<typeof createRegistry>[0];

/**
 * The Host's synchronous registry step. A rejected declaration (duplicate id, undeclared permission, ...) throws the Kernel's own
 * `RegistryError` unchanged, so a caller can run this alone and read the real message; `startAppHost` runs it inside `startOrFail`.
 */
export function buildRegistry(declarations: CreateRegistryInput): Registry {
  return createRegistry(declarations);
}
