import { randomBytes } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

// Correlation ID (http-adapter-contract §7, ADR-0069 decision 3): a client-supplied
// `X-Correlation-Id` is adopted as the request id when it is a safe token, else the
// server generates one. Every response echoes it; logs carry it as `request_id`.

export const CORRELATION_ID_HEADER = 'x-correlation-id';
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;

export function generateCorrelationId(): string {
  return `srv-${Date.now()}-${randomBytes(6).toString('hex')}`;
}

/** Fastify `genReqId`: the valid inbound header, otherwise a generated `srv-…` id. */
export function resolveCorrelationId(req: Pick<IncomingMessage, 'headers'>): string {
  const inbound = req.headers[CORRELATION_ID_HEADER];
  return typeof inbound === 'string' && CORRELATION_ID_PATTERN.test(inbound)
    ? inbound
    : generateCorrelationId();
}
