/// <reference types="@testing-library/jest-dom" />
// #2043: every surface's emitted value must be a document the server accepts. The editor's raw
// output carries Tiptap attrs the allowlist does not define (link target/rel/class/title, orderedList
// start/type, attachmentRef name/size_bytes/mime_type), which the server rejects.
import { act, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { RichEditor, type RichEditorSurface, type TipTapDoc } from '../RichEditor';
import { serverRuleViolations } from './server-rule-checker';
import { normalizeClient } from '../sanitizeClient';
// Load the lazy editor module up front so the first test does not spend its waitFor budget on the import.
import '../RichEditorImpl';

const ATTACHMENT = '33333333-3333-4333-8333-333333333333';
const ACTOR = '11111111-1111-4111-8111-111111111111';


function mount(surface: RichEditorSurface) {
  let editor: Editor | null = null;
  const emitted: TipTapDoc[] = [];
  render(<RichEditor surface={surface} onChange={doc => { emitted.push(doc); }} toolbar={e => { editor = e; return null; }} />);
  return {
    emitted,
    async editor() {
      await waitFor(() => expect(editor).not.toBeNull());
      return editor as unknown as Editor;
    },
  };
}

function find(doc: TipTapDoc, type: string): Array<Record<string, unknown> | undefined> {
  const found: Array<Record<string, unknown> | undefined> = [];
  const walk = (node: TipTapDoc) => {
    if (node.type === type) found.push(node.attrs as Record<string, unknown> | undefined);
    ((node.content ?? []) as TipTapDoc[]).forEach(walk);
  };
  walk(doc);
  return found;
}

function hasLink(doc: TipTapDoc): boolean {
  return JSON.stringify(doc).includes('"type":"link"');
}

// Author actions per surface, done with the real editor's commands: a link (autolink output carries the
// same default attrs), a `1. ` ordered list, an attachment with its display attrs, a mention and an image.
// No focus(): it scrolls the selection into view, which jsdom cannot do.
const typeLink = (e: Editor) => {
  e.chain().insertContent('see https://example.com').run();
  e.chain().setTextSelection({ from: 5, to: 24 }).setLink({ href: 'https://example.com' }).run();
};
const typeOrderedList = (e: Editor) => {
  e.chain().setTextSelection(e.state.doc.content.size).insertContent('<p>first</p>').toggleOrderedList().run();
};
const insertAttachment = (e: Editor) => {
  e.chain().setTextSelection(e.state.doc.content.size).insertContent({ type: 'attachmentRef', attrs: { id: ATTACHMENT, name: 'a.pdf', size_bytes: 10, mime_type: 'application/pdf' } }).run();
};

const CASES: Array<[RichEditorSurface, Array<(e: Editor) => void>]> = [
  ['reporter-reply', [typeLink, insertAttachment]],
  ['public-update', [typeOrderedList]],
  ['internal-comment', [typeLink, typeOrderedList, insertAttachment, e => {
    e.chain().setTextSelection(e.state.doc.content.size).insertContent({ type: 'mention', attrs: { actor_id: ACTOR } }).run();
  }]],
  ['voc-description', [typeLink, typeOrderedList, insertAttachment, e => {
    e.chain().setTextSelection(e.state.doc.content.size).insertContent({ type: 'image', attrs: { id: ATTACHMENT, width: 320 } }).run();
  }]],
];

describe('RichEditor emits a server-valid document on every surface (#2043)', () => {
  it.each(CASES)('%s', async (surface, actions) => {
    const host = mount(surface);
    const live = await host.editor();
    act(() => { actions.forEach(action => action(live)); });
    await waitFor(() => expect(host.emitted.length).toBeGreaterThan(0));
    const last = host.emitted.at(-1) as TipTapDoc;

    expect(serverRuleViolations(last, surface)).toEqual([]);
    // Nothing the author made is dropped: the link, list, attachment, mention and image stay, with
    // every attr the surface allowlist defines.
    if (actions.includes(typeLink)) {
      expect(hasLink(last)).toBe(true);
      expect(JSON.stringify(last)).toContain('"href":"https://example.com"');
    }
    if (actions.includes(typeOrderedList)) expect(find(last, 'orderedList')).toEqual([undefined]);
    if (actions.includes(insertAttachment)) expect(find(last, 'attachmentRef')).toEqual([{ id: ATTACHMENT }]);
    if (surface === 'internal-comment') expect(find(last, 'mention')).toEqual([{ actor_id: ACTOR }]);
    if (surface === 'voc-description') expect(find(last, 'image')).toEqual([{ id: ATTACHMENT, width: 320 }]);
  }, 30_000);

  it('the raw editor output would break the server rules (the cleanup is what makes it valid)', async () => {
    const host = mount('internal-comment');
    const live = await host.editor();
    act(() => { typeLink(live); typeOrderedList(live); });
    await waitFor(() => expect(host.emitted.length).toBeGreaterThan(0));
    expect(serverRuleViolations(live.getJSON() as TipTapDoc, 'internal-comment')).not.toEqual([]);
  }, 30_000);
});

const INVALID_LINKS = [
  ['mailto', 'mailto:person@example.com'],
  ['relative', '/guide'],
  ['javascript', 'javascript:alert(1)'],
  ['credentials', 'https://person:password@example.com/guide'],
  ['overlong', `https://example.com/${'a'.repeat(4096)}`],
] as const;

describe('send-ready link values (#2043 C1)', () => {
  it.each(['', '/guide'])('the checker rejects href %j', href => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'guide', marks: [{ type: 'link', attrs: { href } }] }] }] } as TipTapDoc;
    expect(serverRuleViolations(doc, 'internal-comment')).toContain('doc.0.0.mark(link): invalid href');
  });

  it.each(INVALID_LINKS)('pasted %s link keeps text without a link mark', async (_name, href) => {
    const host = mount('internal-comment');
    const live = await host.editor();
    act(() => { live.commands.insertContent(`<p><a href="${href}">guide</a></p>`); });
    const last = host.emitted.at(-1) as TipTapDoc;
    expect(serverRuleViolations(last, 'internal-comment')).toEqual([]);
    expect(last.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'guide' }] }]);
  });

  it.each([...INVALID_LINKS, ['missing', undefined], ['empty', '']] as const)('normalization unwraps %s href', (_name, href) => {
    const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'guide', marks: [{ type: 'bold' }, { type: 'link', attrs: href === undefined ? {} : { href } }] }] }] } as TipTapDoc;
    const cleaned = normalizeClient(doc, 'internal-comment').doc;
    expect(serverRuleViolations(cleaned, 'internal-comment')).toEqual([]);
    expect(cleaned.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'guide', marks: [{ type: 'bold' }] }] }]);
  });

  it.each(['https://example.com/guide', 'http://example.com/guide'])('pasted allowed URL %s keeps its link', async href => {
    const host = mount('internal-comment');
    const live = await host.editor();
    act(() => { live.commands.insertContent(`<p><a href="${href}">guide</a></p>`); });
    const last = host.emitted.at(-1) as TipTapDoc;
    expect(serverRuleViolations(last, 'internal-comment')).toEqual([]);
    expect(last.content).toEqual([{ type: 'paragraph', content: [{ type: 'text', text: 'guide', marks: [{ type: 'link', attrs: { href } }] }] }]);
  });
});
