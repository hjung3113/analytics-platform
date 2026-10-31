import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewModal } from '../PreviewModal.js';

describe('PreviewModal', () => {
  it('renders children and title when open', () => {
    render(
      <PreviewModal open onClose={vi.fn()} title="Public update — Reporter preview">
        <div data-testid="preview-content">Preview body</div>
      </PreviewModal>,
    );
    expect(screen.getByText('Public update — Reporter preview')).toBeInTheDocument();
    expect(screen.getByTestId('preview-content')).toBeInTheDocument();
  });

  it('does not render children when closed', () => {
    render(
      <PreviewModal open={false} onClose={vi.fn()} title="Some preview">
        <div data-testid="hidden-content">Should not show</div>
      </PreviewModal>,
    );
    expect(screen.queryByTestId('hidden-content')).not.toBeInTheDocument();
  });

  it('applies size lg (max-w-3xl) to the dialog content', () => {
    render(
      <PreviewModal open onClose={vi.fn()} title="Reporter reply preview">
        <span>body</span>
      </PreviewModal>,
    );
    // The dialog content wrapper should carry the lg size class.
    const content = document.querySelector('[data-testid="preview-modal-content"]');
    expect(content).not.toBeNull();
    expect(content?.className).toMatch(/max-w-3xl/);
  });

  describe('focus return on close', () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            미리보기
          </button>
          <PreviewModal open={open} onClose={() => setOpen(false)} title="미리보기 제목">
            <span>body</span>
          </PreviewModal>
        </>
      );
    }

    function openModal() {
      render(<Harness />);
      const button = screen.getByRole('button', { name: '미리보기' });
      button.focus();
      fireEvent.click(button);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      return button;
    }

    it('returns focus to the opener on Escape', async () => {
      const button = openModal();
      fireEvent.keyDown(document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(button).toHaveFocus());
    });

    it('returns focus to the opener on the built-in close button', async () => {
      const button = openModal();
      fireEvent.click(screen.getByRole('button', { name: '닫기' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(button).toHaveFocus());
    });
  });
});
