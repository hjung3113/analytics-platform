// RuleCoveragePort (#1494 R-d, design log-rules §5.3): the read surface other modules use for spec coverage and RuleSet
// Revision resolution; consumers wired in R-f (#1496): the Round attempt RuleSet link (log-lifecycle), the Dataset rule-id
// check (log-datasets) and the model spec badge (log-knowledge). Workspace-parameterised like the other
// ports: the caller verified the workspace and decides the entry permission; required `viewerActorId` applies
// knowledge object visibility. Reads only; no outbound call.

import { and, eq, inArray } from 'drizzle-orm';

import { ruleSetRevisions, rules } from '../../db/schema/log-rules.js';
import type { Tx } from '../../db/tx.js';
import type { CoverageKnowledge } from './deps.js';
import { computeModelCoverage } from './coverage-service.js';
import type { CoverageRevision, CoverageSpecPin, CoverageState, NotComputableReason } from './domain/coverage.js';
import { matchRevisionRef } from './domain/revision-match.js';
import { type RevisionRow, type RuleSetGroup, loadGroups } from './repositories/catalog-read.js';

export type RuleCoverage =
  | { computable: false; reason: NotComputableReason; specPin: CoverageSpecPin | null; ambiguousKeys?: string[] }
  | {
      computable: true;
      requirements: { key: string; state: CoverageState }[];
      coverageDigest: string;
      specPin: CoverageSpecPin;
      ruleSetRevisions: CoverageRevision[];
    };

export interface ResolvedRuleSetRevision {
  ruleSetKey: string;
  revision: string;
  resultRef: string;
  status: 'active' | 'retired';
  /** The active head of the RuleSet in the current catalog. */
  isCurrent: boolean;
  revisionDigest: string;
}

/** The answer to «which RuleSet Revision does this stored string name» (design §2 ②③). */
export type RuleSetRevisionLookup =
  | ({ state: 'matched' } & ResolvedRuleSetRevision)
  /** Two or more Revisions (of one or several RuleSets) carry the string: never guessed, never linked. */
  | { state: 'ambiguous'; count: number }
  /** The catalog has reports but no Revision carries the string. */
  | { state: 'unknown' }
  /** No accepted, not superseded report: nothing to match against. */
  | { state: 'no_catalog' };

export type RuleKeyCheck =
  /** The Revision resolved; `missing` are the asked rule ids it has no Rule `rule_key` for (exact string, in the asked order). */
  | { state: 'checked'; missing: string[] }
  | { state: 'unresolved'; reason: 'ambiguous' | 'unknown' | 'no_catalog' };

export interface RuleCoveragePort {
  getCoverage(tx: Tx, workspaceId: string, modelId: string, softwareId: string | null, viewerActorId: string): Promise<RuleCoverage>;
  /**
   * Which RuleSet Revision of the CURRENT catalog a stored attempt / pin string names: the reported `revision` or its
   * `resultRef`, compared exactly, over every RuleSet. `ambiguous` and `unknown` are told apart; callers that link must
   * link only `matched`.
   */
  findRuleSetRevision(tx: Tx, workspaceId: string, ref: string): Promise<RuleSetRevisionLookup>;
  /**
   * Whether the rule ids exist in the Revision `ref` names (identity = RuleSet + `rule_key`, exact string, design §2 ①②④).
   * `unresolved` when the Revision cannot be named; callers then accept the ids unchecked.
   */
  checkRuleKeys(tx: Tx, workspaceId: string, ref: string, ruleIds: readonly string[]): Promise<RuleKeyCheck>;
  /**
   * Resolves a RuleSet Revision of the CURRENT catalog by `ruleSetKey` and the Validator's revision string — the
   * reported `revision` or its `resultRef`, compared exactly. Null when the key is not in the current catalog, when no
   * Revision matches, or when two Revisions of the RuleSet match (`ambiguous`). Null stays for «ambiguous» on purpose:
   * the key-bearing form is for callers that already hold the key and treat «cannot name one Revision» alike; a caller
   * that must tell ambiguous from unknown uses `findRuleSetRevision`.
   */
  resolveRuleSetRevision(tx: Tx, workspaceId: string, ruleSetKey: string, revision: string): Promise<ResolvedRuleSetRevision | null>;
}

export function createRuleCoveragePort(deps: { knowledgeLookup: CoverageKnowledge }): RuleCoveragePort {
  async function locate(tx: Tx, workspaceId: string, ref: string, ruleSetKey?: string) {
    const groups = await loadGroups(tx, workspaceId, ruleSetKey);
    if (groups.length === 0) return { state: 'no_catalog' as const };
    const match = matchRevisionRef<RevisionRow, RuleSetGroup>(groups, ref, ruleSetKey);
    if (match.state !== 'matched') return match;
    const { group, revision } = match;
    const [row] = await tx
      .select({ revisionDigest: ruleSetRevisions.revisionDigest })
      .from(ruleSetRevisions)
      .where(and(eq(ruleSetRevisions.workspaceId, workspaceId), eq(ruleSetRevisions.id, revision.id)));
    if (!row) return { state: 'unknown' as const };
    const resolved: ResolvedRuleSetRevision = {
      ruleSetKey: group.ruleSetKey,
      revision: revision.revision,
      resultRef: revision.resultRef,
      status: revision.status,
      isCurrent: group.current?.id === revision.id,
      revisionDigest: row.revisionDigest,
    };
    return { state: 'matched' as const, revisionId: revision.id, resolved };
  }
  return {
    async getCoverage(tx, workspaceId, modelId, softwareId, viewerActorId) {
      const result = await computeModelCoverage({ knowledge: deps.knowledgeLookup }, tx, workspaceId, modelId, softwareId, viewerActorId);
      if (!result.computable) return result;
      return {
        computable: true,
        requirements: result.requirements.map(({ key, state }) => ({ key, state })),
        coverageDigest: result.coverageDigest,
        specPin: result.specPin,
        ruleSetRevisions: result.ruleSetRevisions,
      };
    },
    async findRuleSetRevision(tx, workspaceId, ref) {
      const found = await locate(tx, workspaceId, ref);
      return found.state === 'matched' ? { state: 'matched', ...found.resolved } : found;
    },
    async checkRuleKeys(tx, workspaceId, ref, ruleIds) {
      const found = await locate(tx, workspaceId, ref);
      if (found.state !== 'matched') return { state: 'unresolved', reason: found.state };
      if (ruleIds.length === 0) return { state: 'checked', missing: [] };
      const present = await tx
        .select({ ruleKey: rules.ruleKey })
        .from(rules)
        .where(and(eq(rules.workspaceId, workspaceId), eq(rules.ruleSetRevisionId, found.revisionId), inArray(rules.ruleKey, [...ruleIds])));
      const known = new Set(present.map((r) => r.ruleKey));
      return { state: 'checked', missing: ruleIds.filter((id) => !known.has(id)) };
    },
    async resolveRuleSetRevision(tx, workspaceId, ruleSetKey, revision) {
      const found = await locate(tx, workspaceId, revision, ruleSetKey);
      return found.state === 'matched' ? found.resolved : null;
    },
  };
}
