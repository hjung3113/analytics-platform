// Read of the attachments linked to one non-VOC parent (#1451). The owning module has already judged that the actor
// may read the parent; this only lists, scoped to the workspace by the storage-key prefix (the table has no
// workspace_id column) and to active rows. No storage key is returned.

import { sql } from 'drizzle-orm';

import type { Db } from '../../db/client.js';
import type { Tx } from '../../db/tx.js';
import type { AttachmentParentKind } from './parent-kinds.js';

export interface ParentAttachmentRow {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  uploadedByActorId: string;
  linkedAt: string;
}

export async function listAttachmentsByParent(
  db: Db | Tx,
  input: { workspaceId: string; parentKind: Exclude<AttachmentParentKind, 'voc'>; parentId: string },
): Promise<ParentAttachmentRow[]> {
  const res = await db.execute<{
    id: string;
    name: string;
    size_bytes: string | number;
    mime_type: string;
    uploaded_by_actor_id: string;
    linked_at: Date | string;
  }>(sql`
    select id, name, size_bytes, mime_type, uploaded_by_actor_id, linked_at
      from voc.voc_attachments
     where parent_kind = ${input.parentKind}
       and parent_id = ${input.parentId}
       and archived_at is null
       and storage_key like ${`${input.workspaceId}/%`}
     order by linked_at asc, id asc
  `);
  return res.rows.map((r) => ({
    id: r.id,
    name: r.name,
    sizeBytes: typeof r.size_bytes === 'string' ? Number(r.size_bytes) : r.size_bytes,
    mimeType: r.mime_type,
    uploadedByActorId: r.uploaded_by_actor_id,
    linkedAt: (r.linked_at instanceof Date ? r.linked_at : new Date(r.linked_at)).toISOString(),
  }));
}
