import type { Db } from '../../db/client.js';
import type { createAuditService } from '../core/audit/audit-service.js';
import type { SourceSampleSet } from '@ap/contract-schemas';
import type { SourceReadPort } from './ports/source-read.js';

/**
 * The log-lifecycle read port this module will use (Round `sample_set`, `rule_result` reverse lookup). Provisional: node a only fixes the
 * seam; nodes b/d add the methods they need and the implementation inside log-lifecycle. No Round or lifecycle table is read here.
 */
export interface LifecycleRead {
  getRoundSampleSet(workspaceId: string, roundId: string): Promise<SourceSampleSet | null>;
}

export interface LogExplorerDeps {
  db: Db;
  clock: () => Date;
  /** The Source adapter, injected by the assembly. Production injects a real one; the synthetic adapter is dev/test only (ADR-0119 §7). */
  sourceReadPort: SourceReadPort;
  lifecycleRead: LifecycleRead;
  audit: ReturnType<typeof createAuditService>;
}
