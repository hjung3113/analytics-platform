// RichEditor accessible name (#1161): the contenteditable textbox takes its name from `ariaLabel`.

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RichEditor } from '../../index';

describe('RichEditor accessible name', () => {
  it('names the editable textbox from ariaLabel and marks it multiline', async () => {
    render(<RichEditor surface="internal-comment" ariaLabel="내부 코멘트 내용" />);
    const box = await screen.findByRole('textbox', { name: '내부 코멘트 내용' });
    expect(box).toHaveAttribute('aria-multiline', 'true');
  });

  it('omits aria-label when ariaLabel is not given', async () => {
    render(<RichEditor surface="internal-comment" />);
    const box = await screen.findByRole('textbox');
    expect(box).not.toHaveAttribute('aria-label');
  });
});

it.each([
  ['internal-comment', ['굵게', '기울임', '링크', '글머리 목록', '번호 목록']],
  ['public-update', ['굵게', '기울임', '글머리 목록', '번호 목록']],
  ['reporter-reply', ['굵게', '기울임', '링크']],
] as const)('shows one minimal capability toolbar for %s', async (surface, labels) => {
  render(<RichEditor surface={surface} />);
  const toolbar = await screen.findByRole('toolbar', { name: '본문 서식' });
  expect(toolbar).toHaveClass('bg-surface-band', 'border-border-chrome');
  expect(within(toolbar).getAllByRole('button').map(button => button.getAttribute('aria-label'))).toEqual(labels);
});

it('uses the caller toolbar in place of the default', async () => {
  render(<RichEditor surface="internal-comment" toolbar={() => <button type="button">저장</button>} />);
  await screen.findByRole('textbox');
  expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument();
  expect(screen.queryByRole('toolbar', { name: '본문 서식' })).toBeNull();
});
