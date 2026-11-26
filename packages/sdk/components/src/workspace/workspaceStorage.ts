/**
 * The local preference of a menu workspace (ADR-0067 decision 20). A browser-local preference, not a server record: nothing here calls
 * the adapter. Every storage access is guarded; a storage that throws leaves the preference in memory.
 */
import { readLocalStorage, writeLocalStorage } from '@ap/ui';
import { normalizeWorkspaceState, sameWorkspaceState, type WorkspaceSpec, type WorkspaceState } from './workspaceState';

export const WORKSPACE_WRITE_DELAY_MS = 300;

// A handful of recently edited views per workspace, even when every view has a different set of panels.
const SCOPED_LAYOUT_LIMIT = 8;

export const scopedWorkspaceStorageKey = (key: string, scope: string) => `${key}:scope:${scope}`;
const scopedLayoutsKey = (key: string) => `${key}:scopes`;

type ScopedLayout = [scope: string, state: unknown];

function readScopedLayouts(key: string): ScopedLayout[] | null {
  return readLocalStorage(scopedLayoutsKey(key), stored => {
    const list: unknown = stored === null ? null : JSON.parse(stored);
    return Array.isArray(list)
      ? list.filter((entry): entry is ScopedLayout => Array.isArray(entry) && entry.length === 2 && typeof entry[0] === 'string')
      : null;
  }, null);
}

function legacyScopedLayouts(key: string): ScopedLayout[] {
  const prefix = scopedWorkspaceStorageKey(key, '');
  try {
    const previous: ScopedLayout[] = [];
    for (let index = 0; index < localStorage.length; index++) {
      const entry = localStorage.key(index);
      if (!entry?.startsWith(prefix)) continue;
      const state = readLocalStorage(entry, stored => stored === null ? null : JSON.parse(stored) as unknown, null);
      previous.push([entry.slice(prefix.length), state]);
    }
    // Legacy layouts have no last-write order.
    return previous.reverse();
  } catch {
    return [];
  }
}

/** The Web Storage subset a standalone workspace writes through (`localStorage` and `sessionStorage` fit as they are). */
export type PanelWorkspaceStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

/** `persistKey` is a static identifier (`WORKSPACE_ID`); user and menu ids come from the session and the registry. */
export const workspaceStorageKey = (userId: string, menuId: string, persistKey: string) => `platform:workspace:v1:${userId}:${menuId}:${persistKey}`;

/** The stored state repaired against `spec`, or null when there is none or storage cannot be read. Without `storage`, `localStorage`. */
export function readWorkspaceState(key: string, spec: WorkspaceSpec, storage?: PanelWorkspaceStorage, scope?: string): WorkspaceState | null {
  const decode = (stored: string | null) => stored === null ? null : normalizeWorkspaceState(JSON.parse(stored) as unknown, spec, { fromStorage: true });
  if (scope !== undefined) {
    const layouts = readScopedLayouts(key);
    if (layouts === null) return readLocalStorage(scopedWorkspaceStorageKey(key, scope), decode, null);
    const entry = layouts.find(([id]) => id === scope);
    return entry ? normalizeWorkspaceState(entry[1], spec, { fromStorage: true }) : null;
  }
  if (!storage) return readLocalStorage(key, decode, null);
  try {
    return decode(storage.getItem(key));
  } catch {
    return null;
  }
}

export function writeWorkspaceState(key: string, state: WorkspaceState, storage?: PanelWorkspaceStorage, { sharedRows = false, scope }: { sharedRows?: boolean; scope?: string } = {}): void {
  // An empty list records that this workspace uses shared rows and has no manual sizes.
  const preference = sharedRows && state.sharedRowSizes === undefined ? { ...state, sharedRowSizes: [] } : state;
  if (scope !== undefined) {
    const existing = readScopedLayouts(key);
    const legacy = existing ? [] : legacyScopedLayouts(key);
    const recent = (existing ?? legacy).filter(([id, saved]) => id !== scope && saved !== null);
    const layouts: ScopedLayout[] = [[scope, preference], ...recent];
    if (writeLocalStorage(scopedLayoutsKey(key), JSON.stringify(layouts.slice(0, SCOPED_LAYOUT_LIMIT)))) {
      for (const [id] of legacy) writeLocalStorage(scopedWorkspaceStorageKey(key, id), null);
    }
    return;
  }
  const stored = JSON.stringify(preference);
  if (!storage) { writeLocalStorage(key, stored); return; }
  try {
    storage.setItem(key, stored);
  } catch {
    // same as localStorage: the preference stays in memory
  }
}

export { sameWorkspaceState };
