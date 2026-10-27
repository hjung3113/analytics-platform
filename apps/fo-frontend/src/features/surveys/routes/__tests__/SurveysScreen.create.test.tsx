// SurveysScreen create flow (#764 l): a created Survey opens its builder through the host navigate.

import { installSurveysFetch } from '@/features/surveys/__tests__/surveys-seam-fixtures';
import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SurveysScreen } from '../SurveysScreen';

vi.mock('@/features/surveys/components/list/SurveyListScreen', async (original) => ({
  ...(await original<typeof import('@/features/surveys/components/list/SurveyListScreen')>()),
  SurveyListScreen: ({ onCreated }: { onCreated: (id: string) => void }) => (
    <button type="button" onClick={() => onCreated('55555555-5555-4555-8555-555555555555')}>
      created
    </button>
  ),
}));

afterEach(cleanup);

describe('SurveysScreen create', () => {
  it('navigates to the new Survey with builder=true', () => {
    installSurveysFetch();
    const navigate = vi.fn();
    const seam: HostSeam = {
      canLink: () => true,
      Link: ({ to, children }) => <a href={to}>{children}</a>,
      notifyError: () => {},
      notifySuccess: () => {},
      useNavigate: () => navigate,
      useSearch: () => ({}),
      useTitle: () => {},
    };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <HostSeamProvider value={seam}>
          <SurveysScreen renderDetail={() => undefined} />
        </HostSeamProvider>
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'created' }));
    expect(navigate).toHaveBeenCalledWith(
      '/surveys/55555555-5555-4555-8555-555555555555?builder=true',
    );
  });
});
