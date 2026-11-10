import type pg from 'pg';

import type { Db } from '../../db/client.js';
import type { EqvReadService } from '../eqv/read-service.js';
import type { CheckService } from '../permissions/check-service.js';
import type { ImportApplyHooks } from './import-apply-service.js';
import type { SpecCoverageSource } from './spec-coverage-endpoint.js';

export interface LogKnowledgeDeps {
  db: Db;
  checkService: CheckService;
  /**
   * The runner pool of `importApply` (`createApplyRunnerPool`): separate from the command pool behind `db`, which the
   * action's own transaction occupies, so the runner never waits on command capacity.
   */
  runnerPool?: pg.Pool;
  /** The 명세 커버리지 source of the spec screen badge (the log-rules `RuleCoveragePort`, injected by the assembly; #1496). Absent = «unavailable». */
  ruleCoverage?: SpecCoverageSource;
  /** The eqv read service behind the Top View reads and the link check (default: `eqvReadService`); tests inject a stub. */
  eqvRead?: EqvReadService;
  /** Time budget of one apply call (default `IMPORT_APPLY_BUDGET_MS`); tests shrink it. */
  applyBudgetMs?: number;
  /** Test seams (never set in production). `afterApply` runs once `runApply` returned, before the action record is written. */
  applyHooks?: ImportApplyHooks & { afterApply?(): Promise<void> };
}
