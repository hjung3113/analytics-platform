import { RespondSurveyScreen } from '@/features/surveys/components/participation/SurveyParticipationScreens';
import { ME_QUERY_KEY } from '@/lib/auth/useMe';
import { surveyRespondentFormDtoSchema } from '@ap/feature-shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, expect, test, vi } from 'vitest';
const respondentSurveyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const respondentForm = surveyRespondentFormDtoSchema.parse({
  survey: {
    id: respondentSurveyId,
    title: 'Q3 매출 리포트 사용성 진단',
    type: 'discovery',
    identity_protected: true,
    description: null,
  },
  questions: [
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      kind: 'text',
      prompt: '어떤 점이 좋았나요?',
      is_required: false,
      sort_order: 0,
      options: null,
      rating_min: null,
      rating_max: null,
      rating_low_label: null,
      rating_high_label: null,
      branch_parent_question_id: null,
      branch_trigger_option_key: null,
    },
  ],
});

test('renders respondent form without loading Survey management data', async () => {
  const requests: Array<{ method: string; pathname: string }> = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const url = new URL(rawUrl, 'http://localhost');
    const method = init?.method ?? 'GET';
    requests.push({ method, pathname: url.pathname });

    if (method === 'GET' && url.pathname === `/surveys/${respondentSurveyId}/form`) {
      return jsonResponse(200, respondentForm);
    }
    if (method === 'GET' && url.pathname === `/surveys/${respondentSurveyId}`) {
      return jsonResponse(404, { code: 'not_found.record', message: 'survey not found' });
    }
    if (method === 'GET' && url.pathname === '/surveys') {
      return jsonResponse(200, { items: [], page: { has_more: false } });
    }
    if (method === 'GET' && url.pathname === '/nav/counts') {
      return jsonResponse(200, { counts: {} });
    }
    if (method === 'GET' && url.pathname === '/managed-systems') {
      return jsonResponse(200, { items: [], page: { has_more: false } });
    }
    if (method === 'GET' && url.pathname === '/me/permissions/scope') {
      return jsonResponse(200, { scope: { kind: 'all' } });
    }
    if (method === 'GET' && url.pathname === '/me/saved-views') {
      return jsonResponse(200, { items: [] });
    }
    return jsonResponse(200, {});
  });
  vi.stubGlobal('fetch', fetchMock as typeof globalThis.fetch);

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(ME_QUERY_KEY, {
    actor: {
      id: '11111111-1111-4111-8111-111111111111',
      external_id: 'respondent',
      email: 'respondent@example.test',
      display_name: 'Survey respondent',
      role_level: 'user',
    },
    workspace_id: '22222222-2222-4222-8222-222222222222',
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RespondSurveyScreen surveyId={respondentSurveyId} />
    </QueryClientProvider>,
  );

  expect(await screen.findByTestId('survey-respondent-form')).toBeVisible();
  expect(requests).toContainEqual({
    method: 'GET',
    pathname: `/surveys/${respondentSurveyId}/form`,
  });
  expect(requests).not.toContainEqual({
    method: 'GET',
    pathname: `/surveys/${respondentSurveyId}`,
  });
  expect(requests).not.toContainEqual({ method: 'GET', pathname: '/surveys' });
});
function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});
