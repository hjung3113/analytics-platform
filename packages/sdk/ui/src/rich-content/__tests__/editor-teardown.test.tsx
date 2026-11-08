import { act, render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/core';
import { afterEach, expect, it, vi } from 'vitest';
import { watchEditorTimers } from '../../__tests__/support/watch-editor-timers';
import RichEditorImpl from '../RichEditorImpl';

afterEach(() => { vi.restoreAllMocks(); });

it('waits at the end of a file until a pending BubbleMenu timer has run (#1543)', async () => {
  const settle = watchEditorTimers();
  let editor: Editor | null = null;
  render(<RichEditorImpl surface="voc-description" defaultValue={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'selected text' }] }] }} toolbar={live => { editor = live; return null; }} />);
  await screen.findByRole('textbox');
  act(() => { editor!.commands.setTextSelection({ from: 1, to: 5 }); });
  // BubbleMenuView.shouldShow reads this after its 250 ms debounce. Once settled, nothing is left to read it after jsdom is gone.
  const reads = vi.spyOn(document, 'activeElement', 'get');
  await settle();
  expect(reads).toHaveBeenCalled();
});

it('does not delay a file that mounted no editor', async () => {
  const settle = watchEditorTimers();
  const started = performance.now();
  await settle();
  expect(performance.now() - started).toBeLessThan(100);
});
