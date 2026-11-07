/** Attachment references in document order. Shared by submit normalization and authoritative writes. */
export function collectRichContentAttachmentIds(doc: unknown): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const node = value as { type?: unknown; attrs?: { id?: unknown }; content?: unknown };
    if ((node.type === 'image' || node.type === 'attachmentRef') && typeof node.attrs?.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(node.attrs.id)) ids.add(node.attrs.id.toLowerCase());
    if (Array.isArray(node.content)) node.content.forEach(visit);
  };
  visit(doc);
  return [...ids];
}
