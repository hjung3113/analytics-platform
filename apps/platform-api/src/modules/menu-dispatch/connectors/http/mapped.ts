import { MenuUpstreamError, normalizeMenuUpstreamBaseUrl } from '../../forwarder.js';
import { JsonRows } from './json-rows.js';
import type { ConnectorFactory } from '../types.js';
import { TargetJudgmentTimeout } from '../types.js';

/** Per-response cap before JSON parsing (8 MiB); independent of the row count cap. */
export const HTTP_RESPONSE_BYTE_CAP = 8 * 1024 * 1024;
export class InvalidHttpPath extends MenuUpstreamError {
  constructor() { super('unavailable'); this.name = 'InvalidHttpPath'; }
}

export function createHttpConnector({ fetch: fetchImpl = fetch, byteCap = HTTP_RESPONSE_BYTE_CAP }: { fetch?: typeof fetch; byteCap?: number } = {}): ConnectorFactory {
  return (target, secrets) => {
    if (target.kind !== 'http') throw new MenuUpstreamError('unavailable');
    const baseUrl = normalizeMenuUpstreamBaseUrl(target.baseUrl);
    return {
      async *query(leg, options) {
        const { call } = leg;
        if (!('mode' in call) || call.mode !== 'mapped') throw new MenuUpstreamError('unavailable');
        const path = call.path.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, key: string) => {
          const value = leg.bindings.pathParams?.[key];
          if (!['string', 'number', 'boolean'].includes(typeof value) || ['', '.', '..'].includes(String(value))) throw new InvalidHttpPath();
          try { return encodeURIComponent(String(value)); } catch { throw new InvalidHttpPath(); }
        });
        const destination = new URL(`${baseUrl}${path}`);
        for (const [key, value] of Object.entries(leg.bindings.query ?? {})) {
          if (value === null || value === undefined) continue;
          if (Array.isArray(value)) {
            if (call.arrayStyle?.mode === 'join') destination.searchParams.append(key, value.map(String).join(call.arrayStyle.separator));
            else for (const item of value) destination.searchParams.append(key, String(item));
          } else destination.searchParams.append(key, String(value));
        }
        const controller = new AbortController();
        let failure: Error | undefined;
        const stop = (reason: Error) => { if (!failure) { failure = reason; controller.abort(); } };
        const callerAbort = () => stop(new MenuUpstreamError(options.signal.reason instanceof MenuUpstreamError && options.signal.reason.kind === 'timeout' ? 'timeout' : 'unavailable'));
        options.signal.addEventListener('abort', callerAbort, { once: true });
        if (options.signal.aborted) callerAbort();
        const timer = setTimeout(() => stop(new TargetJudgmentTimeout()), options.deadlineMs);
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        let rejectAbort: () => void = () => {};
        const aborted = new Promise<never>((_resolve, reject) => {
          rejectAbort = () => reject(failure ?? new MenuUpstreamError('unavailable'));
          controller.signal.addEventListener('abort', rejectAbort, { once: true });
          if (controller.signal.aborted) rejectAbort();
        });
        void aborted.catch(() => {});
        try {
          const headers: Record<string, string> = { 'content-type': 'application/json' };
          if (secrets?.kind === 'http') for (const [key, secret] of Object.entries(secrets.headers)) {
            if (key.toLowerCase() === 'x-internal-identity') throw new MenuUpstreamError('unavailable');
            headers[key] = secret.reveal();
          }
          const response = await Promise.race([fetchImpl(destination.href, {
            method: call.method, redirect: 'error', headers, signal: controller.signal,
            ...(call.method === 'POST' ? { body: JSON.stringify(leg.bindings.body ?? {}) } : {}),
          }), aborted]);
          if (!response.ok || !response.body) throw new MenuUpstreamError('unavailable');
          reader = response.body.getReader();
          const parser = new JsonRows(call.response.rows ?? '');
          const decoder = new TextDecoder('utf-8', { fatal: true });
          let bytes = 0;
          let count = 0;
          for (;;) {
            if (failure) throw failure;
            const item = await Promise.race([reader.read(), aborted]);
            if (failure) throw failure;
            if (!item.done) {
              bytes += item.value.byteLength;
              if (bytes > byteCap) throw new MenuUpstreamError('unavailable');
            }
            const text = decoder.decode(item.value, { stream: !item.done });
            for (const row of parser.write(text, item.done)) {
              if (failure) throw failure;
              count++;
              if (count === options.rowCap) {
                // Cancel before yielding: callers may suspend or immediately return at overflow.
                controller.signal.removeEventListener('abort', rejectAbort);
                controller.abort();
                void reader.cancel().catch(() => {});
                yield row;
                return;
              }
              yield row;
            }
            if (item.done) break;
          }
        } catch (error) {
          if (failure) throw failure;
          if (error instanceof TargetJudgmentTimeout) throw error;
          throw new MenuUpstreamError('unavailable');
        } finally {
          clearTimeout(timer);
          options.signal.removeEventListener('abort', callerAbort);
          controller.signal.removeEventListener('abort', rejectAbort);
          controller.abort();
          void reader?.cancel().catch(() => {});
        }
      },
    };
  };
}
