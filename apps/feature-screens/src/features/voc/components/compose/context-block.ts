// The platform Context a reporter's VOC was filed from, written into the description as a `화면 정보` block
// (platform ADR-0045 amendment): no field or entity link exists for it, and the triager reads the description.

import type { TipTapDoc } from '@ap/feature-shared';

export interface VocComposeContextBlock {
  items: readonly { label: string; value: string }[];
  /** Absolute address of the screen rebuilt from the kept items only; null when there is none. */
  href: string | null;
}

/** The `voc-description` link mark takes http(s) only and at most this many characters. */
const MAX_HREF_LENGTH = 2048;

const text = (value: string, marks?: { type: string; attrs?: Record<string, string> }[]) => ({
  type: 'text',
  text: value,
  ...(marks ? { marks } : {}),
});
const paragraph = (...content: unknown[]) => ({ type: 'paragraph', content });

/**
 * `doc` with the block after the typed content, which stays untouched. Uses only nodes and marks the
 * `voc-description` allowlist accepts (no heading). With no items nothing is appended.
 */
export function appendContextBlock(doc: TipTapDoc, block: VocComposeContextBlock): TipTapDoc {
  if (block.items.length === 0) return doc;
  const appended: unknown[] = [
    paragraph(text('화면 정보', [{ type: 'bold' }])),
    {
      type: 'bulletList',
      content: block.items.map((item) => ({
        type: 'listItem',
        content: [paragraph(text(`${item.label}: ${item.value}`))],
      })),
    },
  ];
  const { href } = block;
  if (href !== null && href.length <= MAX_HREF_LENGTH && /^https?:\/\//.test(href)) {
    appended.push(paragraph(text('화면 열기', [{ type: 'link', attrs: { href } }])));
  }
  return { ...doc, content: [...(doc.content ?? []), ...appended] };
}
