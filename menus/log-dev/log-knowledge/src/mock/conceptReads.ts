/**
 * Mock server half of the concept mapping reads (#1196 e, design v0.6 §15.4), answered like the real server
 * (`modules/log-knowledge/concept-endpoints.ts`): `conceptMappings` (stored rows, newest proposal first, `target_gone`
 * from the model's current published revision) and `conceptSuggestions` (computed on every read from the current
 * published specs, `proposal: true`, never stored; a pair a human decided is not proposed again; `truncated` at the
 * 500 cap). An unknown model answers an empty page, a malformed param an `error`.
 */
import { defineMockEndpoint, type AnyMockEndpoint } from '@ap/mock-server';
import { CONCEPT_KINDS, CONCEPT_REVIEW_STATES, conceptMappingsEndpoint, conceptSuggestionsEndpoint, type ConceptMappingRow, type ConceptSuggestion, type ConceptSuggestionsResult } from '../endpoints';
import { allMappings, conceptById, type MappingRec } from './conceptStore';
import { SIMILARITY_MIN_SCORE, SUGGESTION_CAP, currentTargets, scoreTargets, uuidCode } from './conceptInput';
import { specRevisions } from './specStore';
import { byId } from './store';

const PAGE_SIZE_MAX = 200;
/** The server's `judgePaging`: 0-based page, `pageSize` 1..200 (default 50). */
function pagingMessage(p: { page?: unknown; pageSize?: unknown }): string | null {
  if (p.page !== undefined && (typeof p.page !== 'number' || !Number.isInteger(p.page) || p.page < 0 || p.page > 1_000_000)) return 'page must be a non-negative integer (0-based)';
  if (p.pageSize !== undefined && (typeof p.pageSize !== 'number' || !Number.isInteger(p.pageSize) || p.pageSize < 1 || p.pageSize > PAGE_SIZE_MAX)) return `pageSize must be an integer from 1 to ${PAGE_SIZE_MAX}`;
  return null;
}
const enumMessage = (params: Record<string, unknown>, key: string, allowed: readonly string[]): string | null =>
  params[key] === undefined || (typeof params[key] === 'string' && allowed.includes(params[key] as string)) ? null : `${key} must be one of ${allowed.join(', ')}`;
const uuidMessage = (params: Record<string, unknown>, key: string, required = false): string | null =>
  params[key] === undefined && !required ? null : uuidCode(params[key]) === null ? null : `${key} must be a uuid string`;

function mappingRow(m: MappingRec): ConceptMappingRow {
  const concept = conceptById(m.conceptId)!;
  const target = currentTargets(m.modelId)?.targets.get(m.targetKey);
  return {
    id: m.id, conceptId: m.conceptId, conceptLabel: concept.canonicalLabel, kind: m.targetKind, modelId: m.modelId, modelName: byId(m.modelId)?.name ?? '',
    targetKind: m.targetKind, targetKey: m.targetKey, targetName: target?.name ?? null, targetState: target ? 'present' : 'target_gone',
    relationKind: m.relationKind, reviewState: m.reviewState, origin: m.origin, similarityScore: m.similarityScore, similarityBasis: m.similarityBasis ? { ...m.similarityBasis } : null,
    rejectReason: m.rejectReason, proposedBy: m.proposedBy, proposedAt: m.proposedAt, reviewedBy: m.reviewedBy, reviewedAt: m.reviewedAt, version: m.rowVersion,
  };
}

/** Models with a published revision: the suggestion scan's population. */
const specModels = (): string[] => [...new Set(specRevisions().filter(r => r.revision.state === 'published').map(r => r.revision.modelId))].sort();

/** The stored decisions the scan respects: every confirmed `equivalent` row, and every row of a concept that holds a rejected row. */
function suggestions(modelId: string, kind: string | undefined): ConceptSuggestion[] {
  const models = specModels();
  if (!models.includes(modelId)) return [];
  const rejectedConcepts = new Set(allMappings().filter(m => m.reviewState === 'rejected').map(m => m.conceptId));
  const conceptsOf = new Map<string, { confirmed: Set<string>; rejected: Set<string>; any: Set<string> }>();
  for (const m of allMappings()) {
    if (!models.includes(m.modelId) || !((m.reviewState === 'confirmed' && m.relationKind === 'equivalent') || rejectedConcepts.has(m.conceptId))) continue;
    const entry = conceptsOf.get(`${m.modelId}|${m.targetKey}`) ?? { confirmed: new Set<string>(), rejected: new Set<string>(), any: new Set<string>() };
    entry.any.add(m.conceptId);
    if (m.reviewState === 'rejected') entry.rejected.add(m.conceptId);
    if (m.reviewState === 'confirmed' && m.relationKind === 'equivalent') entry.confirmed.add(m.conceptId);
    conceptsOf.set(`${m.modelId}|${m.targetKey}`, entry);
  }
  const shares = (x?: Set<string>, y?: Set<string>): boolean => !!x && !!y && [...x].some(c => y.has(c));
  const same = (a: { modelId: string; key: string }, b: { modelId: string; key: string }): boolean => {
    const mine = conceptsOf.get(`${a.modelId}|${a.key}`), theirs = conceptsOf.get(`${b.modelId}|${b.key}`);
    return shares(mine?.confirmed, theirs?.confirmed) || shares(mine?.rejected, theirs?.any) || shares(theirs?.rejected, mine?.any);
  };
  const out: ConceptSuggestion[] = [];
  for (const [key, source] of currentTargets(modelId)!.targets) {
    if (kind && source.kind !== kind) continue;
    for (const other of models) {
      if (other === modelId) continue;
      for (const [candidateKey, candidate] of currentTargets(other)!.targets) {
        if (candidate.kind !== source.kind || same({ modelId, key }, { modelId: other, key: candidateKey })) continue;
        const { score, basis } = scoreTargets(source, candidate);
        if (score < SIMILARITY_MIN_SCORE) continue;
        out.push({ kind: source.kind, source: { modelId, targetKey: key, name: source.name }, candidate: { modelId: other, modelName: byId(other)?.name ?? '', targetKey: candidateKey, name: candidate.name }, score, basis, proposal: true });
      }
    }
  }
  return out.sort((a, b) => b.score - a.score || a.source.targetKey.localeCompare(b.source.targetKey) || a.candidate.modelId.localeCompare(b.candidate.modelId) || a.candidate.targetKey.localeCompare(b.candidate.targetKey)).slice(0, SUGGESTION_CAP);
}

export const conceptReadsMock: readonly AnyMockEndpoint[] = [
  defineMockEndpoint(conceptMappingsEndpoint, {
    mart: false,
    validate: ({ params: p }) => uuidMessage(p, 'modelId') ?? uuidMessage(p, 'conceptId') ?? enumMessage(p, 'reviewState', CONCEPT_REVIEW_STATES) ?? enumMessage(p, 'kind', CONCEPT_KINDS) ?? pagingMessage(p),
    handle: ({ params: p }) => {
      const rows = allMappings().filter(m =>
        (!p.modelId || m.modelId === p.modelId.toLowerCase()) && (!p.conceptId || m.conceptId === p.conceptId.toLowerCase()) && (!p.reviewState || m.reviewState === p.reviewState) && (!p.kind || m.targetKind === p.kind))
        .sort((a, b) => b.proposedAt.localeCompare(a.proposedAt) || a.id.localeCompare(b.id));
      const size = p.pageSize ?? 50, page = p.page ?? 0;
      return { total: rows.length, rows: rows.slice(page * size, (page + 1) * size).map(mappingRow) };
    },
  }),
  defineMockEndpoint(conceptSuggestionsEndpoint, {
    mart: false,
    validate: ({ params: p }) => uuidMessage(p, 'modelId', true) ?? enumMessage(p, 'kind', CONCEPT_KINDS) ?? pagingMessage(p),
    handle: ({ params: p }): ConceptSuggestionsResult => {
      const found = suggestions(p.modelId.toLowerCase(), p.kind);
      const size = p.pageSize ?? 50, page = p.page ?? 0;
      return { total: found.length, truncated: found.length >= SUGGESTION_CAP, rows: found.slice(page * size, (page + 1) * size) };
    },
  }),
];
