import type { Db } from '../../db/client.js';
import type { CheckService } from '../permissions/check-service.js';
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
}
