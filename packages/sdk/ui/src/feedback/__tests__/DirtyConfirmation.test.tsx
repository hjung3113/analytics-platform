/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DirtyConfirmation } from '../DirtyConfirmation.js';

describe('DirtyConfirmation', () => {
  it('does not show dialog content when open is false', () => {
    render(
      <DirtyConfirmation
        open={false}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByText('변경사항이 저장되지 않았습니다')).toBeNull();
  });

  it('shows title, message, and buttons with Korean defaults when open is true', () => {
    render(
      <DirtyConfirmation
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText('변경사항이 저장되지 않았습니다')).toBeInTheDocument();
    expect(screen.getByText('이동하면 작성 중인 내용이 사라집니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '이동' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '계속 작성' })).toHaveClass(
      'bg-surface-raised',
      'border-border-subtle',
    );
  });

  it('calls onConfirm (and not onCancel) when the confirm button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DirtyConfirmation open={true} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '이동' }));
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel (and not onConfirm) when the cancel button is clicked', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(
      <DirtyConfirmation open={true} onConfirm={onConfirm} onCancel={onCancel} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders custom title, message, and button labels', () => {
    render(
      <DirtyConfirmation
        open={true}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
        title="저장하지 않고 나가시겠습니까?"
        message="변경사항이 취소됩니다."
        confirmLabel="나가기"
        cancelLabel="취소"
      />,
    );
    expect(screen.getByText('저장하지 않고 나가시겠습니까?')).toBeInTheDocument();
    expect(screen.getByText('변경사항이 취소됩니다.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '나가기' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '취소' })).toHaveClass(
      'bg-surface-raised',
      'border-border-subtle',
    );
  });

  it.each([
    { name: '이동', callback: 'confirm' },
    { name: '계속 작성', callback: 'cancel' },
  ] as const)('closes the dialog when the $callback button is clicked (#1324)', async ({ name, callback }) => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <DirtyConfirmation
          open={open}
          onConfirm={callback === 'confirm' ? () => { onConfirm(); setOpen(false); } : onConfirm}
          onCancel={callback === 'cancel' ? () => { onCancel(); setOpen(false); } : onCancel}
        />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name }));
    await waitFor(() => expect(screen.queryByText('변경사항이 저장되지 않았습니다')).not.toBeInTheDocument());
    expect(onConfirm).toHaveBeenCalledTimes(callback === 'confirm' ? 1 : 0);
    expect(onCancel).toHaveBeenCalledTimes(callback === 'cancel' ? 1 : 0);
  });

  it('closes on Escape and calls onCancel once (#1324)', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <DirtyConfirmation
          open={open}
          onConfirm={onConfirm}
          onCancel={() => { onCancel(); setOpen(false); }}
        />
      );
    }
    render(<Harness />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('변경사항이 저장되지 않았습니다')).not.toBeInTheDocument());
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not swallow a later Escape after a default-prevented button click (#1324)', async () => {
    const onCancel = vi.fn();
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return (
        <div onClickCapture={(event) => event.preventDefault()}>
          <button type="button" onClick={() => setOpen(true)}>reopen</button>
          <DirtyConfirmation
            open={open}
            onConfirm={vi.fn()}
            onCancel={() => { onCancel(); setOpen(false); }}
          />
        </div>
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    await waitFor(() => expect(screen.queryByText('변경사항이 저장되지 않았습니다')).not.toBeInTheDocument());
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'reopen' }));
    await screen.findByText('변경사항이 저장되지 않았습니다');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByText('변경사항이 저장되지 않았습니다')).not.toBeInTheDocument());
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
