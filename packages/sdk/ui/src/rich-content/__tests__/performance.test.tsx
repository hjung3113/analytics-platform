import { Editor } from '@tiptap/core';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { TipTapDoc } from '../RichEditor';
import { RichContentRenderer } from '../RichContentRenderer';
import { buildExtensionsForSurface } from '../editor-extensions';
import { sanitizeClient } from '../sanitizeClient';
const id = '11111111-1111-4111-8111-111111111111';
export const longDoc: TipTapDoc = { type: 'doc', content: [
  { type: 'paragraph', content: [{ type: 'text', text: '가'.repeat(5000) }] },
  ...Array.from({ length: 20 }, () => ({ type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: '표' }] }] }] }] })),
  ...Array.from({ length: 30 }, () => ({ type: 'image', attrs: { id } })),
] };
const stats = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return { samples: values.length, median_ms: sorted[Math.floor(sorted.length / 2)], p95_ms: sorted[Math.ceil(sorted.length * .95) - 1] }; };
describe('rich editor jsdom long-document benchmark', () => {
  it('records transaction/update and static reader render timings for 20 tables, 30 images and 5000 characters', () => {
    const editor = new Editor({ content: longDoc, extensions: buildExtensionsForSurface('voc-description', '', { resolveAttachmentUrl: id => `/attachments/${id}`, onFiles: () => {} }), onUpdate: ({ editor }) => { sanitizeClient(editor.getJSON() as TipTapDoc, 'voc-description'); } });
    try {
      const updates: number[] = []; const reads: number[] = [];
      editor.commands.setTextSelection(1);
      // One warmup; these timings deliberately include the canonical onChange sanitize pass.
      editor.commands.insertContent('가');
      renderToString(<RichContentRenderer doc={longDoc} surface="voc-description" mode="internal" resolveAttachmentUrl={id => `/attachments/${id}`} />);
      for (let i = 0; i < 20; i++) {
        const start = performance.now(); editor.commands.insertContent('가'); updates.push(performance.now() - start);
        const readStart = performance.now();
        const html = renderToString(<RichContentRenderer doc={longDoc} surface="voc-description" mode="internal" resolveAttachmentUrl={id => `/attachments/${id}`} />);
        reads.push(performance.now() - readStart);
        expect(html.match(/<table/g)).toHaveLength(20);
        expect(html.match(/<img/g)).toHaveLength(30);
        expect(html).not.toContain('contenteditable="true"');
      }
      console.info('W-1452-JSDOM-BENCHMARK', JSON.stringify({ method: 'warm jsdom, synchronous transaction incl. update sanitizer; React renderToString incl. generateHTML', tables: 20, images: 30, baseCharacters: 5000, transaction: stats(updates), reader: stats(reads), updates, reads }));
    } finally { editor.destroy(); }
  });
});
