import type { Db } from '../../db/client.js';
import type { createAuditService } from '../core/audit/audit-service.js';
import type { SourceSampleSet } from '@ap/contract-schemas';
import type { CheckService } from '../permissions/check-service.js';
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

/**
 * The Source-owner half of `explorer.source.read` (design §4): the capability is a workspace grant, and which `sourceOwner`s a holder may read
 * is judged here, per request. Nothing in the permission model carries a Source owner yet, so the assembly injects the rule; the production
 * default refuses every owner (fail closed) until the owner-scoped grant model is decided (backlog, #1469).
 */
export interface SourceOwnerAccess {
  allows(actor: { actor_id: string; workspace_id: string }, sourceOwner: string): Promise<boolean>;
}

export const denyAllSourceOwners: SourceOwnerAccess = { allows: async () => false };

/** What the read endpoints (`logExplorer.records|window|parsed|periods`) need. */
export interface LogExplorerReadDeps {
  db: Db;
  checkService: CheckService;
  audit: ReturnType<typeof createAuditService>;
  clock: () => Date;
  /**
   * The Source adapter, or null while none is connected: every read then answers `source_absent` with reason `source_not_connected`.
   * Production injects no adapter yet; the synthetic one comes only from the dev/test assembly (ADR-0119 §7).
   */
  sourceReadPort: SourceReadPort | null;
  sourceOwnerAccess: SourceOwnerAccess;
  /** HMAC key of the page cursors; absent = a random key per process. */
  cursorKey?: Buffer;
}
