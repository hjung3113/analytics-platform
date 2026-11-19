import type { AdminPermissionRequestRow } from '../../../../lib/api';
import { adminDetailFixture } from '../../../../test/permission-details';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../permission-request-decision-form.js', () => ({
  PermissionRequestDecisionForm: () => null,
}));

import { PermissionRequestDetail } from '../permission-request-detail.js';

const REQUEST: AdminPermissionRequestRow = {
  id: '10000000-0000-0000-0000-000000000001',
  requester_actor_id: '20000000-0000-0000-0000-000000000002',
  requested_capability: 'finding.manage',
  requested_managed_system_id: '30000000-0000-0000-0000-000000000003',
  reason: 'Finding access needed for review.',
  status: 'pending',
  revision: 1,
  requested_expiration: null,
  created_at: '2026-07-10T00:00:00.000Z',
};

describe('PermissionRequestDetail identity', () => {
  it('shows the Finding role requirement before deciding a User request', () => {
    render(
      <PermissionRequestDetail request={adminDetailFixture(REQUEST)} onClose={() => undefined} />,
    );

    expect(screen.getByText('승인해도 요청자는 Finding 목록·상세를 열 수 없습니다. Developer 이상 역할이 필요합니다.')).toBeInTheDocument();
  });

  it('leads with requester and readable capability in a two-line header', () => {
    render(
      <PermissionRequestDetail
        request={adminDetailFixture(REQUEST)}
        actorName="김하나"
        managedSystemName="Billing Ops"
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText('김하나 · Finding 관리')).toBeInTheDocument();
    expect(screen.getByText('Finding 관리')).toBeInTheDocument();
    expect(screen.getByText(/finding\.manage/)).not.toBeVisible();
    expect(screen.queryByText('상태', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('김하나')).toBeInTheDocument();
    expect(screen.getByText('Billing Ops')).toBeInTheDocument();
    const original = screen.getByText('원본').closest('details');
    expect(original).not.toHaveAttribute('open');
    expect(original).toHaveTextContent(REQUEST.id);
    expect(original).toHaveTextContent(REQUEST.requester_actor_id);
    const header = screen.getByText('권한 요청').closest('header');
    expect(header?.querySelectorAll('p')).toHaveLength(2);
  });

  it('uses safe labels when actor and 시스템 names are unavailable', () => {
    render(
      <PermissionRequestDetail request={adminDetailFixture(REQUEST)} onClose={() => undefined} />,
    );

    expect(screen.getByText('이름 미확인')).toBeInTheDocument();
    expect(screen.getByText('시스템')).toBeInTheDocument();
    expect(screen.getByText('원본').closest('details')).toHaveTextContent(REQUEST.requester_actor_id);
    expect(screen.getByText('원본').closest('details')).toHaveTextContent('30000000-0000-0000-0000-000000000003');
  });

  it('allows the hosted title to wrap while keeping the status badge on one line', () => {
    render(
      <PermissionRequestDetail
        request={adminDetailFixture(REQUEST)}
        actorName="Mock Developer One"
        onClose={() => undefined}
        renderDetail={({ title, headerActions }) => <header><h2>{title}</h2>{headerActions}</header>}
      />,
    );

    const title = screen.getByRole('heading', { name: 'Mock Developer One · Finding 관리' });
    expect(title.firstElementChild).toHaveClass('block', 'whitespace-normal', 'wrap-anywhere');
    expect(screen.getByText('검토 중')).toHaveClass('whitespace-nowrap', 'shrink-0');
  });
});
