import { Readable } from 'node:stream';

import { PREFERENCE_REQUEST_MAX_BYTES } from '@ap/contract-schemas';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { OVERSIZE_BODY, createPreferencesBodyParser } from '../preferences-body.js';

// DB-free: the parser alone, behind a bare Fastify route, fed real raw bodies (whitespace and \u escapes that JSON.parse erases).
const app = Fastify();
const MALFORMED = Symbol('malformed');
app.addContentTypeParser('application/json', createPreferencesBodyParser(MALFORMED));
app.post('/', async (req) => ({
  oversize: req.body === OVERSIZE_BODY,
  malformed: req.body === MALFORMED,
  body: req.body === OVERSIZE_BODY || req.body === MALFORMED ? null : (req.body ?? null),
}));

const post = (payload: string | Readable, headers: Record<string, string> = {}) =>
  app.inject({
    method: 'POST',
    url: '/',
    headers: { 'content-type': 'application/json', ...headers },
    payload,
  });

const MAX = PREFERENCE_REQUEST_MAX_BYTES;
const padded = (bytes: number) => {
  const core = '{"set":{"lang":"ko"}}';
  return core + ' '.repeat(bytes - core.length);
};

describe('preferences raw body bound', () => {
  it('accepts a body of exactly the limit and parses it', async () => {
    const res = await post(padded(MAX));
    expect(res.json()).toEqual({
      oversize: false,
      malformed: false,
      body: { set: { lang: 'ko' } },
    });
  });

  it('flags a body one byte over the limit even though its parsed value is tiny', async () => {
    const res = await post(padded(MAX + 1));
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ oversize: true, malformed: false, body: null });
  });

  it('counts bytes, not characters: multibyte text over the limit is flagged', async () => {
    const res = await post(`{"set":{"lang":"${'한'.repeat(Math.ceil(MAX / 3))}"}}`);
    expect(res.json().oversize).toBe(true);
  });

  it('flags a body made of \\u escapes whose parsed value is small', async () => {
    const res = await post(`{"set":{"lang":"${'\\u0041'.repeat(Math.ceil(MAX / 6) + 1)}"}}`);
    expect(res.json().oversize).toBe(true);
  });

  it('flags a chunked body (no Content-Length) over the limit, and a 5 MiB one, without an error status', async () => {
    for (const total of [MAX + 1, 5 * 1024 * 1024]) {
      const text = padded(total);
      const chunks = Array.from({ length: Math.ceil(total / 65_536) }, (_, i) =>
        text.slice(i * 65_536, (i + 1) * 65_536),
      );
      const res = await post(Readable.from(chunks, { objectMode: false }), {
        'transfer-encoding': 'chunked',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().oversize).toBe(true);
    }
  });

  it('keeps an empty body undefined and hands invalid JSON to the route as the malformed sentinel', async () => {
    expect((await post('')).json()).toEqual({ oversize: false, malformed: false, body: null });
    expect((await post('{not json')).json()).toMatchObject({ malformed: true, oversize: false });
  });
});
