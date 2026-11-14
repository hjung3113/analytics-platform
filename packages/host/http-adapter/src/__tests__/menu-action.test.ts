import type { MenuAction } from '@ap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTION_OK, bootstrapBody, hang, json, opaqueRedirect, ready, type Handler } from './test-support.js';

const REQ: MenuAction = { action: 'g.n', context: { scopeId: 'fab-a' }, input: { name: 'x' }, idempotencyKey: '7b6c1d6e-0000-4000-8000-000000000000' };
const UNKNOWN = { outcome: 'unknown', data: null, version: null, fieldErrors: [], replayed: false };

describe('menuAction request', () => {
  it('sends Idempotency-Key and CSRF, the MenuAction as the body, and no If-Match without expectedVersion', async () => {
    const { adapter, sent } = await ready(() => json(ACTION_OK));
    await adapter.menuAction(REQ);
    const call = sent()[0]!;
    expect(call.method).toBe('POST');
    expect(call.path).toBe('/api/v1/menu-action');
    expect(call.body).toEqual(REQ);
    expect(call.headers['Idempotency-Key']).toBe(REQ.idempotencyKey);
    expect(call.headers['X-CSRF-Token']).toBe('t1');
    expect(call.headers['If-Match']).toBeUndefined();
  });

  it('sends expectedVersion as an unquoted opaque If-Match', async () => {
    const { adapter, sent } = await ready(() => json(ACTION_OK));
    await adapter.menuAction({ ...REQ, expectedVersion: 'v-12.3' });
    expect(sent()[0]!.headers['If-Match']).toBe('v-12.3');
    expect((sent()[0]!.body as MenuAction).expectedVersion).toBe('v-12.3');
  });
});

describe('menuAction answers', () => {
  it('passes a judged ActionResponse through (ok)', async () => {
    const { adapter } = await ready(() => json({ ...ACTION_OK, extra: 1 }));
    expect(await adapter.menuAction(REQ)).toEqual(ACTION_OK);
  });

  it.each([
    { outcome: 'conflict', data: null, version: 'v9', fieldErrors: [], replayed: false, correlationId: 'srv-3' },
    { outcome: 'invalid', data: null, version: null, fieldErrors: [{ path: ['name'], code: 'required' }], replayed: false, correlationId: 'srv-3', message: 'invalid_input' },
    { outcome: 'forbidden', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'srv-3' },
    { outcome: 'not_found', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'srv-3' },
    { outcome: 'error', data: null, version: null, fieldErrors: [], replayed: false, correlationId: 'srv-3', message: 'handler_failed' },
    { outcome: 'ok', data: { id: 'a' }, version: 'v2', fieldErrors: [], replayed: true, correlationId: 'srv-3' },
  ])('keeps a server-judged $outcome as the server sent it', async (body) => {
    const { adapter } = await ready(() => json(body));
    expect(await adapter.menuAction(REQ)).toEqual(body);
  });

  const unknownRows: [string, Handler, string, boolean][] = [
    ['network', () => { throw new TypeError('x'); }, 'network_error', false],
    ['500', () => new Response('trace', { status: 500, headers: { 'X-Correlation-Id': 'srv-5' } }), 'http_500', false],
    ['502', () => new Response('', { status: 502, headers: { 'X-Correlation-Id': 'srv-5' } }), 'http_502', false],
    ['504', () => new Response('', { status: 504, headers: { 'X-Correlation-Id': 'srv-5' } }), 'http_504', false],
    ['404', () => new Response('', { status: 404, headers: { 'X-Correlation-Id': 'srv-5' } }), 'http_404', false],
    ['422', () => new Response('', { status: 422, headers: { 'X-Correlation-Id': 'srv-5' } }), 'http_422', false],
    ['429', () => new Response('', { status: 429, headers: { 'X-Correlation-Id': 'srv-5' } }), 'http_429', false],
    ['200 that is not JSON', () => new Response('<html>', { status: 200, headers: { 'X-Correlation-Id': 'srv-5' } }), 'invalid_response', false],
    ['200 JSON that is not an ActionResponse', () => json({ outcome: 'ok' }, { headers: { 'X-Correlation-Id': 'srv-5' } }), 'invalid_envelope', false],
    ['200 JSON with an unknown outcome', () => json({ ...ACTION_OK, outcome: 'done' }, { headers: { 'X-Correlation-Id': 'srv-5' } }), 'invalid_envelope', false],
    ['an ApiResponse envelope instead of an ActionResponse', () => json({ outcome: 'ok', data: null, assessments: [], trust: null, correlationId: 'x' }, { headers: { 'X-Correlation-Id': 'srv-5' } }), 'invalid_envelope', false],
    ['401', () => new Response('', { status: 401, headers: { 'X-Correlation-Id': 'srv-5' } }), 'session_expired', true],
    ['302', () => new Response(null, { status: 302 }), 'session_expired', true],
    ['opaqueredirect', () => opaqueRedirect(), 'session_expired', true],
    ['403 (CSRF)', () => new Response('', { status: 403, headers: { 'X-Correlation-Id': 'srv-5' } }), 'http_403', true],
  ];

  it.each(unknownRows)('%s is unknown with empty fields and a short code', async (_name, handler, message, recheck) => {
    const { adapter, calls, sent } = await ready(handler);
    const result = await adapter.menuAction(REQ);
    const fromResponse = !['network', 'opaqueredirect', '302'].some((n) => _name.startsWith(n));
    expect(result).toEqual({ ...UNKNOWN, correlationId: fromResponse ? 'srv-5' : sent()[0]!.headers['X-Correlation-Id'], message });
    await Promise.resolve();
    expect(calls.filter((c) => c.path.endsWith('/bootstrap'))).toHaveLength(recheck ? 2 : 1);
    expect(sent()).toHaveLength(1);
  });

  describe('timeout and abort', () => {
    beforeEach(() => void vi.useFakeTimers());
    afterEach(() => void vi.useRealTimers());

    it('the 30 s timeout is unknown / client_timeout', async () => {
      const { adapter, sent } = await ready(hang);
      const pending = adapter.menuAction(REQ);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await pending).toEqual({ ...UNKNOWN, correlationId: sent()[0]!.headers['X-Correlation-Id'], message: 'client_timeout' });
    });

    it('a Kernel signal that aborts rejects with an AbortError', async () => {
      const { adapter } = await ready(hang);
      const kernel = new AbortController();
      const settled = adapter.menuAction(REQ, kernel.signal).catch((e: unknown) => e);
      kernel.abort();
      expect((await settled as Error).name).toBe('AbortError');
    });
  });

  it('a 403 refreshes the token for the next write and does not resend this one', async () => {
    let boots = 0;
    const { adapter, sent } = await ready(
      (call) => (call.headers['X-CSRF-Token'] === 't1' ? new Response('', { status: 403 }) : json(ACTION_OK)),
      {},
      () => json(bootstrapBody('v1', boots++ === 0 ? 't1' : 't2')),
    );
    expect((await adapter.menuAction(REQ)).outcome).toBe('unknown');
    await vi.waitFor(() => expect(boots).toBe(2));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(sent()).toHaveLength(1);
    expect((await adapter.menuAction(REQ)).outcome).toBe('ok');
    expect(sent().map((c) => c.headers['X-CSRF-Token'])).toEqual(['t1', 't2']);
  });
});
