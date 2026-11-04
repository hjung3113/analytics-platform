/**
 * Per-viewer draft of the catalog import wizard (#1195 c, FIX1 UX-2): the pasted text, the file name and the staged job id survive a
 * route change inside the app (the SDK has no leave guard). The kernel offers menus no draft store and menu code may not touch web
 * storage, so the draft lives in module memory: it outlives the screen but not a page reload (which `beforeunload` warns about).
 * It is keyed by user id, so another sign-in in the same tab never sees it and never overwrites it.
 */
export type ImportDraft = { text: string; sourceName: string | null; jobId: string | null };

const kept = new Map<string, ImportDraft>();

export const readDraft = (userId: string): ImportDraft | null => kept.get(userId) ?? null;
export function writeDraft(userId: string, draft: ImportDraft): void { kept.set(userId, draft); }
/** Drops one user's draft, or every draft when no user is given. */
export function clearDraft(userId?: string): void { if (userId === undefined) kept.clear(); else kept.delete(userId); }
