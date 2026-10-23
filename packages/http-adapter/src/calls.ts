import { isRecord, PORT_ERROR_CODES, PortError, type ActionResponse, type ApiResponse, type MenuAction, type PortErrorCode } from '@ap/contracts';
import { abortError, parseJson, type Parsed, type Raw, type SendRequest, type Transport } from './transport.js';
import type { SessionStore } from './session.js';
import { safeMessage, toActionResponse, toEnvelope } from './validate.js';

/**
 * A transport failure of a non-envelope or fire-and-forget method. `code` is one of the short strings of contract §2.1
 * (`client_timeout`, `network_error`, `session_expired`, `http_<status>`, `invalid_response`) and is all it carries:
 * no URL, body or stack reaches the screen (#101). Never named `AbortError`.
 */
export class TransportError extends Error {
  constructor(readonly code: string, readonly correlationId: string) {
    super(code);
    this.name = 'TransportError';
  }
}

export type CallContext = {
  transport: Transport;
  store: SessionStore;
  timeoutMs: number;
  fireAndForgetTimeoutMs: number;
};

type CallOptions = {
  signal?: AbortSignal;
  /** State-changing POST: sends `X-CSRF-Token`; a 403 re-bootstraps to refresh it, the call is not resent. */
  csrf?: boolean;
  headers?: Record<string, string>;
  correlationId?: string;
  keepalive?: boolean;
  timeoutMs?: number;
};

type Fail = { code: string; correlationId: string };

/** Side effects every outcome shares: a 401 or redirect starts the session re-check, a CSRF 403 refreshes the token. */
function observe(context: CallContext, raw: Raw, csrf: boolean): void {
  if (raw.kind === 'redirect' || (raw.kind === 'response' && raw.status === 401)) void context.store.recheck();
  else if (csrf && raw.kind === 'response' && raw.status === 403) void context.store.recheck();
}

async function send(context: CallContext, request: Omit<SendRequest, 'timeoutMs'>, options: CallOptions): Promise<Raw> {
  const headers = { ...(options.csrf ? { 'X-CSRF-Token': context.store.csrfToken() } : {}), ...options.headers };
  const raw = await context.transport.send({
    ...request,
    headers,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? context.timeoutMs,
    correlationId: options.correlationId,
    keepalive: options.keepalive,
  });
  observe(context, raw, options.csrf === true);
  return raw;
}

/** The short code of a failure that is not a usable 2xx; null when the response is a 2xx to be read. */
function failure(raw: Raw): Fail | null {
  switch (raw.kind) {
    case 'timeout':
      return { code: 'client_timeout', correlationId: raw.correlationId };
    case 'network':
      return { code: 'network_error', correlationId: raw.correlationId };
    case 'redirect':
      return { code: 'session_expired', correlationId: raw.correlationId };
    case 'aborted':
      return null;
    case 'response':
      if (raw.status === 401) return { code: 'session_expired', correlationId: raw.correlationId };
      return raw.ok ? null : { code: `http_${raw.status}`, correlationId: raw.correlationId };
  }
}

function body(raw: Raw): Parsed {
  return raw.kind === 'response' ? parseJson(raw.text) : { ok: false };
}

/**
 * Envelope methods (06 §19) never reject; the only exception is Kernel cancellation, which the Kernel discards.
 * Every failure becomes an `error`/`timeout` envelope with a short code (contract §2.1).
 */
export async function envelopeCall<T>(context: CallContext, request: Omit<SendRequest, 'timeoutMs'>, options: CallOptions = {}): Promise<ApiResponse<T>> {
  const raw = await send(context, request, options);
  if (raw.kind === 'aborted') throw abortError();
  const converted = (outcome: 'error' | 'timeout', message: string, correlationId: string): ApiResponse<T> =>
    ({ outcome, data: null, assessments: [], trust: null, correlationId, message });
  const failed = failure(raw);
  if (failed) return converted(failed.code === 'client_timeout' ? 'timeout' : 'error', failed.code, failed.correlationId);
  const correlationId = raw.kind === 'response' ? raw.correlationId : '';
  const parsed = body(raw);
  if (!parsed.ok) return converted('error', 'invalid_response', correlationId);
  const envelope = toEnvelope(parsed.value);
  return envelope ? (envelope as ApiResponse<T>) : converted('error', 'invalid_envelope', correlationId);
}

/**
 * The write envelope. A reply that is not a well-formed `ActionResponse` of a 2xx — network, timeout, 5xx, any other
 * status, bad JSON — leaves the write's effect unknown, so it is `unknown` (never `error`, which means "answered and
 * changed nothing", checklist §2). Only the server's own judged answer is passed through.
 */
export async function actionCall(context: CallContext, request: Omit<SendRequest, 'timeoutMs'>, action: MenuAction, signal?: AbortSignal): Promise<ActionResponse<unknown>> {
  const headers: Record<string, string> = { 'Idempotency-Key': action.idempotencyKey };
  if (action.expectedVersion !== undefined) headers['If-Match'] = action.expectedVersion;
  const raw = await send(context, request, { signal, csrf: true, headers });
  if (raw.kind === 'aborted') throw abortError();
  const unknown = (message: string, correlationId: string): ActionResponse<unknown> =>
    ({ outcome: 'unknown', data: null, version: null, fieldErrors: [], replayed: false, correlationId, message });
  const failed = failure(raw);
  if (failed) return unknown(failed.code, failed.correlationId);
  const correlationId = raw.kind === 'response' ? raw.correlationId : '';
  const parsed = body(raw);
  if (!parsed.ok) return unknown('invalid_response', correlationId);
  const response = toActionResponse(parsed.value);
  return response ?? unknown('invalid_envelope', correlationId);
}

/** A parsed 2xx body and the response's correlation id, kept so a later shape check can still name the response. */
export type PlainReply = { value: unknown; correlationId: string };

/** The parsed 2xx body of a non-envelope call, or a rejection with a short code. */
function plainResult(raw: Raw): PlainReply {
  const failed = failure(raw);
  if (failed) throw new TransportError(failed.code, failed.correlationId);
  const correlationId = raw.kind === 'response' ? raw.correlationId : '';
  const parsed = body(raw);
  if (!parsed.ok) throw new TransportError('invalid_response', correlationId);
  return { value: parsed.value, correlationId };
}

/** Non-envelope reads (and fire-and-forget): the parsed 2xx body, or a rejection with a short code. */
export async function plainCall(context: CallContext, request: Omit<SendRequest, 'timeoutMs'>, options: CallOptions = {}): Promise<PlainReply> {
  const raw = await send(context, request, options);
  if (raw.kind === 'aborted') throw abortError();
  return plainResult(raw);
}

/** The three selection ports: a judged 4xx `{code,message,field?}` is a PortError, everything else a transport rejection. */
/** A PortError `field` names an input field; anything that does not look like one is dropped (same reason as `safeMessage`). */
function safeField(field: unknown): string | undefined {
  return typeof field === 'string' && /^[A-Za-z0-9_.[\]-]{1,100}$/.test(field) ? field : undefined;
}

export async function portCall(context: CallContext, request: Omit<SendRequest, 'timeoutMs'>, signal?: AbortSignal): Promise<PlainReply> {
  const raw = await send(context, request, { signal });
  if (raw.kind === 'aborted') throw abortError();
  if (raw.kind === 'response' && raw.status >= 400 && raw.status < 500 && raw.status !== 401) {
    const parsed = parseJson(raw.text);
    const value = parsed.ok ? parsed.value : null;
    if (isRecord(value) && typeof value['code'] === 'string' && (PORT_ERROR_CODES as readonly string[]).includes(value['code']) && typeof value['message'] === 'string') {
      throw new PortError(value['code'] as PortErrorCode, safeMessage(value['message']), safeField(value['field']));
    }
  }
  return plainResult(raw);
}
