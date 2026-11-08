// Text normalization of the search index (#1506 S-c, design log-knowledge-search §3.2). Pure and DB-free.
// Rule: NFKC + lower-case; a word is split at `_` `-` `.` `/` and camelCase boundaries and BOTH the original word and its pieces are
// kept (`STEP_PROCESS` -> `step_process`, `step`, `process`). Korean has no morphology here: whitespace words only, the trigram
// column of the index does the fuzzy part. No external call, no dictionary.

/** The characters a word may hold before it is cut (letters and digits of any script, and the join characters `_ - . /`). */
const WORD = /[\p{L}\p{N}_\-./]+/gu;
const JOINERS = /[_\-./]+/u;
const EDGE_JOINERS = /^[_\-./]+|[_\-./]+$/gu;

/** NFKC then lower-case: the one spelling every comparison uses. */
export function normalizeForm(text: string): string {
  return text.normalize('NFKC').toLowerCase();
}

/** The camelCase / acronym boundaries of one already NFKC-folded (case preserved) word segment: `fooBar` -> foo, bar; `HTTPServer` -> http, server. */
function camelPieces(segment: string): string[] {
  return segment
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu}+)(\p{Lu}\p{Ll})/gu, '$1 $2')
    .split(' ')
    .filter((x) => x !== '');
}

/** All tokens of one word: the original (lower-cased) first, then its pieces; duplicates removed, order kept. */
export function wordTokens(word: string): string[] {
  const folded = word.normalize('NFKC').replace(EDGE_JOINERS, '');
  if (folded === '') return [];
  const out = [folded.toLowerCase()];
  for (const part of folded.split(JOINERS)) {
    for (const piece of camelPieces(part)) out.push(piece.toLowerCase());
  }
  return [...new Set(out)];
}

/** The tokens of free text, original words and pieces, each once, in first-seen order. */
export function tokenize(text: string): string[] {
  const seen = new Set<string>();
  for (const word of text.normalize('NFKC').match(WORD) ?? []) {
    for (const token of wordTokens(word)) seen.add(token);
  }
  return [...seen];
}

/** The tokens of an Event / module stable key (`moduleKey/eventKey`): the whole key lower-cased, then every segment's tokens. */
export function keyTokens(key: string): string[] {
  const folded = normalizeForm(key.trim());
  if (folded === '') return [];
  const out = [folded];
  for (const segment of key.split('/')) for (const token of wordTokens(segment)) out.push(token);
  return [...new Set(out)];
}

export interface DocumentSource {
  title: string;
  typeCode: string;
  observation: string | null;
  expected: string | null;
  analysisOpinion: string | null;
  improvement: string | null;
  changeNote: string | null;
  /** Event keys from the revision's relation records and subjects (`moduleKey/eventKey`). */
  eventKeys: readonly string[];
  /** Names and codes of the owner chain (vendor, model, software) and the confirmed concept labels: words, not keys. */
  extraWords: readonly string[];
}

export interface SearchDocumentText {
  /** Expanded tokens of the content fields (full text side: `to_tsvector('simple', …)`). */
  searchText: string;
  /** Tokens, Event keys and extra words (trigram side). */
  termText: string;
}

/** Builds both texts of a document from the source values. */
export function buildDocumentText(source: DocumentSource): SearchDocumentText {
  const content = [source.title, source.typeCode, source.observation, source.expected, source.analysisOpinion, source.improvement, source.changeNote]
    .filter((x): x is string => typeof x === 'string' && x.trim() !== '')
    .flatMap(tokenize);
  const terms = new Set<string>(content);
  for (const key of source.eventKeys) for (const token of keyTokens(key)) terms.add(token);
  for (const word of source.extraWords) for (const token of tokenize(word)) terms.add(token);
  return { searchText: [...new Set(content)].join(' '), termText: [...terms].join(' ') };
}

/** Splits a list into consecutive chunks of at most `size` (size >= 1). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('chunk size must be a positive integer');
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The delay before attempt `attempt + 1` after `attempt` failed attempts: 30 s doubling, capped at one hour. */
export function backoffSeconds(attempt: number): number {
  return Math.min(30 * 2 ** Math.max(0, attempt - 1), 3600);
}

export const MAX_ATTEMPTS = 8;
