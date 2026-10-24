import { readLocalStorage, writeLocalStorage } from '@ap/ui';

/** A section id and a `persistKey` are static identifiers (same rule as `WORKSPACE_ID`). */
export const INSPECTOR_ID = /^[a-z][a-z0-9._-]{0,63}$/;

/** `platform:inspector-expanded:<persistKey>`: the same `platform:<preference>:<key>` convention as `useCollapsePreference`'s callers. */
export const inspectorStorageKey = (persistKey: string) => `platform:inspector-expanded:${persistKey}`;

/** `ids` kept in declaration order, unknown and repeated ids dropped. */
export function normalizeExpanded(ids: readonly unknown[], known: readonly string[]): string[] {
  const wanted = new Set(ids);
  return known.filter(id => wanted.has(id));
}

/** The stored expanded set, or null when nothing usable is stored or storage cannot be read. */
export function readExpanded(persistKey: string, known: readonly string[]): string[] | null {
  return readLocalStorage(inspectorStorageKey(persistKey), raw => {
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? normalizeExpanded(parsed as unknown[], known) : null;
  }, null);
}

export function writeExpanded(persistKey: string, ids: readonly string[]): void {
  writeLocalStorage(inspectorStorageKey(persistKey), JSON.stringify(ids)); // a refusing storage leaves the preference in memory
}
