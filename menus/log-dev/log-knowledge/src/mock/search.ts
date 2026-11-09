/** Synthetic preview only. Production ranking, visibility and authenticated cursors remain owned by S-d. */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { isUuid, searchEndpoint, searchSuggestEndpoint, type KnowledgeSearchData, type KnowledgeSearchItem, type KnowledgeSearchParams, type SearchDirection, type SearchReason } from '../endpoints';
import { allItems, allLinks, latestRevision, ownerOf, type ItemRec } from './items';
import { byId } from './store';

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const operators = ['before', 'after', '먼저', '이전', '나중', '이후', '→'];
const eventToken = (s: string) => /^[\p{L}\p{N}_./-]+$/u.test(s) && !operators.includes(s.toLowerCase()) && /\p{L}/u.test(s) && (/[_/]/.test(s) || s.length >= 2 && /\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s));
function interpretation(params: KnowledgeSearchParams): KnowledgeSearchData['interpretation'] {
  const original = params.q ?? '', words = original.replace(/→/gu, ' → ').normalize('NFKC').trim().split(/\s+/u), kind = params.kind ?? 'all';
  let direction: SearchDirection | null = null;
  if (params.relation) {
    const r = params.relation, swapped = r.predicate === 'after';
    direction = { origin: 'explicit', source: swapped ? r.target : r.source, target: swapped ? r.source : r.target, kind, swapped };
  } else if (words.length === 3 && eventToken(words[0]!) && eventToken(words[2]!)) {
    const operator = words[1]!.toLowerCase(), swapped = ['after', '나중', '이후'].includes(operator);
    if (swapped || ['before', '먼저', '이전', '→'].includes(operator)) direction = { origin: 'operator', source: words[swapped ? 2 : 0]!, target: words[swapped ? 0 : 2]!, kind, swapped };
  }
  return { original, tokens: direction?.origin === 'operator' ? [] : original.toLowerCase().split(/\s+/u).filter(Boolean), direction };
}
const matchesKey = (stored: string, token: string) => [stored, stored.split('/').at(-1)].some(v => v?.toUpperCase() === token.toUpperCase());
const signature = (p: KnowledgeSearchParams) => {
  let hash = 2166136261;
  for (const c of JSON.stringify([p.q ?? null, p.relation ?? null, p.kind ?? 'all', p.ownerFilter ?? null, !!p.includeOpposite])) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619) >>> 0;
  return hash.toString(16);
};
function message(p: KnowledgeSearchParams): string | null {
  if (!object(p) || Object.keys(p).some(k => !['q', 'ownerFilter', 'relation', 'kind', 'includeOpposite', 'cursor', 'limit'].includes(k))) return 'invalid params';
  if (p.q != null && (typeof p.q !== 'string' || p.q.length > 200 || p.q.includes('\0'))) return 'invalid q';
  if (p.kind != null && !['all', 'observed', 'expected'].includes(p.kind)) return 'invalid kind';
  if (p.includeOpposite !== undefined && typeof p.includeOpposite !== 'boolean') return 'invalid includeOpposite';
  if (p.limit !== undefined && (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 50)) return 'invalid limit';
  if (p.relation != null && (!object(p.relation) || Object.keys(p.relation).some(k => !['source', 'predicate', 'target'].includes(k)) || !['before', 'after'].includes(p.relation.predicate) || ![p.relation.source, p.relation.target].every(s => typeof s === 'string' && s.trim() && s === s.trim() && s.length <= 1200))) return 'invalid relation';
  if (p.ownerFilter != null && (!object(p.ownerFilter) || Object.keys(p.ownerFilter).some(k => !['modelId', 'softwareId', 'includeSoftware'].includes(k)) || [p.ownerFilter.modelId, p.ownerFilter.softwareId].some(v => v != null && (typeof v !== 'string' || !isUuid(v))) || p.ownerFilter.includeSoftware !== undefined && typeof p.ownerFilter.includeSoftware !== 'boolean')) return 'invalid ownerFilter';
  if (p.cursor != null && (typeof p.cursor !== 'string' || !new RegExp(`^mock:${signature(p)}:[0-9]+$`).test(p.cursor))) return 'invalid cursor';
  return p.q === 'mock-error' ? 'synthetic search failure' : null;
}
function toResult(rec: ItemRec, reasons: SearchReason[]): KnowledgeSearchItem {
  const revision = latestRevision(rec), owner = ownerOf(rec);
  return {
    itemId: rec.id, itemNo: rec.itemNo, title: revision.title, excerpt: [revision.observation, revision.expected, revision.analysisOpinion, revision.improvement].find(s => s?.trim())?.replace(/\s+/gu, ' ').slice(0, 160) ?? '',
    typeCode: revision.typeCode, revisionNo: revision.revisionNo, publicationState: rec.publicationState, verificationState: rec.verificationState, processingState: rec.processingState, publishedAt: revision.publishedAt,
    owner: { modelId: owner.modelId, modelCode: byId(owner.modelId)?.code ?? '', modelName: owner.modelName, softwareId: owner.kind === 'software' ? owner.softwareId : null, softwareLabel: owner.kind === 'software' ? owner.versionLabel : null },
    reasons, stage: reasons.includes('observed_same_direction') ? 1 : reasons.includes('expected_same_direction') ? 2 : reasons.includes('concept_mapping') ? 4 : 3,
    expectedOnly: reasons.includes('expected_same_direction') && !reasons.includes('observed_same_direction'),
    relatedCount: new Set(allLinks().flatMap(link => {
      const other = link.sourceItemId === rec.id ? link.targetItemId : link.targetItemId === rec.id ? link.sourceItemId : null;
      return other && allItems().some(item => item.id === other && item.publicationState === 'published') ? [other] : [];
    })).size,
  };
}
function search(p: KnowledgeSearchParams): KnowledgeSearchData {
  const parsed = interpretation(p), direction = parsed.direction, owner = p.ownerFilter, preview = p.q?.startsWith('mock-');
  const items: KnowledgeSearchItem[] = [], opposite: KnowledgeSearchItem[] = [];
  for (const rec of allItems()) {
    if (rec.publicationState !== 'published') continue;
    const own = ownerOf(rec);
    if (owner?.softwareId && own.softwareId !== owner.softwareId || owner?.modelId && (own.modelId !== owner.modelId || own.kind === 'software' && !owner.includeSoftware && !owner.softwareId)) continue;
    const records = (latestRevision(rec).relations ?? []).filter(r => !p.kind || p.kind === 'all' || r.kind === p.kind);
    const same = direction ? records.filter(r => matchesKey(r.source, direction.source) && matchesKey(r.target, direction.target)) : [];
    const reverse = direction ? records.some(r => matchesKey(r.source, direction.target) && matchesKey(r.target, direction.source)) : false;
    if (!same.length && reverse) { opposite.push(toResult(rec, [])); continue; }
    const reasons: SearchReason[] = [];
    if (same.some(r => r.kind === 'observed')) reasons.push('observed_same_direction');
    else if (same.length) reasons.push('expected_same_direction');
    const r = latestRevision(rec), text = [r.title, r.observation, r.expected, r.analysisOpinion, r.improvement, ...(r.relations ?? []).flatMap(rel => [rel.source, rel.target])].join(' ').toLowerCase();
    if (!reasons.length && (preview && p.q !== 'mock-none' || parsed.tokens.length > 0 && parsed.tokens.every(token => text.includes(token)))) reasons.push('exact_token');
    if (reasons.length) items.push(toResult(rec, reasons));
  }
  const sort = (a: KnowledgeSearchItem, b: KnowledgeSearchItem) => a.stage - b.stage || b.publishedAt.localeCompare(a.publishedAt) || a.itemId.localeCompare(b.itemId);
  items.sort(sort); opposite.sort(sort);
  // Explicit presentation fixture, not an implementation of production concept expansion or ranking.
  if (p.q === 'mock-reasons') {
    const reasons: SearchReason[] = ['observed_same_direction', 'expected_same_direction', 'exact_token', 'concept_mapping'];
    items.forEach((item, index) => { const reason = reasons[index % reasons.length]!; item.reasons = [reason]; item.stage = index % reasons.length + 1; item.expectedOnly = reason === 'expected_same_direction'; });
  }
  const offset = p.cursor ? Number(p.cursor.split(':').at(-1)) : 0, size = p.limit ?? 20, more = items.length > offset + size;
  return {
    version: 'v0', interpretation: parsed, items: items.slice(offset, offset + size), opposite: p.includeOpposite && !p.cursor ? opposite.slice(0, 20) : null, oppositeHasMore: !!p.includeOpposite && opposite.length > 20,
    hasMore: more, nextCursor: more ? `mock:${signature(p)}:${offset + size}` : null, capped: items.length > 100,
    indexLag: { lagSeconds: p.q === 'mock-indexing' ? 11 : null, backfill: { state: p.q === 'mock-indexing' ? 'running' : 'done', percent: p.q === 'mock-indexing' ? 48 : 100 } },
  };
}
export const searchReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(searchEndpoint, { mart: false, validate: ({ params }) => message(params), handle: ({ params }) => search(params) }),
  defineMockEndpoint(searchSuggestEndpoint, { mart: false, validate: ({ params }) => !params.q?.trim() || message(params) ? 'invalid suggestion query' : null,
    handle: ({ params }) => {
      const prefix = params.q.toUpperCase(), suggestions: { kind: 'title' | 'eventKey'; text: string }[] = [];
      const seen = new Set<string>();
      for (const rec of allItems().filter(item => item.publicationState === 'published')) {
        const owner = ownerOf(rec), filter = params.ownerFilter;
        if (filter?.softwareId && filter.softwareId !== owner.softwareId || filter?.modelId && (filter.modelId !== owner.modelId || owner.kind === 'software' && !filter.includeSoftware && !filter.softwareId)) continue;
        const revision = latestRevision(rec), keys = (revision.relations ?? []).flatMap(r => [r.source, r.target]);
        for (const [kind, text] of [['title', revision.title] as const, ...keys.flatMap(key => [['eventKey', key] as const, ['eventKey', key.split('/').at(-1)!] as const])]) {
          if (text.toUpperCase().startsWith(prefix) && !seen.has(text)) { seen.add(text); suggestions.push({ kind, text }); }
        }
      }
      return { version: 'v0' as const, suggestions: suggestions.slice(0, 12) };
    } }),
];
