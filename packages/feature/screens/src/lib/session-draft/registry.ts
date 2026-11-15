/**
 * Session-expiry draft registry (#1887, platform ADR-0071 decision 5 addendum). No domain knowledge and no imports: the bridge (through
 * `global-screens/core`) and every form reach it without a new package edge.
 *
 * - A mounted form registers `{ key, read }`; `read` returns only plain user-entered text/choices (never a secret or one-time value) or `null`.
 * - Nothing is written while the session is healthy. Only `snapshotSessionDrafts(userId)`, which the bridge calls on a feature 401 BEFORE it
 *   retires the subtree, writes the registered drafts to `sessionStorage` as `draft:<userId>:<key>`.
 * - `beginSessionDraftOwner(userId)` runs when a session generation becomes ready: it deletes, unread, every draft of another user and every
 *   draft older than `SESSION_DRAFT_TTL_MS`, and binds `takeSessionDraft` to that user.
 * - `takeSessionDraft(key)` reads and deletes the current owner's draft. Every storage access is guarded: storage that throws or is missing
 *   (private windows, quota) behaves as empty and never breaks a form.
 */
export type DraftJson = null | boolean | number | string | DraftJson[] | { [key: string]: DraftJson };

export const SESSION_DRAFT_PREFIX = 'draft:';
/** A draft older than this is deleted unread: an old half-written form is more confusing than an empty one. */
export const SESSION_DRAFT_TTL_MS = 30 * 60 * 1000;

type Entry = { key: string; read: () => DraftJson | null };
type Stored = { savedAt: number; value: DraftJson; generation?: number };
/** Who a form was mounted under: its user and the session generation, so a late cleanup only touches its own snapshot. */
export type SessionDraftBinding = { owner: string | null; generation: number };

/** Registration order; a later registration with the same key wins at snapshot time. */
const entries: Entry[] = [];
let owner: string | null = null;
/** Bumped by every `beginSessionDraftOwner`; a snapshot is stamped with the generation it was taken in. */
let generation = 0;

function storage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

const storageKey = (userId: string, key: string): string => `${SESSION_DRAFT_PREFIX}${userId}:${key}`;

function parseStored(raw: string | null): Stored | null {
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || !('savedAt' in parsed) || !('value' in parsed)) return null;
    const { savedAt, value } = parsed as { savedAt: unknown; value: unknown };
    const { generation: stamped } = parsed as { generation?: unknown };
    if (typeof savedAt !== 'number') return null;
    return typeof stamped === 'number' ? { savedAt, value: value as DraftJson, generation: stamped } : { savedAt, value: value as DraftJson };
  } catch {
    return null;
  }
}

const fresh = (stored: Stored, now: number): boolean => now - stored.savedAt >= 0 && now - stored.savedAt <= SESSION_DRAFT_TTL_MS;

/** Registers a mounted form's draft reader; the returned function unregisters exactly this registration. */
export function registerSessionDraft(key: string, read: () => DraftJson | null): () => void {
  const entry: Entry = { key, read };
  entries.push(entry);
  return () => {
    const index = entries.indexOf(entry);
    if (index !== -1) entries.splice(index, 1);
  };
}

/** Writes every registered draft for `userId` (in registration order) and ends the owner binding. Without a user nothing is written. */
export function snapshotSessionDrafts(userId: string | null): void {
  owner = null;
  if (userId === null) return;
  const store = storage();
  if (store === null) return;
  const savedAt = Date.now();
  for (const entry of [...entries]) {
    let value: DraftJson | null;
    try {
      value = entry.read();
    } catch {
      continue;
    }
    if (value === null) continue;
    try {
      store.setItem(storageKey(userId, entry.key), JSON.stringify({ savedAt, value, generation } satisfies Stored));
    } catch {
      // Quota or a blocked store: this draft is lost, the session-expiry handling goes on.
    }
  }
}

/** A ready session of `userId`: drafts of other users and expired ones are deleted unread; `takeSessionDraft` reads this user's. */
export function beginSessionDraftOwner(userId: string | null): void {
  owner = userId;
  generation += 1;
  const store = storage();
  if (store === null) return;
  try {
    const now = Date.now();
    const ownPrefix = userId === null ? null : `${SESSION_DRAFT_PREFIX}${userId}:`;
    const keys: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key !== null && key.startsWith(SESSION_DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) {
      const stored = ownPrefix !== null && key.startsWith(ownPrefix) ? parseStored(store.getItem(key)) : null;
      if (stored === null || !fresh(stored, now)) store.removeItem(key);
    }
  } catch {
    // An unreadable store holds nothing this session can use.
  }
}

/** Reads and deletes the current owner's draft for `key`; `null` without an owner, a draft, or when it expired. */
export function takeSessionDraft(key: string): DraftJson | null {
  if (owner === null) return null;
  const store = storage();
  if (store === null) return null;
  try {
    const name = storageKey(owner, key);
    const stored = parseStored(store.getItem(name));
    store.removeItem(name);
    return stored !== null && fresh(stored, Date.now()) ? stored.value : null;
  } catch {
    return null;
  }
}

/** The owner and generation a form mounting now belongs to; pass it to `discardSessionDraft` so a late cleanup stays bound to it. */
export function currentSessionDraftBinding(): SessionDraftBinding {
  return { owner, generation };
}

/**
 * Deletes a draft for `key` (successful submit, explicit cancel or close). With a `binding` it deletes only that user's snapshot taken in
 * that generation, even after the session was retired (`owner === null`) and never the next session's owner or a later snapshot;
 * without one it deletes the current owner's.
 */
export function discardSessionDraft(key: string, binding?: SessionDraftBinding): void {
  const target = binding === undefined ? owner : binding.owner;
  if (target === null) return;
  const store = storage();
  if (store === null) return;
  try {
    const name = storageKey(target, key);
    if (binding !== undefined) {
      const stored = parseStored(store.getItem(name));
      if (stored !== null && stored.generation !== undefined && stored.generation !== binding.generation) return;
    }
    store.removeItem(name);
  } catch {
    // Nothing to delete from an unusable store.
  }
}

/** Test-only: forget registrations and the owner binding. */
export function resetSessionDraftsForTests(): void {
  entries.length = 0;
  owner = null;
  generation = 0;
}
