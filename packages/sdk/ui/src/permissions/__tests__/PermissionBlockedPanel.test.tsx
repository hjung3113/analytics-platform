/// <reference types="@testing-library/jest-dom" />
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { vi } from 'vitest';
import {
  PermissionBlockedPanel,
  type PermissionState,
} from '../PermissionBlockedPanel.js';

describe('PermissionBlockedPanel — state rendering', () => {
  it('state=request_access: sets data-state attribute', () => {
    const { container } = render(
      <PermissionBlockedPanel state="request_access" category="VOC 상세" />,
    );
    expect(container.querySelector('[data-state="request_access"]')).not.toBeNull();
  });

  it('state=request_access: renders Lock icon area + heading + body copy', () => {
    render(<PermissionBlockedPanel state="request_access" category="VOC 상세" />);
    expect(screen.getByText('VOC 상세')).toBeInTheDocument();
    expect(
      screen.getByText('이 항목에 접근하려면 권한 요청이 필요합니다.'),
    ).toBeInTheDocument();
  });

  it('state=request_access: renders a domain reason when provided', () => {
    render(
      <PermissionBlockedPanel
        state="request_access"
        category="VOC Inbox"
        reason="선택한 Managed System의 VOC를 볼 권한이 없습니다."
      />,
    );
    expect(
      screen.getByText('선택한 Managed System의 VOC를 볼 권한이 없습니다.'),
    ).toBeInTheDocument();
  });

  it('state=request_access: omits the request button when onRequestAccess is undefined', () => {
    render(<PermissionBlockedPanel state="request_access" category="VOC 상세" />);
    expect(screen.queryByRole('button', { name: '권한 요청하기' })).not.toBeInTheDocument();
  });

  it('state=request_access: button enabled + onClick fires when handler provided', () => {
    const handler = vi.fn();
    render(
      <PermissionBlockedPanel
        state="request_access"
        category="VOC 상세"
        onRequestAccess={handler}
      />,
    );
    const btn = screen.getByRole('button', { name: '권한 요청하기' });
    expect(btn).not.toBeDisabled();
    expect(btn.parentElement).toContainElement(screen.getByText('이 항목에 접근하려면 권한 요청이 필요합니다.'));
    fireEvent.click(btn);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('state=request_access: renders requiredScope when provided', () => {
    render(
      <PermissionBlockedPanel
        state="request_access"
        category="VOC 상세"
        requiredScope={['voc.read', 'ms-001']}
      />,
    );
    expect(screen.getByText('voc.read · ms-001')).toBeInTheDocument();
  });

  it('state=request_access: renders requiredScope without managed_system_id', () => {
    render(
      <PermissionBlockedPanel
        state="request_access"
        category="VOC 상세"
        requiredScope={['voc.read']}
      />,
    );
    expect(screen.getByText('voc.read')).toBeInTheDocument();
  });

  it('state=summary_visible: sets data-state attribute', () => {
    const { container } = render(
      <PermissionBlockedPanel state="summary_visible" category="요약" />,
    );
    expect(container.querySelector('[data-state="summary_visible"]')).not.toBeNull();
  });

  it('state=summary_visible: renders body copy', () => {
    render(<PermissionBlockedPanel state="summary_visible" category="요약" />);
    expect(screen.getByText('요약 정보만 표시됩니다.')).toBeInTheDocument();
  });

  it('state=summary_visible: renders summary slot when provided', () => {
    render(
      <PermissionBlockedPanel
        state="summary_visible"
        category="요약"
        summary={<span data-testid="summary-content">요약 내용</span>}
      />,
    );
    expect(screen.getByTestId('summary-content')).toBeInTheDocument();
  });

  it('state=summary_visible: fallback copy when summary undefined', () => {
    render(<PermissionBlockedPanel state="summary_visible" category="요약" />);
    expect(screen.getByText('요약 정보가 없습니다.')).toBeInTheDocument();
  });

  it('state=denied: sets data-state attribute', () => {
    const { container } = render(
      <PermissionBlockedPanel state="denied" category="VOC 상세" />,
    );
    expect(container.querySelector('[data-state="denied"]')).not.toBeNull();
  });

  it('state=denied: shows default message when no reason', () => {
    render(<PermissionBlockedPanel state="denied" category="VOC 상세" />);
    expect(screen.getByText('이 항목에 접근할 수 없습니다.')).toBeInTheDocument();
  });

  it('state=denied: shows reason when provided', () => {
    render(
      <PermissionBlockedPanel
        state="denied"
        category="VOC 상세"
        reason="계약 만료로 인해 접근이 차단되었습니다."
      />,
    );
    expect(
      screen.getByText('계약 만료로 인해 접근이 차단되었습니다.'),
    ).toBeInTheDocument();
  });

  it('state=denied: no CTA button rendered', () => {
    render(
      <PermissionBlockedPanel state="denied" category="VOC 상세" reason="denied" />,
    );
    expect(
      screen.queryByRole('button', { name: '권한 요청하기' }),
    ).toBeNull();
  });

  it('state=blocked_not_requestable: sets data-state attribute', () => {
    const { container } = render(
      <PermissionBlockedPanel
        state="blocked_not_requestable"
        category="VOC 상세"
      />,
    );
    expect(
      container.querySelector('[data-state="blocked_not_requestable"]'),
    ).not.toBeNull();
  });

  it('state=blocked_not_requestable: shows default message when no reason', () => {
    render(
      <PermissionBlockedPanel state="blocked_not_requestable" category="VOC 상세" />,
    );
    expect(screen.getByText('권한 요청이 허용되지 않습니다.')).toBeInTheDocument();
  });

  it('state=blocked_not_requestable: shows reason when provided', () => {
    render(
      <PermissionBlockedPanel
        state="blocked_not_requestable"
        category="VOC 상세"
        reason="조직 정책에 의해 차단됨"
      />,
    );
    expect(screen.getByText('조직 정책에 의해 차단됨')).toBeInTheDocument();
  });

  it('state=blocked_not_requestable: no CTA button rendered', () => {
    render(
      <PermissionBlockedPanel
        state="blocked_not_requestable"
        category="VOC 상세"
      />,
    );
    expect(
      screen.queryByRole('button', { name: '권한 요청하기' }),
    ).toBeNull();
  });
});

describe('PermissionBlockedPanel — audit footer', () => {
  it('renders the legacy audit label and space as one text segment', () => {
    const html = renderToString(<PermissionBlockedPanel state="denied" category="VOC 상세" decisionId="dec-abc123" />);
    expect(html).toContain('결정 <code>dec-abc123</code>');
  });

  it('renders decisionId when provided', () => {
    render(
      <PermissionBlockedPanel
        state="denied"
        category="VOC 상세"
        decisionId="dec-abc123"
      />,
    );
    expect(screen.getByText('dec-abc123')).toBeInTheDocument();
  });

  it('renders evaluatedRelative when both provided', () => {
    render(
      <PermissionBlockedPanel
        state="denied"
        category="VOC 상세"
        decisionId="dec-xyz"
        evaluatedRelative="5분 전"
      />,
    );
    expect(screen.getByText('dec-xyz')).toBeInTheDocument();
    expect(screen.getByText(/5분 전/)).toBeInTheDocument();
  });

  it('does NOT render footer when decisionId is absent', () => {
    render(<PermissionBlockedPanel state="denied" category="VOC 상세" />);
    // "Decision" text should be absent
    expect(screen.queryByText(/Decision/)).toBeNull();
  });
});

describe('PermissionBlockedPanel — all four states set data-state', () => {
  const states: PermissionState[] = [
    'request_access',
    'summary_visible',
    'denied',
    'blocked_not_requestable',
  ];
  states.forEach((state) => {
    it(`data-state="${state}" present`, () => {
      const { container } = render(
        <PermissionBlockedPanel state={state} category="테스트" />,
      );
      expect(container.querySelector(`[data-state="${state}"]`)).not.toBeNull();
    });
  });
});

describe('PermissionBlockedPanel request flow', () => {
  it.each([
    ['denied', 'lucide-circle-x'],
    ['blocked_not_requestable', 'lucide-ban'],
  ] as const)('uses the original panel layout and icon for %s by default', (state, icon) => {
    const { container } = render(<PermissionBlockedPanel state={state} category="Finding" />);
    const panel = container.querySelector('[data-state]');
    expect(panel).toHaveClass('rounded-md', 'p-4');
    expect(panel).not.toHaveClass('max-w-lg');
    expect(panel?.querySelector(`.${icon}`)).toBeInTheDocument();
  });

  it.each([
    ['none', '권한 요청', null, '이 항목에 접근하려면 권한 요청이 필요합니다.'],
    ['pending', '내 권한 요청 보기', null, '보낸 권한 요청을 검토하고 있습니다.'],
    ['approved-partial', '남은 권한 요청', '승인됨 · 아직 필요한 것', '아직 필요한 권한을 요청하세요.'],
    ['not-requestable', null, null, '이 항목에 접근할 수 없습니다.'],
  ] as const)('renders %s with one row of allowed actions', (status, label, statusLabel, body) => {
    const { container } = render(<PermissionBlockedPanel
      layout="card"
      state="request_access"
      category="Finding"
      missing={{ permission: 'Finding 조회', system: 'Power BI' }}
      requiredScope={['finding.read']}
      requestStatus={status}
      requestAction={label && <button type="button">{label}</button>}
      exitAction={<button type="button">홈으로</button>}
    />);
    expect(container.querySelector('[data-request-status]')).toHaveClass('mx-auto', 'max-w-lg');
    expect(screen.getByText(body)).toBeInTheDocument();
    expect(screen.queryByText('finding.read')).not.toBeInTheDocument();
    expect(screen.getByText('Finding 조회 · Power BI')).toBeInTheDocument();
    expect(screen.getByText('필요한 권한')).toBeInTheDocument();
    const home = screen.getByRole('button', { name: '홈으로' });
    const row = home.parentElement!;
    expect(row).toHaveClass('flex', 'gap-2');
    const expected = label ? [screen.getByRole('button', { name: label }), home] : [home];
    expect(within(row).getAllByRole('button')).toEqual(expected);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('검토 중')).not.toBeInTheDocument();
    if (statusLabel) expect(screen.getByText(statusLabel)).toBeInTheDocument();
  });
});

it('keeps the card callback and exit in the same row and ignores the exit in the default panel', () => {
  const onRequestAccess = vi.fn();
  const props = { state: 'request_access', category: 'Finding', onRequestAccess, exitAction: <button type="button">Go to Home</button> } as const;
  const { rerender } = render(<PermissionBlockedPanel {...props} />);
  expect(screen.queryByRole('button', { name: 'Go to Home' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '권한 요청하기' })).toBeInTheDocument();
  rerender(<PermissionBlockedPanel {...props} layout="card" />);
  const request = screen.getByRole('button', { name: /^권한 요청$/ });
  const home = screen.getByRole('button', { name: 'Go to Home' });
  const row = home.parentElement!;
  expect(within(row).getAllByRole('button')).toEqual([request, home]);
  fireEvent.click(request);
  expect(onRequestAccess).toHaveBeenCalledOnce();
  rerender(<PermissionBlockedPanel {...props} layout="card" lang="en" requestStatus="pending"
    missing={{ permission: 'Read findings' }} requestAction={<button type="button">View my access requests</button>} />);
  expect(within(row).getAllByRole('button')).toEqual([screen.getByRole('button', { name: 'View my access requests' }), home]);
  expect(screen.getByText('Required access')).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Your access request is under review.');
  expect(screen.queryByText('Under review')).not.toBeInTheDocument();
});
