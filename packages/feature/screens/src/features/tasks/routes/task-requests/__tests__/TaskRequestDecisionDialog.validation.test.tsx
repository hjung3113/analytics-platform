import type { TaskRequestDto } from '@ap/feature-shared';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { TaskRequestDecisionDialog } from '../TaskRequestDecisionDialog';

const requestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001';
const request = { id: requestId } as TaskRequestDto;

it('keeps reject enabled without an opening error and shows and focuses the required reason on submit', async () => {
  const user = userEvent.setup();
  const onSubmit = vi.fn();
  render(
    <TaskRequestDecisionDialog
      dialog={{ requestId, action: 'reject', value: '', error: null }}
      request={request}
      isSelfApproval={false}
      isSubmitting={false}
      onChange={vi.fn()}
      onClose={vi.fn()}
      onSubmit={onSubmit}
    />,
  );

  const reason = screen.getByRole('textbox', { name: '반려 사유' });
  const submit = screen.getByRole('button', { name: '반려' });
  expect(submit).toBeEnabled();
  expect(reason).not.toHaveAttribute('aria-invalid');
  expect(screen.queryByText('반려 사유를 입력해 주세요.')).toBeNull();

  await user.click(submit);

  expect(screen.getByText('반려 사유를 입력해 주세요.')).toBeVisible();
  expect(reason).toHaveAttribute('aria-invalid', 'true');
  expect(reason).toHaveFocus();
  expect(onSubmit).not.toHaveBeenCalled();
});
