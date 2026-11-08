import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import RichEditorImpl from '../RichEditorImpl';
import { RichContentRenderer } from '../RichContentRenderer';

describe('editor-owned block control gutter', () => {
  it('reserves a gutter only for an editable surface with block controls', async () => {
    const { rerender } = render(<RichEditorImpl surface="voc-description" />);
    await screen.findByRole('textbox');
    expect(screen.getByRole('textbox').parentElement).toHaveAttribute('data-rich-gutter');
    rerender(<RichEditorImpl surface="voc-description" disabled />);
    expect(screen.getByRole('textbox').parentElement).not.toHaveAttribute('data-rich-gutter');
    rerender(<RichEditorImpl surface="reporter-reply" />);
    expect(screen.getByRole('textbox').parentElement).not.toHaveAttribute('data-rich-gutter');
  });
  it('does not add an editing gutter to read-view content', () => {
    const { container } = render(<RichContentRenderer surface="voc-description" mode="reporter_visible" doc={{ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Read body' }] }] }} />);
    expect(container.querySelector('[data-rich-gutter]')).toBeNull();
    expect(container.querySelector('.rich-editor')).toBeNull();
    expect(screen.getByText('Read body')).toBeInTheDocument();
  });
});
