import { type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { tanstackHost } from '@/test/host-adapters/lib/host/tanstack-host';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type * as React from 'react';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@ap/ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ap/ui')>();
  return {
    ...actual,
    ListShell: ({
      toolbar,
      tabs,
      list,
      detailPanel,
    }: {
      toolbar?: { title?: string; subtitle?: string };
      tabs?: React.ReactNode;
      list: React.ReactNode;
      detailPanel?: React.ReactNode;
    }) => (
      <div data-shell="list">
        <header>
          <h2>{toolbar?.title}</h2>
          <span>{toolbar?.subtitle}</span>
        </header>
        {tabs}
        {list}
        {detailPanel}
      </div>
    ),
  };
});

import { useSurveyDetailParts } from '@/features/surveys/components/detail/SurveyDetailParts';
import { PERMISSION_BLOCKED_REASONS } from '@/lib/copy/permission-reasons';
import { SurveysScreen } from '@/features/surveys/routes/SurveysScreen';
import { surveysSearchSchema } from '@/test/surveys-host/screen';

// The platform bridge's seam shape: the host owns the page title and the Survey detail parts never write one.
const PLATFORM_LIKE_HOST: HostSeam = { ...tanstackHost, hostOwnsTitle: true, useTitle: () => undefined };

const MS_ID = '99999999-9999-9999-9999-999999999901';
const SURVEY_ID = '11111111-1111-4111-8111-111111111111';
const BLOCKED_SURVEY_ID = '44444444-4444-4444-8444-444444444444';
const ACTOR_ID = '22222222-2222-4222-8222-222222222222';

const survey = {
  id: SURVEY_ID,
  workspace_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  display_id: 'SRV-1',
  type: 'discovery',
  status: 'open',
  title: '온보딩 설문',
  description: null,
  primary_managed_system_id: MS_ID,
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: ACTOR_ID,
  opened_at: '2026-01-02T00:00:00.000Z',
  closed_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
  questions: [],
};

const surveys = [
  survey,
  {
    ...survey,
    id: BLOCKED_SURVEY_ID,
    display_id: 'SRV-2',
    type: 'validation',
    status: 'closed',
    title: '결과 확인 설문',
  },
];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function installFetch(): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = new URL(url, 'http://localhost');
    if (path.pathname === '/surveys') return jsonResponse(surveys);
    if (path.pathname === '/managed-systems') return jsonResponse({ items: [], total: 0 });
    if (path.pathname === '/actors') return jsonResponse({ actors: [] });
    if (path.pathname === '/me')
      return jsonResponse({
        actor: {
          id: ACTOR_ID,
          external_id: 'user-1',
          email: 'user@example.com',
          display_name: '사용자',
          role_level: 'user',
        },
        workspace_id: 'ws',
      });
    if (path.pathname === '/me/permissions/check')
      return jsonResponse({
        state: 'approved',
        decision: { allow: true, via: 'role', requestable: null },
      });
    if (path.pathname === `/surveys/${BLOCKED_SURVEY_ID}`)
      return jsonResponse({ code: 'permission.denied', message: 'Survey read denied' }, 403);
    if (path.pathname === `/surveys/${SURVEY_ID}`) return jsonResponse(survey);
    return jsonResponse({ code: 'not_mocked' }, 500);
  }) as typeof globalThis.fetch;
}

// Thin frame over the production hook: the hook owns the loading/not-found/blocked/error/full views and the permission panel.
function SurveyDetailFrame({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const parts = useSurveyDetailParts({ surveyId, onClose });
  return (
    <aside data-testid="survey-detail" data-view={parts.view.kind}>
      <h2>{parts.title}</h2>
      {parts.body}
    </aside>
  );
}

function SurveysRoute() {
  return (
    <SurveysScreen
      renderDetail={(selectedId, { close }) =>
        selectedId === null ? null : (
          <SurveyDetailFrame key={selectedId} surveyId={selectedId} onClose={close} />
        )
      }
    />
  );
}

function renderSelectedSurvey() {
  installFetch();
  const rootRoute = createRootRoute({
    component: () => (
      <HostSeamProvider value={PLATFORM_LIKE_HOST}>
        <Outlet />
      </HostSeamProvider>
    ),
  });
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '/surveys',
    validateSearch: (raw) => surveysSearchSchema.parse(raw),
    component: SurveysRoute,
  });
  const surveyDetailStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/surveys/$surveyId',
    component: () => null,
  });
  const surveyResultsStub = createRoute({
    getParentRoute: () => rootRoute,
    path: '/surveys/$surveyId/results',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([route, surveyDetailStub, surveyResultsStub]),
    history: createMemoryHistory({ initialEntries: [`/surveys?selected=${SURVEY_ID}`] }),
  });
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe('/surveys selected detail under a host that owns the title', () => {
  test('shows the permitted Survey, then the next selection being denied (403) shows the permission-denied view and no Survey record', async () => {
    const router = renderSelectedSurvey();

    const detail = await screen.findByTestId('survey-detail');
    await waitFor(() => expect(detail).toHaveAttribute('data-view', 'full'));
    expect(detail).toHaveTextContent('온보딩 설문');

    fireEvent.click(screen.getByTestId(`survey-row-${BLOCKED_SURVEY_ID}`));
    await waitFor(() =>
      expect(router.state.location.search).toMatchObject({ selected: BLOCKED_SURVEY_ID }),
    );

    // The production blocked view, settled after the 403 (not the loading skeleton), with its permission panel.
    await waitFor(() =>
      expect(screen.getByTestId('survey-detail')).toHaveAttribute('data-view', 'blocked'),
    );
    const blocked = screen.getByTestId('survey-detail');
    expect(blocked).toHaveTextContent(PERMISSION_BLOCKED_REASONS.surveyDetail);
    expect(blocked).not.toHaveTextContent('온보딩 설문');
    expect(blocked).not.toHaveTextContent('SRV-1');
    expect(blocked).not.toHaveTextContent('결과 확인 설문');
  });
});
