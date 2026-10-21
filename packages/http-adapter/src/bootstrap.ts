import type { PlatformAdapter } from '@ap/contracts';
import { createHttpAdapter } from './adapter.js';
import { newRequestId } from './correlation.js';
import { createSessionStore, readBootstrap } from './session.js';
import { createTransport } from './transport.js';

export type HttpAdapterOptions = {
  fetch?: typeof fetch;
  /** Origin prefix of every request; `''` (default) is the same origin. */
  base?: string;
  /** `session-state` poll interval while someone is subscribed. Default 5 min. */
  pollMs?: number;
  /** Envelope and plain calls. Default 30 s. */
  timeoutMs?: number;
  /** `recordUsage`, `reportClientError`. Default 10 s. */
  fireAndForgetTimeoutMs?: number;
  /** The session is gone and a re-bootstrap answered 401: the host sends the person to log in. */
  onSessionLost?: () => void;
};

export type BootstrapResult =
  | { kind: 'ready'; adapter: PlatformAdapter }
  | { kind: 'login' }
  | { kind: 'unavailable'; correlationId: string };

/**
 * Reads `GET /api/v1/platform/bootstrap` and, when it answers, returns the adapter. Never rejects: the host picks
 * the screen from `kind` (contract §3).
 */
export async function bootstrapHttpAdapter(options: HttpAdapterOptions = {}): Promise<BootstrapResult> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  try {
    const transport = createTransport({ fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)), base: options.base ?? '' });
    const read = await readBootstrap(transport, timeoutMs);
    if (read.kind === 'login') return { kind: 'login' };
    if (read.kind === 'failed') return { kind: 'unavailable', correlationId: read.correlationId || newRequestId() };
    const store = createSessionStore(read.payload, { transport, pollMs: options.pollMs ?? 300_000, timeoutMs, onSessionLost: options.onSessionLost });
    const adapter = createHttpAdapter({ transport, store, timeoutMs, fireAndForgetTimeoutMs: options.fireAndForgetTimeoutMs ?? 10_000 });
    return { kind: 'ready', adapter };
  } catch {
    return { kind: 'unavailable', correlationId: newRequestId() };
  }
}
