import { describe, expect, it } from 'vitest';
import { createTransport } from '../transport.js';

const send = async (response: Response) => {
  const transport = createTransport({ fetch: async () => response, base: '' });
  return transport.send({ method: 'GET', path: '/api/v1/platform/bootstrap', timeoutMs: 1_000 });
};

describe('transport Retry-After (#1179)', () => {
  it.each<[string, string, number | undefined]>([
    ['delay-seconds', '30', 30],
    ['zero seconds', '0', 0],
    ['not a number', 'abc', undefined],
    ['negative', '-1', undefined],
    ['fractional', '1.5', undefined],
    ['the HTTP-date form', 'Wed, 21 Oct 2026 07:28:00 GMT', undefined],
  ])('Retry-After "%s" → retryAfterSeconds %s', async (_name, header, want) => {
    const raw = await send(new Response('', { status: 429, headers: { 'Retry-After': header } }));
    expect(raw).toEqual({
      kind: 'response',
      status: 429,
      ok: false,
      correlationId: expect.any(String),
      text: '',
      ...(want === undefined ? {} : { retryAfterSeconds: want }),
    });
  });

  it('a response without Retry-After exposes no field beyond the Raw shape', async () => {
    const raw = await send(new Response('', { status: 503, headers: { 'X-Correlation-Id': 'srv-1', 'X-Trace-Id': 't-1' } }));
    expect(raw).toEqual({ kind: 'response', status: 503, ok: false, correlationId: 'srv-1', text: '' });
  });

  it('carries the seconds on any status, not only 429', async () => {
    const raw = await send(new Response('', { status: 200, headers: { 'Retry-After': '30' } }));
    expect(raw).toEqual({ kind: 'response', status: 200, ok: true, correlationId: expect.any(String), text: '', retryAfterSeconds: 30 });
  });
});
