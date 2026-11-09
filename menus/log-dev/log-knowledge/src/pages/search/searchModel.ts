import type { PageKeyRule } from '@ap/components';
import { isSearchEventToken, isSearchRelation, SEARCH_ORDER_OPERATORS, type KnowledgeSearchParams, type SearchKind, type SearchRelation } from '../../endpoints';

export const SEARCH_KIND_LABEL: Record<SearchKind, { ko: string; en: string }> = {
  all: { ko: '모두', en: 'All' }, observed: { ko: '관찰', en: 'Observed' }, expected: { ko: '기대', en: 'Expected' },
};
const parseRelation = (raw: string): SearchRelation | null => {
  try { const r: unknown = JSON.parse(raw); return isSearchRelation(r) ? r : null; } catch { return null; }
};
/**
 * The page keys this screen accepts, for `usePageKeyRules` (06 §6: a malformed key is refused, never corrected). The label is the user-facing field name.
 * `kind`, `opposite` are closed lists; `relation` is the JSON of one {source, predicate, target}; `q` stays within the server's 200-character text.
 */
export const SEARCH_KEY_RULES = [
  { key: 'q', label: { ko: '검색어', en: 'Search query' }, valid: (raw: string) => raw.length <= 200 && !raw.includes('\0') },
  { key: 'relation', label: { ko: '순서 조건', en: 'Order condition' }, valid: (raw: string) => raw === '' || parseRelation(raw) !== null },
  { key: 'kind', label: { ko: '종류', en: 'Kind' }, valid: (raw: string) => Object.hasOwn(SEARCH_KIND_LABEL, raw) },
  { key: 'opposite', label: { ko: '반대 방향', en: 'Opposite direction' }, valid: (raw: string) => raw === 'true' || raw === 'false' },
] satisfies readonly PageKeyRule[];

/** The query parameters of an address whose keys already passed `SEARCH_KEY_RULES` (a bad key never reaches here: the screen shows `PageKeyWarning` and sends nothing). */
export function parseSearchAddress(page: Record<string, string | null | undefined>): { params: KnowledgeSearchParams; active: boolean } {
  const q = page['q'] ?? '', raw = page['relation'], relation = raw ? parseRelation(raw) : null, kind = page['kind'] ?? 'all';
  const params: KnowledgeSearchParams = {
    q: q || null, relation, kind: Object.hasOwn(SEARCH_KIND_LABEL, kind) ? kind as SearchKind : 'all', includeOpposite: page['opposite'] === 'true',
  };
  return { params, active: q.trim() !== '' || relation !== null };
}

/** Mirror the server's Event/operator/Event grammar; ordinary text must keep every word. */
export function plainQuery(q: string): string {
  const words = q.replace(/→/gu, ' → ').normalize('NFKC').trim().split(/\s+/u);
  return words.length === 3 && (SEARCH_ORDER_OPERATORS as readonly string[]).includes(words[1]!.toLowerCase()) && isSearchEventToken(words[0]!) && isSearchEventToken(words[2]!) ? `${words[0]} ${words[2]}` : q;
}
