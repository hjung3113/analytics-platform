// Suggestion scan of the concept review (#1196 e): which targets of OTHER models look like the targets of one model.
// Pure. Candidates are narrowed through an inverted index (shared name trigrams or shared field names) before they are
// scored, so a large workspace is not an all-pairs scan. Every result is a PROPOSAL (`proposal: true`): the scan reads
// no stored decision as equivalence and writes nothing.

import { SIMILARITY_MIN_SCORE, type SimilarityBasis, normalizeName, scoreTargets } from './concept-similarity.js';

export const SUGGESTION_CAP = 500;

export interface ScanTarget {
  modelId: string;
  targetKey: string;
  kind: 'module' | 'event';
  name: string;
  fields: readonly string[];
}
export interface Suggestion {
  kind: 'module' | 'event';
  source: { modelId: string; targetKey: string; name: string };
  candidate: { modelId: string; targetKey: string; name: string };
  score: number;
  basis: SimilarityBasis;
  /** Always true: a suggestion is a proposal for a human to review, never an equivalence. */
  proposal: true;
}

function grams(value: string): string[] {
  const padded = `  ${value} `;
  const out = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i += 1) out.add(padded.slice(i, i + 3));
  return [...out];
}

/** `alreadySame(a, b)`: both targets are confirmed members of one concept — nothing left to propose. */
export function scanSuggestions(
  sources: readonly ScanTarget[],
  candidates: readonly ScanTarget[],
  alreadySame: (a: ScanTarget, b: ScanTarget) => boolean,
): Suggestion[] {
  const index = new Map<string, number[]>();
  const add = (token: string, at: number) => {
    const list = index.get(token);
    if (list) list.push(at);
    else index.set(token, [at]);
  };
  candidates.forEach((c, at) => {
    const name = normalizeName(c.name);
    if (name !== '') for (const g of grams(name)) add(`n:${c.kind}:${g}`, at);
    for (const f of new Set(c.fields.map(normalizeName))) if (f !== '') add(`f:${c.kind}:${f}`, at);
  });
  const out: Suggestion[] = [];
  for (const source of sources) {
    const hits = new Set<number>();
    const name = normalizeName(source.name);
    if (name !== '') for (const g of grams(name)) for (const at of index.get(`n:${source.kind}:${g}`) ?? []) hits.add(at);
    for (const f of new Set(source.fields.map(normalizeName))) if (f !== '') for (const at of index.get(`f:${source.kind}:${f}`) ?? []) hits.add(at);
    for (const at of hits) {
      const candidate = candidates[at] as ScanTarget;
      if (candidate.modelId === source.modelId || alreadySame(source, candidate)) continue;
      const { score, basis } = scoreTargets(source, candidate);
      if (score < SIMILARITY_MIN_SCORE) continue;
      out.push({
        kind: source.kind,
        source: { modelId: source.modelId, targetKey: source.targetKey, name: source.name },
        candidate: { modelId: candidate.modelId, targetKey: candidate.targetKey, name: candidate.name },
        score,
        basis,
        proposal: true,
      });
    }
  }
  return out
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.source.targetKey.localeCompare(b.source.targetKey) ||
        a.candidate.modelId.localeCompare(b.candidate.modelId) ||
        a.candidate.targetKey.localeCompare(b.candidate.targetKey),
    )
    .slice(0, SUGGESTION_CAP);
}
