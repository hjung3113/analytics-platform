import type { PlatformAdapter } from '@ap/contracts';
import { bootstrapHttpAdapter, type HttpAdapterOptions } from '../index.js';

export type Call = {
  method: string;
  url: string;
  path: string;
  search: string;
  headers: Record<string, string>;
  body: unknown;
  init: RequestInit;
};

export const json = (body: unknown, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

export const ENVELOPE = { outcome: 'ok', data: { rows: 1 }, assessments: [], trust: null, correlationId: 'srv-1' };
export const ACTION_OK = { outcome: 'ok', data: { id: 'a' }, version: 'v2', fieldErrors: [], replayed: false, correlationId: 'srv-2' };

export const bootstrapBody = (sessionVersion = 'v1', csrfToken = 't1') => ({
  session: { user: { id: 'u1', name: 'User', title: { ko: '사용자', en: 'User' }, permissions: [] }, scopes: [] },
  publishedMetrics: [{ metricId: 'm1', publishedVersion: '1' }],
  defaultRangeTo: '2026-10-02T09:00:00',
  sessionVersion,
  csrfToken,
});

/** A `Response` whose `type` is `opaqueredirect` (a real one cannot be built by hand). */
export const opaqueRedirect = (): Response =>
  ({ type: 'opaqueredirect', status: 0, ok: false, headers: new Headers(), text: async () => '' }) as unknown as Response;

/** Rejects when the request is aborted, like a real `fetch` that is still waiting. */
export const hang = (call: Call): Promise<Response> =>
  new Promise((_resolve, reject) => {
    call.init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
  });

export type Handler = (call: Call) => Response | Promise<Response>;

export function server(handler: Handler) {
  const calls: Call[] = [];
  const fetchFn = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const raw = String(input);
    const url = new URL(raw, 'http://localhost');
    const call: Call = {
      method: String(init.method ?? 'GET'),
      url: raw,
      path: url.pathname,
      search: url.search,
      headers: (init.headers ?? {}) as Record<string, string>,
      body: typeof init.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
      init,
    };
    calls.push(call);
    return handler(call);
  }) as typeof fetch;
  return {
    calls,
    fetch: fetchFn,
    /** Calls other than bootstrap/session-state: what the adapter method itself sent. */
    sent: () => calls.filter((c) => !c.path.endsWith('/platform/bootstrap') && !c.path.endsWith('/platform/session-state')),
    count: (suffix: string) => calls.filter((c) => c.path.endsWith(suffix)).length,
  };
}

/** Bootstrap answers 200 with `bootstrapBody`; everything else goes to `handler`. */
export async function ready(handler: Handler, options: HttpAdapterOptions = {}, boot: () => Response = () => json(bootstrapBody())) {
  const s = server((call) => (call.path === '/api/v1/platform/bootstrap' ? boot() : handler(call)));
  const result = await bootstrapHttpAdapter({ fetch: s.fetch, ...options });
  if (result.kind !== 'ready') throw new Error(`bootstrap was ${result.kind}`);
  const adapter: PlatformAdapter = result.adapter;
  return { adapter, ...s };
}
