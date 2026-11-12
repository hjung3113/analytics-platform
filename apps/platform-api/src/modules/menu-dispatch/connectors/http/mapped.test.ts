import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTargetSecrets, TargetSecret } from '../../bundle/secrets.js';
import { expect, it, vi } from 'vitest';
import type { Routing } from '../../declarations-file.js';
import type { ConnectorLeg } from '../types.js';
import { MenuUpstreamError } from '../../forwarder.js';
import { TargetJudgmentTimeout } from '../types.js';
import { createHttpConnector } from './mapped.js';

async function collect(rows: AsyncIterable<unknown>): Promise<unknown[]> {
  const result: unknown[] = [];
  for await (const row of rows) result.push(row);
  return result;
}

const leg = (value: string): ConnectorLeg => ({ targetId: 'syn-http', site: 'S1', rooms: ['R1'], call: { mode: 'mapped', method: 'GET', path: '/rows/{key}', pathParams: { key: 'params.key' }, response: {} }, bindings: { pathParams: { key: value } } });
it('encodes each path value as a whole segment, keeping the target host and scheme', async () => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response('[{"id":1}]'));
  const connector = createHttpConnector({ fetch: fetchImpl })({ kind: 'http', baseUrl: 'https://synthetic.test/base' }, undefined);
  expect(await collect(connector.query(leg('/?#%한'), { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 }))).toEqual([{ id: 1 }]);
  expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://synthetic.test/base/rows/%2F%3F%23%25%ED%95%9C');
});

it.each(['', '.', '..'])('refuses invalid segment %j before fetching', async (value) => {
  const fetchImpl = vi.fn<typeof fetch>();
  const connector = createHttpConnector({ fetch: fetchImpl })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  await expect(collect(connector.query(leg(value), { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 }))).rejects.toMatchObject({ name: 'InvalidHttpPath', message: 'menu-query upstream is unavailable' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
it.each([{ mode: 'repeat' }, { mode: 'join', separator: '|' }] as const)('serializes query arrays with $mode and POST body bindings', async (arrayStyle) => {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{"rows":[1]}'));
  const connector = createHttpConnector({ fetch: fetchImpl })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const request: ConnectorLeg = { ...leg('key'), call: { mode: 'mapped', method: 'POST', path: '/rows', query: { rooms: 'scope.rooms' }, body: { site: 'scope.site' }, arrayStyle, response: { rows: '/rows' } }, bindings: { query: { rooms: ['R/1', 'R?2'] }, body: { site: 'S1' } } };
  expect(await collect(connector.query(request, { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 }))).toEqual([1]);
  expect(fetchImpl.mock.calls[0]?.[0]).toBe(arrayStyle.mode === 'repeat' ? 'https://synthetic.test/rows?rooms=R%2F1&rooms=R%3F2' : 'https://synthetic.test/rows?rooms=R%2F1%7CR%3F2');
  expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: '{"site":"S1"}', redirect: 'error', headers: { 'content-type': 'application/json' } });
});
it.each([
  ['non-2xx', () => new Response('syn-upstream-private', { status: 500 })],
  ['non-JSON', () => new Response('syn-upstream-private')],
  ['non-array', () => new Response('{"syn-upstream-private":true}')],
  ['redirect', () => { throw new Error('syn-upstream-private redirect'); }],
] as const)('sanitizes %s failures', async (_kind, response) => {
  const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => { expect(init?.redirect).toBe('error'); return response(); });
  const connector = createHttpConnector({ fetch: fetchImpl })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const error: unknown = await collect(connector.query(leg('key'), { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 })).catch((error: unknown) => error);
  expect(error).toMatchObject({ kind: 'unavailable', httpStatus: 502, message: 'menu-query upstream is unavailable' });
  expect(error).not.toHaveProperty('cause');
  expect(String(error)).not.toContain('syn-upstream-private');
});
it('counts response bytes and aborts the request at the cap before reading further', async () => {
  let signal: AbortSignal | null | undefined;
  const cancelled = vi.fn();
  let pulls = 0;
  const connector = createHttpConnector({ byteCap: 8, fetch: async (_url, init) => {
    signal = init?.signal;
    return new Response(new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new TextEncoder().encode('123456789')); }, cancel: cancelled }));
  } })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  await expect(collect(connector.query(leg('key'), { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 }))).rejects.toMatchObject({ httpStatus: 502 });
  expect(signal?.aborted).toBe(true); expect(cancelled).toHaveBeenCalledOnce(); expect(pulls).toBeLessThanOrEqual(2);
});
it('yields only rowCap rows and aborts fetch on iterator return', async () => {
  let signal: AbortSignal | null | undefined;
  const connector = createHttpConnector({ fetch: async (_url, init) => { signal = init?.signal; return new Response('[1,2,3,4]'); } })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const iterator = connector.query(leg('key'), { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 })[Symbol.asyncIterator]();
  expect(await iterator.next()).toMatchObject({ value: 1 }); expect(await iterator.next()).toMatchObject({ value: 2 });
  await iterator.return?.(); expect(signal?.aborted).toBe(true);
});
it.each(['judgment', 'core', 'caller'] as const)('classifies %s cancellation by its own mechanism, never error text', async (kind) => {
  vi.useFakeTimers();
  const controller = new AbortController();
  let upstreamSignal: AbortSignal | null | undefined;
  const connector = createHttpConnector({ fetch: async (_url, init) => {
    upstreamSignal = init?.signal;
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('timeout unavailable syn-private')), { once: true }));
  } })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  try {
    const result = collect(connector.query(leg('key'), { signal: controller.signal, deadlineMs: 100, rowCap: 2 })).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    if (kind === 'core') controller.abort(new MenuUpstreamError('timeout'));
    else if (kind === 'caller') controller.abort(new Error('timeout syn-private'));
    else await vi.advanceTimersByTimeAsync(100);
    const error = await result;
    expect(error).toEqual(kind === 'judgment' ? new TargetJudgmentTimeout() : new MenuUpstreamError(kind === 'core' ? 'timeout' : 'unavailable'));
    expect(error).not.toHaveProperty('cause'); expect(upstreamSignal?.aborted).toBe(true);
  } finally { vi.useRealTimers(); }
});
it('covers a stalled response body with the judgment timer', async () => {
  const connector = createHttpConnector({ fetch: async () => new Response(new ReadableStream({ start() {} })) })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  await expect(collect(connector.query(leg('key'), { signal: new AbortController().signal, deadlineMs: 5, rowCap: 2 }))).rejects.toEqual(new TargetJudgmentTimeout());
});
it('uses static headers loaded from secret files without emitting them or an identity token', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'syn-http-secret-'));
  const secret = join(dir, 'header');
  const log = vi.spyOn(console, 'info').mockImplementation(() => {});
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  try {
    await writeFile(secret, 'syn-private-header');
    const target = { kind: 'http', baseUrl: 'https://synthetic.test', headers: { 'x-syn-key': { file: secret } } } as const;
    const secrets = await readTargetSecrets({ 'syn-http': target });
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('[]'));
    const connector = createHttpConnector({ fetch: fetchImpl })(target, secrets['syn-http']);
    await collect(connector.query(leg('key'), { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 }));
    expect(fetchImpl.mock.calls[0]?.[1]?.headers).toEqual({ 'content-type': 'application/json', 'x-syn-key': 'syn-private-header' });
    expect(log).not.toHaveBeenCalled(); expect(warn).not.toHaveBeenCalled(); expect(error).not.toHaveBeenCalled();
    expect(JSON.stringify(secrets)).not.toContain('syn-private-header');
  } finally { log.mockRestore(); warn.mockRestore(); error.mockRestore(); await rm(dir, { recursive: true, force: true }); }
});
it('sanitizes a pre-aborted caller even if a reserved identity header is declared', async () => {
  const controller = new AbortController(); controller.abort(new Error('syn-private timeout'));
  const fetchImpl = vi.fn<typeof fetch>();
  const connector = createHttpConnector({ fetch: fetchImpl })({ kind: 'http', baseUrl: 'https://synthetic.test' }, { kind: 'http', headers: { 'x-internal-identity': new TargetSecret('syn-private-identity') } });
  await expect(collect(connector.query(leg('key'), { signal: controller.signal, deadlineMs: 1000, rowCap: 2 }))).rejects.toEqual(new MenuUpstreamError('unavailable'));
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('returns too_large and cancels a stalled tail before the judgment timer or EOF', async () => {
  const { handleRouted } = await import('../../routed-handler.js');
  const { runQuery } = await import('../../query.js');
  const cancelled = vi.fn();
  let signal: AbortSignal | null | undefined;
  const factory = createHttpConnector({ fetch: async (_url, init) => {
    signal = init?.signal;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('[{"id":1},{"id":2},{"id":3},')); }, cancel: cancelled }));
  } });
  const endpoint = { id: 'syn.rows', menuId: 'syn', permission: 'platform:view', paramKeys: [], requiresScope: false, context: {}, mergeTimeDomain: false, limits: { maxRows: 2 } };
  const owner: Routing = { call: { mode: 'mapped', method: 'GET', path: '/rows', response: {} }, routes: [{ targets: ['t1'] }], unroutedRooms: 'error' };
  vi.useFakeTimers();
  try {
    let result: unknown;
    const actor = { actor_id: 'syn-actor', workspace_id: 'syn-workspace', role_level: 'user' } as const;
    const pending = runQuery({ ok: true, context: {}, params: {}, declaration: {
      spec: endpoint, authorize: async () => true, validate: () => ({ ok: true }),
      handle: (args) => handleRouted(endpoint, owner, { endpoints: [endpoint], actions: [], permissions: [], targets: { t1: { kind: 'http', baseUrl: 'https://syn.test' } }, endpointOwners: { 'syn.rows': owner } }, { connectorFactories: { http: factory }, timeoutMs: 3000 }, args),
    } }, actor, 'syn-cid').then((value) => { result = value; });
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toMatchObject({ outcome: 'too_large', data: null });
    expect(signal?.aborted).toBe(true);
    expect(cancelled).toHaveBeenCalledOnce();
    await pending;
  } finally { vi.useRealTimers(); }
});

it.each([1, 2, 7, 1024])('streams nested escaped pointers across %i-byte chunks without collecting siblings', async (chunkSize) => {
  const body = new TextEncoder().encode('{"skip":[{"rows":[0]}],"a/b":{"~rows":[{"text":"한글 \\" \\u0041","nested":[true,null,-1.25e2]},"x",false,null,2]},"tail":true}');
  const connector = createHttpConnector({ fetch: async () => new Response(new ReadableStream({ start(controller) {
    for (let offset = 0; offset < body.length; offset += chunkSize) controller.enqueue(body.slice(offset, offset + chunkSize));
    controller.close();
  } })) })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const request: ConnectorLeg = { ...leg('key'), call: { mode: 'mapped', method: 'GET', path: '/rows', response: { rows: '/a~1b/~0rows' } } };
  expect(await collect(connector.query(request, { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 10 }))).toEqual([{ text: '한글 " A', nested: [true, null, -125] }, 'x', false, null, 2]);
});
it.each(['[1,]', '[1}', '[{"x":1,}]', '[01]', '[true false]', '["bad\\q"]', '{"rows":[]}{}', '{"rows":[1]', '{"other":[]}'])('sanitizes malformed or missing selected JSON rows: %s', async (body) => {
  const connector = createHttpConnector({ fetch: async () => new Response(body) })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const request: ConnectorLeg = { ...leg('key'), call: { mode: 'mapped', method: 'GET', path: '/rows', response: { rows: body.startsWith('{') ? '/rows' : '' } } };
  await expect(collect(connector.query(request, { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 10 }))).rejects.toEqual(new MenuUpstreamError('unavailable'));
});
it('discards buffered rows and a partial row on caller cancellation', async () => {
  const caller = new AbortController();
  const cancelled = vi.fn();
  const connector = createHttpConnector({ fetch: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('[{"id":1},{"id":2},{"partial":')); }, cancel: cancelled })) })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const iterator = connector.query(leg('key'), { signal: caller.signal, deadlineMs: 1000, rowCap: 10 })[Symbol.asyncIterator]();
  expect(await iterator.next()).toMatchObject({ value: { id: 1 } });
  caller.abort();
  await expect(iterator.next()).rejects.toEqual(new MenuUpstreamError('unavailable'));
  expect(await iterator.next()).toMatchObject({ done: true });
  expect(cancelled).toHaveBeenCalledOnce();
});
it('cancels fetch at rowCap even while the consumer is suspended on the last row', async () => {
  const cancelled = vi.fn();
  let signal: AbortSignal | null | undefined;
  const connector = createHttpConnector({ fetch: async (_url, init) => { signal = init?.signal; return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('[1,2,3,')); }, cancel: cancelled })); } })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const iterator = connector.query(leg('key'), { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 2 })[Symbol.asyncIterator]();
  expect(await iterator.next()).toMatchObject({ value: 1 });
  expect(await iterator.next()).toMatchObject({ value: 2 });
  expect(signal?.aborted).toBe(true); expect(cancelled).toHaveBeenCalledOnce();
  expect(await iterator.next()).toMatchObject({ done: true });
});

it.each(['{"outer":[{"rows":[]}]}', '{"outer":[{"rows":[[1],{"id":2}]}]}'])('selects arrays through object and array pointer segments: %s', async (body) => {
  const connector = createHttpConnector({ fetch: async () => new Response(body) })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const request: ConnectorLeg = { ...leg('key'), call: { mode: 'mapped', method: 'GET', path: '/rows', response: { rows: '/outer/0/rows' } } };
  expect(await collect(connector.query(request, { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 10 }))).toEqual(body.includes('"id"') ? [[1], { id: 2 }] : []);
});
it('keeps counting bytes after selected nested rows end', async () => {
  const cancelled = vi.fn();
  const connector = createHttpConnector({ byteCap: 40, fetch: async () => new Response(new ReadableStream({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"data":{"rows":[1]},"tail":"'));
    controller.enqueue(new TextEncoder().encode('x'.repeat(41)));
  }, cancel: cancelled })) })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const request: ConnectorLeg = { ...leg('key'), call: { mode: 'mapped', method: 'GET', path: '/rows', response: { rows: '/data/rows' } } };
  await expect(collect(connector.query(request, { signal: new AbortController().signal, deadlineMs: 1000, rowCap: 10 }))).rejects.toEqual(new MenuUpstreamError('unavailable'));
  expect(cancelled).toHaveBeenCalledOnce();
});
it('cancels a pending read without yielding an incomplete row', async () => {
  const caller = new AbortController();
  const cancelled = vi.fn();
  const connector = createHttpConnector({ fetch: async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('[{"partial":')); }, cancel: cancelled })) })({ kind: 'http', baseUrl: 'https://synthetic.test' }, undefined);
  const iterator = connector.query(leg('key'), { signal: caller.signal, deadlineMs: 1000, rowCap: 10 })[Symbol.asyncIterator]();
  const pending = iterator.next();
  caller.abort();
  await expect(pending).rejects.toEqual(new MenuUpstreamError('unavailable'));
  expect(await iterator.next()).toMatchObject({ done: true });
  expect(cancelled).toHaveBeenCalledOnce();
});
