import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@ap/kernel';
import { afterEach, expect, it, vi } from 'vitest';
import { ApprovalReviewFrame } from '../ApprovalReviewFrame';

afterEach(cleanup);
it.each(['approve', 'reject', 'withdraw', 'close'] as const)('handles %s in the review frame', async action => {
  const user = userEvent.setup();
  const onAction = vi.fn(async () => ({ ok: true as const, value: null }));
  const onClose = vi.fn();
  render(<I18nProvider><ApprovalReviewFrame name="주간 분석" scope="MEM" canDecide={action !== 'withdraw'}
    canWithdraw={action === 'withdraw'} onAction={onAction} onClose={onClose} /></I18nProvider>);
  if (action === 'close') await user.click(screen.getByRole('button', { name: '검토 닫기' }));
  if (action === 'approve') await user.click(screen.getByRole('button', { name: /^승인$/ }));
  if (action === 'withdraw') {
    expect(screen.queryByRole('button', { name: /^승인$/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: '신청 거두기' }));
  }
  if (action === 'reject') {
    await user.click(screen.getByRole('button', { name: '반려…' }));
    const dialog = screen.getByRole('dialog');
    const submit = dialog.querySelector('button[type="submit"]')!;
    const reason = screen.getByRole('textbox', { name: '반려 이유' });
    expect(reason).toBeRequired();
    await user.type(reason, '   ');
    expect(submit).toBeDisabled();
    await user.type(reason, '기간 수정 필요');
    await user.click(submit);
  }
  if (action === 'reject') expect(onAction).toHaveBeenCalledWith(action, '기간 수정 필요');
  else if (action !== 'close') expect(onAction).toHaveBeenCalledWith(action);
  expect(onClose).toHaveBeenCalledOnce();
});
