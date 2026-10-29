import type { PlatformAdapter, SavedViewStore } from '@ap/contracts';
import { createHttpAdapter } from '../adapter.js';
import { newRequestId } from '../calls/correlation.js';
import { createSessionStore, readBootstrap } from './session.js';
import { createTransport } from '../calls/transport.js';
import { createHttpSavedViews, type ImportLocal } from '../saved-views/store.js';

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
  /**
   * `store` and `importLocal` share the adapter's transport, session and CSRF token (ADR-0099). `importLocal` is not part of the
   * `SavedViewStore` port: only the real assembly's one-time browser-local import calls it.
   */
  | { kind: 'ready'; adapter: PlatformAdapter; store: SavedViewStore; importLocal: ImportLocal }
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
    const context = { transport, store, timeoutMs, fireAndForgetTimeoutMs: options.fireAndForgetTimeoutMs ?? 10_000 };
    const adapter = createHttpAdapter(context);
    const savedViews = createHttpSavedViews(context);
    return { kind: 'ready', adapter, store: savedViews.store, importLocal: savedViews.importLocal };
  } catch {
    return { kind: 'unavailable', correlationId: newRequestId() };
  }
}
