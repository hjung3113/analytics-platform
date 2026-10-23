import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { memoryStorage } from '@ap/kernel/testing';
import { setFoApi } from '../fo-api';
import { foQueryClient } from '../fo/session';
import { ID_A, ID_B, json, mountAt, stubFetch, switchableAdapter, type Call } from '../fo/test-support';

const origin = () => window.location.origin;
const RESPOND = `/surveys/${ID_A}/respond`;

const survey = { id: ID_A, title: 'Q3 사용성 진단', type: 'discovery', identity_protected: true, description: null };
const base = { is_required: false, rating_min: null, rating_max: null, rating_low_label: null, rating_high_label: null, options: null, branch_parent_question_id: null, branch_trigger_option_key: null };
const choices = [{ key: 'a', label: '가' }, { key: 'b', label: '나' }];
const textQuestion = { ...base, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01', kind: 'text', prompt: '사용 경험을 적어주세요.', sort_order: 0, is_required: true };
const textForm = { survey, questions: [textQuestion] };
const mixedForm = {
  survey,
  questions: [
    { ...base, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02', kind: 'rating', prompt: '만족도', sort_order: 0, rating_min: 1, rating_max: 5, rating_low_label: '낮음', rating_high_label: '높음' },
    { ...base, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa03', kind: 'single_choice', prompt: '하나만 고르세요', sort_order: 1, options: choices },
    { ...base, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04', kind: 'multiple_choice', prompt: '여러 개 고르세요', sort_order: 2, options: choices },
    { ...base, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05', kind: 'text', prompt: '자유 의견', sort_order: 3 },
  ],
};
const answerable = { items: [{ survey_id: ID_A, display_id: 'SRV-21', title: 'Q3 사용성 진단', type: 'discovery', question_count: 2, opened_at: '2026-07-20T00:00:00.000Z' }], page: { has_more: false } };
const emptyPage = { items: [], page: { has_more: false } };

/** Answers the respondent routes; `form` and `post` override the form and the submit answer. */
function surveyFetch(over: { form?: () => Response; post?: () => Response } = {}) {
  return stubFetch((path, method) => {
    if (path === '/api/fo/me/answerable-surveys') return json(answerable);
    if (path === '/api/fo/me/survey-responses') return json(emptyPage);
    if (path === `/api/fo/surveys/${ID_A}/form`) return over.form?.() ?? json(textForm);
    if (path === `/api/fo/surveys/${ID_A}/responses` && method === 'POST') return over.post?.() ?? json({ id: ID_B, survey_id: ID_A, submitted_at: '2026-07-21T00:00:00.000Z', identity_protected: true }, 201);
    return json({ code: 'internal.unexpected', message: 'not mocked' }, 500);
  });
}

const respondUrl = (returnTo?: string) => `${RESPOND}?v=1${returnTo === undefined ? '' : `&returnTo=${encodeURIComponent(returnTo)}`}`;
const posts = (calls: Call[]) => calls.filter(call => call.method !== 'GET');

/** Opens the page header's `더보기` menu when it exists; the return link lives there. */
async function openHeaderMenu() {
  const more = screen.queryByRole('button', { name: '더보기' });
  if (more) await userEvent.setup().click(more);
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => {
  cleanup();
  foQueryClient.clear();
  setFoApi(null);
  vi.unstubAllGlobals();
  window.history.replaceState(null, '', '/');
});

describe('Surveys without a FeedbackOps API (mock preview) — S1', () => {
  it.each([
    ['/surveys?v=1', '설문'],
    [`${RESPOND}?v=1`, '설문 응답'],
  ])('%s shows %s and 실서버 필요 and requests nothing', async (url, heading) => {
    setFoApi(null);
    const calls = surveyFetch();
    mountAt(switchableAdapter().adapter, url);
    expect(await screen.findByRole('heading', { name: heading })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('실서버 필요');
    expect(calls).toEqual([]);
  });
});

describe('Surveys through the FeedbackOps bridge', () => {
  const onSessionLost = vi.fn();
  beforeEach(() => { onSessionLost.mockReset(); setFoApi({ basePath: '/api/fo', onSessionLost }); });

  it('S2: lists answerable surveys, links to the platform respond page with a returnTo, and opens the form', async () => {
    const calls = surveyFetch();
    mountAt(switchableAdapter().adapter, '/surveys?v=1');
    const link = (await screen.findByRole('link', { name: '응답하기' })) as HTMLAnchorElement;
    expect(calls.map(call => call.path)).toEqual(expect.arrayContaining(['/api/fo/me/answerable-surveys', '/api/fo/me/survey-responses']));
    expect(calls.every(call => call.credentials === 'include')).toBe(true);
    const href = new URL(link.getAttribute('href')!, origin());
    expect(href.pathname).toBe(RESPOND);
    expect(new URL(href.searchParams.get('returnTo')!, origin()).pathname).toBe('/surveys');

    fireEvent.click(link);
    const heading = await screen.findByRole('heading', { name: '설문 응답' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
    await waitFor(() => expect(calls.map(call => `${call.method} ${call.path}`)).toContain(`GET /api/fo/surveys/${ID_A}/form`));
  });

  it('S3: nothing is pre-selected', async () => {
    surveyFetch({ form: () => json(mixedForm) });
    mountAt(switchableAdapter().adapter, respondUrl());
    await screen.findByText('하나만 고르세요');
    const inputs = [...screen.queryAllByRole('radio'), ...screen.queryAllByRole('checkbox')] as HTMLInputElement[];
    expect(inputs.length).toBeGreaterThanOrEqual(8);
    expect(inputs.filter(input => input.checked)).toEqual([]);
    expect((screen.getByRole('textbox', { name: '자유 의견' }) as HTMLTextAreaElement).value).toBe('');
  });

  it('S4: a submit shows the FeedbackOps success state and the header link back to the origin; no VOC is requested', async () => {
    const calls = surveyFetch();
    mountAt(switchableAdapter().adapter, respondUrl('/notifications?v=1'));
    fireEvent.change(await screen.findByRole('textbox', { name: '사용 경험을 적어주세요.' }), { target: { value: '좋았습니다' } });
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));

    await screen.findByTestId('survey-response-success');
    expect(posts(calls).map(call => `${call.method} ${call.path}`)).toEqual([`POST /api/fo/surveys/${ID_A}/responses`]);
    expect(window.location.pathname).toBe(RESPOND);
    expect(screen.getByRole('list', { name: 'toasts' }).children).toHaveLength(0);
    expect(calls.filter(call => call.path.includes('/vocs'))).toEqual([]);

    await openHeaderMenu();
    const back = screen.getAllByRole('link').find(link => new URL(link.getAttribute('href')!, origin()).pathname === '/notifications')!;
    expect(back).toBeTruthy();
    fireEvent.click(back);
    const heading = await screen.findByRole('heading', { name: '알림' });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it.each([
    ['an absolute URL', 'https://evil.example/x'],
    ['a protocol-relative URL', '//evil.example/x'],
    ['a navHidden path', `/surveys/${ID_B}/respond?v=1`],
    ['no returnTo', undefined],
  ])('S5: %s never becomes a link outside the app or to a navHidden path', async (_name, returnTo) => {
    surveyFetch();
    mountAt(switchableAdapter().adapter, respondUrl(returnTo));
    await screen.findByRole('textbox', { name: '사용 경험을 적어주세요.' });
    await openHeaderMenu();
    for (const link of screen.queryAllByRole('link')) {
      const href = new URL(link.getAttribute('href')!, origin());
      expect(href.origin).toBe(origin());
      expect(href.pathname).not.toBe(`/surveys/${ID_B}/respond`);
      expect(href.href).not.toContain('evil.example');
    }
    expect(window.location.origin).toBe(origin());
  });

  it.each(['not-a-uuid', '..%2F..%2Fme'])('S6: the invalid survey ID %s is not found and requests nothing', async surveyId => {
    const calls = surveyFetch();
    mountAt(switchableAdapter().adapter, `/surveys/${surveyId}/respond?v=1`);
    expect(await screen.findByRole('heading', { name: '설문 응답' })).toBeTruthy();
    expect(screen.getByText('설문을 찾을 수 없습니다')).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it('S7: a 401 on submit retires the page through onSessionLost without a toast or navigation', async () => {
    surveyFetch({ post: () => json({ code: 'auth.session_invalid', message: 'no session' }, 401) });
    mountAt(switchableAdapter().adapter, respondUrl());
    fireEvent.change(await screen.findByRole('textbox', { name: '사용 경험을 적어주세요.' }), { target: { value: '좋았습니다' } });
    await userEvent.setup().click(screen.getByRole('button', { name: '제출' }));
    expect(await screen.findByText('세션이 만료되었습니다')).toBeTruthy();
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('list', { name: 'toasts' }).children).toHaveLength(0);
    expect(window.location.pathname).toBe(RESPOND);
  });

  it('S8: an already-submitted form shows the FeedbackOps message and a link back to 설문', async () => {
    surveyFetch({ form: () => json({ code: 'conflict.survey_response_already_submitted', message: 'survey response already submitted' }, 409) });
    mountAt(switchableAdapter().adapter, respondUrl());
    expect(await screen.findByText('이 Survey에는 이미 응답을 제출했습니다.')).toBeTruthy();
    const back = screen.getByRole('link', { name: 'Survey 참여로 돌아가기' });
    expect(new URL(back.getAttribute('href')!, origin()).pathname).toBe('/surveys');
    expect(screen.queryByTestId('survey-respondent-form')).toBeNull();
  });
});
