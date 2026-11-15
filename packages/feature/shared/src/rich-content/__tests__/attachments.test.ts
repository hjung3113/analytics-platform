import { describe, expect, it } from 'vitest';
import { collectRichContentAttachmentIds } from '../attachments.js';
import { isTipTapDocBlank } from '../../vocs/rich-content.js';
const id = '11111111-1111-4111-8111-111111111111';
describe('rich content structural nodes and attachment references', () => {
  it.each(['table', 'tableRow', 'tableCell', 'taskList', 'taskItem', 'details', 'detailsSummary', 'detailsContent', 'tableOfContents', 'horizontalRule'])('empty %s cannot bypass blank validation', type => {
    expect(isTipTapDocBlank({ type: 'doc', content: [{ type }] })).toBe(true);
  });
  it('collects nested image and attachment IDs in order, deduplicates and ignores invalid ids', () => {
    expect(collectRichContentAttachmentIds({ type: 'doc', content: [{ type: 'details', content: [
      { type: 'image', attrs: { id } }, { type: 'attachmentRef', attrs: { id } }, { type: 'image', attrs: { id: 'bad' } },
    ] }] })).toEqual([id]);
    expect(isTipTapDocBlank({ type: 'doc', content: [{ type: 'image', attrs: { id } }] })).toBe(false);
  });
});
