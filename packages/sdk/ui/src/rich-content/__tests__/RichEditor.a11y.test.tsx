// RichEditor accessible name (#1161): the contenteditable textbox takes its name from `ariaLabel`.

import { render, screen } from '@testing-library/react';
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
