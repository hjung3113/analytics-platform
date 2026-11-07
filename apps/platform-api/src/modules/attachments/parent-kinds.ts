// Attachment parent kinds and the per-parent read seam (#1451, log-lifecycle design D6).
//
// A linked attachment belongs to exactly one parent of a closed kind. The kind decides who may download it: each kind
// registers one `AttachmentParentReader`, and the download path asks only that reader. Default-deny: a linked row whose
// kind has no registered reader is never readable, so a new kind cannot widen another kind's access and VOC access
// never grants another kind's attachments. Unlinked rows (no voc_id, comment_id or parent_id) stay readable by their
// uploader only; a row with a parent_id but no resolvable kind is denied.
//
// `voc` is the first parent (its reader is built by `vocAttachmentParent`, behaviour unchanged); `validation_round` is
// the second, and its reader is injected by the log-lifecycle module through `AttachmentsServiceDeps.parents`.

/** The closed set of parent kinds (also the DB check `voc_attachments_parent_kind_check`). */
export const ATTACHMENT_PARENT_KINDS = ['voc', 'validation_round'] as const;
export type AttachmentParentKind = (typeof ATTACHMENT_PARENT_KINDS)[number];

export interface AttachmentActor {
  actor_id: string;
  workspace_id: string;
  role_level: 'admin' | 'developer' | 'user';
}

/** The link columns of a stored attachment row the readers judge. */
export interface AttachmentLinkRow {
  voc_id: string | null;
  comment_id: string | null;
  comment_kind: string | null;
  parent_kind: string | null;
  parent_id: string | null;
  uploaded_by_actor_id: string;
}

export interface AttachmentParentReader {
  readonly kind: AttachmentParentKind;
  /**
   * Resolves when the actor may read the attachment, throws `HttpError('permission.denied')` when not. The workspace
   * gate (storage-key prefix) already ran; a reader still scopes its parent lookup to `actor.workspace_id`.
   */
  assertCanRead(input: { actor: AttachmentActor; row: AttachmentLinkRow }): Promise<void>;
}

/**
 * The parent kind of a stored row: the `parent_kind` column, or `voc` for a linked row written before migration 0105
 * (parent_kind NULL with voc_id / comment_id set). `null` = unlinked (no link column set); a row that has a
 * `parent_id` but no kind resolves to `'unresolved'`, which has no reader and is therefore denied.
 */
export function attachmentParentKindOf(row: AttachmentLinkRow): string | null {
  if (row.parent_kind) return row.parent_kind;
  if (row.voc_id || row.comment_id) return 'voc';
  return row.parent_id ? 'unresolved' : null;
}

export type AttachmentParentRegistry = ReadonlyMap<string, AttachmentParentReader>;

/** Builds the registry; a duplicate kind is a wiring bug and throws. */
export function createAttachmentParentRegistry(readers: readonly AttachmentParentReader[]): AttachmentParentRegistry {
  const registry = new Map<string, AttachmentParentReader>();
  for (const reader of readers) {
    if (registry.has(reader.kind)) throw new Error(`attachment parent kind '${reader.kind}' registered twice`);
    registry.set(reader.kind, reader);
  }
  return registry;
}
