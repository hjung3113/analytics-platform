/**
 * The local preference of a menu workspace (ADR-0067 decision 20). A browser-local preference, not a server record: nothing here calls
 * the adapter. Every storage access is guarded; a storage that throws leaves the preference in memory.
 */
import { normalizeWorkspaceState, sameWorkspaceState, type WorkspaceSpec, type WorkspaceState } from './workspaceState';

export const WORKSPACE_WRITE_DELAY_MS = 300;

/** `persistKey` is a static identifier (`WORKSPACE_ID`); user and menu ids come from the session and the registry. */
export const workspaceStorageKey = (userId: string, menuId: string, persistKey: string) => `platform:workspace:v1:${userId}:${menuId}:${persistKey}`;

/** The stored state repaired against `spec`, or null when there is none or storage cannot be read. */
export function readWorkspaceState(key: string, spec: WorkspaceSpec): WorkspaceState | null {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return null;
    return normalizeWorkspaceState(JSON.parse(stored) as unknown, spec);
  } catch { return null; }
}

export function writeWorkspaceState(key: string, state: WorkspaceState): void {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* preference stays in memory */ }
}

export { sameWorkspaceState };
