import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DECISION_RULE_KINDS,
  DecisionImpactConfirmDialog,
  DecisionReasonField,
  Button,
  createDecisionUndoToastAction,
  requiredDecisionReasonError,
} from '../../index';

describe('opt-in decision rules', () => {
  it('leaves an ordinary button unchanged when no decision rule is selected', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    render(<Button onClick={onAction}>Run action</Button>);

    await user.click(screen.getByRole('button', { name: 'Run action' }));

    expect(onAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('declares the three rule kinds and creates an undo toast action for reversible work', () => {
    const onUndo = vi.fn();
    const action = createDecisionUndoToastAction({ kind: 'reversible', onUndo });

    expect(DECISION_RULE_KINDS).toEqual(['reversible', 'judgment', 'irreversible']);
    expect(action.label).toBe('실행 취소');
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
    expect(screen.getByText('· 필수')).toBeVisible();
    expect(screen.getByText('결정 사유를 입력해 주세요.')).toBeVisible();
    fireEvent.change(input, { target: { value: '검토 완료' } });
    expect(onChange).toHaveBeenCalledWith('검토 완료');
    expect(requiredDecisionReasonError('검토 완료')).toBeUndefined();
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
