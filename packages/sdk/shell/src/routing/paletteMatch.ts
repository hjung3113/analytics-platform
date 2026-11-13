/** Palette menu matching (#1943): whitespace-insensitive, every query word must match, ranked by where it matched. */

/** Where a query word matched; lower is better. */
export const MATCH_NAME = 0;
export const MATCH_KEYWORD = 1;
export const MATCH_CONTEXT = 2;

export type PaletteTarget = {
  /** The menu's own names (ko/en). */
  names: readonly string[];
  /** Names the menu declared for itself (`keywords`). */
  keywords: readonly string[];
  /** Group and system names. */
  context: readonly string[];
};

const squash = (s: string) => s.toLowerCase().replace(/\s+/g, '');

const prepare = (list: readonly string[]) => list.map(squash).filter(Boolean);

export function queryWords(q: string): string[] {
  return q.toLowerCase().split(/\s+/).filter(Boolean);
}

/** Worst rank over the query words, or null when any word matches nowhere. */
export function matchRank(words: readonly string[], target: PaletteTarget): number | null {
  const names = prepare(target.names);
  const keywords = prepare(target.keywords);
  const context = prepare(target.context);
  let worst = MATCH_NAME;
  for (const word of words) {
    const w = squash(word);
    const rank = names.some(s => s.includes(w)) ? MATCH_NAME
      : keywords.some(s => s.includes(w)) ? MATCH_KEYWORD
      : context.some(s => s.includes(w)) ? MATCH_CONTEXT : null;
    if (rank === null) return null;
    worst = Math.max(worst, rank);
  }
  return worst;
}

/** True when some part of `text` is within one insertion, deletion or substitution of `pattern`. */
function nearSubstring(pattern: string, text: string): boolean {
  let prev = Array.from({ length: text.length + 1 }, () => 0);
  for (let i = 1; i <= pattern.length; i++) {
    const row = [i];
    for (let j = 1; j <= text.length; j++) {
      row[j] = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + (pattern[i - 1] === text[j - 1] ? 0 : 1));
    }
    prev = row;
  }
  return Math.min(...prev) <= 1;
}

/** Typo candidate: the whole query (spaces dropped) is one letter off a menu name or keyword. Needs 3+ letters so short input does not match everything. */
export function isNearMiss(q: string, target: PaletteTarget): boolean {
  const pattern = squash(q);
  if (pattern.length < 3) return false;
  return prepare([...target.names, ...target.keywords]).some(s => nearSubstring(pattern, s));
}
