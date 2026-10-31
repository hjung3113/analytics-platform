import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import * as React from 'react';
import { TransientOverlayScope } from '../../TransientOverlayScope';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '../dialog.js';

describe('DialogContent accessible labels', () => {
  it('uses its configured close label', () => {
    render(
      <Dialog open>
        <DialogContent closeLabel="Dismiss dialog">
          <DialogTitle>Dialog title</DialogTitle>
          <DialogDescription>Dialog description</DialogDescription>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Dismiss dialog' })).toBeInTheDocument();
  });
});

describe('DialogContent toast interactions (#1030)', () => {
  it.each(['toast', 'outside', 'caller'] as const)(
    'protects toast clicks and preserves outside interaction: %s',
    async (target) => {
      const onOpenChange = vi.fn();
      const onInteractOutside = vi.fn();
      render(
        <>
          <Dialog open onOpenChange={onOpenChange}>
            <DialogContent onInteractOutside={onInteractOutside}>
              <DialogTitle>Overlay title</DialogTitle>
              <DialogDescription>Overlay description</DialogDescription>
            </DialogContent>
          </Dialog>
          <ol data-sonner-toaster>
            <li>
              <button type="button">실행 취소</button>
            </li>
          </ol>
          <div data-testid="plain-outside" />
        </>,
      );
      // Radix installs the document pointerdown listener on the next turn.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
      fireEvent.pointerDown(
        target === 'toast' ? screen.getByText('실행 취소') : screen.getByTestId('plain-outside'),
        { pointerType: 'mouse', button: 0 },
      );
      if (target === 'toast') {
        expect(onOpenChange).not.toHaveBeenCalled();
        expect(screen.getByRole('dialog')).toBeInTheDocument();
      } else {
        expect(onOpenChange).toHaveBeenCalledWith(false);
        if (target === 'caller') expect(onInteractOutside).toHaveBeenCalled();
      }
    },
  );
});

describe('DialogContent focus return without a trigger (#1169)', () => {
  function Harness({ onCloseAutoFocus }: { onCloseAutoFocus?: (event: Event) => void }) {
    const [open, setOpen] = React.useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          열기
        </button>
        <button type="button">다른 곳</button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent {...(onCloseAutoFocus ? { onCloseAutoFocus } : {})}>
            <DialogTitle>제목</DialogTitle>
            <DialogDescription>설명</DialogDescription>
          </DialogContent>
        </Dialog>
      </>
    );
  }
  function openIt() {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: '열기' });
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    return opener;
  }

  it('returns focus to the opener on Escape', async () => {
    const opener = openIt();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('returns focus to the opener on the built-in close button', async () => {
    const opener = openIt();
    fireEvent.click(screen.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it('lets a consumer preventDefault win', async () => {
    const onCloseAutoFocus = vi.fn((event: Event) => {
      event.preventDefault();
      screen.getByRole('button', { name: '다른 곳' }).focus();
    });
    render(<Harness onCloseAutoFocus={onCloseAutoFocus} />);
    const opener = screen.getByRole('button', { name: '열기' });
    opener.focus();
    fireEvent.click(opener);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(onCloseAutoFocus).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('button', { name: '다른 곳' })).toHaveFocus();
  });

  it('leaves focus on a Radix trigger as before', async () => {
    render(
      <Dialog>
        <DialogTrigger>트리거</DialogTrigger>
        <DialogContent>
          <DialogTitle>제목</DialogTitle>
          <DialogDescription>설명</DialogDescription>
        </DialogContent>
      </Dialog>,
    );
    const trigger = screen.getByRole('button', { name: '트리거' });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it('does not restore or call the consumer when the overlay scope hid the dialog', async () => {
    const onCloseAutoFocus = vi.fn();
    function Scoped({ active }: { active: boolean }) {
      return (
        <TransientOverlayScope active={active}>
          <button type="button">밖</button>
          <Dialog open>
            <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
              <DialogTitle>제목</DialogTitle>
              <DialogDescription>설명</DialogDescription>
            </DialogContent>
          </Dialog>
        </TransientOverlayScope>
      );
    }
    const { rerender } = render(<Scoped active />);
    rerender(<Scoped active={false} />);
    screen.getByRole('button', { name: '밖' }).focus();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('button', { name: '밖' })).toHaveFocus();
    expect(onCloseAutoFocus).not.toHaveBeenCalled();
  });
});
