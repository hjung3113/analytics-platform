import { readLocalStorage, writeLocalStorage } from '@ap/ui';

/** A section id and a `persistKey` are static identifiers (same rule as `WORKSPACE_ID`). */
export const INSPECTOR_ID = /^[a-z][a-z0-9._-]{0,63}$/;

/** `platform:inspector-expanded:v1:<user>:<menu>:<persistKey>`: the identity scope of `workspaceStorageKey` (`persistKey` is a static id; user and menu come from the session and the registry). */
export const inspectorStorageKey = (userId: string, menuId: string, persistKey: string) => `platform:inspector-expanded:v1:${userId}:${menuId}:${persistKey}`;

/** `ids` kept in declaration order, unknown and repeated ids dropped. */
export function normalizeExpanded(ids: readonly unknown[], known: readonly string[]): string[] {
  const wanted = new Set(ids);
  return known.filter(id => wanted.has(id));
}

/** The stored expanded set, or null when nothing usable is stored or storage cannot be read. */
export function readExpanded(key: string, known: readonly string[]): string[] | null {
  return readLocalStorage(key, raw => {
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeExpanded(parsed as unknown[], known) : null;
  }, null);
}

export function writeExpanded(key: string, ids: readonly string[]): void {
  writeLocalStorage(key, JSON.stringify(ids)); // a refusing storage leaves the preference in memory
}
