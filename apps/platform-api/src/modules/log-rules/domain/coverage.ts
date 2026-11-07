// Spec coverage (#1494 R-d, design log-rules §3.3): computed on read, never stored. Pure. A requirement key of the
// effective spec is matched to a Rule's declared requirement id by EXACT string equality only (no case folding, trimming,
// prefix match or ID mapping); an id with no matching key is not counted. The Rule `scope` is a free label the platform
// does not interpret in v0 (design §3.2 «jsonb 후보», keys fixed only after the Validator survey): it is NOT read here, so
// «scope covers the model/SW only partly» is not evaluated and `partial` comes from `support` alone (open point, see
// api/log-rules.md «Coverage»).

import { canonicalJson, sha256 } from './report.js';

export const COVERAGE_STATES = ['no_rule', 'unsupported', 'unknown', 'partial', 'covered'] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];
export type RuleSupport = 'supported' | 'partial' | 'unsupported' | 'unknown';

/** Why no per-requirement state exists. Never shown as 0%, never turned into all-`no_rule`. */
export const NOT_COMPUTABLE_REASONS = ['model_unknown', 'no_spec', 'ambiguous_key', 'no_catalog', 'no_requirement_ids'] as const;
export type NotComputableReason = (typeof NOT_COMPUTABLE_REASONS)[number];

export interface CoverageSpecPin {
  revisionId: string;
  changeSetDigest: string;
}
/** The effective-spec side, as the log-knowledge read port answers it (keys used exactly as stored). */
export type CoverageSpecInput =
  | { state: 'ok'; specPin: CoverageSpecPin; keys: readonly string[] }
  | { state: 'no_spec' | 'model_unknown'; specPin: null }
  | { state: 'ambiguous_key'; specPin: CoverageSpecPin; ambiguousKeys: readonly string[] };

/** An active, current RuleSet Revision of the accepted catalog. */
export interface CoverageRevision {
  ruleSetKey: string;
  revision: string;
  resultRef: string;
  revisionDigest: string;
}
/** A Rule of a current active Revision that declares at least one requirement id (all its targets' ids, flattened). */
export interface CoverageRule {
  ruleSetKey: string;
  revision: string;
  ruleKey: string;
  support: RuleSupport;
  requirementIds: readonly string[];
}
export interface CoverageCatalogInput {
  /** At least one accepted, not superseded report exists. */
  received: boolean;
  revisions: readonly CoverageRevision[];
  rules: readonly CoverageRule[];
}

export interface DeclaredRule {
  ruleSetKey: string;
  revision: string;
  ruleKey: string;
  support: RuleSupport;
}
export interface RequirementCoverage {
  key: string;
  state: CoverageState;
  declaredBy: DeclaredRule[];
}
export type CoverageCounts = Record<CoverageState, number> & { total: number };

export type CoverageResult =
  | { computable: false; reason: NotComputableReason; specPin: CoverageSpecPin | null; ambiguousKeys?: string[] }
  | {
      computable: true;
      specPin: CoverageSpecPin;
      requirements: RequirementCoverage[];
      counts: CoverageCounts;
      ruleSetRevisions: CoverageRevision[];
      coverageDigest: string;
    };

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpRule = (a: DeclaredRule, b: DeclaredRule): number =>
  cmp(a.ruleSetKey, b.ruleSetKey) || cmp(a.revision, b.revision) || cmp(a.ruleKey, b.ruleKey);

/**
 * The state of one requirement from the `support` of every Rule that declares it. Documented precedence (the design
 * table leaves mixes open): any `supported` → covered; else any `partial` → partial; else all `unsupported` →
 * unsupported; else (all `unknown`, or `unsupported` mixed with `unknown`) → unknown, because `unknown` means «the
 * Validator did not say» and must not be turned into `unsupported`; no declaring Rule → no_rule.
 */
export function stateOf(supports: readonly RuleSupport[]): CoverageState {
  if (supports.length === 0) return 'no_rule';
  if (supports.includes('supported')) return 'covered';
  if (supports.includes('partial')) return 'partial';
  if (supports.every((s) => s === 'unsupported')) return 'unsupported';
  return 'unknown';
}

/** Domain separation: a coverage digest never equals a report, revision or rule digest. */
export const COVERAGE_DIGEST_DOMAIN = 'log_rules.coverage.v0\n';

/**
 * SHA-256 over a canonical form that does not depend on input order: requirements by key (state, declaring Rule ids as
 * `[ruleSetKey, revision, ruleKey]` tuples, so a `/` inside a key cannot blur them), the spec pin and the RuleSet
 * Revisions (`ruleSetKey`, `revision`, `resultRef`, `revisionDigest`) the computation read.
 */
export function coverageDigest(
  specPin: CoverageSpecPin,
  requirements: readonly RequirementCoverage[],
  revisions: readonly CoverageRevision[],
): string {
  const body = {
    specPin: { revisionId: specPin.revisionId, changeSetDigest: specPin.changeSetDigest },
    requirements: [...requirements]
      .sort((a, b) => cmp(a.key, b.key))
      .map((r) => ({
        key: r.key,
        state: r.state,
        rules: [...r.declaredBy].sort(cmpRule).map((d) => [d.ruleSetKey, d.revision, d.ruleKey]),
      })),
    ruleSetRevisions: [...revisions]
      .sort((a, b) => cmp(a.ruleSetKey, b.ruleSetKey) || cmp(a.revision, b.revision))
      .map((v) => [v.ruleSetKey, v.revision, v.resultRef, v.revisionDigest]),
  };
  return sha256(COVERAGE_DIGEST_DOMAIN + canonicalJson(body));
}

export function computeCoverage(spec: CoverageSpecInput, catalog: CoverageCatalogInput): CoverageResult {
  // Spec side first: a model-level fact, true whatever the catalog holds.
  if (spec.state === 'ambiguous_key') {
    return { computable: false, reason: 'ambiguous_key', specPin: spec.specPin, ambiguousKeys: [...spec.ambiguousKeys] };
  }
  if (spec.state !== 'ok') return { computable: false, reason: spec.state, specPin: null };
  if (!catalog.received) return { computable: false, reason: 'no_catalog', specPin: spec.specPin };
  const declaring = catalog.rules.filter((r) => r.requirementIds.length > 0);
  if (declaring.length === 0) return { computable: false, reason: 'no_requirement_ids', specPin: spec.specPin };

  const keys = [...new Set(spec.keys)];
  const known = new Set(keys);
  const byKey = new Map<string, Map<string, DeclaredRule>>();
  for (const rule of declaring) {
    for (const id of rule.requirementIds) {
      if (!known.has(id)) continue; // not in the effective spec: not counted
      let rules = byKey.get(id);
      if (!rules) byKey.set(id, (rules = new Map()));
      // A Rule naming the same id on two targets counts once.
      rules.set(JSON.stringify([rule.ruleSetKey, rule.revision, rule.ruleKey]), {
        ruleSetKey: rule.ruleSetKey,
        revision: rule.revision,
        ruleKey: rule.ruleKey,
        support: rule.support,
      });
    }
  }
  const requirements: RequirementCoverage[] = keys.map((key) => {
    const declaredBy = [...(byKey.get(key)?.values() ?? [])].sort(cmpRule);
    return { key, state: stateOf(declaredBy.map((d) => d.support)), declaredBy };
  });
  const ruleSetRevisions = [...catalog.revisions].sort((a, b) => cmp(a.ruleSetKey, b.ruleSetKey) || cmp(a.revision, b.revision));
  return {
    computable: true,
    specPin: spec.specPin,
    requirements,
    counts: countStates(requirements),
    ruleSetRevisions,
    coverageDigest: coverageDigest(spec.specPin, requirements, ruleSetRevisions),
  };
}

export function countStates(requirements: readonly { state: CoverageState }[]): CoverageCounts {
  const counts: CoverageCounts = { no_rule: 0, unsupported: 0, unknown: 0, partial: 0, covered: 0, total: requirements.length };
  for (const r of requirements) counts[r.state] += 1;
  return counts;
}

/** Default row order: «규칙 없음» first, then the other not-covered states, `covered` last; ties by key (code-unit order). */
export function sortRequirements<T extends { key: string; state: CoverageState }>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => COVERAGE_STATES.indexOf(a.state) - COVERAGE_STATES.indexOf(b.state) || cmp(a.key, b.key));
}
