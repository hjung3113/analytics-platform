import type { PublishedMetric, Session } from '@ap/contracts';
import { parseJson, type Transport } from './transport.js';
import { toBootstrap, toSessionVersion, type BootstrapPayload } from './validate.js';

export const BOOTSTRAP_PATH = '/api/v1/platform/bootstrap';
export const SESSION_STATE_PATH = '/api/v1/platform/session-state';

/** Waits after a failed re-check: 5 s, 30 s, then 5 min (contract §4). */
const BACKOFF_MS = [5_000, 30_000, 300_000] as const;

export type BootstrapRead =
  | { kind: 'ok'; payload: BootstrapPayload }
  | { kind: 'login' }
  | { kind: 'failed'; correlationId: string };

/** One `GET bootstrap`. Never rejects: every failure is a value. */
export async function readBootstrap(transport: Transport, timeoutMs: number): Promise<BootstrapRead> {
  const raw = await transport.send({ method: 'GET', path: BOOTSTRAP_PATH, timeoutMs });
  if (raw.kind === 'redirect' || (raw.kind === 'response' && raw.status === 401)) return { kind: 'login' };
  if (raw.kind === 'response' && raw.ok) {
    const parsed = parseJson(raw.text);
    const payload = parsed.ok ? toBootstrap(parsed.value) : null;
    return payload ? { kind: 'ok', payload } : { kind: 'failed', correlationId: raw.correlationId };
  }
  // `aborted` needs a Kernel signal and bootstrap sends none.
  return { kind: 'failed', correlationId: raw.kind === 'aborted' ? '' : raw.correlationId };
}

export type SessionStoreConfig = {
  transport: Transport;
  pollMs: number;
  timeoutMs: number;
  onSessionLost?: () => void;
};

export type SessionStore = {
  session(): Session;
  publishedMetrics(): readonly PublishedMetric[];
  defaultRangeTo(): string;
  /** In-memory only: never written to storage. Replaced by every successful bootstrap. */
  csrfToken(): string;
  subscribe(onChange: () => void): () => void;
  /**
   * Starts a re-check (single-flight). `onChange` or `onSessionLost` is the observable result; a server answer or a
   * throwing listener never rejects it, only an internal bug does.
   */
  recheck(): Promise<void>;
};

export function createSessionStore(initial: BootstrapPayload, config: SessionStoreConfig): SessionStore {
  const { transport, pollMs, timeoutMs, onSessionLost } = config;
  const listeners = new Set<() => void>();
  let session = initial.session;
  let sessionVersion = initial.sessionVersion;
  let csrfToken = initial.csrfToken;
  const publishedMetrics = initial.publishedMetrics;
  const defaultRangeTo = initial.defaultRangeTo;

  let lost = false;
  let inflight: Promise<void> | null = null;
  let failures = 0;
  let blockedUntil = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let polling = false;

  const stopTimers = () => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    if (pollTimer !== null) clearTimeout(pollTimer);
    retryTimer = null;
    pollTimer = null;
  };

  // A throwing `onChange` listener must not stop the others or turn the re-check into a rejection; the browser still
  // reports it (`reportError`). Anything else that throws in a re-check stays visible as a rejection.
  const notify = () => {
    for (const listener of [...listeners]) {
      try {
        listener();
      } catch (error) {
        globalThis.reportError?.(error);
      }
    }
  };

  const loseSession = () => {
    if (lost) return;
    lost = true;
    stopTimers();
    // Same isolation as notify(): a throwing consumer callback is reported, never a rejection of recheck().
    try {
      onSessionLost?.();
    } catch (error) {
      globalThis.reportError?.(error);
    }
  };

  const scheduleRetry = (delay: number) => {
    if (listeners.size === 0) return;
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void recheck();
    }, delay);
  };

  const run = async () => {
    const read = await readBootstrap(transport, timeoutMs);
    if (lost) return;
    if (read.kind === 'login') {
      loseSession();
      return;
    }
    if (read.kind === 'failed') {
      const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)] ?? BACKOFF_MS[0];
      failures += 1;
      blockedUntil = Date.now() + delay;
      scheduleRetry(delay);
      return;
    }
    failures = 0;
    blockedUntil = 0;
    // The token follows the cookie session, not the session content (contract §3 identity rule 2).
    csrfToken = read.payload.csrfToken;
    if (read.payload.sessionVersion !== sessionVersion) {
      session = read.payload.session;
      sessionVersion = read.payload.sessionVersion;
      notify();
    }
  };

  function recheck(): Promise<void> {
    if (lost) return Promise.resolve();
    if (inflight) return inflight;
    if (Date.now() < blockedUntil) return Promise.resolve();
    inflight = run().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  const poll = async () => {
    pollTimer = null;
    polling = true;
    try {
      const raw = await transport.send({ method: 'GET', path: SESSION_STATE_PATH, timeoutMs });
      if (raw.kind === 'redirect' || (raw.kind === 'response' && raw.status === 401)) {
        await recheck();
      } else if (raw.kind === 'response' && raw.ok) {
        const parsed = parseJson(raw.text);
        const remote = parsed.ok ? toSessionVersion(parsed.value) : null;
        if (remote !== null && remote !== sessionVersion) await recheck();
      }
      // A failed poll is not an event: the next interval tries again.
    } finally {
      polling = false;
      if (listeners.size > 0) startPolling();
    }
  };

  function startPolling() {
    if (lost || pollTimer !== null || polling) return;
    pollTimer = setTimeout(() => void poll(), pollMs);
  }

  return {
    session: () => session,
    publishedMetrics: () => publishedMetrics,
    defaultRangeTo: () => defaultRangeTo,
    csrfToken: () => csrfToken,
    recheck,
    subscribe(onChange) {
      // A fresh wrapper per call so subscribing the same function twice keeps two independent entries.
      const entry = () => onChange();
      listeners.add(entry);
      startPolling();
      return () => {
        if (!listeners.delete(entry)) return;
        if (listeners.size === 0) stopTimers();
      };
    },
  };
}
