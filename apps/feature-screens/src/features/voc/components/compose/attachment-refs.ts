// The editor toolbar's upload puts `{ id, name, size_bytes, mime_type }` on an `attachmentRef` node, but the
// `voc-description`, `reporter-reply` and `internal-comment` allowlists (server and client) take `id` only, and the
// server links only the ids listed in `attachment_ids`. Callers: the compose and create screens and the reply and
// comment composers reduce each node to its `id` (`normalizeAttachmentRefs`) and list those ids with the dropzone's
// (`mergeAttachmentIds`). `public-update` allows no `attachmentRef`, so its composer offers no editor attach (#745).

import type { TipTapDoc } from '@ap/feature-shared';

interface RichNode {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
  [key: string]: unknown;
}

/** `doc` with every `attachmentRef` reduced to `{ id }`, and the ids found, in document order. */
export function normalizeAttachmentRefs<D extends object = TipTapDoc>(
  doc: D,
): { doc: D; ids: string[] } {
  const ids: string[] = [];
  const walk = (node: RichNode): RichNode => {
    const next: RichNode = { ...node };
    if (node.type === 'attachmentRef') {
      const id = node.attrs?.id;
      if (typeof id === 'string') ids.push(id);
      next.attrs = typeof id === 'string' ? { id } : {};
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
