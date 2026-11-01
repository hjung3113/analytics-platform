import type { Pair } from '@ap/contracts';

/**
 * Hidden page pairs of a screen that linked away with `returnTo` (ADR-0105). The return link carries only the visible address, so the hidden
 * pairs wait here, session-scoped (`sessionStorage`), keyed by that visible address, until the user follows the return link.
 * Namespaced, versioned and bounded; any storage failure means "no hidden state" (the pairs are dropped, never put in an address).
 * Every snapshot is bound to its owner (session user id, deployment origin + base path, menu id): a restore needs all three to match,
 * so another account, another deployment under the same origin, or another menu never reads it. A failed write fails closed:
 * the older snapshot for that address is removed (best effort) and, whatever storage says, that trip restores nothing.
 */
const STORAGE_KEY = 'ap.kernel.returnHidden';
const VERSION = 2;
const MAX_ENTRIES = 16;
const MAX_PAIRS = 32;
const MAX_CHARS = 32_768;

type Entries = [string, string, Pair[]][];
/** Who may restore a snapshot: the session user, the deployment (origin + base path) and the menu the screen belongs to. */
export interface ReturnHiddenOwner { readonly user: string; readonly deployment: string; readonly menu: string }
const ownerKey = (o: ReturnHiddenOwner): string => JSON.stringify([o.user, o.deployment, o.menu]);
/** Trips whose snapshot could not be written: even if an older slot survives in storage, they restore nothing. */
const failed = new Set<string>();
const slotKey = (visibleUrl: string, owner: string): string => JSON.stringify([visibleUrl, owner]);

function load(): Entries {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (raw === null) return [];
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || (parsed as { v?: unknown }).v !== VERSION) return [];
    const entries = (parsed as { entries?: unknown }).entries;
    if (!Array.isArray(entries)) return [];
    const out: Entries = [];
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length !== 3 || typeof entry[0] !== 'string' || typeof entry[1] !== 'string' || !Array.isArray(entry[2])) continue;
      const pairs: Pair[] = [];
      for (const pair of entry[2]) if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && typeof pair[1] === 'string') pairs.push([pair[0], pair[1]]);
      out.push([entry[0], entry[1], pairs]);
    }
    return out;
  } catch { return []; }
}
/** True when storage now holds exactly `entries`. */
function save(entries: Entries): boolean {
  try {
    let kept = entries.slice(-MAX_ENTRIES);
    let text = JSON.stringify({ v: VERSION, entries: kept });
    while (text.length > MAX_CHARS && kept.length > 0) { kept = kept.slice(1); text = JSON.stringify({ v: VERSION, entries: kept }); }
    if (kept.length === 0) window.sessionStorage.removeItem(STORAGE_KEY); else window.sessionStorage.setItem(STORAGE_KEY, text);
    return true;
  } catch { return false; }
}

/** Remember (or, for none, forget) the hidden pairs the screen at `visibleUrl` held when it linked away. */
export function rememberReturnHidden(visibleUrl: string, hidden: readonly Pair[], owner: ReturnHiddenOwner): void {
  const o = ownerKey(owner);
  const slot = slotKey(visibleUrl, o);
  const entries = load().filter(([url, who]) => url !== visibleUrl || who !== o);
  if (hidden.length > 0 && hidden.length <= MAX_PAIRS) entries.push([visibleUrl, o, hidden.map(([k, v]): Pair => [k, v])]);
  if (save(entries)) { failed.delete(slot); return; }
  // Fail closed: the older snapshot for this slot must not survive a failed replacement.
  failed.add(slot);
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* unreadable or unwritable: the in-memory mark still blocks the restore */ }
}

/** The hidden pairs remembered for `visibleUrl` by `owner`; none when nothing was stored, the owner differs, the write failed or storage is unavailable. */
export function readReturnHidden(visibleUrl: string, owner: ReturnHiddenOwner): Pair[] {
  const o = ownerKey(owner);
  if (failed.has(slotKey(visibleUrl, o))) return [];
  return load().find(([url, who]) => url === visibleUrl && who === o)?.[2] ?? [];
}
