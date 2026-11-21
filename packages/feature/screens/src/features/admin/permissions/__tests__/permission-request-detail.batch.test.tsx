import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { adminDetailFixture } from '../../../../test/permission-details';

vi.mock('../permission-request-decision-form.js', () => ({ PermissionRequestDecisionForm: () => null }));

import { PermissionRequestDetail } from '../permission-request-detail.js';

const batchId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const items = ['workspace.read', 'finding.read', 'finding.manage'].map((capability, index) => adminDetailFixture({
  id: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${index}`, requester_actor_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', requested_capability: capability,
  requested_managed_system_id: null, status: 'pending', revision: 1, requested_expiration: null, reason: '업무 조회',
  created_at: '2026-11-17T00:00:00.000Z', batch_id: batchId,
}));

it('shows the Finding role requirement on a later User request in the batch', () => {
  const [first] = items;
  if (!first) throw new Error('fixture');
  render(<PermissionRequestDetail request={first} batch={{ id: batchId, items }} actorName="김하나" onClose={() => undefined} />);

  const note = '승인해도 요청자는 Finding 목록·상세를 열 수 없습니다. Developer 이상 역할이 필요합니다.';
  expect(within(screen.getByRole('region', { name: 'Finding 조회' })).getByText(note)).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Finding 관리' })).getByText(note)).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: '전체 읽기' })).queryByText(note)).not.toBeInTheDocument();
});

it('labels later sensitive and denied member evidence while keeping shared notes once', () => {
  const first = items[0];
  const later = items[2];
  if (!first || !later) throw new Error('fixture');
  const harmless: (typeof items)[number] = { ...first, effective_access: { ...first.effective_access, decision: { allow: true, via: 'role' }, scope: { kind: 'all' } }, risk_indicators: [{ code: 'no_expiration', evidence: { requested_expiration: null } }] };
  const system = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const denied: (typeof items)[number] = { ...later, requested_managed_system_id: system, risk_indicators: [
    { code: 'sensitive_capability' as const, evidence: { capability: 'finding.manage' } },
    { code: 'active_deny' as const, evidence: { denies: [{ id: later.id, managed_system_id: system }] } },
    { code: 'no_expiration', evidence: { requested_expiration: null } },
  ], effective_access: { ...later.effective_access, decision: { allow: false as const, reason: 'explicit_deny' as const, requestable: null } } };
  render(<PermissionRequestDetail request={harmless} batch={{ id: batchId, items: [harmless, denied] }} actorName="김하나" onClose={() => undefined} />);
  const evidence = screen.getByRole('region', { name: 'Finding 관리' });
  expect(within(evidence).getByText(/민감한 권한/)).toBeInTheDocument();
  expect(within(evidence).getByText('명시적 차단')).toBeInTheDocument();
  expect(within(evidence).getByText(/겹치는 활성 차단 1건/)).toBeInTheDocument();
  expect(evidence).not.toHaveTextContent('cccccccc');
  expect(screen.getAllByText('검토 시 확인할 사항')).toHaveLength(1);
  expect(screen.getAllByText('요청자 역할')).toHaveLength(1);
  expect(screen.getAllByText('검토 권한')).toHaveLength(1);
  expect(screen.getAllByText('요청 만료일 없음')).toHaveLength(1);
  const review = within(screen.getByTestId('permission-request-risk-review'));
  expect(review.getAllByRole('listitem')[0]).toContainElement(review.getByText('요청 만료일 없음'));
});

it('a pending batch shows the review notes once, every requested permission, and no raw request id', () => {
  const [first] = items;
  if (!first) throw new Error('fixture');
  render(<PermissionRequestDetail request={first} batch={{ id: batchId, items }} actorName="김하나" onClose={() => undefined} />);
  expect(screen.getAllByText('검토 시 확인할 사항')).toHaveLength(1);
  expect(screen.queryByText('aaaaaaaa')).not.toBeInTheDocument();
  expect(screen.queryByText('승인 0 · 거절 0')).not.toBeInTheDocument();
  expect(screen.getByText('전체 읽기, Finding 조회, Finding 관리')).toBeInTheDocument();
});

it('a decided batch lists each row with its outcome', () => {
  const decided = items.map((item, index) => ({ ...item, status: index === 0 ? 'approved' as const : 'rejected' as const }));
  const [first] = decided;
  if (!first) throw new Error('fixture');
  render(<PermissionRequestDetail request={first} batch={{ id: batchId, items: decided }} actorName="김하나" onClose={() => undefined} />);
  expect(screen.getByText('승인 1 · 거절 2')).toBeInTheDocument();
});

it('groups each permission and its current access in its own checklist item', () => {
  const [first, second] = items;
  if (!first || !second) throw new Error('fixture');
  render(<PermissionRequestDetail request={first} batch={{ id: batchId, items: [first, second] }} onClose={() => undefined} />);

  const review = within(screen.getByTestId('permission-request-risk-review'));
  const list = review.getByRole('list');
  const groups = within(list).getAllByRole('listitem');
  expect(groups).toHaveLength(2);
  for (const [index, name] of ['전체 읽기', 'Finding 조회'].entries()) {
    const group = groups[index];
    if (!group) throw new Error(`Missing checklist item for ${name}`);
    const permission = within(within(group).getByRole('region', { name }));
    expect(permission.getByText('요청 범위의 현재 권한')).toBeInTheDocument();
  }
});
