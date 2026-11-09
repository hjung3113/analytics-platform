// Runs the evaluation queries through the real read path (`runSearch`, the same function `logKnowledge.search` calls) and scores them (#1508 S-e).

import { performance } from 'node:perf_hooks';

import type { Db } from '../../../../db/client.js';
import { type SearchInput, runSearch } from '../../repositories/search-read.js';
import { type Corpus, type EvalQuery, QUERY_TYPES, type QueryType } from './corpus.js';
import type { LoadedCorpus } from './load-corpus.js';
import { type QueryScore, type TypeSummary, scoreQuery, summarize } from './metrics.js';

export interface QueryResult {
  id: string;
  type: QueryType;
  q: string;
  returned: string[];
  relevant: string[];
  score: QueryScore;
  /** Forward/reverse mixing: a main-section hit that carries only the other direction, or an opposite-section hit that carries the asked direction. */
  directionCounterExamples: string[];
  /** A main-section hit whose matching records are all of the other kind (observed vs expected). */
  kindViolations: string[];
  /** Wall time of the read (ms). */
  ms: number;
}

export interface EvalReport {
  byType: Partial<Record<QueryType, TypeSummary>>;
  queries: QueryResult[];
  directionCounterExamples: number;
  kindViolations: number;
  skipped: Corpus['skipped'];
}

function inputOf(query: EvalQuery, loaded: LoadedCorpus): SearchInput {
  const o = query.owner;
  const owner: SearchInput['owner'] = !o
    ? null
    : 'software' in o
      ? { modelId: null, softwareId: loaded.softwareId.get(o.software) ?? null, includeSoftware: false }
      : { modelId: loaded.modelId.get(o.model) ?? null, softwareId: null, includeSoftware: o.includeSoftware };
  return { q: query.q, owner, relation: null, kind: query.kind ?? 'all', includeOpposite: query.includeOpposite === true, cursor: null, limit: 20 };
}

export async function evaluate(db: Db, loaded: LoadedCorpus, corpus: Corpus): Promise<EvalReport> {
  const viewer = { workspaceId: loaded.workspaceId, actorId: loaded.viewerId };
  const results: QueryResult[] = [];
  for (const query of corpus.queries) {
    const started = performance.now();
    const out = await runSearch(db, viewer, inputOf(query, loaded));
    const ms = performance.now() - started;
    if (!out.ok) throw new Error(`query ${query.id} failed: ${out.message}`);
    const keyOf = (id: string) => loaded.itemKey.get(id) ?? `unknown:${id}`;
    const returned = out.response.items.map((i) => keyOf(i.itemId));
    const opposite = (out.response.opposite ?? []).map((i) => keyOf(i.itemId));
    const other = new Set(query.otherDirection ?? []);
    const relevant = new Set(query.relevant);
    const mixed = [...returned.filter((k) => other.has(k)), ...opposite.filter((k) => relevant.has(k))];
    const otherKind = new Set(query.otherKind ?? []);
    results.push({
      id: query.id,
      type: query.type,
      q: query.q,
      returned,
      relevant: query.relevant,
      score: scoreQuery(returned, query.relevant),
      directionCounterExamples: mixed,
      kindViolations: returned.filter((k) => otherKind.has(k)),
      ms,
    });
  }
  const byType: EvalReport['byType'] = {};
  for (const type of QUERY_TYPES) {
    const scores = results.filter((r) => r.type === type).map((r) => r.score);
    if (scores.length > 0) byType[type] = summarize(scores);
  }
  return {
    byType,
    queries: results,
    directionCounterExamples: results.reduce((n, r) => n + r.directionCounterExamples.length, 0),
    kindViolations: results.reduce((n, r) => n + r.kindViolations.length, 0),
    skipped: corpus.skipped,
  };
}

export function formatTable(report: EvalReport): string {
  const pad = (s: string, n: number) => s.padEnd(n);
  const f = (x: number) => x.toFixed(3);
  const lines = [`${pad('type', 22)}${pad('queries', 9)}${pad('Recall@20', 11)}${pad('Prec@10', 9)}MRR`];
  for (const type of QUERY_TYPES) {
    const s = report.byType[type];
    if (s) lines.push(`${pad(type, 22)}${pad(String(s.queries), 9)}${pad(f(s.recall20), 11)}${pad(f(s.precision10), 9)}${f(s.mrr)}`);
  }
  for (const s of report.skipped) lines.push(`${pad(s.type, 22)}skipped: ${s.reason}`);
  lines.push(`direction counter-examples: ${report.directionCounterExamples} (must be 0)`, `observed/expected violations: ${report.kindViolations} (must be 0)`);
  return lines.join('\n');
}
