// The editor toolbar's upload puts `{ id, name, size_bytes, mime_type }` on an `attachmentRef` node, but the
// `voc-description` allowlist (server and client) takes `id` only, and the server links only the ids listed in
// `attachment_ids`. The compose path reduces each node to its `id` and lists those ids with the dropzone's.

import type { TipTapDoc } from '@fops/shared';

interface RichNode {
  type?: unknown;
  attrs?: Record<string, unknown>;
  content?: unknown;
  [key: string]: unknown;
}

/** `doc` with every `attachmentRef` reduced to `{ id }`, and the ids found, in document order. */
export function normalizeAttachmentRefs(doc: TipTapDoc): { doc: TipTapDoc; ids: string[] } {
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
  return { doc: walk(doc as RichNode) as unknown as TipTapDoc, ids };
}

/** Editor ids first (the body points at them), then the dropzone's; duplicates dropped, none silently cut.
 * Enforcing `MAX_ATTACHMENT_IDS_PER_PARENT` is the submit path's job, where an over-cap set can surface to the user. */
export function mergeAttachmentIds(
  editorIds: readonly string[],
  dropzoneIds: readonly string[],
): string[] {
  return [...new Set([...editorIds, ...dropzoneIds])];
}
