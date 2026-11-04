import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '../alert-dialog.js';

describe('AlertDialogContent toast interactions (#1030)', () => {
  it.each(['toast', 'outside', 'caller'] as const)(
    'protects toast clicks and preserves outside interaction: %s',
    async (target) => {
      const onOpenChange = vi.fn();
      const onInteractOutside = vi.fn();
      render(
        <>
          <AlertDialog open onOpenChange={onOpenChange}>
            <AlertDialogContent onInteractOutside={onInteractOutside}>
              <AlertDialogTitle>Overlay title</AlertDialogTitle>
              <AlertDialogDescription>Overlay description</AlertDialogDescription>
            </AlertDialogContent>
          </AlertDialog>
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

describe('AlertDialogCancel and AlertDialogAction close the dialog (#1324)', () => {
  function Content({ cancel, action }: {
    cancel?: React.ComponentPropsWithoutRef<typeof AlertDialogCancel>;
    action?: React.ComponentPropsWithoutRef<typeof AlertDialogAction>;
  }) {
    return (
      <>
        <AlertDialogTitle>삭제할까요?</AlertDialogTitle>
        <AlertDialogDescription>이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
        <footer>
          <AlertDialogCancel {...cancel}>취소</AlertDialogCancel>
          {action !== undefined && <AlertDialogAction {...action}>확인</AlertDialogAction>}
        </footer>
      </>
    );
  }

  it('closes an uncontrolled dialog when Cancel is clicked without onClick', async () => {
    render(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <Content />
        </AlertDialogContent>
      </AlertDialog>,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('notifies onOpenChange(false) when Cancel is clicked in a controlled dialog', () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <Content />
        </AlertDialogContent>
      </AlertDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('runs a consumer onClick on Cancel and still closes', async () => {
    const onOpenChange = vi.fn();
    const onClick = vi.fn();
    render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <Content cancel={{ onClick }} />
        </AlertDialogContent>
      </AlertDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: '취소' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes an uncontrolled dialog when Action is clicked', async () => {
    render(
      <AlertDialog defaultOpen>
        <AlertDialogContent>
          <Content action={{}} />
        </AlertDialogContent>
      </AlertDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the dialog open when an Action onClick preventDefaults (ImportWizard 계속-열기 contract)', () => {
    const onOpenChange = vi.fn();
    render(
      <AlertDialog open onOpenChange={onOpenChange}>
        <AlertDialogContent>
          <Content action={{ onClick: (event) => event.preventDefault() }} />
        </AlertDialogContent>
      </AlertDialog>,
    );
    fireEvent.click(screen.getByRole('button', { name: '확인' }));
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
