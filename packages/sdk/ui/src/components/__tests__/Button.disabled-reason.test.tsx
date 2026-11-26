import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { Button } from '../Button.js';

it('shows a disabled reason and describes it without replacing existing descriptions', () => {
  render(
    <>
      <span id="existing-description">Existing help</span>
      <Button disabled aria-describedby="existing-description" disabledReason="Select a system first">
        Create
      </Button>
    </>,
  );

  const button = screen.getByRole('button', { name: 'Create' });
  const reason = screen.getByText('Select a system first');
  const describedBy = button.getAttribute('aria-describedby')?.split(' ') ?? [];

  expect(button).toBeDisabled();
  expect(reason).toBeVisible();
  expect(describedBy).toContain('existing-description');
  expect(describedBy).toContain(reason.id);
  expect(reason.id).not.toBe('');
});

it('does not render a disabled reason for an enabled button', () => {
  render(
    <Button aria-describedby="existing-description" disabledReason="Select a system first">
      Create
    </Button>,
  );

  expect(screen.getByRole('button', { name: 'Create' })).toHaveAttribute(
    'aria-describedby',
    'existing-description',
  );
  expect(screen.queryByText('Select a system first')).toBeNull();
});

it('keeps the focused button node when its disabled reason appears and disappears', () => {
  const ref = React.createRef<HTMLButtonElement>();
  const { rerender } = render(
    <Button ref={ref} disabledReason={undefined}>
      Create
    </Button>,
  );
  const button = screen.getByRole('button', { name: 'Create' });
  button.focus();

  rerender(
    <Button ref={ref} disabled disabledReason="Select a system first">
      Create
    </Button>,
  );

  expect(screen.getByRole('button', { name: 'Create' })).toBe(button);
  expect(ref.current).toBe(button);
  expect(button).toHaveFocus();
  expect(screen.getByText('Select a system first')).toBeVisible();

  rerender(
    <Button ref={ref} disabledReason={undefined}>
      Create
    </Button>,
  );

  expect(screen.getByRole('button', { name: 'Create' })).toBe(button);
  expect(ref.current).toBe(button);
  expect(button).toHaveFocus();
  expect(screen.queryByText('Select a system first')).toBeNull();
});
