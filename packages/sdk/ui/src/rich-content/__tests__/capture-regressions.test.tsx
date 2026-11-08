import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Editor } from '@tiptap/core';
import { describe, expect, it, vi } from 'vitest';
import RichEditorImpl from '../RichEditorImpl';
import { RichContentRenderer } from '../RichContentRenderer';
import type { TipTapDoc } from '../RichEditor';
import { AttachButton } from '../toolbar/AttachButton';

async function mountEditor() {
  let editor: Editor | undefined;
  const element = (disabled: boolean) => <RichEditorImpl surface="voc-description" ariaLabel="본문" disabled={disabled} defaultValue={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '선택한 본문' }] }] }} toolbar={(live, api) => { editor = live ?? undefined; return api.renderControls?.(); }} />;
  const rendered = render(element(false));
  await screen.findByRole('textbox', { name: '본문' });
  await waitFor(() => expect(editor).toBeDefined());
  // Disable through the prop a consumer uses: the editor re-applies `editable: !disabled` on every render.
  return { ...rendered, editor: editor!, setDisabled: (disabled: boolean) => rendered.rerender(element(disabled)) };
}

describe('capture review regressions', () => {
  it('keeps legacy attachment controls unchanged unless tooltip help is opted in', () => {
    render(<AttachButton onPick={() => {}} />);
    expect(screen.getByRole('button', { name: '첨부 파일 추가' })).not.toHaveAttribute('data-state');
  });

  it('associates slash options with editor focus through navigation, filtering, Escape and disabling', async () => {
    const { editor, setDisabled } = await mountEditor();
    await waitFor(() => expect(editor.state.plugins.some(p => (p as unknown as { key: string }).key.startsWith('richContentSlash'))).toBe(true));
    const box = screen.getByRole('textbox', { name: '본문' });
    expect(box).toHaveAttribute('aria-expanded', 'false');
    act(() => { editor.commands.clearContent(); editor.commands.focus(); editor.commands.insertContent('/'); });
    const menu = await screen.findByRole('listbox', { name: '블록 추가' });
    const options = within(menu).getAllByRole('option');
    expect(menu.id).not.toBe('');
    // Focus (Tiptap's focus command) and the textbox association (an effect after the menu renders) land asynchronously.
    await waitFor(() => { expect(box).toHaveFocus(); expect(box).toHaveAttribute('aria-expanded', 'true'); });
    expect(box).toHaveAttribute('aria-controls', menu.id);
    expect(options[0]!.id).not.toBe('');
    expect(box).toHaveAttribute('aria-activedescendant', options[0]!.id);
    fireEvent.keyDown(box, { key: 'ArrowDown' });
    expect(box).toHaveAttribute('aria-activedescendant', options[1]!.id);
    fireEvent.keyDown(box, { key: 'ArrowUp' });
    expect(box).toHaveAttribute('aria-activedescendant', options[0]!.id);
    act(() => { editor.commands.insertContent('제목'); });
    const filtered = within(screen.getByRole('listbox')).getAllByRole('option');
    expect(filtered[0]).toHaveAttribute('aria-selected', 'true');
    expect(box).toHaveAttribute('aria-activedescendant', filtered[0]!.id);
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(box).toHaveAttribute('aria-expanded', 'false');
    expect(box).not.toHaveAttribute('aria-controls');
    expect(box).not.toHaveAttribute('aria-activedescendant');
    act(() => { editor.commands.clearContent(); editor.commands.insertContent('/'); });
    await screen.findByRole('listbox');
    await waitFor(() => expect(box).toHaveAttribute('aria-expanded', 'true'));
    setDisabled(true);
    await waitFor(() => expect(box).toHaveAttribute('aria-expanded', 'false'));
    expect(box).not.toHaveAttribute('aria-controls');
    expect(box).not.toHaveAttribute('aria-activedescendant');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('gives concurrent editors separate slash menu and option ids', async () => {
    const first = await mountEditor();
    await waitFor(() => expect(first.editor.state.plugins.some(p => (p as unknown as { key: string }).key.startsWith('richContentSlash'))).toBe(true));
    act(() => { first.editor.commands.clearContent(); first.editor.commands.focus(); first.editor.commands.insertContent('/'); });
    const firstMenu = await within(first.container).findByRole('listbox');
    const firstOptionId = within(firstMenu).getAllByRole('option')[0]!.id;
    let secondEditor: Editor | null = null;
    const secondRender = render(<RichEditorImpl surface="voc-description" ariaLabel="두 번째 본문" toolbar={live => { secondEditor = live; return null; }} />);
    const secondBox = await screen.findByRole('textbox', { name: '두 번째 본문' });
    await waitFor(() => expect(secondEditor?.state.plugins.some(p => (p as unknown as { key: string }).key.startsWith('richContentSlash'))).toBe(true));
    act(() => { secondEditor!.commands.focus(); secondEditor!.commands.insertContent('/'); });
    const secondMenu = await within(secondRender.container).findByRole('listbox');
    const secondOptionId = within(secondMenu).getAllByRole('option')[0]!.id;
    expect(firstMenu.id).not.toBe('');
    expect(secondMenu.id).not.toBe(firstMenu.id);
    expect(secondOptionId).not.toBe(firstOptionId);
    await waitFor(() => expect(secondBox).toHaveAttribute('aria-controls', secondMenu.id));
    expect(secondBox).toHaveAttribute('aria-activedescendant', secondOptionId);
  });

  it('uses the checklist flex selector DOM contract in editor and reader, including nested items', async () => {
    const { editor, container } = await mountEditor();
    const item = (text: string, content: TipTapDoc['content'] = []) => ({ type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }, ...content] });
    const doc: TipTapDoc = { type: 'doc', content: [{ type: 'taskList', content: [item('상위', [{ type: 'taskList', content: [item('하위')] }])] }] };
    act(() => { editor.commands.setContent(doc); });
    const reader = render(<RichContentRenderer surface="voc-description" mode="internal" doc={doc} />);
    for (const root of [container.querySelector('.ProseMirror')!, reader.container]) {
      expect(root.querySelectorAll('li[data-type="taskItem"]')).toHaveLength(2);
      expect(root.querySelectorAll('li[data-type="taskItem"] > label > input[type="checkbox"]')).toHaveLength(2);
      expect(root.querySelectorAll('li[data-type="taskItem"] > div')).toHaveLength(2);
    }
    fireEvent.click(container.querySelector('li input')!);
    expect(container.querySelector('li')).toHaveAttribute('data-type', 'taskItem');
    expect(container.querySelector('li')).toHaveAttribute('data-checked', 'true');
  });

  it.each(['굵게', '기울임', '밑줄', '취소선', '인라인 코드', '형광펜', '글자색', '블록 추가', '링크', '실행 취소', '첨부 파일 추가', '열 삭제', '행 삭제', '표 삭제', '칸 병합 / 나누기', '머리 행', '열 추가', '행 추가'])('shows shared tooltip help for %s without changing its accessible name', async label => {
    const { editor } = await mountEditor();
    act(() => { editor.commands.insertTable({ rows: 2, cols: 2 }); });
    const control = within(screen.getByRole('toolbar', { name: '본문 서식' })).getByRole('button', { name: label });
    // Undo needs an undoable transaction; attachment is exposed by api.renderControls().
    await userEvent.hover(control);
    expect(await screen.findByRole('tooltip')).toHaveTextContent(label);
    expect(control).toHaveAccessibleName(label);
  });

  it('explains invalid links inline, retains the selected range and applies a corrected http(s) link', async () => {
    const { editor } = await mountEditor();
    // jsdom has no text-range layout; only suppress geometry used by scroll-to-selection.
    vi.spyOn(editor.view, 'coordsAtPos').mockReturnValue({ top: 0, bottom: 0, left: 0, right: 0 });
    act(() => { editor.commands.setTextSelection({ from: 1, to: 4 }); });
    const selection = { from: editor.state.selection.from, to: editor.state.selection.to };
    await userEvent.click(screen.getByRole('button', { name: '링크' }));
    const input = screen.getByRole('textbox', { name: '링크 주소' });
    await userEvent.type(input, 'example.com');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(input).toHaveAttribute('aria-invalid', 'true');
    const error = screen.getByRole('alert');
    expect(error).toHaveTextContent('http:// 또는 https://');
    expect(input).toHaveAttribute('aria-describedby', error.id);
    expect({ from: editor.state.selection.from, to: editor.state.selection.to }).toEqual(selection);
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toBeUndefined();
    await userEvent.clear(input);
    await userEvent.type(input, 'https://example.com');
    await userEvent.click(screen.getByRole('button', { name: '적용' }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(editor.getJSON().content?.[0]?.content?.[0]?.marks).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'link', attrs: expect.objectContaining({ href: 'https://example.com' }) })]));
    expect(editor.getJSON().content?.[0]?.content?.[1]?.marks).toBeUndefined();
  });
});
