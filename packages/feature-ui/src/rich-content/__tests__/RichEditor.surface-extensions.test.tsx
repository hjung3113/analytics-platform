import { render, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { describe, expect, it } from 'vitest';

import { RichEditor, type RichEditorSurface, type TipTapDoc } from '@ap/ui';

const ATTACHMENT_UUID = '22222222-2222-2222-2222-222222222222';
const ACTOR_UUID = '11111111-1111-1111-1111-111111111111';

function renderWithEditor(surface: RichEditorSurface, placeholder?: string) {
  let editorRef: Editor | null = null;
  let latestDoc: TipTapDoc | null = null;
  render(
    <RichEditor
      surface={surface}
      {...(placeholder !== undefined ? { placeholder } : {})}
      onChange={(doc) => {
        latestDoc = doc;
      }}
      toolbar={(editor) => {
        editorRef = editor;
        return null;
      }}
    />,
  );

  return {
    async editor() {
      await waitFor(() => expect(editorRef).not.toBeNull());
      if (editorRef === null) throw new Error('editor was not mounted');
      return editorRef;
    },
    async doc() {
      await waitFor(() => expect(latestDoc).not.toBeNull());
      if (latestDoc === null) throw new Error('editor document was not emitted');
      return latestDoc;
    },
  };
}

function flattenTypes(doc: TipTapDoc): string {
  const types: string[] = [];
  const visit = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const current = node as { type?: unknown; marks?: unknown; content?: unknown };
    if (typeof current.type === 'string') types.push(current.type);
    if (Array.isArray(current.marks)) {
      for (const mark of current.marks) visit(mark);
    }
    if (Array.isArray(current.content)) {
      for (const child of current.content) visit(child);
    }
  };
  visit(doc);
  return types.join(' ');
}

describe('RichEditor surface extension registration', () => {
  it('public-update strips pasted link marks and rejects disallowed mention and attachment nodes', async () => {
    const harness = renderWithEditor('public-update');
    const editor = await harness.editor();

    editor
      .chain()
      .insertContent('<p><a href="https://example.com">linked</a></p>')
      .insertContent(`<p><span data-type="mention" actor_id="${ACTOR_UUID}">@actor</span></p>`)
      .insertContent(
        `<div data-type="attachment-ref" id="${ATTACHMENT_UUID}" data-attachment-id="${ATTACHMENT_UUID}"></div>`,
      )
      .run();

    const doc = await harness.doc();
    const flat = JSON.stringify(doc);
    expect(flat).toContain('linked');
    expect(flattenTypes(doc)).not.toContain('link');
    expect(flattenTypes(doc)).not.toContain('mention');
    expect(flattenTypes(doc)).not.toContain('attachmentRef');
  });

  it('voc-description keeps allowed pasted link, underline, and attachmentRef content', async () => {
    const harness = renderWithEditor('voc-description');
    const editor = await harness.editor();

    editor
      .chain()
      .insertContent('<p><a href="https://example.com"><u>linked</u></a></p>')
      .insertContent({ type: 'attachmentRef', attrs: { id: ATTACHMENT_UUID } })
      .run();

    const doc = await harness.doc();
    const flatTypes = flattenTypes(doc);
    expect(flatTypes).toContain('link');
    expect(flatTypes).toContain('underline');
    expect(flatTypes).toContain('attachmentRef');
  });

  it('internal-comment keeps allowed pasted link, mention, and attachmentRef content', async () => {
    const harness = renderWithEditor('internal-comment');
    const editor = await harness.editor();

    editor
      .chain()
      .insertContent('<p><a href="https://example.com">linked</a></p>')
      .insertContent({ type: 'mention', attrs: { actor_id: ACTOR_UUID } })
      .insertContent({ type: 'attachmentRef', attrs: { id: ATTACHMENT_UUID } })
      .run();

    const doc = await harness.doc();
    const flatTypes = flattenTypes(doc);
    expect(flatTypes).toContain('link');
    expect(flatTypes).toContain('mention');
    expect(flatTypes).toContain('attachmentRef');
  });

  // #1167: the extension only decorates the DOM; the drawing CSS lives in @ap/ui's compat.css
  // (consumer-contract.test.ts compiles the documented recipe and asserts the rule). Here we pin
  // the decoration side: the configured text lands on the empty editor's first node, so the CSS
  // selector `.rich-editor .is-editor-empty:first-child::before` has something to draw.
  it('decorates the empty editor first node with the configured placeholder', async () => {
    const harness = renderWithEditor('voc-description', '내용을 입력하세요');
    const editor = await harness.editor();

    await waitFor(() => {
      const empty = editor.view.dom.querySelector('.is-editor-empty');
      expect(empty).not.toBeNull();
      expect(empty?.getAttribute('data-placeholder')).toBe('내용을 입력하세요');
    });

    // Typed content clears the decoration, so the rule stops drawing.
    editor.chain().insertContent('<p>본문</p>').run();
    await waitFor(() => {
      expect(editor.view.dom.querySelector('.is-editor-empty')).toBeNull();
    });
  });
});
