/**
 * The local preference of a menu workspace (ADR-0067 decision 20). A browser-local preference, not a server record: nothing here calls
 * the adapter. Every storage access is guarded; a storage that throws leaves the preference in memory.
 */
import { readLocalStorage, writeLocalStorage } from '@ap/ui';
import { normalizeWorkspaceState, sameWorkspaceState, type WorkspaceSpec, type WorkspaceState } from './workspaceState';

export const WORKSPACE_WRITE_DELAY_MS = 300;

/** The Web Storage subset a standalone workspace writes through (`localStorage` and `sessionStorage` fit as they are). */
export type PanelWorkspaceStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** `persistKey` is a static identifier (`WORKSPACE_ID`); user and menu ids come from the session and the registry. */
export const workspaceStorageKey = (userId: string, menuId: string, persistKey: string) => `platform:workspace:v1:${userId}:${menuId}:${persistKey}`;

const RECENT_SCOPE_LIMIT = 8;

function readScopes(key: string): [string, string][] {
  return readLocalStorage(key, stored => {
    const entries: unknown = stored === null ? [] : JSON.parse(stored);
    return Array.isArray(entries) ? entries.filter((entry): entry is [string, string] =>
      Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string' && typeof entry[1] === 'string') : [];
  }, []);
}

/** A browser-local preference per scope, with the earlier unscoped preference as the starting point. */
export function scopedWorkspaceStorage(scope: string): PanelWorkspaceStorage {
  return {
    getItem(key) {
      const saved = readScopes(`${key}:scopes`).find(([id]) => id === scope);
      return saved?.[1] ?? localStorage.getItem(key);
    },
    setItem(key, value) {
      const scopedKey = `${key}:scopes`;
      const recent = readScopes(scopedKey).filter(([id]) => id !== scope);
      writeLocalStorage(scopedKey, JSON.stringify([[scope, value], ...recent].slice(0, RECENT_SCOPE_LIMIT)));
    },
  };
}

/** The stored state repaired against `spec`, or null when there is none or storage cannot be read. Without `storage`, `localStorage`. */
export function readWorkspaceState(key: string, spec: WorkspaceSpec, storage?: PanelWorkspaceStorage): WorkspaceState | null {
  const decode = (stored: string | null) => stored === null ? null : normalizeWorkspaceState(JSON.parse(stored) as unknown, spec, { fromStorage: true });
  if (!storage) return readLocalStorage(key, decode, null);
  try {
    return decode(storage.getItem(key));
  } catch {
    return null;
  }
}

export function writeWorkspaceState(key: string, state: WorkspaceState, storage?: PanelWorkspaceStorage, { sharedRows = false } = {}): void {
  // An empty list records that this workspace uses shared rows and has no manual sizes.
  const stored = JSON.stringify(sharedRows && state.sharedRowSizes === undefined ? { ...state, sharedRowSizes: [] } : state);
  // a refusing storage leaves the preference in memory
  if (!storage) { writeLocalStorage(key, stored); return; }
  try {
    storage.setItem(key, stored);
  } catch {
    // same as localStorage: the preference stays in memory
  }
}

export { sameWorkspaceState };
