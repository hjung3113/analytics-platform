import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ListStateMessage } from './ListStateMessage';

describe('ListStateMessage', () => {
  it('renders an empty message and invokes its action', () => {
    const onClick = vi.fn();
    render(
      <ListStateMessage
        variant="empty"
        title="Task가 없습니다."
        body="등록된 Task가 여기에 표시됩니다."
        action={{ label: '새로고침', onClick }}
      />,
    );

    expect(screen.getByText('Task가 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('등록된 Task가 여기에 표시됩니다.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '새로고침' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByTestId('list-state-message')).toHaveAttribute('data-variant', 'empty');
  });

  it('renders a filtered message and invokes its action', () => {
    const onClick = vi.fn();
    render(
      <ListStateMessage
        variant="filtered"
        title="현재 조건에 맞는 설문이 없습니다"
        body="상태: Draft"
        action={{ label: '필터 초기화', onClick }}
      />,
    );

    expect(screen.getByText('현재 조건에 맞는 설문이 없습니다')).toBeInTheDocument();
    expect(screen.getByText('상태: Draft')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '필터 초기화' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByTestId('list-state-message')).toHaveAttribute('data-variant', 'filtered');
  });

  it('renders an error message and invokes its action', () => {
    const onClick = vi.fn();
    render(
      <ListStateMessage
        variant="error"
        title="Finding 목록을 불러오지 못했습니다"
        body="잠시 후 다시 시도하세요."
        action={{ label: '다시 시도', onClick }}
      />,
    );

    expect(screen.getByText('Finding 목록을 불러오지 못했습니다')).toBeInTheDocument();
    expect(screen.getByText('잠시 후 다시 시도하세요.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }));
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByTestId('list-state-message')).toHaveAttribute('data-variant', 'error');
  });

  it('aligns to the start in a small size only when asked; the default stays centred', () => {
    const { rerender } = render(<ListStateMessage variant="empty" title="비어 있음" />);
    const title = () => screen.getByText('비어 있음');
    expect(title().parentElement).toHaveClass('items-center', 'py-12');
    expect(title().parentElement).not.toHaveClass('items-start');

    rerender(<ListStateMessage variant="empty" title="비어 있음" align="start" />);
    expect(title().parentElement).toHaveClass('items-start', 'text-left', 'py-6');
    expect(title().parentElement).not.toHaveClass('items-center');
  });
});
