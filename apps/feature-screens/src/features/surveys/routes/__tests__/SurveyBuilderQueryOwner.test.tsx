// Regression (764b C1): one query owner per host. The standalone route already observes useSurvey(surveyId); going from the detail to
// `?builder=true` on the same route must not add a second observer (an extra GET, builder shown under a slow refetch, edits lost when
// the refetch fails). Real query hooks over a counting fetch; only the router is stubbed.

import { S1, S1_ID, installSurveysFetch } from '@/features/surveys/__tests__/surveys-seam-fixtures';
import { HostSeamProvider } from '@/lib/host/host-seam';
import { DetailPanelSlotProvider, useDetailPanelSlotHost } from '@ap/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { routeSearch } = vi.hoisted(() => ({ routeSearch: { current: {} as { builder?: true } } }));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useParams: () => ({ surveyId: '11111111-1111-4111-8111-111111111111' }),
  useSearch: () => routeSearch.current,
  useMatchRoute: () => () => false,
  useNavigate: () => vi.fn(),
  useBlocker: () => ({ status: 'idle' }),
}));

import { SurveyBuilderScreen } from '@/features/surveys/routes/SurveyBuilderScreen';
import { SurveyDetailRoute } from '@/test/surveys-host/detail';

const DRAFT = { ...S1, status: 'draft' };
let detailGets = 0;

function installCountingFetch(): void {
  installSurveysFetch();
  const base = globalThis.fetch;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input), 'http://localhost').pathname;
    if (path === `/surveys/${S1_ID}`) {
      detailGets += 1;
      return new Response(JSON.stringify(DRAFT), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return base(input, init);
  }) as typeof globalThis.fetch;
}

function PanelHost({ children }: { children: React.ReactNode }) {
  const { ref } = useDetailPanelSlotHost();
  return (
    <>
      {children}
      <div ref={ref} />
    </>
  );
}

const seam = {
  canLink: () => true,
  Link: ({ to, children }: { to: string; children?: React.ReactNode }) => (
    <a href={to}>{children}</a>
  ),
  notifyError: () => {},
  notifySuccess: () => {},
  useNavigate: () => () => {},
  useSearch: () => ({}),
  useTitle: () => {},
} as React.ComponentProps<typeof HostSeamProvider>['value'];

function tree(client: QueryClient, child: React.ReactElement) {
  return (
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <DetailPanelSlotProvider>
          <PanelHost>{child}</PanelHost>
        </DetailPanelSlotProvider>
      </HostSeamProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  detailGets = 0;
  routeSearch.current = {};
  installCountingFetch();
});
afterEach(cleanup);

describe('Survey builder query ownership', () => {
  it('reuses the standalone route’s read when the detail switches to the builder (no second GET, draft kept)', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(tree(client, <SurveyDetailRoute />));
    await screen.findByTestId('survey-list');
    await waitFor(() => expect(detailGets).toBe(1));
    await waitFor(() => expect(screen.getAllByText('온보딩 설문').length).toBeGreaterThan(0));
    expect(detailGets).toBe(1);

    routeSearch.current = { builder: true };
    view.rerender(tree(client, <SurveyDetailRoute />));
    const title = await screen.findByLabelText('Survey 제목');
    expect(screen.getByTestId('survey-builder')).toBeInTheDocument();
    fireEvent.change(title, { target: { value: '바뀐 제목' } });

    // Let any refetch the builder's mount would start land and re-render.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(detailGets).toBe(1);
    expect(screen.getByLabelText('Survey 제목')).toHaveValue('바뀐 제목');
  });

  it('the bridge-style SurveyBuilderScreen alone makes exactly one GET', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(tree(client, <SurveyBuilderScreen surveyId={S1_ID} onBack={() => {}} />));
    await screen.findByTestId('survey-builder');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(detailGets).toBe(1);
  });
});
