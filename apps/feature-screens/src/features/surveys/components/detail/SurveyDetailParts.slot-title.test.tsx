// The Survey slot renders the title once (#1168 C-1): the header shows
// `display_id · title` and the body repeats no visible title of its own.
// New file (not SurveyScreens.test.tsx) — #1167 edits that one in parallel.

import {
  S1_ID,
  installSurveysFetch,
} from '@/features/surveys/__tests__/surveys-seam-fixtures';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
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
      <div data-testid="body">{parts.body}</div>
    </div>
  );
}

function mount(surveyId: string) {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <HostSeamProvider value={seam}>
        <Parts surveyId={surveyId} onClose={vi.fn()} />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
}

beforeEach(installSurveysFetch);
afterEach(cleanup);

describe('Survey slot title (#1168 C-1)', () => {
  it('renders the survey title once — the header only, never in the body', async () => {
    mount(S1_ID);
    await waitFor(() => expect(screen.getByTestId('view')).toHaveTextContent('full'));

    expect(screen.getByTestId('title')).toHaveTextContent('SRV-1 · 온보딩 설문');
    expect(within(screen.getByTestId('body')).queryByText('온보딩 설문')).toBeNull();
  });
});
