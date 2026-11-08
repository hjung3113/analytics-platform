import type { Db } from '../../db/client.js';
import type { SourceOwnerAccess } from '../log-explorer/index.js';
import type { SuiteRequestPort, SuiteResultReadPort } from '../log-lifecycle/index.js';
import type { KnowledgeLookup } from '../log-knowledge/index.js';
import type { CheckService } from '../permissions/check-service.js';
import type { RuleKeyChecker } from './rule-scope-check.js';
import type { DatasetSourceRead } from './source-check.js';

export interface LogDatasetsDeps {
  db: Db;
  checkService: CheckService;
  /**
   * The Source read port that settles whether a revision's files still exist and match (design log-test-datasets §3.2). OPTIONAL: production
   * has no real adapter yet, and without one every availability is `unverified`. The assembly injects the guarded port of the log-explorer
   * module; this module never imports the synthetic adapter or `testing/`.
   */
  sourceRead?: DatasetSourceRead | undefined;
  /**
   * Which `sourceOwner`s the actor may probe (the log-explorer seam, `denyAllSourceOwners` by default): without it a dataset author could use
   * the availability check to learn which files an owner holds. A denied owner = no Source call, every file `permission_denied`.
   */
  sourceOwnerAccess: SourceOwnerAccess;
  /** The log-knowledge read port (barrel): the current effective spec pin a baseline's `specPin` is compared with (기준 낡음 `spec_pin_changed`, #1478). */
  knowledgeLookup: KnowledgeLookup;
  /** The lifecycle barrel port: registers the execution request of a suite run item and reads request states (#1479). This module never touches a lifecycle table. */
  lifecycleRequests: SuiteRequestPort;
  /** The lifecycle barrel read port for the rule results of the latest succeeded attempt of a request (the comparison, #1480). Rule ids and result names only. */
  lifecycleResults: SuiteResultReadPort;
  /** The rule catalog rule-id check of `expectedScope` (the log-rules `RuleCoveragePort`, injected by the assembly; #1496). Absent = every id accepted unchecked. */
  ruleCoverage?: RuleKeyChecker | undefined;
}
