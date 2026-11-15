// The editor toolbar's upload puts `{ id, name, size_bytes, mime_type }` on an `attachmentRef` node, but the
// `voc-description`, `reporter-reply` and `internal-comment` allowlists (server and client) take `id` only, and the
// server links only the ids listed in `attachment_ids`. Callers: the compose and create screens and the reply and
// comment composers reduce each node to its `id` (`normalizeAttachmentRefs`) and list those ids with the dropzone's
// (`mergeAttachmentIds`). `public-update` allows no `attachmentRef`, so its composer offers no editor attach (#745).

import { collectRichContentAttachmentIds, type TipTapDoc } from '@ap/feature-shared';

interface RichNode {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
  [key: string]: unknown;
}

/** Normalize attachmentRef/image storage attrs, collecting both IDs in document order. */
export function normalizeAttachmentRefs<D extends object = TipTapDoc>(
  doc: D,
): { doc: D; ids: string[] } {
  const ids = collectRichContentAttachmentIds(doc);
  const walk = (node: RichNode): RichNode => {
    const next: RichNode = { ...node };
    if (node.type === 'attachmentRef') {
      const id = node.attrs?.id;
      next.attrs = typeof id === 'string' ? { id } : {};
    }
    if (node.type === 'image') {
      const id = node.attrs?.id;
      const width = node.attrs?.width;
      next.attrs = { ...(typeof id === 'string' ? { id } : {}), ...(typeof width === 'number' ? { width } : {}) };
    }
    if (Array.isArray(node.content)) next.content = (node.content as RichNode[]).map(walk);
    return next;
  };
  return { doc: walk(doc as RichNode) as unknown as D, ids };
}

/** Editor ids first (the body points at them), then the dropzone's; duplicates dropped, none silently cut.
 * Enforcing `MAX_ATTACHMENT_IDS_PER_PARENT` is the submit path's job, where an over-cap set can surface to the user. */
export function mergeAttachmentIds(
  editorIds: readonly string[],
  dropzoneIds: readonly string[],
): string[] {
  return [...new Set([...editorIds, ...dropzoneIds])];
}
