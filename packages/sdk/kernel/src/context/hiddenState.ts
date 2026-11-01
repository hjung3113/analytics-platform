import type { Pair } from '@ap/contracts';

/** The one history-state field the Kernel owns (ADR-0105). Any other field of `history.state` belongs to someone else and is never touched. */
export const HIDDEN_STATE_KEY = 'apHidden';
const HIDDEN_STATE_VERSION = 1;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The hidden page pairs a history entry carries; anything that is not a versioned list of string pairs reads as none. */
export function readHiddenState(state: unknown): Pair[] {
  if (!isRecord(state)) return [];
  const field = state[HIDDEN_STATE_KEY];
  if (!isRecord(field) || field.v !== HIDDEN_STATE_VERSION || !Array.isArray(field.pairs)) return [];
  const pairs: Pair[] = [];
  for (const pair of field.pairs) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return [];
    pairs.push([pair[0], pair[1]]);
  }
  return pairs;
}

/** `current` with only the namespaced field replaced by `pairs` (removed when empty). Foreign fields stay; an empty result is `null`, as a plain history write. */
export function withHiddenState(current: unknown, pairs: readonly Pair[]): Record<string, unknown> | null {
  const next: Record<string, unknown> = isRecord(current) ? { ...current } : {};
  delete next[HIDDEN_STATE_KEY];
  if (pairs.length > 0) next[HIDDEN_STATE_KEY] = { v: HIDDEN_STATE_VERSION, pairs: pairs.map(([k, v]) => [k, v]) };
  return Object.keys(next).length > 0 ? next : null;
}

/** `url` without the pairs whose key is in `keys`, and those pairs in order. A url that carries none comes back byte for byte. */
export function splitHidden(url: string, keys: readonly string[]): { url: string; hidden: Pair[] } {
  const q = url.indexOf('?');
  if (keys.length === 0 || q === -1) return { url, hidden: [] };
  const visible: Pair[] = []; const hidden: Pair[] = [];
  for (const pair of new URLSearchParams(url.slice(q + 1)).entries()) (keys.includes(pair[0]) ? hidden : visible).push([pair[0], pair[1]]);
  if (hidden.length === 0) return { url, hidden };
  return { url: url.slice(0, q) + (visible.length > 0 ? '?' + new URLSearchParams(visible).toString() : ''), hidden };
}

export const sameHidden = (a: readonly Pair[], b: readonly Pair[]): boolean => a.length === b.length && a.every(([k, v], i) => k === b[i][0] && v === b[i][1]);
