// useSurveyDetailParts under a test host seam (#764 l): loading / not-found / blocked / full, and the close-survey confirmation.

import {
  DENIED_ID,
  S1_ID,
  STALE_ID,
  installSurveysFetch,
} from '@/features/surveys/__tests__/surveys-seam-fixtures';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSurveyDetailParts } from './SurveyDetailParts';

const seam: HostSeam = {
  canLink: () => true,
  Link: ({ to, children }) => <a href={to}>{children}</a>,
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => () => {},
  useSearch: () => ({}),
  useTitle: () => {},
};

function Parts({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const parts = useSurveyDetailParts({ surveyId, onClose });
  return (
    <div>
      <span data-testid="view">{parts.view.kind}</span>
      <div data-testid="title">{parts.title}</div>
      <div data-testid="actions">{parts.headerActions}</div>
      <div data-testid="body">{parts.body}</div>
    </div>
  );
}

function mount(surveyId: string, onClose = vi.fn()) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HostSeamProvider value={seam}>
        <Parts surveyId={surveyId} onClose={onClose} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
  return onClose;
}

beforeEach(installSurveysFetch);
afterEach(cleanup);

describe('useSurveyDetailParts', () => {
  it('shows the loading skeleton first, then the full detail with the display id and title', async () => {
    mount(S1_ID);
    expect(screen.getByTestId('view')).toHaveTextContent('loading');
    expect(screen.getByLabelText('Survey 상세 불러오는 중')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('full'));
    expect(screen.getByTestId('title')).toHaveTextContent('SRV-1 · 온보딩 설문');
    expect(screen.getByText('질문이 없습니다.')).toBeInTheDocument();
  });

  it('renders not-found with a way back to the list', async () => {
    const onClose = mount(STALE_ID);
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('not-found'));
    fireEvent.click(screen.getByRole('button', { name: 'Survey 목록으로' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders the blocked state for a permission denial', async () => {
    mount(DENIED_ID);
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('blocked'));
    expect(screen.getByText('이 Survey를 볼 권한이 없습니다.')).toBeInTheDocument();
  });

  it('keeps the close-survey action behind its confirmation', async () => {
    mount(S1_ID);
    const close = await screen.findByRole('button', { name: 'Survey 종료' });
    expect(screen.queryByTestId('survey-close-confirmation')).toBeNull();
    fireEvent.click(close);
    expect(await screen.findByTestId('survey-close-confirmation')).toBeInTheDocument();
  });
});
