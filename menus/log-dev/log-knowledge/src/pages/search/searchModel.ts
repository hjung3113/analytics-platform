import type { KnowledgeSearchParams, SearchKind, SearchRelation } from '../../endpoints';

export const SEARCH_KIND_LABEL: Record<SearchKind, { ko: string; en: string }> = {
  all: { ko: '모두', en: 'All' }, observed: { ko: '관찰', en: 'Observed' }, expected: { ko: '기대', en: 'Expected' },
};
const record = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
export function parseSearchAddress(page: Record<string, string | null | undefined>): { params: KnowledgeSearchParams; active: boolean; errors: string[] } {
  const errors: string[] = [], q = page['q'] ?? '', raw = page['relation'];
  let relation: SearchRelation | null = null;
  if (q.length > 200 || q.includes('\0')) errors.push('q');
  if (raw) {
    try {
      const r: unknown = JSON.parse(raw);
      if (!record(r) || Object.keys(r).some(k => !['source', 'predicate', 'target'].includes(k)) || !['before', 'after'].includes(String(r['predicate'])) ||
          ![r['source'], r['target']].every(v => typeof v === 'string' && v.trim() !== '' && v === v.trim() && v.length <= 1200)) throw new Error('relation');
      relation = r as SearchRelation;
    } catch { errors.push('relation'); }
  }
  const kind = page['kind'] ?? 'all';
  if (!Object.hasOwn(SEARCH_KIND_LABEL, kind)) errors.push('kind');
  if (page['opposite'] != null && !['true', 'false'].includes(page['opposite'])) errors.push('opposite');
  const params: KnowledgeSearchParams = {
    q: q || null, relation, kind: Object.hasOwn(SEARCH_KIND_LABEL, kind) ? kind as SearchKind : 'all', includeOpposite: page['opposite'] === 'true',
  };
  return { params, active: q.trim() !== '' || relation !== null, errors };
}

/** The server interprets an exact three-token operator query again unless its operator is removed with the chip. */
export function plainQuery(q: string): string {
  const words = q.normalize('NFKC').trim().split(/\s+/u);
  return words.length === 3 && ['before', 'after', '먼저', '이전', '나중', '이후', '→'].includes(words[1]!.toLowerCase()) ? `${words[0]} ${words[2]}` : q;
}
