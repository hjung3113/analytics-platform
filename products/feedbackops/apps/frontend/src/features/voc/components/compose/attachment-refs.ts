// The editor toolbar's upload puts `{ id, name, size_bytes, mime_type }` on an `attachmentRef` node, but the
// `voc-description`, `reporter-reply` and `internal-comment` allowlists (server and client) take `id` only,
// `public-update` takes no `attachmentRef` at all, and the server links only the ids listed in `attachment_ids`.
// Callers: the compose and create screens and the reply and comment composers reduce each node to its `id`
// (`normalizeAttachmentRefs`); the public-update composer drops the nodes (`removeAttachmentRefs`). All list the
// editor's ids with the dropzone's (`mergeAttachmentIds`).

import type { TipTapDoc } from '@fops/shared';

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

/** `doc` without any `attachmentRef` node, and the ids found, in document order. For a surface whose allowlist has
 * no `attachmentRef`: the files stay linked through `attachment_ids`. Other nodes, empty paragraphs included, stay. */
export function removeAttachmentRefs<D extends object = TipTapDoc>(
  doc: D,
): { doc: D; ids: string[] } {
  const ids: string[] = [];
  const walk = (node: RichNode): RichNode => {
    if (!Array.isArray(node.content)) return node;
    const content: RichNode[] = [];
    for (const child of node.content as RichNode[]) {
      if (child.type === 'attachmentRef') {
        const id = child.attrs?.id;
        if (typeof id === 'string') ids.push(id);
      } else {
        content.push(walk(child));
      }
    }
    return { ...node, content };
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
