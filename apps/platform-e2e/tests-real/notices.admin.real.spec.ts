import { randomUUID } from 'node:crypto';
import type { Page, Request } from '@playwright/test';
import { evidence, expect, mainHeading, test } from './support';

// Real-server evidence for #1106. Scope: actual cookie + CSRF HTTP CRUD against the notice routes, then the
// Home banner read through the real `POST /api/v1/menu-query` and the rendered DOM after normal navigation.
// There is no notice CRUD screen in this release, so no-reload invalidation after a write is proven by the
// mounted assembly test in apps/platform-web, not here. No route is mocked.

type Answer = { outcome: string; data: { id: string; version: string } | null; version: string | null; replayed: boolean; fieldErrors: unknown[] };

const draft = (suffix: string, ko: string) => ({
  title: { ko: `${ko} ${suffix}`, en: `Notice ${suffix}` },
  content: { ko: '실서버 공지 본문', en: 'Real server notice body' },
  scopeId: null,
  until: '2099-01-01T00:00:00',
});

async function csrfToken(page: Page): Promise<string> {
  const response = await page.request.get('/api/v1/platform/bootstrap');
  expect(response.status()).toBe(200);
  return ((await response.json()) as { csrfToken: string }).csrfToken;
}

async function write(page: Page, csrf: string, path: 'save' | 'delete', body: Record<string, unknown>, version?: string): Promise<Answer> {
  const idempotencyKey = randomUUID();
  const response = await page.request.post(`/api/v1/platform/notices/${path}`, {
    headers: { 'x-csrf-token': csrf, 'idempotency-key': idempotencyKey, ...(version ? { 'if-match': version } : {}) },
    data: { ...body, idempotencyKey },
  });
  expect(response.status(), 'a judged notice write is HTTP 200').toBe(200);
  return (await response.json()) as Answer;
}

// Observes the Home notice query of THIS navigation. The `request` listener is attached immediately before the
// navigation starts, so a query already in flight from the previous page was issued earlier and is never in the
// set. The body is read inside the `response` event, while the response's document is still alive, so a later
// navigation cannot make it unavailable. A query of this navigation that is itself aborted (body unavailable) is
// skipped and the next one is awaited.
type HomeNoticeAnswer = { status: number; body: { outcome: string; data: Array<{ id: string; title: { ko: string }; scopeId: string | null }>; trust: unknown } };

async function openHome(page: Page): Promise<HomeNoticeAnswer> {
  const issued = new Set<Request>();
  const onRequest = (request: Request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/v1/menu-query') issued.add(request);
  };
  const answer = new Promise<HomeNoticeAnswer>(resolve => {
    page.on('response', async response => {
      if (!issued.has(response.request())) return;
      try {
        resolve({ status: response.status(), body: (await response.json()) as HomeNoticeAnswer['body'] });
      } catch {
        // aborted by a navigation of this same load: wait for the next query
      }
    });
  });
  page.on('request', onRequest);
  await page.goto('/home');
  await expect(mainHeading(page)).toHaveText('플랫폼 홈');
  return answer;
}

test.describe('공지 서버와 Home 배너 (#1106)', () => {
  test('공지를 만들고 고치고 지우면 Home 배너가 서버 응답대로 따라온다', async ({ page }, testInfo) => {
    const suffix = randomUUID().slice(0, 8);
    await page.goto('/home');
    const csrf = await csrfToken(page);
    const created = await write(page, csrf, 'save', draft(suffix, '실서버 공지'));
    expect(created.outcome).toBe('ok');
    const id = created.data!.id;
    let version = created.data!.version;
    let deleted = false;
    try {
      const first = await openHome(page);
      expect(first.status).toBe(200);
      const body = first.body;
      expect(body.outcome).toBe('ok');
      expect(body.trust).toBeNull();
      expect(body.data.find(row => row.id === id)).toMatchObject({ scopeId: null, title: { ko: `실서버 공지 ${suffix}` } });
      await expect(page.getByRole('status').filter({ hasText: `실서버 공지 ${suffix}` })).toBeVisible();
      await evidence(page, testInfo, 'real-notice-created');

      const updated = await write(page, csrf, 'save', { ...draft(suffix, '고친 공지'), id, expectedVersion: version }, version);
      expect(updated.outcome).toBe('ok');
      version = updated.data!.version;
      await openHome(page);
      await expect(page.getByRole('status').filter({ hasText: `고친 공지 ${suffix}` })).toBeVisible();
      await expect(page.getByRole('status').filter({ hasText: `실서버 공지 ${suffix}` })).toHaveCount(0);

      const stale = await write(page, csrf, 'save', { ...draft(suffix, '낡은 수정'), id, expectedVersion: 'v1' }, 'v1');
      expect(stale.outcome).toBe('conflict');
      expect(stale.version).toBe(version);

      const removed = await write(page, csrf, 'delete', { id, expectedVersion: version }, version);
      expect(removed.outcome).toBe('ok');
      deleted = true;
      await openHome(page);
      await expect(page.getByRole('status').filter({ hasText: suffix })).toHaveCount(0);
      await evidence(page, testInfo, 'real-notice-deleted');
    } finally {
      if (!deleted) await write(page, csrf, 'delete', { id, expectedVersion: version }, version);
    }
  });

  test('쓰기에는 CSRF가 필요하고 같은 키 재시도는 재생된다', async ({ page }) => {
    await page.goto('/home');
    const csrf = await csrfToken(page);
    const idempotencyKey = randomUUID();
    const body = { ...draft(randomUUID().slice(0, 8), '재생 공지'), idempotencyKey };
    const denied = await page.request.post('/api/v1/platform/notices/save', { headers: { 'idempotency-key': idempotencyKey }, data: body });
    expect(denied.status()).toBe(403);

    const send = () => page.request.post('/api/v1/platform/notices/save', { headers: { 'x-csrf-token': csrf, 'idempotency-key': idempotencyKey }, data: body });
    const first = (await (await send()).json()) as Answer;
    const retry = (await (await send()).json()) as Answer;
    expect([first.outcome, first.replayed]).toEqual(['ok', false]);
    expect([retry.outcome, retry.replayed, retry.data?.id]).toEqual(['ok', true, first.data!.id]);
    await write(page, csrf, 'delete', { id: first.data!.id, expectedVersion: first.data!.version }, first.data!.version);
  });
});
