import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createRealAssembly } from './assembly';

afterEach(cleanup);

const payload = {
  session: { user: { id: 'kit-user', name: 'Kit user', title: { ko: 'Kit user', en: 'Kit user' }, permissions: [] }, scopes: [] },
  publishedMetrics: [],
  defaultRangeTo: '2026-10-02T09:00:00',
  sessionVersion: 'kit-v1',
  csrfToken: 'kit-token',
};

it('ready bootstrap supplies the Host adapter, server preferences and server saved views', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(payload), { headers: { 'Content-Type': 'application/json' } }));
  const result = await createRealAssembly({ fetch })();
  expect(fetch.mock.calls[0]?.[0]).toBe('/api/v1/platform/bootstrap');
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'GET', credentials: 'same-origin', redirect: 'manual' });
  if (!('adapter' in result)) throw new Error('expected Host input');
  expect(result.adapter.session().user.id).toBe('kit-user');
  expect(result.topBarTools).toBeNull();
  expect(result.serverPreferences).toBe(true);
  expect(typeof result.savedViews?.list).toBe('function');
});

it('login bootstrap returns the encoded current path and query to the Host', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status: 401 }));
  const result = await createRealAssembly({ fetch, where: () => ({ pathname: '/sample', search: '?a=1&b=2' }) })();
  expect(result).toEqual({ redirect: '/auth/login?return_to=%2Fsample%3Fa%3D1%26b%3D2' });
});

it.each([
  [503, undefined, '서버에 연결할 수 없습니다', undefined],
  [429, '30', '요청이 너무 많습니다', '30초 후 다시 시도해 주세요.'],
  [429, '61', '요청이 너무 많습니다', '2분 후 다시 시도해 주세요.'],
  [429, undefined, '요청이 너무 많습니다', '잠시 후 다시 시도해 주세요.'],
] as const)('bootstrap status %s with Retry-After %s returns a standalone screen', async (status, retryAfter, title, wait) => {
  const headers: Record<string, string> = { 'X-Correlation-Id': 'kit-request' };
  if (retryAfter !== undefined) headers['Retry-After'] = retryAfter;
  const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(null, { status, headers }));
  const result = await createRealAssembly({ fetch })();
  if (!('screen' in result)) throw new Error('expected standalone screen');
  render(result.screen);
  expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByText('kit-request')).toBeTruthy();
  expect(screen.getByRole('button', { name: '다시 시도' })).toBeTruthy();
  if (wait) expect(screen.getByText(wait)).toBeTruthy();
});
