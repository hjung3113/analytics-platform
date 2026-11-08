import type { Db } from '../../db/client.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { KnowledgeLookup } from '../log-knowledge/index.js';
import type { CheckService } from '../permissions/check-service.js';

export interface LogRulesDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
}

/** What the catalog reads need: no audit (reads write nothing). */
export type LogRulesReadDeps = Pick<LogRulesDeps, 'db' | 'checkService'>;

/** The effective-spec read of the log-knowledge barrel port (R-c); coverage reads depend on it, never on log-knowledge internals. */
export type CoverageKnowledge = Pick<KnowledgeLookup, 'listEffectiveRequirements'>;

/** The model / software name lists of the log-knowledge barrel port: the Coverage tab picker options (#1496 R-f). */
export type OptionKnowledge = Pick<KnowledgeLookup, 'listModels' | 'listSoftware'>;

/** Catalog reads plus the coverage reads (#1494 R-d). */
export type LogRulesContributionDeps = LogRulesReadDeps & { knowledgeLookup: CoverageKnowledge & OptionKnowledge };
