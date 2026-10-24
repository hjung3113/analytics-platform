import type { TipTapDoc } from '@fops/shared';
import { describe, expect, it } from 'vitest';
import { removeAttachmentRefs } from '../attachment-refs';

describe('removeAttachmentRefs', () => {
  it('drops every attachmentRef node at any depth, keeps the rest, and lists the ids in document order', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
        { type: 'attachmentRef', attrs: { id: 'id-1', name: 'x.txt', size_bytes: 1 } },
        { type: 'paragraph' },
        {
          type: 'blockquote',
          content: [{ type: 'attachmentRef', attrs: { id: 'id-2' } }],
        },
      ],
    } as unknown as TipTapDoc;

    expect(removeAttachmentRefs(doc)).toEqual({
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'a' }] },
          { type: 'paragraph' },
          { type: 'blockquote', content: [] },
        ],
      },
      ids: ['id-1', 'id-2'],
    });
  });
});
