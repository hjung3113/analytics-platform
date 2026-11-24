import { Profiler } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import type { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('@tiptap/extension-drag-handle-react', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
import RichEditorImpl from '../RichEditorImpl';
import { EditorContextBars } from '../EditorContextBars';

// #2814: typing inside a table must not resubscribe the context bar's ResizeObserver or add a render for an unchanged placement.

const observers = { built: 0 };
class CountingObserver { constructor() { observers.built++; } observe() {} unobserve() {} disconnect() {} }

/** Lays the editor's table wrapper and the bar's marker out at fixed rectangles, so the placement has real numbers. */
function layout() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect;
    if (this.classList.contains('tableWrapper') || this.tagName === 'TABLE' || this.tagName === 'PRE') return box(140, 260, 400, 120);
    if (this.classList.contains('relative') && this.classList.contains('z-5')) return box(100, 200, 600, 0);
    if (this.hasAttribute('data-context-placement')) return box(0, 0, 180, 28);
    return box(0, 0, 0, 0);
  });
}

async function mount() {
  let editor: Editor | null = null;
  const rendered = render(<RichEditorImpl surface="voc-description" ariaLabel="본문" toolbar={(live, api) => { editor = live; return api.renderControls?.(); }} />);
  await screen.findByRole('textbox', { name: '본문' });
  await waitFor(() => expect(editor).not.toBeNull());
  vi.spyOn(editor!.view, 'coordsAtPos').mockReturnValue({ top: 120, bottom: 140, left: 10, right: 10 });
  return { ...rendered, editor: editor! };
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('context bar while typing (#2814)', () => {
  it('builds the ResizeObserver once over five keys in a table', async () => {
    vi.stubGlobal('ResizeObserver', CountingObserver);
    layout();
    const { editor } = await mount();
    act(() => { editor.commands.insertTable({ rows: 2, cols: 2 }); });
    await screen.findByRole('toolbar', { name: '표 편집' });
    const built = observers.built;
    for (const letter of 'abcde') act(() => { editor.commands.insertContent(letter); });
    expect(observers.built - built).toBe(0);
  });

  it('renders the bar once per key when its placement stays the same', async () => {
    layout();
    const { editor } = await mount();
    act(() => { editor.commands.insertTable({ rows: 2, cols: 2 }); });
    // A second bar on the same editor, alone under a Profiler, so only its own renders count.
    let commits = 0;
    render(<Profiler id="bar" onRender={() => { commits++; }}><EditorContextBars editor={editor} /></Profiler>);
    await waitFor(() => expect(screen.getAllByRole('toolbar', { name: '표 편집' })).toHaveLength(2));
    const before = commits;
    for (const letter of 'abcde') act(() => { editor.commands.insertContent(letter); });
    expect(commits - before).toBeLessThanOrEqual(5);
  });

  it('places the table bar at the wrapper start and the code bar at the block end, inside the marker', async () => {
    layout();
    const { editor } = await mount();
    act(() => { editor.commands.insertTable({ rows: 2, cols: 2 }); });
    const table = (await screen.findByRole('toolbar', { name: '표 편집' })).parentElement!;
    expect(table.style.getPropertyValue('--rich-context-top')).toBe('60px');
    expect(table.style.getPropertyValue('--rich-context-left')).toBe('40px');
    act(() => { editor.commands.setContent('<pre><code>x</code></pre>'); editor.commands.setTextSelection(1); });
    const code = (await screen.findByRole('button', { name: '코드 언어' })).closest<HTMLElement>('[data-context-placement]')!;
    expect(code.style.getPropertyValue('--rich-context-top')).toBe('60px');
    expect(code.style.getPropertyValue('--rich-context-left')).toBe(`${540 - 100 - 180}px`);
    act(() => { editor.commands.setContent('<p>plain</p>'); editor.commands.setTextSelection(1); });
    await waitFor(() => expect(document.querySelector('[data-context-placement]')).toBeNull());
  });
});
