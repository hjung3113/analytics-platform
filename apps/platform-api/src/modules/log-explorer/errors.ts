// The only error a SourceReadPort call may throw. It carries a code and nothing else: no message from the Source, no cause, no
// request or response text, so a thrown error can be logged, audited or put on the wire without leaking a source body (ADR-0119 §1).

export const SOURCE_READ_ERROR_CODES = [
  'aborted',
  'time_budget_exceeded',
  'adapter_failed',
  'invalid_request',
  'invalid_response',
] as const;
export type SourceReadErrorCode = (typeof SOURCE_READ_ERROR_CODES)[number];

export class SourceReadError extends Error {
  readonly code: SourceReadErrorCode;

  constructor(code: SourceReadErrorCode) {
    super(code);
    this.name = 'SourceReadError';
    this.code = code;
  }
}

const KNOWN_CODES: ReadonlySet<string> = new Set(SOURCE_READ_ERROR_CODES);

/**
 * Every thrown error is rebuilt: only a whitelisted `code` is read from the incoming value, then a fresh code-only SourceReadError is
 * made. The incoming object's message, stack, cause and any extra field an adapter attached are never copied or kept, so an error that
 * is itself a SourceReadError cannot carry a source body out. Anything else, or an unreadable code, becomes `adapter_failed`.
 */
export function toSourceReadError(error: unknown): SourceReadError {
  try {
    if (error instanceof SourceReadError) {
      const code: unknown = error.code;
      if (typeof code === 'string' && KNOWN_CODES.has(code)) return new SourceReadError(code as SourceReadErrorCode);
    }
  } catch {
    // A getter that throws is as untrustworthy as the value itself.
  }
  return new SourceReadError('adapter_failed');
}
