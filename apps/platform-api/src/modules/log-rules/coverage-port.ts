// RuleCoveragePort (#1494 R-d, design log-rules §5.3): the read surface other modules (Gate, Round screen, Datasets;
// wired in R-f, not here) use for spec coverage and RuleSet Revision resolution. Workspace-parameterised like the other
// ports: the caller verified the workspace and decides the permission; this port applies none (coverage visibility equals
// `platform:view`, as log-knowledge reads, see the module AGENTS.md). Reads only; no outbound call.

import { and, eq } from 'drizzle-orm';

import { ruleSetRevisions } from '../../db/schema/log-rules.js';
import type { Tx } from '../../db/tx.js';
import type { CoverageKnowledge } from './deps.js';
import { computeModelCoverage } from './coverage-service.js';
import type { CoverageRevision, CoverageSpecPin, CoverageState, NotComputableReason } from './domain/coverage.js';
import { loadGroups } from './repositories/catalog-read.js';

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

export interface RuleCoveragePort {
  getCoverage(tx: Tx, workspaceId: string, modelId: string, softwareId?: string | null): Promise<RuleCoverage>;
  /**
   * Resolves a RuleSet Revision of the CURRENT catalog by `ruleSetKey` and the Validator's revision string — the
   * reported `revision` or its `resultRef`, compared exactly. Null when the key is not in the current catalog, when no
   * Revision matches, or when two Revisions of the RuleSet match (`ambiguous`: never guessed).
   */
  resolveRuleSetRevision(tx: Tx, workspaceId: string, ruleSetKey: string, revision: string): Promise<ResolvedRuleSetRevision | null>;
}

export function createRuleCoveragePort(deps: { knowledgeLookup: CoverageKnowledge }): RuleCoveragePort {
  return {
    async getCoverage(tx, workspaceId, modelId, softwareId = null) {
      const result = await computeModelCoverage({ knowledge: deps.knowledgeLookup }, tx, workspaceId, modelId, softwareId);
      if (!result.computable) return result;
      return {
        computable: true,
        requirements: result.requirements.map(({ key, state }) => ({ key, state })),
        coverageDigest: result.coverageDigest,
        specPin: result.specPin,
        ruleSetRevisions: result.ruleSetRevisions,
      };
    },
    async resolveRuleSetRevision(tx, workspaceId, ruleSetKey, revision) {
      const group = (await loadGroups(tx, workspaceId, ruleSetKey))[0];
      if (!group) return null;
      const hits = group.revisions.filter((r) => r.revision === revision || r.resultRef === revision);
      const [hit] = hits;
      if (hits.length !== 1 || !hit) return null;
      const [row] = await tx
        .select({ revisionDigest: ruleSetRevisions.revisionDigest })
        .from(ruleSetRevisions)
        .where(and(eq(ruleSetRevisions.workspaceId, workspaceId), eq(ruleSetRevisions.id, hit.id)));
      if (!row) return null;
      return {
        ruleSetKey: group.ruleSetKey,
        revision: hit.revision,
        resultRef: hit.resultRef,
        status: hit.status,
        isCurrent: group.current?.id === hit.id,
        revisionDigest: row.revisionDigest,
      };
    },
  };
}
