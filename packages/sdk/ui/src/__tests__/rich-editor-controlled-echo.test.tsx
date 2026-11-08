// A controlled parent echoes every onChange back as `value`. The echo is the same document
// in different key order / default attrs, so the editor must not replace it (caret would jump).
import { act, render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { RichEditor, type TipTapDoc } from '../index';

const id = '11111111-1111-4111-8111-111111111111';
const bold = { type: 'text', text: 'hello world', marks: [{ type: 'bold' }] };
const DOCS: Record<string, TipTapDoc> = {
  marked: { type: 'doc', content: [{ type: 'paragraph', content: [bold] }] },
  'table and image': { type: 'doc', content: [
    { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [bold] }] }] }] },
    { type: 'image', attrs: { id } },
  ] },
};

describe('RichEditor controlled echo', () => {
  it.each(Object.keys(DOCS))('typing in the middle of a %s document keeps the caret and does not replace the document', async name => {
    let editor: Editor | null = null;
    function Host() {
      const [value, setValue] = React.useState<TipTapDoc>(DOCS[name] as TipTapDoc);
      return <RichEditor surface="voc-description" value={value} onChange={setValue} resolveAttachmentUrl={i => `/a/${i}`} toolbar={e => { editor = e; return null; }} />;
    }
    render(<Host />);
    await waitFor(() => expect(editor).not.toBeNull());
    const live = editor as unknown as Editor;
    let target = 0;
    live.state.doc.descendants((node, pos) => { if (node.isText && !target) target = pos + 5; });
    act(() => { live.commands.setTextSelection(target); });
    const docChanging: number[] = [];
    live.on('transaction', ({ transaction }) => { if (transaction.docChanged) docChanging.push(transaction.steps.length); });
    act(() => { live.commands.insertContentAt(target, 'X'); });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    expect(docChanging).toHaveLength(1);
    expect(live.state.selection.from).toBe(target + 1);
    expect(live.getText()).toContain('helloX world');
  });
});
