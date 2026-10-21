import { describe, expect, it } from 'vitest';
import { bootstrapHttpAdapter } from './index.js';
import { bootstrapBody, hang, json, opaqueRedirect, server, type Handler } from './test-support.js';

const run = (handler: Handler, options = {}) => {
  const s = server(handler);
  return { s, result: bootstrapHttpAdapter({ fetch: s.fetch, ...options }) };
};

describe('bootstrapHttpAdapter', () => {
  it('200 with a good body is ready, and sends a same-origin, manual-redirect, CSRF-free GET with a correlation id', async () => {
    const { s, result } = run(() => json(bootstrapBody()));
    const r = await result;
    expect(r.kind).toBe('ready');
    const call = s.calls[0]!;
    expect(call.method).toBe('GET');
    expect(call.url).toBe('/api/v1/platform/bootstrap');
    expect(call.init.credentials).toBe('same-origin');
    expect(call.init.redirect).toBe('manual');
    expect(call.headers['X-Correlation-Id']).toMatch(/^req-[0-9a-f]{16}-[0-9a-f]{12}$/);
    expect(call.headers['X-CSRF-Token']).toBeUndefined();
  });

  it('prefixes every request with options.base', async () => {
    const { s, result } = run(() => json(bootstrapBody()));
    await bootstrapHttpAdapter({ fetch: s.fetch, base: 'https://api.example' });
    await result;
    expect(s.calls.map((c) => c.url)).toEqual(['/api/v1/platform/bootstrap', 'https://api.example/api/v1/platform/bootstrap']);
  });

  it.each<[string, Handler]>([
    ['401', () => new Response('', { status: 401 })],
    ['302', () => new Response(null, { status: 302, headers: { Location: 'https://idp.example/login' } })],
    ['opaqueredirect', () => opaqueRedirect()],
  ])('%s is login', async (_name, handler) => {
    const { result } = run(handler);
    expect(await result).toEqual({ kind: 'login' });
  });

  it.each<[string, Handler]>([
    ['500', () => new Response('boom', { status: 500, headers: { 'X-Correlation-Id': 'srv-9' } })],
    ['503', () => new Response('', { status: 503, headers: { 'X-Correlation-Id': 'srv-9' } })],
    ['403', () => new Response('', { status: 403, headers: { 'X-Correlation-Id': 'srv-9' } })],
    ['200 that is not JSON', () => new Response('<html>', { status: 200, headers: { 'X-Correlation-Id': 'srv-9' } })],
    ['200 without csrfToken', () => json({ ...bootstrapBody(), csrfToken: undefined }, { headers: { 'X-Correlation-Id': 'srv-9' } })],
    ['200 without a session', () => json({ ...bootstrapBody(), session: null }, { headers: { 'X-Correlation-Id': 'srv-9' } })],
  ])('%s is unavailable with the response correlation id', async (_name, handler) => {
    const { result } = run(handler);
    expect(await result).toEqual({ kind: 'unavailable', correlationId: 'srv-9' });
  });

  it('a network failure is unavailable with the request correlation id', async () => {
    const { s, result } = run(() => {
      throw new TypeError('Failed to fetch');
    });
    const r = await result;
    expect(r).toEqual({ kind: 'unavailable', correlationId: s.calls[0]!.headers['X-Correlation-Id'] });
  });

  it('a timeout is unavailable', async () => {
    const { result } = run(hang, { timeoutMs: 5 });
    const r = await result;
    expect(r.kind).toBe('unavailable');
  });

  it('never rejects, even when fetch throws before returning a promise', async () => {
    const r = await bootstrapHttpAdapter({
      fetch: (() => {
        throw new Error('sync');
      }) as unknown as typeof fetch,
    });
    expect(r.kind).toBe('unavailable');
    expect(r.kind === 'unavailable' && r.correlationId).toMatch(/^req-/);
  });

  it('ignores an unsafe response correlation id', async () => {
    const { s, result } = run(() => new Response('', { status: 500, headers: { 'X-Correlation-Id': 'a b\tc' } }));
    const r = await result;
    expect(r).toEqual({ kind: 'unavailable', correlationId: s.calls[0]!.headers['X-Correlation-Id'] });
  });
});
