// The PG adapter of the SearchPort (#1507 S-d): FTS (`tsv`) and trigram (`term_text`) over the ACTIVE generation of `search_document`, plus the
// Event relation records of each published Item's latest Revision for direction queries. One statement per call; the caller's guard is
// applied to the Item id of every HIT row (`guarded` below) and to the Items of the suggestion statement, so ranking, count, the opposite
// section and suggestions only ever see visible Items. Hit-first (#1593): the guard runs on the few matched Items, not on every Item.
// This file knows nothing about access rules: it never imports the visibility module.

import { type SQL, sql } from 'drizzle-orm';

import { escapeLikePattern } from '../../../lib/sql-like.js';
import { type Candidate, type CandidateGuard, type ConceptKey, type KeyMatcher, REASON_ORDER, type SearchAfter, type SearchPlan, type SearchPort, type SearchReason, type Suggestion } from './search-port.js';
import { eventPartSql, rowsOf, textArray, uuidParam as uuid } from './search-sql.js';


/**
 * Published Items of the workspace that pass the owner filter, with their latest Revision. With a `guard` it also applies it (the suggestion
 * statement); the hit stages pass none and are guarded once, row by row, by `guardedHits`. Not materialized, so a hit stage drives the join
 * from its index and probes this by primary key instead of building all Items first.
 */
function itemsCte(plan: Pick<SearchPlan, 'workspaceId' | 'owner'>, guard: CandidateGuard | null): SQL {
  const o = plan.owner;
  const parts: SQL[] = [];
  if (o?.modelId) {
    parts.push(
      o.includeSoftware
        ? sql`(i.owner_model_id = ${uuid(o.modelId)} OR i.owner_software_id IN (SELECT sv.id FROM knowledge.software_version sv WHERE sv.workspace_id = i.workspace_id AND sv.model_id = ${uuid(o.modelId)}))`
        : sql`i.owner_model_id = ${uuid(o.modelId)}`,
    );
  }
  if (o?.softwareId) parts.push(sql`i.owner_software_id = ${uuid(o.softwareId)}`);
  const ownerFilter = parts.length > 0 ? sql`AND ${sql.join(parts, sql` AND `)}` : sql``;
  const guardClause = guard ? sql`AND ${guard(sql`i.id`)}` : sql``;
  return sql`items AS ${guard ? sql.raw('MATERIALIZED') : sql.raw('NOT MATERIALIZED')} (
    SELECT i.id AS item_id, i.latest_revision_no AS revision_no, rv.title AS title, rv.published_at AS published_at,
      coalesce(i.owner_model_id, sv.model_id) AS model_id,
      (extract(epoch FROM rv.published_at) * 1000000)::bigint AS pub
    FROM knowledge.knowledge_item i
    JOIN knowledge.knowledge_item_revision rv ON rv.workspace_id = i.workspace_id AND rv.item_id = i.id AND rv.revision_no = i.latest_revision_no
    LEFT JOIN knowledge.software_version sv ON sv.workspace_id = i.workspace_id AND sv.id = i.owner_software_id
    WHERE i.workspace_id = ${uuid(plan.workspaceId)} AND i.publication_state = 'published' ${ownerFilter} ${guardClause}
  )`;
}

/** Event key column `col` (a lower-cased key) matches the tokens: it is a whole token, or its Event part (after the last `/`) is one. */
const tokenMatch = (col: string, tokens: readonly string[]): SQL =>
  tokens.length === 0 ? sql`false` : sql`(${sql.raw(col)} = ANY(${textArray(tokens)}) OR ${eventPartSql(col)} = ANY(${textArray(tokens)}))`;
const conceptMatch = (col: string, modelCol: string, keys: readonly ConceptKey[]): SQL =>
  keys.length === 0 ? sql`false` : sql`(${sql.join(keys.map((k) => sql`(${sql.raw(modelCol)} = ${uuid(k.modelId)} AND ${sql.raw(col)} = ${k.key})`), sql` OR `)})`;

/** The ONE place the guard meets a candidate: every hit row (all stages, both sections) passes it before ranking, counting or paging. Materialized, so it runs once per hit row. */
function guardedHits(raw: SQL, guard: CandidateGuard): SQL[] {
  return [sql`hits_raw AS MATERIALIZED (${raw})`, sql`hits AS (SELECT h.* FROM hits_raw h WHERE ${guard(sql`h.item_id`)})`];
}

interface Built {
  /** Complete `WITH …` prefix (no trailing comma) defining `items` and `hits` (main section). */
  with: SQL;
  active: boolean;
}

function textHits(plan: SearchPlan): SQL[] {
  const t = plan.text;
  if (!t || t.words.length === 0) return [];
  const hits: SQL[] = [];
  const ws = uuid(plan.workspaceId);
  const gen = sql`(SELECT coalesce((SELECT p.active_generation FROM knowledge.search_index_pointer p WHERE p.workspace_id = ${ws}), 1))`;
  // Stage 3: every word is a whole token of the document (`term_text` is space separated). The LIKE prefilter lets the trigram index prune.
  const exact = sql.join(
    t.words.map((w) => sql`(d.term_text LIKE ${`%${escapeLikePattern(w)}%`} AND (' ' || d.term_text || ' ') LIKE ${`% ${escapeLikePattern(w)} %`})`),
    sql` AND `,
  );
  hits.push(sql`SELECT it.item_id, 3 AS stage, 1000000 AS score_micro, 'exact_token' AS reason, false AS expected_only
    FROM items it JOIN knowledge.search_document d ON d.workspace_id = ${ws} AND d.item_id = it.item_id AND d.index_generation = ${gen} WHERE ${exact}`);
  // Stage 6: full text (all words) or trigram word similarity of the whole query. One select per index: an `OR` of the two
  // conditions has no usable index and scans every document. The trigram branch skips what full text already matched, so
  // no Item appears twice.
  // The document scan is planned on its own (`OFFSET 0` fence): joined to `items` the planner chose a parallel sequential scan
  // for the trigram branch (about 0.8 s at 100,000 Items) although the trigram index answers it in about 0.15 s.
  const score = sql`round(greatest(CASE WHEN d.tsv @@ plainto_tsquery('simple', ${t.normalized}) THEN ts_rank(d.tsv, plainto_tsquery('simple', ${t.normalized})) ELSE 0 END, word_similarity(${t.normalized}, d.term_text)) * 1000000)::int`;
  const stage6 = (where: SQL) => sql`SELECT it.item_id, 6 AS stage, d.score_micro, 'text' AS reason, false AS expected_only
    FROM (SELECT d.item_id, ${score} AS score_micro FROM knowledge.search_document d WHERE d.workspace_id = ${ws} AND d.index_generation = ${gen} AND ${where} OFFSET 0) d
    JOIN items it ON it.item_id = d.item_id`;
  hits.push(stage6(sql`d.tsv @@ plainto_tsquery('simple', ${t.normalized})`));
  hits.push(stage6(sql`${t.normalized} <% d.term_text AND NOT d.tsv @@ plainto_tsquery('simple', ${t.normalized})`));
  if (t.conceptKeys.length > 0) {
    // Stage 4 (text): Items about an Event that a confirmed equivalent concept mapping ties to what the query names.
    hits.push(sql`SELECT it.item_id, 4 AS stage, 1000000 AS score_micro, 'concept_mapping' AS reason, false AS expected_only
      FROM items it WHERE EXISTS (SELECT 1 FROM knowledge.item_revision_subject s WHERE s.workspace_id = ${ws} AND s.item_id = it.item_id AND s.revision_no = it.revision_no AND s.target_kind = 'event' AND ${conceptMatch('lower(s.target_key)', 's.model_id', t.conceptKeys)})
        OR EXISTS (SELECT 1 FROM knowledge.item_event_relation_record r WHERE r.workspace_id = ${ws} AND r.item_id = it.item_id AND r.revision_no = it.revision_no AND (${conceptMatch('lower(r.source_key)', 'it.model_id', t.conceptKeys)} OR ${conceptMatch('lower(r.target_key)', 'it.model_id', t.conceptKeys)}))`);
  }
  return hits;
}

function build(plan: SearchPlan, guard: CandidateGuard): Built {
  const ctes: SQL[] = [itemsCte(plan, null)];
  const hitSelects: SQL[] = [];
  const d = plan.direction;
  if (d) {
    ctes.push(sql`dir AS (${recordHitsBody(plan, d.source, d.target, d.kinds)})`);
    ctes.push(sql`reverse_only AS (SELECT item_id FROM (${recordHitsBody(plan, d.target, d.source, d.kinds)}) r WHERE r.item_id NOT IN (SELECT item_id FROM dir))`);
    hitSelects.push(sql`SELECT item_id, stage, score_micro, reason, expected_only FROM dir`);
  }
  hitSelects.push(...textHits(plan).map((hit) => d ? sql`SELECT t.* FROM (${hit}) t WHERE t.item_id NOT IN (SELECT item_id FROM reverse_only)` : hit));
  if (hitSelects.length === 0) return { with: sql`WITH ${sql.join(ctes, sql`, `)}`, active: false };
  ctes.push(...guardedHits(sql.join(hitSelects.map((s) => sql`(${s})`), sql` UNION ALL `), guard));
  return { with: sql`WITH ${sql.join(ctes, sql`, `)}`, active: true };
}

/** The body of a records CTE for the main section. */
function recordHitsBody(plan: SearchPlan, a: KeyMatcher, b: KeyMatcher, kinds: readonly string[]): SQL {
  const ws = uuid(plan.workspaceId);
  const srcExact = tokenMatch('lower(r.source_key)', a.tokens);
  const tgtExact = tokenMatch('lower(r.target_key)', b.tokens);
  const srcAny = sql`(${srcExact} OR ${conceptMatch('lower(r.source_key)', 'it.model_id', a.conceptKeys)})`;
  const tgtAny = sql`(${tgtExact} OR ${conceptMatch('lower(r.target_key)', 'it.model_id', b.conceptKeys)})`;
  return sql`SELECT r.item_id,
      CASE WHEN ${srcExact} AND ${tgtExact} THEN (CASE WHEN r.kind = 'observed' THEN 1 ELSE 2 END) ELSE 4 END AS stage,
      1000000 AS score_micro,
      CASE WHEN ${srcExact} AND ${tgtExact} THEN (CASE WHEN r.kind = 'observed' THEN 'observed_same_direction' ELSE 'expected_same_direction' END) ELSE 'concept_mapping' END AS reason,
      (r.kind = 'expected') AS expected_only
    FROM knowledge.item_event_relation_record r
    JOIN items it ON it.item_id = r.item_id AND it.revision_no = r.revision_no
    WHERE r.workspace_id = ${ws} AND r.kind = ANY(${textArray(kinds)}) AND ${srcAny} AND ${tgtAny}`;
}

const RANKED = sql`
  best AS (SELECT DISTINCT ON (h.item_id) h.item_id, h.stage, h.score_micro, h.expected_only FROM hits h ORDER BY h.item_id, h.stage, h.score_micro DESC, h.expected_only),
  reasons AS (SELECT h.item_id, array_agg(DISTINCT h.reason) AS reasons FROM hits h GROUP BY h.item_id),
  ranked AS (SELECT b.item_id, b.stage, b.score_micro::int AS score_micro, it.pub AS pub, b.expected_only, r.reasons
    FROM best b JOIN items it ON it.item_id = b.item_id JOIN reasons r ON r.item_id = b.item_id)`;

interface RankedRow extends Record<string, unknown> {
  item_id: string;
  stage: number;
  score_micro: number;
  pub: string | number;
  expected_only: boolean;
  reasons: string[];
}

const ORDER_ASC = new Map<string, number>(REASON_ORDER.map((r, i) => [r, i]));
function toCandidate(row: RankedRow): Candidate {
  const reasons = (row.reasons as SearchReason[]).slice().sort((a, b) => (ORDER_ASC.get(a) ?? 99) - (ORDER_ASC.get(b) ?? 99));
  return { itemId: row.item_id, stage: Number(row.stage), scoreMicro: Number(row.score_micro), publishedAtMicro: Number(row.pub), reasons, expectedOnly: row.expected_only === true };
}

function afterCondition(after: SearchAfter | null): SQL {
  if (!after) return sql``;
  return sql`WHERE (r.stage, -r.score_micro, -r.pub, r.item_id) > (${after.stage}::int, ${-after.scoreMicro}::int, ${-after.publishedAtMicro}::bigint, ${uuid(after.itemId)})`;
}

export const pgSearchPort: SearchPort = {
  async search(tx, plan, guard, page) {
    const b = build(plan, guard);
    if (!b.active) return [];
    const res = await tx.execute(sql`${b.with}, ${RANKED}
      SELECT r.* FROM ranked r ${afterCondition(page.after)} ORDER BY r.stage, r.score_micro DESC, r.pub DESC, r.item_id ASC LIMIT ${page.limit}`);
    return rowsOf<RankedRow>(res).map(toCandidate);
  },

  async searchOpposite(tx, plan, guard, limit) {
    const d = plan.direction;
    if (!d) return [];
    const ctes: SQL[] = [itemsCte(plan, null)];
    ctes.push(sql`same AS (${recordHitsBody(plan, d.source, d.target, d.kinds)})`);
    ctes.push(...guardedHits(sql`SELECT * FROM (${recordHitsBody(plan, d.target, d.source, d.kinds)}) o WHERE o.item_id NOT IN (SELECT item_id FROM same)`, guard));
    const res = await tx.execute(sql`WITH ${sql.join(ctes, sql`, `)}, ${RANKED}
      SELECT r.* FROM ranked r ORDER BY r.stage, r.score_micro DESC, r.pub DESC, r.item_id ASC LIMIT ${limit}`);
    return rowsOf<RankedRow>(res).map(toCandidate);
  },

  async countUpTo(tx, plan, guard, cap) {
    const b = build(plan, guard);
    if (!b.active) return 0;
    const res = await tx.execute(sql`${b.with}, ${RANKED}
      SELECT count(*)::int AS n FROM (SELECT 1 FROM ranked LIMIT ${cap}) c`);
    return rowsOf<{ n: number }>(res)[0]?.n ?? 0;
  },

  async suggest(tx, plan, guard, prefix, limit): Promise<Suggestion[]> {
    const like = `${escapeLikePattern(prefix.normalize('NFKC').toLowerCase())}%`;
    const ws = uuid(plan.workspaceId);
    const res = await tx.execute(sql`WITH ${itemsCte(plan, guard)},
      keys AS (
        SELECT r.source_key AS k FROM knowledge.item_event_relation_record r JOIN items it ON it.item_id = r.item_id AND it.revision_no = r.revision_no WHERE r.workspace_id = ${ws}
        UNION SELECT r.target_key FROM knowledge.item_event_relation_record r JOIN items it ON it.item_id = r.item_id AND it.revision_no = r.revision_no WHERE r.workspace_id = ${ws}
        UNION SELECT s.target_key FROM knowledge.item_revision_subject s JOIN items it ON it.item_id = s.item_id AND it.revision_no = s.revision_no WHERE s.workspace_id = ${ws}
      )
      SELECT kind, text FROM (
        SELECT 'title' AS kind, it.title AS text, 0 AS ord FROM items it WHERE lower(it.title) LIKE ${like}
        UNION SELECT 'eventKey', k.k, 1 FROM keys k WHERE lower(k.k) LIKE ${like} OR ${eventPartSql('lower(k.k)')} LIKE ${like}
      ) s ORDER BY ord, text LIMIT ${limit}`);
    return rowsOf<{ kind: 'title' | 'eventKey'; text: string }>(res).map((r) => ({ kind: r.kind, text: r.text }));
  },
};
