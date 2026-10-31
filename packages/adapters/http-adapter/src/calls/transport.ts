import { isSafeCorrelationId, newRequestId } from './correlation.js';

export type SendRequest = {
  method: 'GET' | 'POST';
  /** Absolute path under the base, e.g. `/api/v1/platform/bootstrap`. */
  path: string;
  query?: Readonly<Record<string, string | undefined>>;
  body?: unknown;
  headers?: Readonly<Record<string, string>>;
  /** Kernel cancellation. Only this signal means "cancelled"; the internal timeout never does. */
  signal?: AbortSignal;
  timeoutMs: number;
  keepalive?: boolean;
  /** Sent as `X-Correlation-Id` instead of a fresh id (the client-error report's own id, contract §7). */
  correlationId?: string;
};

/** What came back, before any port-specific meaning. `correlationId` is the response header id, else the request id. */
export type Raw =
  | { kind: 'response'; status: number; ok: boolean; correlationId: string; text: string; retryAfterSeconds?: number }
  | { kind: 'redirect'; correlationId: string }
  | { kind: 'timeout'; correlationId: string }
  | { kind: 'network'; correlationId: string }
  | { kind: 'aborted' };

export type Transport = { send(request: SendRequest): Promise<Raw> };

export type TransportConfig = { fetch: typeof fetch; base: string };

export function createTransport({ fetch: fetchImpl, base }: TransportConfig): Transport {
  return {
    async send(request) {
      const requestId = request.correlationId ?? newRequestId();
      // A first-argument `signal` port (readPreferences, listNotices) can be called by a drift probe with a placeholder: only a real signal is linked.
      const kernelSignal = typeof request.signal?.addEventListener === 'function' ? request.signal : undefined;
      if (kernelSignal?.aborted) return { kind: 'aborted' };

      // Manual link instead of AbortSignal.any (not in every in-house browser, #151): the timeout is ours and is
      // never an AbortError; cancellation is judged by `kernelSignal.aborted` alone.
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, request.timeoutMs);
      const onKernelAbort = () => controller.abort();
      kernelSignal?.addEventListener('abort', onKernelAbort, { once: true });

      const headers: Record<string, string> = { Accept: 'application/json', 'X-Correlation-Id': requestId, ...request.headers };
      if (request.body !== undefined) headers['Content-Type'] = 'application/json';

      try {
        const response = await fetchImpl(buildUrl(base, request.path, request.query), {
          method: request.method,
          headers,
          body: request.body === undefined ? undefined : JSON.stringify(request.body),
          signal: controller.signal,
          credentials: 'same-origin',
          redirect: 'manual',
          ...(request.keepalive ? { keepalive: true } : {}),
        });
        if (response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400)) {
          return { kind: 'redirect', correlationId: requestId };
        }
        const headerId = response.headers.get('X-Correlation-Id');
        const retryAfterSeconds = parseRetryAfter(response.headers.get('Retry-After'));
        const text = await response.text();
        return {
          kind: 'response',
          status: response.status,
          ok: response.status >= 200 && response.status < 300,
          correlationId: isSafeCorrelationId(headerId) ? headerId : requestId,
          text,
          ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
        };
      } catch {
        if (kernelSignal?.aborted) return { kind: 'aborted' };
        return { kind: timedOut ? 'timeout' : 'network', correlationId: requestId };
      } finally {
        clearTimeout(timer);
        kernelSignal?.removeEventListener('abort', onKernelAbort);
      }
    },
  };
}

function buildUrl(base: string, path: string, query: SendRequest['query']): string {
  if (!query) return `${base}${path}`;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== undefined) params.set(key, value);
  const search = params.toString();
  return search === '' ? `${base}${path}` : `${base}${path}?${search}`;
}

/** `Retry-After` as delay-seconds only — a non-negative integer of seconds. The HTTP-date form and anything else stay absent. */
function parseRetryAfter(header: string | null): number | undefined {
  if (header === null || !/^\d+$/.test(header)) return undefined;
  const seconds = Number(header);
  return Number.isFinite(seconds) ? seconds : undefined;
}

export type Parsed = { ok: true; value: unknown } | { ok: false };

export function parseJson(text: string): Parsed {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

/** Kernel cancellation surfaces as a rejection the Kernel discards (superseded), never as an outcome. */
export function abortError(): Error {
  return new DOMException('The operation was aborted.', 'AbortError');
}
