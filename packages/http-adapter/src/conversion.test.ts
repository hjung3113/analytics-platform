import { PortError } from '@ap/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransportError } from './calls.js';
import { ENVELOPE, hang, json, opaqueRedirect, ready, type Handler } from './test-support.js';

const QUERY = { endpoint: 'e.x', context: {}, params: {} } as never;
const SERVER_ID = { 'X-Correlation-Id': 'srv-7' };

describe('envelope methods (contract §2.1)', () => {
  it('passes a good 200 envelope through with the server correlation id', async () => {
    const { adapter } = await ready(() => json(ENVELOPE));
    expect(await adapter.menuQuery(QUERY)).toEqual(ENVELOPE);
  });

  type Row = [string, Handler, { outcome: 'error' | 'timeout'; message: string; id: 'request' | 'srv-7'; recheck: boolean }];
  const rows: Row[] = [
    ['network failure', () => { throw new TypeError('Failed to fetch'); }, { outcome: 'error', message: 'network_error', id: 'request', recheck: false }],
    ['401', () => new Response('', { status: 401, headers: SERVER_ID }), { outcome: 'error', message: 'session_expired', id: 'srv-7', recheck: true }],
    ['302', () => new Response(null, { status: 302 }), { outcome: 'error', message: 'session_expired', id: 'request', recheck: true }],
    ['opaqueredirect', () => opaqueRedirect(), { outcome: 'error', message: 'session_expired', id: 'request', recheck: true }],
    ['403', () => new Response('{"detail":"secret"}', { status: 403, headers: SERVER_ID }), { outcome: 'error', message: 'http_403', id: 'srv-7', recheck: false }],
    ['404', () => new Response('', { status: 404, headers: SERVER_ID }), { outcome: 'error', message: 'http_404', id: 'srv-7', recheck: false }],
    ['413', () => new Response('', { status: 413 }), { outcome: 'error', message: 'http_413', id: 'request', recheck: false }],
    ['422', () => new Response('', { status: 422, headers: SERVER_ID }), { outcome: 'error', message: 'http_422', id: 'srv-7', recheck: false }],
    ['429', () => new Response('', { status: 429, headers: SERVER_ID }), { outcome: 'error', message: 'http_429', id: 'srv-7', recheck: false }],
    ['500', () => new Response('Traceback ...', { status: 500, headers: SERVER_ID }), { outcome: 'error', message: 'http_500', id: 'srv-7', recheck: false }],
    ['504 (a gateway timeout is not a server judgement)', () => new Response('', { status: 504, headers: SERVER_ID }), { outcome: 'error', message: 'http_504', id: 'srv-7', recheck: false }],
    ['200 that is not JSON', () => new Response('<html>login</html>', { status: 200, headers: SERVER_ID }), { outcome: 'error', message: 'invalid_response', id: 'srv-7', recheck: false }],
    ['200 JSON with an unknown outcome', () => json({ ...ENVELOPE, outcome: 'weird' }, { headers: SERVER_ID }), { outcome: 'error', message: 'invalid_envelope', id: 'srv-7', recheck: false }],
    ['200 JSON without correlationId', () => json({ ...ENVELOPE, correlationId: undefined }, { headers: SERVER_ID }), { outcome: 'error', message: 'invalid_envelope', id: 'srv-7', recheck: false }],
    ['200 JSON with assessments that is not an array', () => json({ ...ENVELOPE, assessments: {} }, { headers: SERVER_ID }), { outcome: 'error', message: 'invalid_envelope', id: 'srv-7', recheck: false }],
    ['200 JSON that is an array', () => json([], { headers: SERVER_ID }), { outcome: 'error', message: 'invalid_envelope', id: 'srv-7', recheck: false }],
  ];

  it.each(rows)('%s becomes an envelope, not a rejection', async (_name, handler, want) => {
    const { adapter, calls, sent } = await ready(handler);
    const result = await adapter.menuQuery(QUERY);
    const requestId = sent()[0]!.headers['X-Correlation-Id'];
    expect(result).toEqual({
      outcome: want.outcome,
      data: null,
      assessments: [],
      trust: null,
      correlationId: want.id === 'request' ? requestId : want.id,
      message: want.message,
    });
    expect(result.message).toMatch(/^[a-z_0-9]+$/);
    await Promise.resolve();
    expect(calls.filter((c) => c.path.endsWith('/bootstrap'))).toHaveLength(want.recheck ? 2 : 1);
  });

  describe('timeout and cancellation', () => {
    beforeEach(() => void vi.useFakeTimers());
    afterEach(() => void vi.useRealTimers());

    it('the internal 30 s timeout is a timeout envelope with the request id, not an AbortError', async () => {
      const { adapter, sent } = await ready(hang);
      const pending = adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(sent()).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      const result = await pending;
      expect(result).toEqual({ outcome: 'timeout', data: null, assessments: [], trust: null, correlationId: sent()[0]!.headers['X-Correlation-Id'], message: 'client_timeout' });
    });

    it('timeoutMs is configurable', async () => {
      const { adapter } = await ready(hang, { timeoutMs: 1000 });
      const pending = adapter.menuQuery(QUERY);
      await vi.advanceTimersByTimeAsync(1000);
      expect((await pending).message).toBe('client_timeout');
    });

    it('a non-envelope read rejects on the internal timeout with a non-AbortError', async () => {
      const { adapter } = await ready(hang);
      const pending = adapter.validateScope('fab-a');
      const settled = pending.catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(30_000);
      const error = await settled;
      expect(error).toBeInstanceOf(TransportError);
      expect(error).toMatchObject({ code: 'client_timeout' });
      expect((error as Error).name).not.toBe('AbortError');
    });

    it('Kernel abort rejects with an AbortError and is not an outcome', async () => {
      const { adapter } = await ready(hang);
      const kernel = new AbortController();
      const pending = adapter.menuQuery(QUERY, kernel.signal);
      const settled = pending.catch((e: unknown) => e);
      kernel.abort();
      expect((await settled as Error).name).toBe('AbortError');
    });

    it('a Kernel signal already aborted sends nothing', async () => {
      const { adapter, sent } = await ready(hang);
      const kernel = new AbortController();
      kernel.abort();
      await expect(adapter.menuQuery(QUERY, kernel.signal)).rejects.toMatchObject({ name: 'AbortError' });
      expect(sent()).toHaveLength(0);
    });

    it('the Kernel signal is judged by kernelSignal.aborted: abort after the timeout fired is still a timeout', async () => {
      const { adapter } = await ready(hang);
      const kernel = new AbortController();
      const pending = adapter.menuQuery(QUERY, kernel.signal);
      await vi.advanceTimersByTimeAsync(30_000);
      expect((await pending).outcome).toBe('timeout');
      kernel.abort();
    });

    it('removes its Kernel listener once the call settles', async () => {
      const { adapter } = await ready(() => json(ENVELOPE));
      const kernel = new AbortController();
      const remove = vi.spyOn(kernel.signal, 'removeEventListener');
      await adapter.menuQuery(QUERY, kernel.signal);
      expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    });
  });
});

describe('non-envelope reads reject (contract §2.2)', () => {
  const failures: [string, Handler, string][] = [
    ['network', () => { throw new TypeError('x'); }, 'network_error'],
    ['401', () => new Response('', { status: 401 }), 'session_expired'],
    ['404', () => new Response('', { status: 404 }), 'http_404'],
    ['422', () => new Response('', { status: 422 }), 'http_422'],
    ['500', () => new Response('', { status: 500 }), 'http_500'],
    ['non-JSON 200', () => new Response('nope', { status: 200 }), 'invalid_response'],
    ['JSON 200 of the wrong shape', () => json({ unexpected: true }), 'invalid_response'],
  ];

  it.each(failures)('validateScope: %s', async (_name, handler, code) => {
    const { adapter } = await ready(handler);
    const error = await adapter.validateScope('fab-a').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ code, message: code });
    expect((error as Error).name).not.toBe('AbortError');
  });

  it('a 401 on a plain read starts a session re-check', async () => {
    const { adapter, calls } = await ready(() => new Response('', { status: 401 }));
    await adapter.contextOptions('fab-a').catch(() => undefined);
    expect(calls.filter((c) => c.path.endsWith('/bootstrap'))).toHaveLength(2);
  });

  it('Kernel abort rejects with an AbortError', async () => {
    const { adapter } = await ready(hang);
    const kernel = new AbortController();
    const settled = adapter.evaluateSelection({} as never, kernel.signal).catch((e: unknown) => e);
    kernel.abort();
    expect((await settled as Error).name).toBe('AbortError');
  });
});

describe('selection ports: a judged 4xx is a PortError, transport failures are not (contract §1, §2.2)', () => {
  const call = (a: Awaited<ReturnType<typeof ready>>['adapter']) => a.listAxisOptions({ scopeId: 'fab-a', axisId: 'room', limit: 5 });

  it.each([
    [400, 'invalid_cursor', 'bad cursor', 'cursor'],
    [400, 'unknown_axis', 'no such axis', 'axisId'],
    [403, 'scope_forbidden', 'nope', undefined],
    [403, 'room_forbidden', 'nope', undefined],
    [404, 'unknown_scope', 'who', undefined],
  ] as const)('%i %s', async (status, code, message, field) => {
    const { adapter } = await ready(() => json({ code, message, ...(field ? { field } : {}) }, { status }));
    const error = await call(adapter).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PortError);
    expect(error).toMatchObject({ code, message, field });
  });

  it.each(['searchEquipment', 'resolveSelection'] as const)('%s maps the same way', async (method) => {
    const { adapter } = await ready(() => json({ code: 'invalid_input', message: 'bad', field: 'limit' }, { status: 400 }));
    const error = await (method === 'searchEquipment' ? adapter.searchEquipment({ scopeId: 'a', limit: 1 } as never) : adapter.resolveSelection({ scopeId: 'a', ids: [] })).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PortError);
  });

  it.each<[string, Handler, string]>([
    ['a 404 that is not a port error body (route missing)', () => new Response('<html>', { status: 404 }), 'http_404'],
    ['a 4xx with an unknown code', () => json({ code: 'who_knows', message: 'x' }, { status: 400 }), 'http_400'],
    ['a 500', () => json({ code: 'invalid_input', message: 'x' }, { status: 500 }), 'http_500'],
    ['a 401', () => json({ code: 'scope_forbidden', message: 'x' }, { status: 401 }), 'session_expired'],
    ['a network failure', () => { throw new TypeError('x'); }, 'network_error'],
    ['a 200 of the wrong shape', () => json({ nope: 1 }), 'invalid_response'],
    ['a 200 that is not JSON', () => new Response('x'), 'invalid_response'],
  ])('%s rejects with a TransportError', async (_name, handler, code) => {
    const { adapter } = await ready(handler);
    const error = await call(adapter).catch((e: unknown) => e);
    expect(error).not.toBeInstanceOf(PortError);
    expect(error).toBeInstanceOf(TransportError);
    expect(error).toMatchObject({ code });
  });

  it('a successful empty page resolves as is', async () => {
    const { adapter } = await ready(() => json({ items: [], nextCursor: null }));
    expect(await call(adapter)).toEqual({ items: [], nextCursor: null });
  });

  it('a timeout rejects with a non-AbortError', async () => {
    vi.useFakeTimers();
    try {
      const { adapter } = await ready(hang);
      const settled = call(adapter).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(30_000);
      const error = await settled;
      expect(error).toMatchObject({ code: 'client_timeout' });
      expect((error as Error).name).not.toBe('AbortError');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Kernel abort rejects with an AbortError', async () => {
    const { adapter } = await ready(hang);
    const kernel = new AbortController();
    const settled = adapter.resolveSelection({ scopeId: 'a', ids: [] }, kernel.signal).catch((e: unknown) => e);
    kernel.abort();
    expect((await settled as Error).name).toBe('AbortError');
  });
});

describe('fire-and-forget (contract §2.2, §5)', () => {
  it('recordUsage resolves the server count', async () => {
    const { adapter } = await ready(() => json({ accepted: 3 }));
    expect(await adapter.recordUsage([])).toEqual({ accepted: 3 });
  });

  it('a 422 is a judged rejection and resolves accepted 0 / false', async () => {
    const { adapter } = await ready(() => new Response('{}', { status: 422 }));
    expect(await adapter.recordUsage([])).toEqual({ accepted: 0 });
    expect(await adapter.reportClientError({ correlationId: 'client-1', menuId: 'm', spaceId: null, path: '/m', name: 'Error' })).toEqual({ accepted: false });
  });

  it('a 200 {accepted: 0} stays a resolved rejection', async () => {
    const { adapter } = await ready(() => json({ accepted: 0 }));
    expect(await adapter.recordUsage([])).toEqual({ accepted: 0 });
  });

  it.each<[string, Handler, string]>([
    ['500', () => new Response('', { status: 500 }), 'http_500'],
    ['network', () => { throw new TypeError('x'); }, 'network_error'],
    ['401', () => new Response('', { status: 401 }), 'session_expired'],
    ['bad body', () => json({ nope: 1 }), 'invalid_response'],
  ])('%s rejects and is not retried', async (_name, handler, code) => {
    const { adapter, sent } = await ready(handler);
    await expect(adapter.recordUsage([])).rejects.toMatchObject({ code });
    await expect(adapter.reportClientError({ correlationId: 'client-1', menuId: 'm', spaceId: null, path: '/m', name: 'Error' })).rejects.toMatchObject({ code });
    expect(sent()).toHaveLength(2);
  });

  it('uses the 10 s fire-and-forget timeout, not the 30 s one', async () => {
    vi.useFakeTimers();
    try {
      const { adapter } = await ready(hang);
      const settled = adapter.recordUsage([]).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(10_000);
      expect(await settled).toMatchObject({ code: 'client_timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('fireAndForgetTimeoutMs is configurable', async () => {
    vi.useFakeTimers();
    try {
      const { adapter } = await ready(hang, { fireAndForgetTimeoutMs: 200 });
      const settled = adapter.reportClientError({ correlationId: 'client-1', menuId: 'm', spaceId: null, path: '/m', name: 'Error' }).catch((e: unknown) => e);
      await vi.advanceTimersByTimeAsync(200);
      expect(await settled).toMatchObject({ code: 'client_timeout' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('recordUsage is keepalive, reportClientError is not', async () => {
    const { adapter, sent } = await ready(() => json({ accepted: true }));
    await adapter.recordUsage([]).catch(() => undefined);
    await adapter.reportClientError({ correlationId: 'client-1', menuId: 'm', spaceId: null, path: '/m', name: 'Error' });
    expect(sent().map((c) => c.init.keepalive)).toEqual([true, undefined]);
  });
});
