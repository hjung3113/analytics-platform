import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@ap/kernel';
import { afterEach, expect, it, vi } from 'vitest';
import { ApprovalReviewFrame } from '../ApprovalReviewFrame';

afterEach(cleanup);

it('gives the view name and Scope a native title only while clipped (#3258 A4)', () => {
  const frame = () => <I18nProvider><ApprovalReviewFrame name="주간 분석" scope="MEM" canDecide
    canWithdraw={false} onAction={vi.fn()} onClose={vi.fn()} /></I18nProvider>;
  const { rerender } = render(frame());
  const labels = [screen.getByText('주간 분석'), screen.getByText('내 Scope MEM로 그림')];
  for (const label of labels) {
    expect.soft(label).not.toHaveAttribute('title');
    Object.defineProperties(label, {
      scrollWidth: { configurable: true, value: 100 },
      clientWidth: { configurable: true, value: 50 },
    });
  }
  rerender(frame());
  for (const label of labels) {
    expect.soft(label).toHaveAttribute('title', label.textContent);
    Object.defineProperty(label, 'clientWidth', { value: 100 });
  }
  rerender(frame());
  for (const label of labels) expect.soft(label).not.toHaveAttribute('title');
});

it('offers default-size cancellation in the rejection footer and guards it during submission (#3258 C3)', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn(() => new Promise<{ ok: true; value: null }>(() => {}));
  render(<I18nProvider><ApprovalReviewFrame name="주간 분석" scope="MEM" canDecide canWithdraw={false}
    onAction={onAction} onClose={vi.fn()} /></I18nProvider>);
  const open = screen.getByRole('button', { name: '반려…' });
  const footer = () => within(screen.getByRole('dialog').querySelector('form')!);
  const cancel = () => footer().getByRole('button', { name: /^취소$/ });
  const submit = () => footer().getByRole('button', { name: /^반려$/ });

  await user.click(open);
  expect.soft(submit()).toHaveClass('h-10');
  expect(cancel()).toHaveClass('h-10', 'bg-surface-raised');
  await user.click(cancel());
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(onAction).not.toHaveBeenCalled();

  await user.click(open);
  await user.type(footer().getByRole('textbox', { name: '반려 이유' }), '기간 수정 필요');
  await user.click(submit());
  expect(cancel()).toBeDisabled();
  await user.keyboard('{Escape}');
  expect(screen.getByRole('dialog')).toBeVisible();
});

it('clears a failed rejection when the dialog is cancelled (#3258 C5)', async () => {
  const user = userEvent.setup();
  const onAction = vi.fn(async () => { throw new Error('offline'); });
  render(<I18nProvider><ApprovalReviewFrame name="주간 분석" scope="MEM" canDecide canWithdraw={false}
    onAction={onAction} onClose={vi.fn()} /></I18nProvider>);
  await user.click(screen.getByRole('button', { name: '반려…' }));
  const form = within(screen.getByRole('dialog').querySelector('form')!);
  await user.type(form.getByRole('textbox', { name: '반려 이유' }), '기간 수정 필요');
  await user.click(form.getByRole('button', { name: /^반려$/ }));
  expect(await form.findByRole('alert')).toBeVisible();
  await user.click(form.getByRole('button', { name: /^취소$/ }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

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
