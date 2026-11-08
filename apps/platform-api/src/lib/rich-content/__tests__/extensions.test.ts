import { describe, expect, it } from 'vitest';
import type { TipTapDoc } from '@ap/feature-shared';
import { sanitizeTipTap } from '../sanitize.js';
const id = '11111111-1111-4111-8111-111111111111';
const doc = (node: unknown) => ({ type: 'doc', content: [node] }) as TipTapDoc;
describe('opt-in rich editor security boundary', () => {
  it('accepts an attachment image containing only id and bounded width', () => {
    const input = doc({ type: 'image', attrs: { id, width: 320 } });
    expect(sanitizeTipTap({ surface: 'voc-description', doc: input })).toEqual({ ok: true, doc: input });
  });
  it.each([
    [{ id, src: '/attachments/x' }, 'rich_content.external_image_forbidden'],
    [{ id, alt: 'injected' }, 'rich_content.disallowed_attr'],
    [{ width: 100 }, 'rich_content.missing_required_attr'],
    [{ id: 'bad' }, 'rich_content.invalid_attr_value'],
    [{ id, width: 4097 }, 'rich_content.invalid_attr_value'],
    [{ id, width: 80.5 }, 'rich_content.invalid_attr_value'],
  ])('rejects crafted image attrs %j', (attrs, code) => {
    expect(sanitizeTipTap({ surface: 'voc-description', doc: doc({ type: 'image', attrs }) })).toMatchObject({ ok: false, error: { code } });
  });
  it.each(['reporter-reply', 'public-update', 'internal-comment'] as const)('keeps images off %s', surface => {
    expect(sanitizeTipTap({ surface, doc: doc({ type: 'image', attrs: { id } }) })).toMatchObject({ ok: false, error: { code: 'rich_content.external_image_forbidden' } });
  });
  it.each([
    { type: 'heading', attrs: { level: 4 } },
    { type: 'taskItem', attrs: { checked: 'true' } },
    { type: 'details', attrs: { open: 1 } },
    { type: 'tableCell', attrs: { colwidth: [10, 4097] } },
    { type: 'tableCell', attrs: { colspan: 21 } },
    { type: 'codeBlock', attrs: { language: 'unknown' } },
    { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'highlight', attrs: { color: '#fff' } }] }] },
    { type: 'paragraph', content: [{ type: 'text', text: 'x', marks: [{ type: 'textStyle', attrs: { color: 'red' } }] }] },
  ])('rejects unbounded or untyped attrs %j', node => {
    expect(sanitizeTipTap({ surface: 'voc-description', doc: doc(node) })).toMatchObject({ ok: false, error: { code: 'rich_content.invalid_attr_value' } });
  });
  it.each(['image', 'horizontalRule'])('keeps %s a leaf', type => {
    expect(sanitizeTipTap({ surface: 'voc-description', doc: doc({ type, attrs: type === 'image' ? { id } : {}, content: [{ type: 'text', text: 'x' }] }) })).toMatchObject({ ok: false, error: { code: 'rich_content.disallowed_node' } });
  });
});
