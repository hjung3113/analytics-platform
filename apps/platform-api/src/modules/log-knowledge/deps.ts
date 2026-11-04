import type pg from 'pg';

import type { Db } from '../../db/client.js';
import type { CheckService } from '../permissions/check-service.js';
import type { ImportApplyHooks } from './import-apply-service.js';

export interface LogKnowledgeDeps {
  db: Db;
  checkService: CheckService;
  /** The pool behind `db`: `importApply` runs `runApply`, which holds an advisory lock on its own connection. */
  pool?: pg.Pool;
  /** Time budget of one apply call (default `IMPORT_APPLY_BUDGET_MS`); tests shrink it. */
  applyBudgetMs?: number;
  /** Test seams (never set in production). `afterApply` runs once `runApply` returned, before the action record is written. */
  applyHooks?: ImportApplyHooks & { afterApply?(): Promise<void> };
}
