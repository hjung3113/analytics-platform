// Matching a stored attempt string to a RuleSet Revision of the current catalog (design log-rules §2 identification
// contract ②③). Pure. The string is the Validator's `revision` or its `resultRef`, compared EXACTLY (no case folding,
// trimming or prefix match). A Revision counts once even when both of its strings equal the reference. More than one
// matching Revision, in one RuleSet or across RuleSets, is `ambiguous`: it is never guessed and never linked.

export interface MatchableRevision {
  id: string;
  revision: string;
  resultRef: string;
}
export interface MatchableGroup<R extends MatchableRevision = MatchableRevision> {
  ruleSetKey: string;
  revisions: readonly R[];
  current: { id: string } | null;
}

export type RevisionMatch<G extends MatchableGroup, R extends MatchableRevision> =
  | { state: 'matched'; group: G; revision: R }
  | { state: 'ambiguous'; count: number }
  | { state: 'unknown' };

export function matchRevisionRef<R extends MatchableRevision, G extends MatchableGroup<R>>(
  groups: readonly G[],
  ref: string,
  ruleSetKey?: string,
): RevisionMatch<G, R> {
  const hits: { group: G; revision: R }[] = [];
  for (const group of groups) {
    if (ruleSetKey !== undefined && group.ruleSetKey !== ruleSetKey) continue;
    for (const revision of group.revisions) {
      if (revision.revision === ref || revision.resultRef === ref) hits.push({ group, revision });
    }
  }
  const [first] = hits;
  if (!first) return { state: 'unknown' };
  if (hits.length > 1) return { state: 'ambiguous', count: hits.length };
  return { state: 'matched', ...first };
}
