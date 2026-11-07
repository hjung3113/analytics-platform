import type { Db } from '../../db/client.js';
import type { AuditService } from '../core/audit/audit-service.js';
import type { CheckService } from '../permissions/check-service.js';

export interface LogRulesDeps {
  db: Db;
  checkService: CheckService;
  auditService: AuditService;
}

/** What the catalog reads need: no audit (reads write nothing). */
export type LogRulesReadDeps = Pick<LogRulesDeps, 'db' | 'checkService'>;
