import { render, screen } from '@testing-library/react';
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
