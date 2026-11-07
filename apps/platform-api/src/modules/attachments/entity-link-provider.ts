// The `manual_validation_attachment` Entity Link endpoint (ADR-0123, #1466): an attachment whose parent kind is
// `validation_round`. It has no Managed System and no read right of its own: `canRead` asks the `AttachmentParentReader`
// registered for the row's parent kind, the same judge as the download path, so the two cannot drift. A kind with no
// reader is denied (default-deny). The row is resolved in the workspace by the storage-key prefix (the table has no
// workspace_id column), only while active and linked to a round.

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import { HttpError } from '../../lib/errors.js';
import type { EntityLinkProvider } from '../entity-links/provider-types.js';
import type { AttachmentParentReader } from './parent-kinds.js';

async function resolveAttachment(db: Db, workspaceId: string, id: string) {
  const res = await db.execute<{ parent_id: string }>(sql`
    select parent_id
      from voc.voc_attachments
     where id = ${id}
       and parent_kind = 'validation_round'
       and parent_id is not null
       and archived_at is null
       and storage_key like ${`${workspaceId}/%`}
     limit 1
  `);
  const row = res.rows[0];
  if (!row) return null;
  return {
    workspace_id: workspaceId,
    managed_system_id: null,
    reporter_id: null,
    parent: { kind: 'validation_round', id: row.parent_id },
  };
}

export function manualValidationAttachmentEntityLinkProvider(
  readers: readonly AttachmentParentReader[],
): EntityLinkProvider {
  return {
    entityType: 'manual_validation_attachment',
    assertExists: resolveAttachment,
    getPermissionSubject: resolveAttachment,
    canRead: async (_deps, actor, subject) => {
      const reader = readers.find((candidate) => candidate.kind === subject.parent?.kind);
      if (!reader || !subject.parent || subject.workspace_id !== actor.workspace_id) return false;
      try {
        await reader.assertCanRead({
          actor,
          row: {
            voc_id: null,
            comment_id: null,
            comment_kind: null,
            parent_kind: subject.parent.kind,
            parent_id: subject.parent.id,
            uploaded_by_actor_id: '',
          },
        });
        return true;
      } catch (err) {
        if (err instanceof HttpError && err.code === 'permission.denied') return false;
        throw err;
      }
    },
    getReporterSummary: async () => ({ available: false }),
    getInternalSummary: async () => null,
    listExpectedLinks: async () => [],
  };
}
