// The knowledge search read (#1507 S-d, design log-knowledge-search §4): the pipeline around the SearchPort.
//   1 interpret the query (pure)  2 candidates from the port  3 visibility judged IN the candidate statement (the single predicate of
//   `access-visibility.ts`, handed to the port as a guard)  4 display values read live for at most `limit` rows  5 one row per Item with
//   «관련 Item n건» counting visible targets only. Nothing here caches: a revoked right is gone with the next request.
// There is no exact total anywhere: `capped` only says «more than 100 visible matches» (ADR-0124).

import { KNOWLEDGE_SEARCH_CAP, KNOWLEDGE_SEARCH_OPPOSITE_LIMIT, KNOWLEDGE_SUGGEST_LIMIT_MAX } from '@ap/contract-schemas';
import { sql } from 'drizzle-orm';

import type { Tx } from '../../../db/tx.js';
import { decodeSearchCursor, encodeSearchCursor, queryDigest } from '../domain/search-cursor.js';
import { type ExplicitRelation, type Interpretation, type RelationKind, eventTokenOf, interpretQuery } from '../domain/search-query.js';
import { type Viewer, visibleItemSql, visibleModelSql } from './access-visibility.js';
import { pgSearchPort } from './search-pg-adapter.js';
import { eventPartSql, rowsOf, textArray, uuidArray } from './search-sql.js';
import type { Candidate, CandidateGuard, ConceptKey, KeyMatcher, RelationRecordKind, SearchPlan, SearchPort, SearchReason } from './search-port.js';

const EXCERPT_MAX = 160;

export interface SearchInput {
  q: string | null;
  owner: { modelId: string | null; softwareId: string | null; includeSoftware: boolean } | null;
  relation: ExplicitRelation | null;
  kind: RelationKind;
  includeOpposite: boolean;
  cursor: string | null;
  limit: number;
}

export interface SearchItem {
  itemId: string;
  itemNo: number;
  title: string;
  excerpt: string;
  typeCode: string;
  revisionNo: number;
  publicationState: string;
  verificationState: string;
  processingState: string;
  publishedAt: string;
  owner: { modelId: string; modelCode: string; modelName: string; softwareId: string | null; softwareLabel: string | null };
  reasons: SearchReason[];
  stage: number;
  expectedOnly: boolean;
  relatedCount: number;
}

export interface SearchResponse {
  version: 'v0';
  interpretation: { original: string; tokens: string[]; direction: Interpretation['direction'] };
  items: SearchItem[];
  opposite: SearchItem[] | null;
  oppositeHasMore: boolean;
  hasMore: boolean;
  nextCursor: string | null;
  capped: boolean;
  indexLag: { lagSeconds: number | null; backfill: { state: 'running' | 'done' | 'none'; percent: number } };
}

export type SearchOutcome = { ok: true; response: SearchResponse } | { ok: false; message: string };

const guardOf = (viewer: Viewer): CandidateGuard => (itemId) => visibleItemSql(viewer, itemId);

/**
 * Model/key pairs of the Events a CONFIRMED + EQUIVALENT concept mapping ties to any of `tokens` (a whole key or its Event part).
 * `proposed`, `rejected` and `related` mappings are never read. Both mappings must sit on models the viewer may see, so a hidden
 * model's mapping cannot make an Item match.
 */
export async function conceptKeysFor(tx: Tx, viewer: Viewer, tokens: readonly string[]): Promise<ConceptKey[]> {
  if (tokens.length === 0) return [];
  const t = textArray(tokens);
  const res = await tx.execute(sql`
    SELECT DISTINCT m2.model_id, lower(m2.target_key) AS k
    FROM knowledge.spec_concept_mapping m1
    JOIN knowledge.spec_concept_mapping m2 ON m2.workspace_id = m1.workspace_id AND m2.concept_id = m1.concept_id AND m2.id <> m1.id
      AND m2.review_state = 'confirmed' AND m2.relation_kind = 'equivalent' AND m2.target_kind = 'event'
    WHERE m1.workspace_id = ${viewer.workspaceId}::uuid AND m1.review_state = 'confirmed' AND m1.relation_kind = 'equivalent' AND m1.target_kind = 'event'
      AND (lower(m1.target_key) = ANY(${t}) OR ${eventPartSql('lower(m1.target_key)')} = ANY(${t}))
      AND ${visibleModelSql(viewer, sql`m1.model_id`)} AND ${visibleModelSql(viewer, sql`m2.model_id`)}`);
  return rowsOf<{ model_id: string; k: string }>(res).map((r) => ({ modelId: r.model_id, key: r.k }));
}

async function matcherFor(tx: Tx, viewer: Viewer, event: string): Promise<KeyMatcher> {
  const token = eventTokenOf(event);
  return { tokens: [token], conceptKeys: await conceptKeysFor(tx, viewer, [token]) };
}

/** The plan of an interpreted query: what the port is asked for. */
export async function planOf(tx: Tx, viewer: Viewer, input: SearchInput, interp: Interpretation): Promise<SearchPlan> {
  const d = interp.direction;
  const kinds: RelationRecordKind[] = d?.kind === 'observed' ? ['observed'] : d?.kind === 'expected' ? ['expected'] : ['observed', 'expected'];
  return {
    workspaceId: viewer.workspaceId,
    owner: input.owner,
    text: interp.words.length > 0 ? { normalized: interp.normalized, words: interp.words, conceptKeys: await conceptKeysFor(tx, viewer, interp.words) } : null,
    direction: d ? { source: await matcherFor(tx, viewer, d.source), target: await matcherFor(tx, viewer, d.target), kinds } : null,
  };
}

interface DisplayRow extends Record<string, unknown> {
  id: string;
  item_no: number;
  latest_revision_no: number;
  publication_state: string;
  verification_state: string;
  processing_state: string;
  title: string;
  type_code: string;
  published_at: Date | string;
  observation: string | null;
  expected: string | null;
  analysis_opinion: string | null;
  improvement: string | null;
  model_id: string;
  model_code: string;
  model_name: string;
  software_id: string | null;
  version_label: string | null;
}

/** First non-blank body field of the latest Revision, whitespace collapsed, cut on code points. Built at read time; the index stores none. */
export function excerptOf(fields: readonly (string | null)[]): string {
  const first = fields.find((f) => typeof f === 'string' && f.trim() !== '');
  if (!first) return '';
  const flat = first.replace(/\s+/gu, ' ').trim();
  const points = [...flat];
  return points.length <= EXCERPT_MAX ? flat : `${points.slice(0, EXCERPT_MAX).join('')}…`;
}

/** Display values for these candidates, read LIVE from the Item row and its latest Revision. An Item gone private or unpublished since the candidate statement is dropped. */
async function display(tx: Tx, viewer: Viewer, candidates: readonly Candidate[], opposite: boolean): Promise<SearchItem[]> {
  if (candidates.length === 0) return [];
  const ids = candidates.map((c) => c.itemId);
  const rows = rowsOf<DisplayRow>(
    await tx.execute(sql`
      SELECT i.id, i.item_no, i.latest_revision_no, i.publication_state, i.verification_state, i.processing_state,
        rv.title, rv.type_code, rv.published_at, rv.observation, rv.expected, rv.analysis_opinion, rv.improvement,
        m.id AS model_id, m.code AS model_code, m.name AS model_name, sw.id AS software_id, sw.version_label
      FROM knowledge.knowledge_item i
      JOIN knowledge.knowledge_item_revision rv ON rv.workspace_id = i.workspace_id AND rv.item_id = i.id AND rv.revision_no = i.latest_revision_no
      LEFT JOIN knowledge.software_version sw ON sw.workspace_id = i.workspace_id AND sw.id = i.owner_software_id
      JOIN knowledge.equipment_model m ON m.workspace_id = i.workspace_id AND m.id = coalesce(i.owner_model_id, sw.model_id)
      WHERE i.workspace_id = ${viewer.workspaceId}::uuid AND i.id = ANY(${uuidArray(ids)}) AND i.publication_state = 'published' AND ${visibleItemSql(viewer, sql`i.id`)}`),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const related = await relatedCounts(tx, viewer, ids);
  const out: SearchItem[] = [];
  for (const c of candidates) {
    const r = byId.get(c.itemId);
    if (!r) continue;
    out.push({
      itemId: r.id,
      itemNo: r.item_no,
      title: r.title,
      excerpt: excerptOf([r.observation, r.expected, r.analysis_opinion, r.improvement]),
      typeCode: r.type_code,
      revisionNo: r.latest_revision_no,
      publicationState: r.publication_state,
      verificationState: r.verification_state,
      processingState: r.processing_state,
      publishedAt: new Date(r.published_at).toISOString(),
      owner: { modelId: r.model_id, modelCode: r.model_code, modelName: r.model_name, softwareId: r.software_id, softwareLabel: r.version_label },
      // The opposite section is its own section: no stage claims a same-direction reason there.
      reasons: opposite ? [] : c.reasons,
      stage: c.stage,
      expectedOnly: !opposite && c.expectedOnly,
      relatedCount: related.get(r.id) ?? 0,
    });
  }
  return out;
}

/** «관련 Item n건»: the other end of each link, published and judged by the same visibility predicate (an archived Item is not counted, #1593). */
async function relatedCounts(tx: Tx, viewer: Viewer, ids: readonly string[]): Promise<Map<string, number>> {
  const res = await tx.execute(sql`
    SELECT x.id, count(DISTINCT x.other)::int AS n FROM (
      SELECT l.source_item_id AS id, l.target_item_id AS other FROM knowledge.item_link l WHERE l.workspace_id = ${viewer.workspaceId}::uuid AND l.source_item_id = ANY(${uuidArray(ids)})
      UNION ALL
      SELECT l.target_item_id, l.source_item_id FROM knowledge.item_link l WHERE l.workspace_id = ${viewer.workspaceId}::uuid AND l.target_item_id = ANY(${uuidArray(ids)})
    ) x JOIN knowledge.knowledge_item o ON o.workspace_id = ${viewer.workspaceId}::uuid AND o.id = x.other AND o.publication_state = 'published'
    WHERE ${visibleItemSql(viewer, sql`x.other`)} GROUP BY x.id`);
  return new Map(rowsOf<{ id: string; n: number }>(res).map((r) => [r.id, r.n]));
}

/** Viewer-visible index coverage, never the workspace's operational backfill counters or state. */
export async function indexLagOf(tx: Tx, viewer: Viewer): Promise<SearchResponse['indexLag']> {
  const [hint] = rowsOf<{ total: number; done: number; lag: number | null }>(await tx.execute(sql`
    WITH visible AS (
      SELECT i.id FROM knowledge.knowledge_item i
      WHERE i.workspace_id = ${viewer.workspaceId}::uuid AND i.publication_state = 'published' AND ${visibleItemSql(viewer, sql`i.id`)}
    ), generation AS (
      SELECT coalesce((SELECT coalesce(p.building_generation, p.active_generation)
        FROM knowledge.search_index_pointer p WHERE p.workspace_id = ${viewer.workspaceId}::uuid), 1) AS n
    )
    SELECT count(*)::int AS total,
      count(d.item_id)::int AS done,
      (SELECT floor(extract(epoch FROM now() - min(o.created_at)))::int
       FROM knowledge.search_outbox o JOIN visible v ON v.id = o.item_id
       WHERE o.workspace_id = ${viewer.workspaceId}::uuid AND o.state = 'pending') AS lag
    FROM visible v CROSS JOIN generation g
    LEFT JOIN knowledge.search_document d ON d.workspace_id = ${viewer.workspaceId}::uuid AND d.item_id = v.id AND d.index_generation = g.n`));
  const total = hint?.total ?? 0;
  const done = hint?.done ?? 0;
  const state = total === 0 ? 'none' : done === total ? 'done' : 'running';
  const percent = total === 0 ? 0 : Math.floor((done * 100) / total);
  return { lagSeconds: hint?.lag ?? null, backfill: { state, percent } };
}

export async function runSearch(tx: Tx, viewer: Viewer, input: SearchInput, port: SearchPort = pgSearchPort): Promise<SearchOutcome> {
  const interp = interpretQuery(input.q, input.relation, input.kind);
  const digest = queryDigest({ workspaceId: viewer.workspaceId, actorId: viewer.actorId, n: interp.normalized, w: interp.words, d: interp.direction, o: input.owner, op: input.includeOpposite });
  let after = null;
  if (input.cursor !== null) {
    after = decodeSearchCursor(input.cursor, digest);
    if (after === null) return { ok: false, message: 'cursor does not belong to this query' };
  }
  const plan = await planOf(tx, viewer, input, interp);
  const guard = guardOf(viewer);
  const found = await port.search(tx, plan, guard, { after, limit: input.limit + 1 });
  const hasMore = found.length > input.limit;
  const page = found.slice(0, input.limit);
  const items = await display(tx, viewer, page, false);
  const last = page[page.length - 1];
  const capped = (await port.countUpTo(tx, plan, guard, KNOWLEDGE_SEARCH_CAP + 1)) > KNOWLEDGE_SEARCH_CAP;
  let opposite: SearchItem[] | null = null;
  let oppositeHasMore = false;
  if (input.includeOpposite && after === null && plan.direction) {
    const o = await port.searchOpposite(tx, plan, guard, KNOWLEDGE_SEARCH_OPPOSITE_LIMIT + 1);
    oppositeHasMore = o.length > KNOWLEDGE_SEARCH_OPPOSITE_LIMIT;
    opposite = await display(tx, viewer, o.slice(0, KNOWLEDGE_SEARCH_OPPOSITE_LIMIT), true);
  }
  return {
    ok: true,
    response: {
      version: 'v0',
      interpretation: { original: interp.original, tokens: interp.tokens, direction: interp.direction },
      items,
      opposite,
      oppositeHasMore,
      hasMore,
      nextCursor: hasMore && last ? encodeSearchCursor({ stage: last.stage, scoreMicro: last.scoreMicro, publishedAtMicro: last.publishedAtMicro, itemId: last.itemId }, digest) : null,
      capped,
      indexLag: await indexLagOf(tx, viewer),
    },
  };
}

/** Prefix suggestions through the same guard, at most 12. */
export async function runSuggest(tx: Tx, viewer: Viewer, q: string, owner: SearchInput['owner'], port: SearchPort = pgSearchPort) {
  const suggestions = await port.suggest(tx, { workspaceId: viewer.workspaceId, owner }, guardOf(viewer), q.trim(), KNOWLEDGE_SUGGEST_LIMIT_MAX);
  return { version: 'v0' as const, suggestions };
}
