// Regression (764r1 C1): the detail panel's builder links go through the DEFAULT host link (no registerAnchorLinkHost), which hands the
// router `builder: 'true'` as a string; the detail route's search schema must still read it as the boolean the builder branch checks.

import { SurveyDetail } from '@/features/surveys/components/detail/SurveyDetail';
import { validateSurveyDetailSearch } from '@/features/surveys/routes/surveys-search';
import type { Survey } from '@/features/surveys/types';
import { parseAppSearch, stringifyAppSearch } from '@/lib/router/search-serialization';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  useSearch,
} from '@tanstack/react-router';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

const survey: Survey = {
  id: 'survey-1',
  display_id: 'SRV-1',
  title: 'Q3 사용성 진단',
  type: 'discovery',
  status: 'draft',
  description: null,
  primary_managed_system_id: 'system-1',
  analytics_area_id: null,
  operator_actor_id: null,
  responses_identity_protected: true,
  created_by: 'actor-1',
  opened_at: null,
  closed_at: null,
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  questions: [],
};

function DetailOrBuilder() {
  const search = useSearch({ strict: false }) as { builder?: boolean };
  return search.builder ? (
    <div data-testid="builder-branch" />
  ) : (
    <SurveyDetail survey={survey} canManage />
  );
}

function renderDetail() {
  const root = createRootRoute({ component: () => <Outlet /> });
  const detail = createRoute({
    getParentRoute: () => root,
    path: '/surveys/$surveyId',
    validateSearch: validateSurveyDetailSearch,
    component: DetailOrBuilder,
  });
  const router = createRouter({
    routeTree: root.addChildren([detail]),
    history: createMemoryHistory({ initialEntries: ['/surveys/survey-1'] }),
    parseSearch: parseAppSearch,
    stringifySearch: stringifyAppSearch,
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

describe('survey detail builder links through the default host', () => {
  it.each(['질문 편집', '새 질문 추가'])('%s opens the builder branch', async (name) => {
    const router = renderDetail();
    await userEvent.click(await screen.findByRole('link', { name }));
    await waitFor(() => expect(screen.getByTestId('builder-branch')).toBeInTheDocument());
    expect(validateSurveyDetailSearch(router.state.location.search).builder).toBe(true);
  });
});
