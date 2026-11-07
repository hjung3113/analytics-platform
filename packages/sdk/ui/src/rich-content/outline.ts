import type { JSONContent } from '@tiptap/core';
export interface OutlineEntry { id: string; text: string; level: number }
/** Stable document-order anchors. No editor, DOM, surface or consumer knowledge. */
export function richContentOutline(doc: JSONContent): OutlineEntry[] {
  const entries: OutlineEntry[] = [];
  const text = (node: JSONContent): string => node.text ?? (node.content ?? []).map(text).join('');
  const walk = (node: JSONContent): void => {
    if (node.type === 'heading') entries.push({ id: `rich-heading-${entries.length}`, text: text(node), level: Number(node.attrs?.level ?? 1) });
    node.content?.forEach(walk);
  };
  walk(doc);
  return entries;
}
export function withOutlineAnchors(doc: JSONContent): JSONContent {
  let index = 0;
  const walk = (node: JSONContent): JSONContent => ({ ...node,
    ...(node.type === 'heading' ? { attrs: { ...node.attrs, id: `rich-heading-${index++}` } } : {}),
    ...(node.content ? { content: node.content.map(walk) } : {}),
  });
  return walk(doc);
}
