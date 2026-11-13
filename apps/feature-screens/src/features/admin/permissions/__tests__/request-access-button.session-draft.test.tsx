// #1887: the permission request reason survives a session expiry for the same user only.
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { beginSessionDraftOwner, resetSessionDraftsForTests, snapshotSessionDrafts } from '@/lib/session-draft/registry';
import { RequestAccessButton } from '../request-access-button.js';

const REASON = '검증용 범위 권한이 필요합니다';
const draftKeys = () => Object.keys(sessionStorage).filter((key) => key.startsWith('draft:'));

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RequestAccessButton capability="finding.manage" managedSystemId="11111111-1111-4111-8111-111111111111" returnRouteIntent="/findings" />
    </QueryClientProvider>,
  );
}

describe('<RequestAccessButton> session-expiry draft (#1887)', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    sessionStorage.clear();
    resetSessionDraftsForTests();
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200, headers: { 'content-type': 'application/json' } }));
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    sessionStorage.clear();
  });

  test('the typed reason comes back when the same user opens the form again', async () => {
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
    fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
    snapshotSessionDrafts('u1');
    first.unmount();
    beginSessionDraftOwner('u1');

    mount();
    fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
    await waitFor(() => expect(screen.getByTestId('permission-request-reason')).toHaveValue(REASON));
    expect(draftKeys()).toEqual([]);
  });

  test('another user does not get the reason', () => {
    const first = mount();
    fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
    fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
    snapshotSessionDrafts('u1');
    first.unmount();
    beginSessionDraftOwner('u2');

    mount();
    fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
    expect(screen.getByTestId('permission-request-reason')).toHaveValue('');
    expect(draftKeys()).toEqual([]);
  });

  test('a closed form keeps nothing', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '권한 요청' }));
    fireEvent.change(screen.getByTestId('permission-request-reason'), { target: { value: REASON } });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    snapshotSessionDrafts('u1');
    expect(draftKeys()).toEqual([]);
  });
});
