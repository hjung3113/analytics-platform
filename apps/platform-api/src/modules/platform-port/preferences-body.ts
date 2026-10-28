// Raw request-body bound of the two preferences POST routes (ADR-0098 §1: 262144 bytes). The shared schema can only measure the
// parsed value re-serialised, which loses whitespace and `\u` escapes; this parser counts the bytes that actually arrive. Past the
// bound it keeps draining without buffering and hands the route OVERSIZE_BODY, so the route still authenticates, checks CSRF and
// answers the judged HTTP 200 `too_large` (a Fastify `bodyLimit` would be a 413 before any of that).

import { PREFERENCE_REQUEST_MAX_BYTES } from '@ap/contract-schemas';
import type { FastifyRequest } from 'fastify';

export const OVERSIZE_BODY = Symbol('oversize-preferences-body');

type Done = (err: Error | null, body?: unknown) => void;

/** `malformed` is the route's own sentinel for text that is not JSON (an empty body stays `undefined`, as on the other routes). */
export function createPreferencesBodyParser(malformed: symbol) {
  return (_req: FastifyRequest, payload: NodeJS.ReadableStream, done: Done): void => {
    let bytes = 0;
    let chunks: Buffer[] = [];
    payload.on('data', (chunk: Buffer | string) => {
      const part = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      bytes += part.length;
      if (bytes <= PREFERENCE_REQUEST_MAX_BYTES) chunks.push(part);
      else chunks = [];
    });
    payload.once('error', (err: Error) => done(err));
    payload.once('end', () => {
      if (bytes > PREFERENCE_REQUEST_MAX_BYTES) return done(null, OVERSIZE_BODY);
      const text = Buffer.concat(chunks).toString('utf8');
      if (text === '') return done(null, undefined);
      try {
        done(null, JSON.parse(text));
      } catch {
        done(null, malformed);
      }
    });
  };
}
