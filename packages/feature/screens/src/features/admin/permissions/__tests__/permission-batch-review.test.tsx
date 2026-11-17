import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import { adminDetailFixture } from '../../../../test/permission-details';
import { PermissionRequestDecisionForm } from '../permission-request-decision-form';

const state = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../useDecidePermissionRequest.js', () => ({ useDecidePermissionRequest: () => ({ mutate: state.mutate, reset: vi.fn(), isPending: false }) }));
vi.mock('../../settings/use-workspace-settings.js', () => ({ useWorkspaceSettings: () => ({ data: undefined }) }));
vi.mock('../../../../lib/api/me', () => ({ useMeBridge: () => ({ data: { actor: { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' } } }) }));

const batchId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const items = ['workspace.read', 'finding.read'].map((capability, index) => adminDetailFixture({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`, requester_actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', requested_capability: capability, requested_managed_system_id: null,
  status: 'pending', revision: index + 1, requested_expiration: null, reason: '업무 조회', created_at: '2026-11-17T00:00:00.000Z', batch_id: batchId,
}));
beforeEach(() => state.mutate.mockReset());
const first = items[0];
const second = items[1];
if (!first || !second) throw new Error('Expected two batch fixtures');

it('partial approval requires one reason and includes every revision with only checked approval ids', () => {
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  expect(screen.getByRole('radiogroup', { name: '승인 만료일' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Finding 조회' }));
  fireEvent.click(screen.getByRole('button', { name: '고른 1개 승인' }));
  expect(state.mutate).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('사유 · 필수'), { target: { value: '조회만 승인합니다' } });
  fireEvent.click(screen.getByRole('button', { name: '고른 1개 승인' }));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action: 'approve', reason: '조회만 승인합니다', batch: { id: batchId, revisions: { [first.id]: 1, [second.id]: 2 }, approveIds: [first.id] } }));
});

it.each([['거절', 'reject'], ['추가 정보 요청', 'need-more-info']])('%s ignores approval selection and targets the whole batch', (label, action) => {
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Finding 조회' }));
  fireEvent.click(screen.getByRole('button', { name: label }));
  expect(screen.getByRole('button', { name: label })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('사유 · 필수'), { target: { value: '전체 요청 검토 사유' } });
  fireEvent.click(screen.getByTestId('permission-decision-submit'));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ action, batch: expect.objectContaining({ revisions: { [first.id]: 1, [second.id]: 2 } }) }));
});

it('held rows are disabled and unchecked, and unchecked decidable rows require a reason', () => {
  const held = { ...second, effective_access: { ...second.effective_access, decision: { allow: true as const, via: 'direct_grant' as const } } };
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items: [first, held] }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  const checks = screen.getAllByRole('checkbox');
  expect(checks[1]).toBeDisabled();
  expect(checks[1]).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByText(/이미 가짐/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '고른 1개 승인' }));
  expect(screen.getByLabelText('사유 · 필수')).toHaveFocus();
  expect(state.mutate).not.toHaveBeenCalled();
});

it('zero selection submits validation with an alert and focuses the reason', () => {
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  for (const checkbox of screen.getAllByRole('checkbox')) fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole('button', { name: '고른 0개 승인' }));
  expect(screen.getByRole('alert')).toHaveTextContent('승인할 권한을 하나 이상 고르세요');
  expect(screen.getByLabelText('사유 · 필수')).toHaveFocus();
  expect(state.mutate).not.toHaveBeenCalled();
});

it('offers only approval scopes shared by checked batch members', () => {
  const otherScope = { ...second, approval_scope_candidates: [{ managed_system_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' }] };
  render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items: [first, otherScope] }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  expect(screen.queryByRole('combobox', { name: '승인 범위' })).not.toBeInTheDocument();
});

it('unchecks a member that becomes held during a fresh access read', () => {
  const view = render(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items }} />);
  fireEvent.click(screen.getByRole('button', { name: '승인' }));
  const held = { ...second, effective_access: { ...second.effective_access, decision: { allow: true as const, via: 'role' as const } } };
  view.rerender(<PermissionRequestDecisionForm request={first} batch={{ id: batchId, items: [first, held] }} />);
  expect(screen.getByRole('checkbox', { name: /Finding 조회/ })).toHaveAttribute('aria-checked', 'false');
  expect(screen.getByRole('checkbox', { name: /Finding 조회/ })).toBeDisabled();
});
