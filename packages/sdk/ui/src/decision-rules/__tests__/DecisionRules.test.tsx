import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  Button,
  DECISION_RULE_KINDS,
  DecisionImpactConfirmDialog,
  DecisionReasonField,
  createDecisionUndoToastAction,
  requiredDecisionReasonError,
} from '../../index';

describe('opt-in decision rules', () => {
  it('declares the three rule kinds and creates an undo toast action for reversible work', () => {
    const onUndo = vi.fn();
    const action = createDecisionUndoToastAction({ kind: 'reversible', onUndo });

    expect(DECISION_RULE_KINDS).toEqual(['reversible', 'judgment', 'irreversible']);
    expect(action.label).toBe('실행 취소');
    action.onAction();
    action.onAction();
    expect(onUndo).toHaveBeenCalledOnce();
  });

  it('renders a required one-line judgment reason with an inline error', () => {
    const onChange = vi.fn();
    const error = requiredDecisionReasonError('   ');
    render(
      <DecisionReasonField
        kind="judgment"
        id="decision-reason"
        value=""
        onChange={onChange}
        error={error}
      />,
    );

    const input = screen.getByRole('textbox', { name: '결정 사유 (한 줄)' });
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('type', 'text');
    expect(input).not.toHaveAttribute('maxlength');
    expect(screen.getByText('· 필수')).toBeVisible();
    expect(screen.getByText('결정 사유를 입력해 주세요.')).toBeVisible();
    fireEvent.change(input, { target: { value: '검토 완료' } });
    expect(onChange).toHaveBeenCalledWith('검토 완료');
    expect(requiredDecisionReasonError('검토 완료')).toBeUndefined();
  });

  it('preserves the existing Button defaults and supplies Korean defaults for opt-in confirmation', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <>
        <Button>저장</Button>
        <DecisionImpactConfirmDialog
          kind="irreversible"
          impactText="대상: Actor A · Payments 시스템의 조회 권한이 취소됩니다."
          onConfirm={onConfirm}
          trigger={<button type="button">변경 실행</button>}
        />
      </>,
    );

    const save = screen.getByRole('button', { name: '저장' });
    expect(save).toHaveClass('bg-accent-primary', 'h-10', 'px-4');
    expect(save).not.toBeDisabled();

    await user.click(screen.getByRole('button', { name: '변경 실행' }));
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('변경 내용을 확인해 주세요.');
    expect(within(dialog).getByRole('button', { name: '취소' })).toBeVisible();
    expect(within(dialog).getByRole('button', { name: '확인' })).toBeVisible();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('styles the irreversible confirmation action as destructive', () => {
    render(
      <DecisionImpactConfirmDialog
        kind="irreversible"
        impactText="The recipient will lose access to this workspace."
        onConfirm={vi.fn()}
        trigger={<button type="button">Revoke access</button>}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Revoke access' }));
    expect(screen.getByRole('button', { name: '확인' })).toHaveClass('bg-accent-danger', 'hover:bg-accent-danger/90');
  });

  it('waits for confirmation and restores focus to the trigger after cancel', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(
      <DecisionImpactConfirmDialog
        kind="irreversible"
        impactText="Actor A는 Payments 시스템에서 조회 권한이 취소되어 데이터를 볼 수 없게 됩니다."
        onConfirm={onConfirm}
        trigger={<button type="button">권한 취소</button>}
        title="권한 취소 확인"
        confirmLabel="권한 취소"
      />,
    );

    const trigger = screen.getByRole('button', { name: '권한 취소' });
    await user.click(trigger);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Actor A는 Payments 시스템에서 조회 권한이 취소되어 데이터를 볼 수 없게 됩니다.');
    expect(onConfirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '취소' }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();

    await user.click(trigger);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '권한 취소' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
