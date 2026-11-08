// Lifecycle ownership joins compose the knowledge module's single object predicate.
import { type SQL, sql } from 'drizzle-orm';
import type { Viewer } from '../../log-knowledge/index.js';
import { lockOwnerAccess } from '../../log-knowledge/index.js';
import type { Tx } from '../../../db/tx.js';
import { visibleModelSql, visibleSoftwareSql } from '../../log-knowledge/index.js';

export function projectVisibleSql(viewer: Viewer, projectId: SQL): SQL {
  return sql`exists (select 1 from log_lifecycle.development_project acl_p where acl_p.workspace_id = ${viewer.workspaceId}::uuid and acl_p.id = ${projectId} and ${visibleModelSql(viewer, sql`acl_p.model_id`)} and (acl_p.software_id is null or ${visibleSoftwareSql(viewer, sql`acl_p.software_id`)}))`;
}
export function roundVisibleSql(viewer: Viewer, roundId: SQL): SQL {
  return sql`exists (select 1 from log_lifecycle.validation_round acl_r where acl_r.workspace_id = ${viewer.workspaceId}::uuid and acl_r.id = ${roundId} and ${projectVisibleSql(viewer, sql`acl_r.project_id`)})`;
}
export function requestVisibleSql(viewer: Viewer, requestId: SQL): SQL {
  return sql`exists (select 1 from log_lifecycle.execution_request acl_q where acl_q.workspace_id = ${viewer.workspaceId}::uuid and acl_q.id = ${requestId} and ${roundVisibleSql(viewer, sql`acl_q.round_id`)})`;
}
/** Workers also process suite requests, which carry pinned samples and have no knowledge parent. Human reads use requestVisibleSql. */
export function workerRequestVisibleSql(viewer: Viewer, requestId: SQL): SQL {
  return sql`(${requestVisibleSql(viewer, requestId)} or exists (select 1 from log_lifecycle.execution_request worker_q where worker_q.workspace_id = ${viewer.workspaceId}::uuid and worker_q.id = ${requestId} and worker_q.round_id is null and worker_q.suite_run_item_id is not null))`;
}
export function attemptVisibleSql(viewer: Viewer, attemptId: SQL): SQL {
  return sql`exists (select 1 from log_lifecycle.execution_attempt acl_a where acl_a.workspace_id = ${viewer.workspaceId}::uuid and acl_a.id = ${attemptId} and ${requestVisibleSql(viewer, sql`acl_a.request_id`)})`;
}

/** Stabilize the parent ACL for commands and rejudge it in a new statement after all lock waits. */
export async function lockRoundOwner(tx: Tx, viewer: Viewer, roundId: string): Promise<boolean> {
  const found = await tx.execute(sql`select p.model_id, p.software_id from log_lifecycle.validation_round r join log_lifecycle.development_project p on p.workspace_id = r.workspace_id and p.id = r.project_id where r.workspace_id = ${viewer.workspaceId}::uuid and r.id = ${roundId}::uuid`);
  const row = found.rows[0] as { model_id: string; software_id: string | null } | undefined;
  return !!row && await lockOwnerAccess(tx, viewer, { ownerModelId: row.model_id, ownerSoftwareId: row.software_id });
}
