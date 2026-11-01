import type { Pair } from '@ap/contracts';

/**
 * Hidden page pairs of a screen that linked away with `returnTo` (ADR-0105). The return link carries only the visible address, so the hidden
 * pairs wait here, session-scoped (`sessionStorage`), keyed by that visible address, until the user follows the return link.
 * Namespaced, versioned and bounded; any storage failure means "no hidden state" (the pairs are dropped, never put in an address).
 */
const STORAGE_KEY = 'ap.kernel.returnHidden';
const VERSION = 1;
const MAX_ENTRIES = 16;
const MAX_PAIRS = 32;
const MAX_CHARS = 32_768;

type Entries = [string, Pair[]][];

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
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !Array.isArray(entry[1])) continue;
      const pairs: Pair[] = [];
      for (const pair of entry[1]) if (Array.isArray(pair) && pair.length === 2 && typeof pair[0] === 'string' && typeof pair[1] === 'string') pairs.push([pair[0], pair[1]]);
      out.push([entry[0], pairs]);
    }
    return out;
  } catch { return []; }
}
function save(entries: Entries): void {
  try {
    let kept = entries.slice(-MAX_ENTRIES);
    let text = JSON.stringify({ v: VERSION, entries: kept });
    while (text.length > MAX_CHARS && kept.length > 0) { kept = kept.slice(1); text = JSON.stringify({ v: VERSION, entries: kept }); }
    if (kept.length === 0) window.sessionStorage.removeItem(STORAGE_KEY); else window.sessionStorage.setItem(STORAGE_KEY, text);
  } catch { /* storage unavailable or full: the hidden pairs are dropped */ }
}

/** Remember (or, for none, forget) the hidden pairs the screen at `visibleUrl` held when it linked away. */
export function rememberReturnHidden(visibleUrl: string, hidden: readonly Pair[]): void {
  const entries = load().filter(([url]) => url !== visibleUrl);
  if (hidden.length > 0 && hidden.length <= MAX_PAIRS) entries.push([visibleUrl, hidden.map(([k, v]): Pair => [k, v])]);
  save(entries);
}

/** The hidden pairs remembered for `visibleUrl`; none when nothing was stored or storage is unavailable. */
export function readReturnHidden(visibleUrl: string): Pair[] {
  return load().find(([url]) => url === visibleUrl)?.[1] ?? [];
}
