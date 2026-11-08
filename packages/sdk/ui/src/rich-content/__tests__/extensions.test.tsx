import { act, createEvent, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import { RichEditor, type TipTapDoc } from '../RichEditor';
import { RichContentRenderer } from '../RichContentRenderer';
import { sanitizeClient } from '../sanitizeClient';
const id = '11111111-1111-4111-8111-111111111111';
const paragraph = (text = '한글 본문') => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const doc: TipTapDoc = { type: 'doc', content: [
  { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '개요' }] },
  { type: 'tableOfContents' },
  { type: 'table', content: [{ type: 'tableRow', content: [{ type: 'tableCell', attrs: { colspan: 1, rowspan: 1, colwidth: [120] }, content: [paragraph()] }] }] },
  { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [paragraph()] }] },
  { type: 'details', attrs: { open: true }, content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '더 보기' }] }, { type: 'detailsContent', content: [paragraph()] }] },
  { type: 'codeBlock', attrs: { language: 'javascript' }, content: [{ type: 'text', text: 'const x = "<script>"' }] },
  { type: 'image', attrs: { id, width: 320 } },
] };
describe('SDK rich editor extensions', () => {
  it('reader preserves opted-in blocks, builds outline and highlights escaped code without an editable view', () => {
    const { container } = render(<RichContentRenderer doc={doc} surface="voc-description" mode="internal" resolveAttachmentUrl={id => `/api/features/attachments/${id}/download`} />);
    expect(container.querySelector('h2')).toHaveTextContent('개요');
    expect(container.querySelector('table td')).toHaveTextContent('한글 본문');
    expect(container.querySelector('col')).toHaveAttribute('width', '120');
    expect(container.querySelector('input[type="checkbox"]')).toBeChecked();
    expect(container.querySelector('details')).toHaveAttribute('open');
    expect(container.querySelector('pre .hljs-keyword')).toHaveTextContent('const');
    expect(container.querySelector('script')).toBeNull();
    const anchor = container.querySelector('nav a')?.getAttribute('href') ?? '';
    expect(anchor).toMatch(/^#rich-heading-[\w-]+-0$/);
    expect(container.querySelector(`[id="${anchor.slice(1)}"]`)).toHaveTextContent('개요');
    expect(container.querySelector('img')).toHaveAttribute('src', `/api/features/attachments/${id}/download`);
    expect(container.querySelector('[contenteditable]')).toBeNull();
  });
  it.each([undefined, () => null])('uses attachment chip without a resolved image URL', resolveAttachmentUrl => {
    const { container } = render(<RichContentRenderer doc={doc} surface="voc-description" mode="internal" {...(resolveAttachmentUrl ? { resolveAttachmentUrl } : {})} attachments={[{ id, name: '화면.png' }]} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('화면.png')).toBeInTheDocument();
    expect(container.querySelector('[data-type="attachment-ref"] .attachment-icon')).toHaveTextContent('📎');
  });
  it('drops invalid optional attrs and invalid image IDs on client', () => {
    const result = sanitizeClient({ type: 'doc', content: [
      { type: 'image', attrs: { id, src: 'https://evil', width: 99999 } },
      { type: 'image', attrs: { id: 'bad' } },
      { type: 'codeBlock', attrs: { language: 'unknown' } },
      { type: 'taskItem', attrs: { checked: 'true' } },
    ] }, 'voc-description');
    expect(result.content).toEqual([{ type: 'image', attrs: { id } }, { type: 'codeBlock', attrs: { language: null } }, { type: 'taskItem' }]);
  });
  it.each(['paste', 'drop'] as const)('uploads files from %s once, inserts only image ids inline, and emits no preview attrs', async method => {
    let editor: Editor | null = null;
    const onChange = vi.fn();
    const onAttach = vi.fn(async (file: File) => ({ attachment_id: id, name: file.name, size_bytes: file.size, mime_type: file.type }));
    render(<RichEditor surface="voc-description" onAttach={onAttach} onChange={onChange} toolbar={e => { editor = e; return null; }} resolveAttachmentUrl={id => `/attachments/${id}`} />);
    await waitFor(() => expect(editor).not.toBeNull());
    const live = editor as unknown as Editor;
    const image = new File(['image'], '화면.png', { type: 'image/png' });
    const log = new File(['log'], 'log.txt', { type: 'text/plain' });
    if (method === 'drop') {
      vi.spyOn(live.view, 'posAtCoords').mockReturnValue({ pos: 1, inside: -1 });
      fireEvent.drop(live.view.dom, { dataTransfer: { files: [image, log], getData: () => '', types: ['Files'] }, clientX: 0, clientY: 0 });
    } else fireEvent.paste(live.view.dom, { clipboardData: { files: [image, log], items: [], getData: () => '' } });
    await waitFor(() => expect(onAttach).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(onChange.mock.lastCall?.[0]?.content).toEqual(expect.arrayContaining([{ type: 'image', attrs: { id } }])));
    expect(JSON.stringify(onChange.mock.lastCall?.[0])).not.toMatch(/src|mime_type|attachmentRef/);
    act(() => { live.commands.insertContentAt(0, { type: 'paragraph', content: [{ type: 'text', text: 'paste here' }] }); live.commands.setTextSelection(2); });
    fireEvent.paste(live.view.dom, { clipboardData: { files: [], getData: (type: string) => type === 'text/html' ? '<img src="https://evil">' : '' } });
    expect(live.view.dom.querySelectorAll('img')).toHaveLength(1);
    act(() => { live.commands.focus('end'); live.commands.insertContent(' ![external](https://evil/a.png) '); });
    expect(live.view.dom.querySelectorAll('img')).toHaveLength(1);
  });
  it('maps an asynchronous paste position through edits and renders a live outline', async () => {
    let editor: Editor | null = null;
    let finish!: (result: { attachment_id: string; name: string; size_bytes: number; mime_type: string }) => void;
    const pending = new Promise<{ attachment_id: string; name: string; size_bytes: number; mime_type: string }>(resolve => { finish = resolve; });
    render(<RichEditor surface="voc-description" defaultValue={{ type: 'doc', content: [paragraph('original')] }} onAttach={() => pending} toolbar={e => { editor = e; return null; }} />);
    await waitFor(() => expect(editor).not.toBeNull());
    const live = editor as unknown as Editor;
    act(() => { live.commands.setTextSelection(1); });
    fireEvent.paste(live.view.dom, { clipboardData: { files: [new File(['x'], 'x.png', { type: 'image/png' })], items: [], getData: () => '' } });
    act(() => { live.commands.insertContentAt(0, { type: 'paragraph', content: [{ type: 'text', text: 'before' }] }); live.commands.setTextSelection(live.state.doc.content.size - 1); });
    await act(async () => { finish({ attachment_id: id, name: 'x.png', size_bytes: 1, mime_type: 'image/png' }); await pending; });
    const nodes = live.getJSON().content ?? [];
    expect(nodes.findIndex(node => node.type === 'image')).toBeLessThan(nodes.findIndex(node => node.content?.some(child => 'text' in child && child.text === 'original')));
    act(() => { live.commands.setContent(doc); });
    expect(live.view.dom.querySelector('[data-rich-outline]')).toHaveTextContent('개요');
    expect(live.view.dom.querySelector('[data-type="attachment-ref"]')).toHaveAttribute('data-attachment-id', id);
  });
  it('failed uploads insert no node and report an accessible error', async () => {
    let editor: Editor | null = null;
    render(<RichEditor surface="voc-description" onAttach={async () => { throw new Error('upload failed'); }} toolbar={e => { editor = e; return null; }} />);
    await waitFor(() => expect(editor).not.toBeNull());
    fireEvent.paste((editor as unknown as Editor).view.dom, { clipboardData: { files: [new File(['x'], 'x.png', { type: 'image/png' })], items: [], getData: () => '' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect((editor as unknown as Editor).getJSON().content?.some(n => n.type === 'image')).toBe(false);
  });

  it('clears the failed-upload warning once the author edits the document again', async () => {
    let editor: Editor | null = null;
    render(<RichEditor surface="voc-description" onAttach={async () => { throw new Error('upload failed'); }} toolbar={e => { editor = e; return null; }} />);
    await waitFor(() => expect(editor).not.toBeNull());
    fireEvent.paste((editor as unknown as Editor).view.dom, { clipboardData: { files: [new File(['x'], 'x.png', { type: 'image/png' })], items: [], getData: () => '' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    act(() => { (editor as unknown as Editor).commands.insertContent('계속 작성'); });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

it('two readers on one page keep their TOC targets inside their own document', () => {
  const { container } = render(<><div data-reader="a"><RichContentRenderer doc={doc} surface="voc-description" mode="internal" /></div><div data-reader="b"><RichContentRenderer doc={doc} surface="voc-description" mode="internal" /></div></>);
  const hrefs = ['a', 'b'].map(key => {
    const reader = container.querySelector(`[data-reader="${key}"]`) as HTMLElement;
    const href = reader.querySelector('nav a')?.getAttribute('href') ?? '';
    expect(reader.querySelector(`[id="${href.slice(1)}"]`)).toHaveTextContent('개요');
    return href;
  });
  expect(hrefs[0]).not.toBe(hrefs[1]);
  expect(container.querySelectorAll('h2[id]')).toHaveLength(2);
  expect(new Set([...container.querySelectorAll('h2[id]')].map(h => h.id)).size).toBe(2);
});

describe('image resize dimensions stay in sync with the document', () => {
  it('clears stale inline CSS on undo and redo, including an initially unset width', async () => {
    let editor: Editor | null = null;
    render(<RichEditor surface="voc-description" defaultValue={{ type: 'doc', content: [{ type: 'image', attrs: { id } }] }} resolveAttachmentUrl={id => `/attachments/${id}`} toolbar={e => { editor = e; return null; }} />);
    await waitFor(() => expect(editor).not.toBeNull());
    const live = editor as unknown as Editor;
    const img = () => live.view.dom.querySelector('img') as HTMLImageElement;
    const docWidth = () => live.getJSON().content?.[0]?.attrs?.width ?? null;
    expect(img().hasAttribute('width')).toBe(false);
    act(() => { img().style.width = '200px'; img().style.height = '100px'; live.chain().setNodeSelection(0).updateAttributes('image', { width: 200 }).run(); });
    act(() => { live.commands.undo(); });
    expect(docWidth()).toBeNull();
    expect(img().hasAttribute('width')).toBe(false);
    expect([img().style.width, img().style.height]).toEqual(['', '']);
    act(() => { live.commands.redo(); });
    expect(docWidth()).toBe(200);
    expect(img().getAttribute('width')).toBe('200');
    expect([img().style.width, img().style.height]).toEqual(['', '']);
    act(() => { img().style.width = '300px'; live.chain().setNodeSelection(0).updateAttributes('image', { width: 300 }).run(); });
    act(() => { live.commands.undo(); });
    expect(docWidth()).toBe(200);
    expect(img().getAttribute('width')).toBe('200');
    expect(img().style.width).toBe('');
  });
});

describe('simulated composition boundaries (jsdom, not native Korean IME)', () => {
  it.each(['paragraph', 'list', 'table', 'backspace'])('preserves committed Korean in %s; composing keys leave blocks and selection untouched', async kind => {
    let editor: Editor | null = null;
    render(<RichEditor surface="voc-description" toolbar={e => { editor = e; return null; }} />);
    await waitFor(() => expect(editor).not.toBeNull());
    const live = editor as unknown as Editor;
    act(() => {
      if (kind === 'list') live.commands.toggleBulletList();
      if (kind === 'table') live.commands.insertTable({ rows: 1, cols: 2 });
      if (kind === 'backspace') live.commands.setContent(paragraph('앞'));
      if (kind === 'backspace') live.commands.focus('end');
    });
    const before = { json: JSON.stringify(live.getJSON()), from: live.state.selection.from, to: live.state.selection.to };
    fireEvent.compositionStart(live.view.dom, { data: '' });
    fireEvent.compositionUpdate(live.view.dom, { data: '한글' });
    fireEvent.keyDown(live.view.dom, { key: kind === 'backspace' ? 'Backspace' : kind === 'table' ? 'Tab' : 'Enter', keyCode: 229, isComposing: true });
    expect({ json: JSON.stringify(live.getJSON()), from: live.state.selection.from, to: live.state.selection.to }).toEqual(before);
    act(() => { live.commands.insertContent('한글'); });
    fireEvent.compositionEnd(live.view.dom, { data: '한글' });
    expect(live.getText()).toContain('한글');
    expect(live.getText().match(/한글/g)).toHaveLength(1);
    expect(screen.queryByRole('listbox', { name: '블록 추가' })).toBeNull();
  });
  it('composing Enter/arrows do not drive an open slash menu; ending composition restores it', async () => {
    let editor: Editor | null = null;
    render(<RichEditor surface="voc-description" toolbar={e => { editor = e; return null; }} />);
    await waitFor(() => expect(editor).not.toBeNull());
    const live = editor as unknown as Editor;
    await waitFor(() => expect(live.view.state.plugins.some(p => (p as unknown as { key: string }).key.startsWith('richContentSlash'))).toBe(true));
    act(() => { live.commands.focus(); live.commands.insertContent('/'); });
    const menu = await screen.findByRole('listbox', { name: '블록 추가' });
    const options = () => screen.getAllByRole('option');
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    fireEvent.compositionStart(live.view.dom, { data: '' });
    for (const key of ['ArrowDown', 'Enter']) fireEvent.keyDown(live.view.dom, { key, keyCode: 229, isComposing: true });
    expect(menu).toBeInTheDocument();
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    expect(live.getText()).toBe('/');
    fireEvent.compositionEnd(live.view.dom, { data: '' });
    await waitFor(() => expect(live.view.composing).toBe(false));
    // Browsers can report keydown.isComposing without ProseMirror seeing composition (view.composing false);
    // only the EditorExtras guard stops these, so this is the step that fails if the guard is removed.
    await act(async () => { await new Promise(r => setTimeout(r, 600)); });
    const late = createEvent.keyDown(live.view.dom, { key: 'ArrowDown', keyCode: 229 });
    Object.defineProperty(late, 'isComposing', { value: true }); // jsdom drops isComposing from the init dict
    fireEvent(live.view.dom, late);
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    expect(live.getText()).toBe('/');
    // jsdom: the first key after compositionend is consumed while ProseMirror settles, so press twice.
    for (let i = 0; i < 2; i++) fireEvent.keyDown(live.view.dom, { key: 'ArrowDown', keyCode: 40 });
    expect(options()[0]).toHaveAttribute('aria-selected', 'false');
    fireEvent.keyDown(live.view.dom, { key: 'Enter' });
    expect(live.getText()).not.toContain('/');
    await waitFor(() => expect(screen.queryByRole('listbox', { name: '블록 추가' })).toBeNull());
  });
});
