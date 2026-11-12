import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTargetSecrets, TargetSecret } from '../../bundle/secrets.js';
import { expect, it, vi } from 'vitest';
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
