/// <reference types="@testing-library/jest-dom" />
import { act, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { RichEditor, type RichEditorSurface, type TipTapDoc } from '../RichEditor';
import { UI_ALLOWLISTS } from '../allowlist-local';
import { serverRuleViolations } from './server-rule-checker';
import '../RichEditorImpl';

const SURFACES: RichEditorSurface[] = ['reporter-reply', 'public-update', 'internal-comment', 'voc-description'];

function mount(surface: RichEditorSurface, echo = false) {
  let editor: Editor | null = null;
  const emitted: TipTapDoc[] = [];
  function Host() {
    const [value, setValue] = React.useState<TipTapDoc>({ type: 'doc', content: [{ type: 'paragraph' }] });
    return <RichEditor surface={surface} value={echo ? value : undefined} onChange={doc => {
      emitted.push(doc);
      if (echo) setValue(JSON.parse(JSON.stringify(doc)) as TipTapDoc);
    }} toolbar={e => { editor = e; return null; }} />;
  }
  render(<Host />);
  return {
    emitted,
    async editor() {
      await waitFor(() => expect(editor).not.toBeNull());
      return editor as unknown as Editor;
    },
  };
}

// Dispatch the text transactions that typing produces, one character at a time. Unlike setContent
// or insertContent, these exercise the real autolink appendTransaction plugin without preventing it.
function type(editor: Editor, text: string) {
  for (const char of text) editor.view.dispatch(editor.state.tr.insertText(char));
}

function expectPlain(editor: Editor, emitted: TipTapDoc[], surface: RichEditorSurface, text: string) {
  expect(editor.getText()).toBe(text);
  // Check live marks as well: send-ready cleanup must not hide an input-side regression.
  expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"link"');
  const last = emitted.at(-1) as TipTapDoc;
  expect(last).toBeDefined();
  expect(serverRuleViolations(last, surface)).toEqual([]);
  expect(JSON.stringify(last)).not.toContain('"type":"link"');
  expect(editor.schema.nodeFromJSON(last).textContent).toBe(editor.state.doc.textContent);
}

const TYPED = [
  ['email in sentence', '문의는 kim@example.com 으로', false],
  ['email then Enter', 'kim@example.com', true],
  ['parenthesized email', '(kim@example.com) 확인', false],
  ['ftp', 'ftp://files.corp/x 참고', false],
  ['tel', 'tel:123456789 참고', false],
  ['mailto', 'mailto:kim@example.com 참고', false],
] as const;
const PASTED = [
  'mailto:kim@example.com', 'tel:123456789', 'ftp://files.corp/x', '/wiki/Page', '#section', 'example.com',
  'https://person:password@example.com/a', `https://example.com/${'a'.repeat(2048)}`,
];

for (const surface of SURFACES) {
  describe(`${surface}: link input (#2060)`, () => {
    it.each(TYPED)('typing %s preserves plain text', async (_name, text, enter) => {
      const host = mount(surface);
      const editor = await host.editor();
      act(() => {
        type(editor, text);
        if (enter) expect(editor.commands.keyboardShortcut('Enter')).toBe(true);
      });
      expectPlain(editor, host.emitted, surface, enter ? `${text}\n\n` : text);
    });

    it.each(PASTED)('pasting HTML href %s preserves plain text', async href => {
      const host = mount(surface);
      const editor = await host.editor();
      act(() => { expect(editor.view.pasteHTML(`<p><a href="${href}">guide</a></p>`, new Event('paste') as ClipboardEvent)).toBe(true); });
      expectPlain(editor, host.emitted, surface, 'guide');
    });

    it.each(['https://example.com/a', 'example.com'])('typing %s keeps allowed autolinks', async text => {
      const host = mount(surface);
      const editor = await host.editor();
      act(() => { type(editor, `${text} `); });
      const last = host.emitted.at(-1) as TipTapDoc;
      expect(serverRuleViolations(last, surface)).toEqual([]);
      expect(editor.getText()).toBe(`${text} `);
      if (UI_ALLOWLISTS[surface].marks.has('link')) {
        const href = text.startsWith('https:') ? text : `http://${text}`;
        expect(JSON.stringify(editor.getJSON())).toContain(`"href":"${href}"`);
        expect(JSON.stringify(last)).toContain(`"href":"${href}"`);
      } else {
        expect(JSON.stringify(last)).not.toContain('"type":"link"');
      }
    });

    it('pasting an allowed HTML link preserves the surface capabilities', async () => {
      const host = mount(surface);
      const editor = await host.editor();
      act(() => { editor.view.pasteHTML('<p><a href="https://example.com/a">guide</a></p>', new Event('paste') as ClipboardEvent); });
      const last = host.emitted.at(-1) as TipTapDoc;
      expect(serverRuleViolations(last, surface)).toEqual([]);
      expect(editor.getText()).toBe('guide');
      expect(JSON.stringify(last).includes('"href":"https://example.com/a"')).toBe(UI_ALLOWLISTS[surface].marks.has('link'));
    });

    it('a controlled echo keeps the document, selection and valid href without setContent', async () => {
      const host = mount(surface, true);
      const editor = await host.editor();
      let replacements = 0;
      editor.on('transaction', ({ transaction }) => {
        if (transaction.getMeta('preventUpdate')) replacements++;
      });
      let before = editor.state.doc;
      let selection = editor.state.selection.from;
      act(() => {
        type(editor, 'kim@example.com https://example.com/a ');
        before = editor.state.doc;
        selection = editor.state.selection.from;
      });
      await act(async () => { await Promise.resolve(); });
      expect(editor.state.doc).toBe(before);
      expect(editor.state.selection.from).toBe(selection);
      expect(replacements).toBe(0);
      expect(JSON.stringify(editor.getJSON())).not.toContain('"href":""');
      expect(serverRuleViolations(host.emitted.at(-1) as TipTapDoc, surface)).toEqual([]);
      if (UI_ALLOWLISTS[surface].marks.has('link')) {
        expect(JSON.stringify(editor.getJSON())).toContain('"href":"https://example.com/a"');
      }
      expect(editor.getText()).toBe('kim@example.com https://example.com/a ');
    });
  });
}
