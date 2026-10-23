// T1–T5 — the platform home `내 할 일` panel. fetch is mocked directly (house style), with the bridge's `/api/fo` base path.

import { surveyKeys } from '@/features/surveys/hooks/useSurveys';
import { configureApiClient } from '@/lib/api/client';
import { permissionRequestsMineAllKey } from '@/lib/api/permission-requests';
import { type HostLinkProps, type HostSeam, HostSeamProvider } from '@/lib/host/host-seam';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HomeTodoPanel } from '../HomeTodoPanel';

const NOW = new Date('2026-10-24T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const uuid = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;

const survey = (n: number) => ({
  survey_id: uuid(n),
  display_id: `SRV-${n}`,
  title: `설문 ${n}`,
  type: 'discovery',
  question_count: 3,
  opened_at: '2026-10-20T00:00:00.000Z',
});
const surveysOf = (count: number, hasMore = false) => ({
  items: Array.from({ length: count }, (_, i) => survey(i + 1)),
  page: { has_more: hasMore },
});

const notification = (n: number, over: Record<string, unknown> = {}) => ({
  id: uuid(100 + n),
  event_type: 'voc.public_update_posted',
  subject_type: 'voc',
  subject_id: uuid(100 + n),
  subject_ref: { visibility_state: 'allowed', display_id: `VOC-${n}`, title: `VOC 제목 ${n}` },
  summary: '공개 업데이트가 올라왔습니다.',
  detail: { voc_id: uuid(200 + n) },
  created_at: ago(n * 60_000),
  read_at: null,
  archived_at: null,
  ...over,
});

const request = (n: number, status: string, updatedAt: string, capability = 'voc.read') => ({
  id: uuid(300 + n),
  requested_capability: capability,
  requested_managed_system_id: null,
  reason: '사유',
  requested_object_type: null,
  requested_object_id: null,
  source_object_type: null,
  source_object_id: null,
  source_action_id: null,
  revision: 1,
  requested_expiration: null,
  updated_at: updatedAt,
  return_route_intent: null,
  status,
  created_at: updatedAt,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

type Answer = unknown | 'fail';
let urls: Array<{ url: string; method: string }> = [];
let answers: { surveys: Answer; notifications: Answer; requests: Answer };
const empty = () => ({
  surveys: { items: [], page: { has_more: false } },
  notifications: { items: [], page: { has_more: false }, unread_count: 0 },
  requests: { requests: [] },
});

function installFetch() {
  urls = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    urls.push({ url, method: init?.method ?? 'GET' });
    const path = new URL(url, 'http://x').pathname;
    const body =
      path === '/api/fo/me/answerable-surveys'
        ? answers.surveys
        : path === '/api/fo/notifications'
          ? answers.notifications
          : path === '/api/fo/permission-requests/mine'
            ? answers.requests
            : undefined;
    if (body === undefined) return new Response('not mocked', { status: 500 });
    return body === 'fail' ? json({ error: 'x' }, 500) : json(body);
  }) as typeof fetch;
}

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
  const seam = {
    canLink: () => true,
    Link: ({ to, children }: HostLinkProps) => <a href={to}>{children}</a>,
    notifyError: vi.fn(),
    notifySuccess: vi.fn(),
  } satisfies HostSeam;
  const view = render(
    <QueryClientProvider client={client}>
      <HostSeamProvider value={seam}>
        <HomeTodoPanel />
      </HostSeamProvider>
    </QueryClientProvider>,
  );
  return { client, view };
}

const originalFetch = globalThis.fetch;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: NOW });
  configureApiClient({ basePath: '/api/fo' });
  answers = empty();
  installFetch();
});
afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
});

const groupEl = (name: string) =>
  screen.getByRole('heading', { level: 3, name }).parentElement as HTMLElement;
const group = (name: string) => within(groupEl(name));
const hrefs = (name: string) =>
  group(name)
    .getAllByRole('link')
    .map((a: HTMLElement) => a.getAttribute('href'));

describe('HomeTodoPanel', () => {
  it('T1 renders the three groups in order, linking through the seam, from the caller-scoped requests', async () => {
    answers = {
      surveys: surveysOf(1),
      notifications: { items: [notification(1)], page: { has_more: false }, unread_count: 1 },
      requests: { requests: [request(1, 'pending', ago(DAY))] },
    };
    const { client } = mount();
    const region = await screen.findByRole('region', { name: '내 할 일' });
    expect(within(region).getByRole('heading', { level: 2, name: '내 할 일' })).toBeTruthy();
    expect(
      within(region)
        .getAllByRole('heading', { level: 3 })
        .map((h) => h.textContent),
    ).toEqual(['응답할 설문', '내 VOC', '권한 요청']);
    expect(hrefs('응답할 설문')).toEqual([`/surveys/${uuid(1)}/respond`]);
    expect(hrefs('내 VOC')).toEqual([`/vocs?view=my&selected=${uuid(201)}`]);
    expect(hrefs('권한 요청')).toEqual(['/permission-requests', '/permission-requests']);
    expect(group('권한 요청').getByText('대기 중')).toBeTruthy();
    expect(urls.map((u) => u.url).sort()).toEqual([
      '/api/fo/me/answerable-surveys',
      '/api/fo/notifications?unread=true&limit=100',
      '/api/fo/permission-requests/mine?status=all',
    ]);
    expect(client.getQueryCache().find({ queryKey: permissionRequestsMineAllKey })).toBeDefined();
    expect(urls.every((u) => u.method === 'GET')).toBe(true);
  });

  it('T2 all groups empty renders nothing', async () => {
    const { view } = mount();
    await waitFor(() => expect(urls).toHaveLength(3));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(view.container.innerHTML).toBe('');
  });

  it('T2 renders nothing while every group is still loading', () => {
    globalThis.fetch = vi.fn(() => new Promise<Response>(() => {})) as typeof fetch;
    const { view } = mount();
    expect(view.container.innerHTML).toBe('');
  });

  it.each([
    ['surveys', '응답할 설문', '내 VOC', '/surveys/participate'],
    ['notifications', '내 VOC', '응답할 설문', null],
    ['requests', '권한 요청', '응답할 설문', '/permission-requests'],
  ] as const)(
    'T2 a failing %s group shows its error line (and its 모두 보기 link, if it has one); the others still render',
    async (key, failed, other, moreHref) => {
      answers = {
        surveys: surveysOf(1),
        notifications: { items: [notification(1)], page: { has_more: false }, unread_count: 1 },
        requests: { requests: [request(1, 'pending', ago(DAY))] },
      };
      answers[key] = 'fail';
      mount();
      expect(await screen.findByText('불러오지 못했습니다')).toBeTruthy();
      expect(group(failed).getByText('불러오지 못했습니다')).toBeTruthy();
      if (moreHref === null) expect(group(failed).queryByRole('link')).toBeNull();
      else
        expect(group(failed).getByRole('link', { name: '모두 보기' }).getAttribute('href')).toBe(
          moreHref,
        );
      expect(group(other).queryByText('불러오지 못했습니다')).toBeNull();
      expect(group(other).getAllByRole('link').length).toBeGreaterThan(0);
    },
  );

  it('T2 hides an empty group while another has items', async () => {
    answers.surveys = surveysOf(1);
    mount();
    await screen.findByRole('region', { name: '내 할 일' });
    expect(screen.queryByRole('heading', { level: 3, name: '내 VOC' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 3, name: '권한 요청' })).toBeNull();
  });

  it('T3 keeps open requests and decided ones within 7 days (inclusive), open first, never cancelled', async () => {
    answers.requests = {
      requests: [
        request(1, 'approved', ago(2 * DAY), 'voc.read'),
        request(2, 'pending', ago(5 * DAY), 'voc.triage'),
        request(3, 'approved', ago(8 * DAY), 'survey.create'),
        request(4, 'cancelled', ago(DAY), 'task.manage'),
        request(5, 'rejected', ago(7 * DAY), 'survey.export'),
        request(6, 'needs_more_info', ago(6 * DAY), 'workspace.read'),
      ],
    };
    mount();
    const rows = (await screen.findAllByTestId('home-todo-permission-requests')).flatMap((g) =>
      within(g).getAllByRole('listitem'),
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining('대기 중'),
      expect.stringContaining('추가 정보 필요'),
      expect.stringContaining('승인됨'),
      expect.stringContaining('거절됨'),
    ]);
  });

  it('T4 collapses repeated updates of one VOC, skips other events, and never marks anything read', async () => {
    const sameVoc = { detail: { voc_id: uuid(201) } };
    answers.notifications = {
      items: [
        notification(1),
        notification(2, { ...sameVoc, id: uuid(150), created_at: ago(30_000) }),
        notification(3, { event_type: 'voc.assigned_to_me' }),
      ],
      page: { has_more: false },
      unread_count: 3,
    };
    mount();
    const vocs = await screen.findByTestId('home-todo-vocs');
    expect(within(vocs).getAllByRole('link')).toHaveLength(1);
    expect(urls.some((u) => u.method === 'POST' || u.url.endsWith('/read'))).toBe(false);
  });

  it('T5 shows five surveys and a 모두 보기 link when more exist', async () => {
    answers.surveys = surveysOf(6);
    mount();
    const surveys = await screen.findByTestId('home-todo-surveys');
    const links = within(surveys).getAllByRole('link');
    expect(links).toHaveLength(6);
    expect(links.map((a) => a.getAttribute('href')).at(-1)).toBe('/surveys/participate');
    expect(links.at(-1)?.textContent).toBe('모두 보기');
  });

  it('Z1 sizes the groups grid by its own width (auto-fit), and a lone group is the only grid child', async () => {
    answers.surveys = surveysOf(1);
    mount();
    const region = await screen.findByRole('region', { name: '내 할 일' });
    const grid = within(region).getByTestId('home-todo-surveys').parentElement as HTMLElement;
    expect(grid.className).toContain('grid-cols-[repeat(auto-fit,minmax(16rem,1fr))]');
    expect(grid.className).not.toMatch(/(^|\s)(sm|md|lg|xl):grid-cols/);
    expect(grid.children).toHaveLength(1);
  });

  it('Z2 a row title carries its full text as title', async () => {
    answers.surveys = surveysOf(1);
    mount();
    const surveys = await screen.findByTestId('home-todo-surveys');
    expect(within(surveys).getByText('설문 1').getAttribute('title')).toBe('설문 1');
  });

  it('Z3 a 내 VOC row shows its display id and time; an unavailable subject shows time only', async () => {
    answers.notifications = {
      items: [
        notification(1),
        notification(2, { subject_ref: { visibility_state: 'unavailable' } }),
      ],
      page: { has_more: false },
      unread_count: 2,
    };
    mount();
    const vocs = await screen.findByTestId('home-todo-vocs');
    const rows = within(vocs).getAllByRole('listitem');
    expect(rows[0]?.textContent).toContain('VOC-1 · ');
    expect(rows[1]?.textContent).not.toContain('·');
  });

  describe('with the surveys page having cached two pages', () => {
    const seed = () => {
      const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
      client.setQueryData(surveyKeys.answerable, {
        pages: [
          { items: [survey(1)], page: { has_more: true, cursor: 'c1' } },
          { items: [survey(2)], page: { has_more: true, cursor: 'c2' } },
        ],
        pageParams: [undefined, 'c1'],
      });
      return client;
    };
    const surveyGets = () => urls.filter((u) => u.url.startsWith('/api/fo/me/answerable-surveys'));

    it('Y1 reads one cursor-less survey page, three requests in total', async () => {
      answers.surveys = surveysOf(1);
      mount(seed());
      await screen.findByRole('region', { name: '내 할 일' });
      await waitFor(() => expect(urls).toHaveLength(3));
      expect(surveyGets().map((u) => u.url)).toEqual(['/api/fo/me/answerable-surveys']);
      expect(urls.some((u) => u.url.includes('cursor='))).toBe(false);
    });

    it('Y2 invalidating the answerable key refetches the first page', async () => {
      answers.surveys = surveysOf(1);
      const client = seed();
      mount(client);
      await screen.findByRole('region', { name: '내 할 일' });
      await waitFor(() => expect(urls).toHaveLength(3));
      await client.invalidateQueries({ queryKey: surveyKeys.answerable });
      await waitFor(() => expect(surveyGets()).toHaveLength(2));
      expect(surveyGets().every((u) => !u.url.includes('cursor='))).toBe(true);
    });
  });
});
