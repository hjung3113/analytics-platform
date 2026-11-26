import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RichEditorImpl from '../RichEditorImpl';

// #3043: switching whether the editor is editable is not a content change. tiptap's `setEditable` emits `update` by default,
// which reached `onChange` on mount and made a form dirty before anyone typed (Escape then asked to discard nothing).
describe('RichEditor editable state', () => {
  it('does not call onChange on mount or when disabled toggles', async () => {
    const onChange = vi.fn();
    const element = (disabled: boolean) => <RichEditorImpl surface="voc-description" disabled={disabled} onChange={onChange} />;
    const { rerender } = render(element(false));
    await screen.findByRole('textbox');
    rerender(element(true));
    rerender(element(false));
    expect(onChange).not.toHaveBeenCalled();
  });
});
