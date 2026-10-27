// SurveyBuilderScreen under a test host seam (#764 b): data states in order, the manage gate before any builder DOM, the title,
// and Back with a dirty draft. No router is mounted.

import {
  S1,
  S1_ID,
  STALE_ID,
  installSurveysFetch,
} from '@/features/surveys/__tests__/surveys-seam-fixtures';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SurveyBuilderScreen } from '../SurveyBuilderScreen';

const DRAFT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const onBack = vi.fn();
let titles: (string | null)[] = [];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function installFetch(options: { canManage: boolean }): void {
  installSurveysFetch();
  const base = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === `/surveys/${DRAFT_ID}`) return json({ ...S1, id: DRAFT_ID, status: 'draft' });
    if (path === '/me/permissions/check' && !options.canManage)
      return json({ state: 'denied', decision: { allow: false, via: 'role', requestable: false } });
    return base(input, init);
  }) as typeof globalThis.fetch;
}

function mount(surveyId: string) {
  const seam: HostSeam = {
    canLink: () => true,
    Link: ({ to, children }) => <a href={to}>{children}</a>,
    notifyError: () => {},
    notifySuccess: () => {},
    useNavigate: () => () => {},
    useSearch: () => ({}),
    useTitle: (title) => {
      titles.push(title);
    },
  };
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <SurveyBuilderScreen surveyId={surveyId} onBack={onBack} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  onBack.mockReset();
  titles = [];
  installFetch({ canManage: true });
});
afterEach(cleanup);

describe('SurveyBuilderScreen over the host seam', () => {
  it('shows loading, then the builder for a manager, with the title set once loaded', async () => {
    mount(DRAFT_ID);
    expect(screen.getByText('불러오는 중…')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-builder')).toBeNull();
    expect(await screen.findByTestId('survey-builder')).toBeInTheDocument();
    await waitFor(() => expect(titles).toContain('SRV-1 · 온보딩 설문'));
    expect(titles[0]).toBeNull();
  });

  it('shows the not-found state for a missing record, without builder DOM or title', async () => {
    mount(STALE_ID);
    expect(await screen.findByText('Survey를 찾을 수 없습니다.')).toBeInTheDocument();
    expect(screen.getByText('삭제되었거나 접근 권한이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-builder')).toBeNull();
    expect(titles.every((title) => title === null)).toBe(true);
  });

  it('renders the blocked panel, not the builder, for a non-manager, and sets no title', async () => {
    installFetch({ canManage: false });
    mount(S1_ID);
    expect(await screen.findByText('Survey 빌더')).toBeInTheDocument();
    expect(screen.queryByTestId('survey-builder')).toBeNull();
    expect(titles.every((title) => title === null)).toBe(true);
  });

  it('calls onBack at once when the draft is clean', async () => {
    mount(DRAFT_ID);
    await screen.findByTestId('survey-builder');
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('confirms Back with a dirty draft: cancel stays, confirm calls onBack; beforeunload only while dirty', async () => {
    const add = vi.spyOn(window, 'addEventListener');
    const beforeUnloadCount = () =>
      add.mock.calls.filter(([type]) => type === 'beforeunload').length;
    mount(DRAFT_ID);
    const title = await screen.findByLabelText('Survey 제목');
    expect(beforeUnloadCount()).toBe(0);
    fireEvent.change(title, { target: { value: '바뀐 제목' } });
    await waitFor(() => expect(beforeUnloadCount()).toBe(1));

    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    expect(onBack).not.toHaveBeenCalled();
    await screen.findByText('변경사항이 저장되지 않았습니다');
    fireEvent.click(screen.getByRole('button', { name: '계속 작성' }));
    await waitFor(() => expect(screen.queryByText('변경사항이 저장되지 않았습니다')).toBeNull());
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '뒤로' }));
    await screen.findByText('변경사항이 저장되지 않았습니다');
    fireEvent.click(screen.getByRole('button', { name: '이동' }));
    expect(onBack).toHaveBeenCalledTimes(1);
    add.mockRestore();
  });
});
