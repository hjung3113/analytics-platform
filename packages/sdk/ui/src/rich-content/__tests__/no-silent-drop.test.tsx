/// <reference types="@testing-library/jest-dom" />
// #2021: the editor must not silently drop what the author typed on the way out, and a parent echo
// that only differs by attributes the sanitizer strips must not replace the document (caret jump).
import { act, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import * as React from 'react';
import { describe, expect, it } from 'vitest';
import { RichEditor, type RichEditorSurface, type TipTapDoc } from '../RichEditor';
import { RichContentRenderer } from '../RichContentRenderer';
// Load the lazy editor module up front so the first test does not spend its waitFor budget on the import.
import '../RichEditorImpl';

const EMPTY: TipTapDoc = { type: 'doc', content: [{ type: 'paragraph' }] };
const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER_ACTOR = '22222222-2222-4222-8222-222222222222';

function mountEchoHost(surface: RichEditorSurface, initial: TipTapDoc, extra: Partial<React.ComponentProps<typeof RichEditor>> = {}) {
  let editor: Editor | null = null;
  const emitted: TipTapDoc[] = [];
  function Host() {
    const [value, setValue] = React.useState<TipTapDoc>(initial);
    return (
      <RichEditor
        surface={surface}
        value={value}
        // A copy, as a parent that stores the draft elsewhere would hand back: the editor must compare it.
        onChange={doc => { emitted.push(doc); setValue(structuredClone(doc)); }}
        toolbar={e => { editor = e; return null; }}
        {...extra}
      />
    );
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

function textLength(doc: TipTapDoc): number {
  let total = 0;
  const walk = (node: unknown) => {
    const n = node as { text?: unknown; content?: unknown };
    if (typeof n.text === 'string') total += n.text.length;
    if (Array.isArray(n.content)) n.content.forEach(walk);
  };
  walk(doc);
  return total;
}

const settle = () => act(async () => { await new Promise(r => setTimeout(r, 30)); });

describe('RichEditor over-limit content (no silent drop)', () => {
  it('keeps over-limit text in the emitted value and the editor, and shows a notice until it is back under the limit', async () => {
    const host = mountEchoHost('voc-description', EMPTY);
    const live = await host.editor();
    const big = 'a'.repeat(51 * 1024);
    act(() => { live.commands.insertContent(big); });
    await settle();
    const last = host.emitted.at(-1) as TipTapDoc;
    expect(textLength(last)).toBe(big.length);
    expect(live.getText().length).toBe(big.length);
    expect(screen.getByRole('alert')).toHaveTextContent('내용이 너무 깁니다');

    act(() => { live.commands.setContent('<p>short</p>', { emitUpdate: true }); });
    await settle();
    expect(screen.queryByRole('alert')).toBeNull();
  }, 30_000);
});

describe('RichEditor controlled echo of attributes the sanitizer strips', () => {
  const CASES: Array<[string, TipTapDoc]> = [
    ['orderedList start=3', { type: 'doc', content: [
      { type: 'orderedList', attrs: { start: 3 }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }] }] },
    ] }],
    ['codeBlock language py', { type: 'doc', content: [
      { type: 'codeBlock', attrs: { language: 'py' }, content: [{ type: 'text', text: 'hello world' }] },
    ] }],
  ];

  it.each(CASES)('%s: the echo does not replace the document or move the caret', async (_name, inserted) => {
    const host = mountEchoHost('voc-description', EMPTY);
    const live = await host.editor();
    let docChanges = 0;
    live.on('transaction', ({ transaction }) => { if (transaction.docChanged) docChanges++; });
    act(() => { live.commands.setContent(inserted, { emitUpdate: true }); });
    let target = 0;
    live.state.doc.descendants((node, pos) => { if (node.isText && !target) target = pos + 5; });
    act(() => { live.commands.setTextSelection(target); });
    const docBefore = live.state.doc;
    await settle();
    expect(host.emitted.length).toBeGreaterThan(0);
    expect(docChanges).toBe(1);
    expect(live.state.doc).toBe(docBefore);
    expect(live.state.selection.from).toBe(target);
  });

  it('a genuine external change still syncs', async () => {
    let setOuter: (doc: TipTapDoc) => void = () => {};
    let editor: Editor | null = null;
    function Host() {
      const [value, setValue] = React.useState<TipTapDoc>(EMPTY);
      setOuter = setValue;
      return <RichEditor surface="voc-description" value={value} onChange={setValue} toolbar={e => { editor = e; return null; }} />;
    }
    render(<Host />);
    await waitFor(() => expect(editor).not.toBeNull());
    act(() => { setOuter({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'from server' }] }] }); });
    await waitFor(() => expect((editor as unknown as Editor).getText()).toBe('from server'));
  });
});

describe('mention label resolver', () => {
  const doc: TipTapDoc = { type: 'doc', content: [{ type: 'paragraph', content: [
    { type: 'mention', attrs: { actor_id: ACTOR } },
    { type: 'text', text: ' ' },
    { type: 'mention', attrs: { actor_id: OTHER_ACTOR } },
  ] }] };
  const resolve = (id: string) => (id === ACTOR ? '홍길동' : null);

  it('the editor shows the resolved name, and the fallback (never the id) for an unresolved actor', async () => {
    const { container } = render(<RichEditor surface="internal-comment" value={doc} resolveMentionLabel={resolve} />);
    await waitFor(() => expect(container.querySelectorAll('.mention-chip')).toHaveLength(2));
    const chips = [...container.querySelectorAll('.mention-chip')].map(el => el.textContent);
    expect(chips).toEqual(['@홍길동', '@멘션']);
    expect(container.textContent).not.toContain(ACTOR);
    expect(container.textContent).not.toContain(OTHER_ACTOR);
  });

  it.each([
    ['with a resolver', resolve, ['@홍길동', '@멘션']],
    ['without a resolver', undefined, ['@멘션', '@멘션']],
  ] as const)('the renderer shows labels %s, never the id', (_n, resolver, expected) => {
    const { container } = render(<RichContentRenderer doc={doc} mode="internal" surface="internal-comment" resolveMentionLabel={resolver} />);
    const chips = [...container.querySelectorAll('.mention-chip')].map(el => el.textContent);
    expect(chips).toEqual(expected);
    expect(container.textContent).not.toContain(ACTOR);
  });
});
