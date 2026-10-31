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

    it('returns focus to the second opener when reopened before the first close finishes', async () => {
      function TwoOpeners() {
        const [open, setOpen] = React.useState(false);
        return (
          <>
            <button type="button" onClick={() => setOpen(true)}>
              열기 A
            </button>
            <button type="button" onClick={() => setOpen(true)}>
              열기 B
            </button>
            <PreviewModal open={open} onClose={() => setOpen(false)} title="미리보기 제목">
              <span>body</span>
            </PreviewModal>
          </>
        );
      }
      render(<TwoOpeners />);
      const buttonA = screen.getByRole('button', { name: '열기 A' });
      const buttonB = screen.getByRole('button', { name: '열기 B' });
      buttonA.focus();
      fireEvent.click(buttonA);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      // Reopen synchronously: the first close's deferred focus restore has not run yet.
      buttonB.focus();
      fireEvent.click(buttonB);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      // Let the first mount's deferred close callback run.
      await new Promise((resolve) => setTimeout(resolve, 20));
      fireEvent.keyDown(document.body, { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(buttonB).toHaveFocus());
    });
  });
});
