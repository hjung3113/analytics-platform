// Query interpretation of the knowledge search (#1507 S-d, design log-knowledge-search §4.1, ADR-0125). Pure and DB-free.
// Direction is read ONLY from (a) the explicit relation param or (b) a query that is exactly `EVENT OPERATOR EVENT` with a closed operator
// word between two Event tokens. Anything else is plain text: no sentence is «understood», a negation or a one-sided operator never
// becomes a direction, and the interpretation is always returned so the screen can show it. No external call.

import { normalizeForm, tokenize, wordTokens } from './search-normalize.js';

export type RelationKind = 'observed' | 'expected' | 'all';

/** Closed operator words. Forward = «left happens before right»; reverse = «left happens after right». */
const FORWARD_OPERATORS: ReadonlySet<string> = new Set(['before', '먼저', '이전', '→']);
const REVERSE_OPERATORS: ReadonlySet<string> = new Set(['after', '나중', '이후']);
export const OPERATOR_WORDS: readonly string[] = [...FORWARD_OPERATORS, ...REVERSE_OPERATORS];

export interface Direction {
  origin: 'explicit' | 'operator';
  /** Normalized to `before`: `source` happens before `target`. */
  source: string;
  target: string;
  kind: RelationKind;
  /** The input said `after`; source and target were swapped. */
  swapped: boolean;
}

export interface Interpretation {
  original: string;
  /** NFKC lower-case of the original, whitespace collapsed: what the text stages search for. */
  normalized: string;
  /** Expanded tokens (words and pieces) of the text part. */
  tokens: string[];
  /** Whole-word tokens of the text part (no pieces), one per word. */
  words: string[];
  direction: Direction | null;
}

export interface ExplicitRelation {
  source: string;
  predicate: 'before' | 'after';
  target: string;
}

const EVENT_CHARS = /^[\p{L}\p{N}_.\-/]+$/u;

/** An Event token looks like a key: it holds `_` or `/`, or is an upper-case word of two or more characters. Operator words are never Event tokens. */
export function isEventToken(word: string): boolean {
  if (word === '' || !EVENT_CHARS.test(word)) return false;
  if (OPERATOR_WORDS.includes(normalizeForm(word))) return false;
  if (!/\p{L}/u.test(word)) return false;
  if (/[_/]/.test(word)) return true;
  return word.length >= 2 && /\p{Lu}/u.test(word) && !/\p{Ll}/u.test(word);
}

const collapse = (text: string): string => text.normalize('NFKC').replace(/\s+/gu, ' ').trim();

function textPart(text: string): Pick<Interpretation, 'tokens' | 'words'> {
  const words: string[] = [];
  for (const raw of collapse(text).split(' ')) {
    const first = raw === '' ? undefined : wordTokens(raw)[0];
    if (first !== undefined && !words.includes(first)) words.push(first);
  }
  return { tokens: tokenize(text), words };
}

function swap(source: string, predicate: 'before' | 'after', target: string): { source: string; target: string; swapped: boolean } {
  return predicate === 'after' ? { source: target, target: source, swapped: true } : { source, target, swapped: false };
}

/** Interprets the query text and the optional explicit relation. The explicit relation wins and then `q` is plain text. */
export function interpretQuery(q: string | null | undefined, relation: ExplicitRelation | null | undefined, kind: RelationKind = 'all'): Interpretation {
  const original = q ?? '';
  const normalized = normalizeForm(collapse(original));
  if (relation) {
    const s = swap(relation.source.trim(), relation.predicate, relation.target.trim());
    return { original, normalized, ...textPart(original), direction: { origin: 'explicit', ...s, kind } };
  }
  // `→` needs no surrounding spaces: `A→B`.
  const parts = collapse(original.replace(/→/gu, ' → ')).split(' ').filter((p) => p !== '');
  if (parts.length === 3) {
    const [left, operator, right] = parts as [string, string, string];
    const op = normalizeForm(operator);
    const forward = FORWARD_OPERATORS.has(op);
    if ((forward || REVERSE_OPERATORS.has(op)) && isEventToken(left) && isEventToken(right)) {
      const s = swap(left, forward ? 'before' : 'after', right);
      // The direction consumed the whole query: no residual text to search.
      return { original, normalized, tokens: [], words: [], direction: { origin: 'operator', ...s, kind } };
    }
  }
  return { original, normalized, ...textPart(original), direction: null };
}

/** An Event token matches a stored key when it is the whole key or the key's Event part (after the last `/`), case-insensitively. */
export function eventTokenOf(value: string): string {
  return normalizeForm(value.trim());
}
